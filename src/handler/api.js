const log = require('debug')('app:api')

const express = require('express')
const bodyParser = require('body-parser')
const uuid = require('uuid/v4')

module.exports = async function (expressApp) {
  expressApp.use(bodyParser.json())
  
  /**
   * API Error handler
   */

  const errorHandler = async (e, req, res) => {
    // TODO: migrate to module
    const errorRef = res.get('X-Call-Ref') || uuid()
    const code = parseInt(((e.code || '') + '').replace(/[^0-9]/g, ''))
    log(`ERROR @ ${req.ip} ${errorRef} - ${e.message} (${e.httpCode||'-'})`, e)
    res.status(typeof e.httpCode === 'undefined' || isNaN(parseInt(e.httpCode)) ? 500 : parseInt(e.httpCode)).json({
      error: {
        reference: errorRef,
        code: isNaN(code) ? null : code
      }
    })

    if (typeof e.sqlMessage !== 'undefined') {
      // Internal DB error, move error to causingError to prevent error detail bleeding
      const sqlError = ((e.code || '') + ' ' + e.sqlMessage).trim()
      e = new Error('Platform (internal) exception')
      e.causingError = sqlError
    }

    const dbCallUpdateQuery = `
      UPDATE 
        calls 
      SET 
        call_httpcode = :call_httpcode,
        call_ecode = :call_ecode,
        call_emessage = :call_emessage,
        call_emessage_debug = :call_emessage_debug
      WHERE
        call_uuidv4 = :call_uuidv4
      LIMIT 1
    `

    let causingError = null
    if (typeof e !== 'undefined') {
      if (typeof e.causingError === 'string') {
        causingError = e.causingError.slice(0, 100)
      } else if (typeof e.causingError === 'object' && e.causingError !== null && typeof e.causingError.message !== 'undefined') {
        causingError = e.causingError.message.slice(0, 100)
      }
    }

    if (typeof res.dbLogLine !== 'undefined') {
      await res.dbLogLine
    }

    const db = await req.db(dbCallUpdateQuery, { 
      call_uuidv4: errorRef,
      call_httpcode: res.statusCode,
      call_ecode: isNaN(code) ? null : code,
      call_emessage: typeof e !== 'undefined' && typeof e.message === 'string' ? e.message.slice(0, 100) : null,
      call_emessage_debug: causingError
    })
  }

  /**
   * API Router
   */
  const router = express.Router()

  router.get('/', function(req, res) {
    // throw new Error("BROKEN")
    res.json({ message: 'XRPL Labs - Signing Platform' })
  })

  const apiDefinition = {
    v1: {
      /**
       * App: custom auth, for our App
       */
      app: {
        middleware: 'auth/app',
        routes: [
          /**
           * add-user
           *    > Add user + pairing, new device, new registration
           * 
           * Disable middleware: no unique device ID is known yet,
           * wait for device activation callback.
           */
          { 
            method: 'post',
            path: 'add-user',
            disableAuth: true,
            // module: 'some-alt-file-at-disk'
          },
          { method: 'post', path: 'activate-device', disableAuth: true },
          { method: 'post', path: 'ping' },
          { method: 'post', path: 'dev/push/raw', module: 'dev-push-raw' },
          { method: 'post', path: 'update-device' },
          { method: 'post', path: 'add-device' },
          { method: [ 'get', 'patch', 'delete' ], path: 'pending-devices' },
          { method: [ 'get', 'patch' ], path: 'payload/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'payload' },
          { method: 'get', path: 'curated-ious' },
          { method: 'get', path: 'account-info/:address(r[a-zA-Z0-9]{3,})', module: 'account-info' }
        ],
        errorHandler: errorHandler
      },
      /**
       * Platform: Simple custom API for 3rd party Developers
       */
      platform: {
        middleware: 'auth/platform',
        routes: [
          { method: [ 'get', 'post' ], path: 'ping-nomiddleware', disableMiddleware: true, module: 'ping' },
          { method: [ 'get', 'post' ], path: 'ping-noauth', disableAuth: true, module: 'ping' },
          { method: [ 'get', 'post' ], path: 'ping' },
          { method: [ 'get' ], path: 'payload/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'payload-get' },
          { method: [ 'post' ], path: 'payload', module: 'payload-post' },
        ],
        errorHandler: errorHandler
      },
      /**
       * Platform: OAuth2 for 3rd party Developers
       */
      oauth2: {
        middleware: 'auth/oauth2',
        routes: [
          // Todo
        ],
        errorHandler: errorHandler
      }
    }
  }

  Object.keys(apiDefinition).map(apiVersion => {
    Object.keys(apiDefinition[apiVersion]).map(apiType => {
      const apiDetails = apiDefinition[apiVersion][apiType]
      apiDetails.routes.map(route => {
        let methods = route.method
        if (typeof methods === 'string') {
          methods = [ methods ]
        }
        methods.forEach(method => {
          router[method](`/${apiVersion}/${apiType}/${route.path}`, [ async (req, res, next) => {
            req.__auth = {}
            if (typeof apiDetails.errorHandler !== 'undefined') {
              Object.assign(res, {
                handleError (error) {
                  return apiDetails.errorHandler(error, req, res)
                }
              })
            }
            if (typeof route.disableMiddleware === 'undefined' || !route.disableMiddleware) {
              require(`../middleware/${apiDetails.middleware}`)(expressApp, req, res, {
                route: route,
                version: apiVersion,
                type: apiType,
                auth: typeof route.disableAuth === 'undefined' || !route.disableAuth
              })
                .then(r => {
                  if (typeof r !== 'undefined') {
                    // log(`API Auth middleware [ next ]`, r)
                    req.__auth = Object.keys(r).reduce((a, b) => {
                      const s = b.replace(/^_+/, '').split('_')
                      if (s[0] !== '') {
                        if (typeof a[s[0]] === 'undefined') a[s[0]] = {}
                        a[s[0]][s[1]] = r[b]
                      }
                      return a
                    }, {})
                  }
                  /**
                   * Middleware is allowed to send cusom responses, skip
                   * the followup method if his has happened.
                   */
                  if (!res.headersSent) {
                    next()
                  }
                })
                .catch(e => {
                  /**
                   * Middleware is allowed to send cusom responses, skip
                   * the generic 500 error if this has happened.
                   */
                  if (!res.headersSent) {
                    /**
                     * Todo: normalize errors (per api type?)
                     */
                    res.status(500).json({ 
                      error: true,
                      message: `API Auth middleware rejected: [ ${e.message} ]`,
                      code: 500,
                      reference: '',
                      req: req.url,
                      method: req.method
                    })
                  }
                })
            } else {
              next()
            }
          } ], require(`@api/${apiVersion}/${apiType}/${route.module || route.path}`))
        })
      })
    })
  })

  router.post('/', async (req, res, next) => {
    if (typeof req.body === 'object' && typeof req.body.name !== 'undefined') {
      res.json({ 
        message: 'Test response',
        env: {
          mode: req.config.mode,
          remoteAddress: req.remoteAddress,
          ipTrusted: req.ipTrusted
        },
        data: {
          body: req.body,
          query: req.query
        },
        db: await expressApp.db(`SELECT "YES" as online`)
      })
    } else {
      next()
    }
  })

  // API ROUTER WILDCARD - FALLBACK
  router.all('*', function(req, res){
    if ('OPTIONS' === req.method) {
      res.sendStatus(200)
    } else {
      /**
       * Todo: normalize errors (per api type?)
       */
      res.status(404).json({ 
        error: true,
        message: 'Endpoint unknown or method invalid for given endpoint',
        reference: '',
        code: 404, 
        req: req.url,
        method: req.method
      })
    }
  })

  // Use
  expressApp.use('/api', router)
}
