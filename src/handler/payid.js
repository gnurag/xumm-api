const log = require('@src/handler/log')('app:payid')
const xTagged = require('xrpl-tagged-address-codec')
const userProfile = require('@src/api/v1/internal/user-profile-data')

const express = require('express')
const router = express.Router()

// TODO: tests

module.exports = async function (expressApp) {
  router.all('*', (req, res, next) => {
    req.isPayId = false
    req.isMainNet = null

    const usedHeaders = {
      contentType: (req.headers['content-type'] || '').toLowerCase().split(';')[0].trim(),
      accept: (req.headers['accept'] || '').toLowerCase().split(';')[0].trim()
    }

    req.sanitizedPath = req.path === '/' || req.path === '/.well-known/pay'
      ? '/'
      : req.path.trim().replace(/\/+$/, '').toLowerCase().replace(/[ \+]+/g, '+').toLowerCase()

    req.payIdAccept = usedHeaders.accept.match(/^application\/xrpl\-([a-z]+)\+json/)

    if (req.payIdAccept) {
      req.isPayId = true
      req.isMainNet = Boolean(req.payIdAccept[1].match(/main|live/))
    }

    req.payIdNet = req.isMainNet
      ? 'mainnet'
      : 'testnet'

    next()
  })

  router.get('/:payid(*)', async (req, res, next) => {
    // return next()
    const payid = req.sanitizedPath.slice(1)
    const slug = payid.split('+')[0]

    let returnAccount
    try {
      returnAccount = await userProfile(slug, payid, req.db)

      if (typeof returnAccount === 'object' && returnAccount !== null && typeof returnAccount.account === 'string') {
        res.json({
          addressDetailType: 'CryptoAddressDetails',
          addressDetails: {
            address: xTagged.Encode({account: returnAccount.account, tag: null, test: !req.isMainNet})
          }
        })  
      } else {
        next()
      }
    } catch (e) {
      log(' >>>> ! PayId Request Error', e)
      next()
    }

    log('$$ PayID call: ' + slug + ' » ' + payid, returnAccount)
  })

  router.all('*', (req, res) => {
    if ('OPTIONS' === req.method) {
      res.sendStatus(200)
    } else {
      res.status(404).json({
        statusCode: 404,
        error: `Not Found`,
        message: `Payment information for "${req.sanitizedPath.slice(1)}" in XRPL on ${req.payIdNet.toUpperCase()} could not be found.`
      })
    }
  })

  // Use
  expressApp.use('/payid', router)
}
