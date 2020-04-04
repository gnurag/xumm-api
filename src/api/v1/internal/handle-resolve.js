const fetch = require('node-fetch')
const log = require('debug')('app:handle-resolve')
const knownAccount = require('@api/v1/internal/known-account-hydrate')
const utf8 = require('utf8')
const taggedAddressCodec = require('xrpl-tagged-address-codec')

// For PayId
const URL = require('url')
const isValidDomain = require('is-valid-domain')
const ip = require('ip')
const dns = require('dns')

const cacheSeconds = 60 * 15 // 15 minutes

/**
 * Todo: add XUMM hashed address book function lookup
 */

const defaultFetchConfig = {
  timeout: 3000,
  size: 1024 * 100,
  redirect: 'follow',
  follow: 3
}

const is = {
  possiblePackedAddress (query) {
    return query.match(/^[TX][a-zA-Z0-9]{20,}$/)
  },
  validEmailAccount (query) {
    const tester = /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

    if (!query) {
      return false
    }

    if (query.length > 254) {
      return false
    }
    
    const valid = tester.test(query)

    if (!valid) {
      return false
    }

    const parts = query.split('@')
    if (parts[0].length > 64) {
      return false
    }
    
    const domainParts = parts[1].split('.')
    if (domainParts.some(part => part.length > 63 )) {
      return false
    }

    return true
  },
  possibleXrplAccount (query) {
    return new RegExp(/^r[0-9a-zA-Z]{3,}$/).test(query)
  },
  async possiblePayId (query) {
    /**
     * Checks for IPs and domains pointing to IPs
     * Domain should be valid and IP should not be local
     * to prevent PayId based internal network attack
     */
    if (new RegExp(/^\$[0-9a-z\._-]+/).test(query)) {
      const payIdUrl = URL.parse(query.replace(/^\$/, 'https://'))
      if (typeof payIdUrl.host === 'string' && isValidDomain(payIdUrl.host)) {
        const resolved = await Promise.all([
          new Promise(resolve => {
            dns.resolve4(payIdUrl.host, (err, address) => {
              // console.log('resolve4', payIdUrl.host, err, address)
              if (err) {
                resolve([])
              } else {
                resolve(address)
              }
            })
          }),
          new Promise(resolve => {
            dns.resolve6(payIdUrl.host, (err, address) => {
              // console.log('resolve6', payIdUrl.host, err, address)
              if (err) {
                resolve([])
              } else {
                resolve(address)
              }
            })
          })
        ])

        const localIps = resolved.reduce((a, b) => {
          a = a.concat(b)
          return a
        }, []).filter(a => {
          return ip.isPrivate(a)
        })

        if (localIps < 1) {
          return true
        }
      }
    }
    return false
  }
}

const xrplns = {
  networks: [],
  initialized: false,
  async call (url) {
    const callApi = await fetch('https://api.xrplns.com/v1/' + url, {
      headers: {
        'XRPLNS-KEY': app.config.xrplnsKey || ''
      },
      method: 'get',
      ...defaultFetchConfig
    })
    const json = await callApi.json()
    return json
  },
  async initialize () {
    log('Initializing XRPLNS, fetching social networks')
    this.networks = await this.call('social-networks')
    log('Initialized XRPLNS social networks', this.networks)
  },
  sanitizeQuery (query, network) {
    if (network === 'local' || network === 'twitter') {
      return utf8.encode(query.replace(/^@/, ''))
    }
    return utf8.encode(query)
  },
  async get (query) {
    const source = 'xrplns'
    try {
      const results = await (async () => {
        if (is.validEmailAccount(query)) {
          const callResults = await this.call('resolve/social/email/' + utf8.encode(query))
          log(utf8.encode(query))
          return [Object.assign(callResults || {}, { network: 'email' })]
        } else {
          return Promise.all(this.networks.map(async n => {
            const callResults = await this.call('resolve/social/' + n + '/' + this.sanitizeQuery(query, n))
            return Object.assign(callResults || {}, { network: n })
          }).concat(await (async () => {
            const callResults = await this.call('resolve/user/' + this.sanitizeQuery(query, 'local'))
            if (callResults !== null &&
              typeof callResults === 'object' &&
              typeof callResults.data === 'object' &&
              callResults.data !== null &&
              typeof callResults.data.xrplAccounts === 'object'
            ) {
              const data = callResults.data.xrplAccounts
              return data.map(d => {
                return {
                  network: 'local',
                  data: d
                }
              })
            }
          })()))
        }
      })()

      // log(results)

      return results.filter(r => r !== null && typeof r === 'object' && typeof r.data === 'object' && typeof r.data.xrplAccount === 'string').map(r => {
        return {
          source,
          network: r.network,
          alias: r.data.slug || query,
          account: r.data.xrplAccount,
          tag: r.data.destinationTag === '' ? null : Number(r.data.destinationTag),
          description: r.data.label || ''
        }
      })
    } catch (e) {
      log('Query @' + source + ' for [' + query + ']', e.message)
    }
    return []
  }
}

const bithomp = {
  async get (query) {
    const source = 'bithomp.com'
    try {
      const method = is.possibleXrplAccount(query) && query.length >= 20 ? 'address' : 'username'
      const call = await fetch('https://bithomp.com/api/v2/' + method + '/' + utf8.encode(query) + '?service=true&username=true&verifiedDomain=true&blacklisted=true', {
        method: 'get',
        ...defaultFetchConfig,
        headers: {
          'x-bithomp-token': app.config.bithompToken
        }
      })
      const response = await call.json()
      if (typeof response === 'object' && response !== null && typeof response.address === 'string') {
        return [{
          source,
          network: null,
          alias: response.service ? (response.service.name || (response.username || query)) : (response.username || query),
          account: response.address,
          tag: null,
          description: response.verifiedDomain || (response.service ? (response.service.domain || '') : '')
        }]
      }
    } catch (e) {
      log('Query @' + source + ' for [' + query + ']', e.message)
    }
    return []
  }
}

const xrpscan = {
  async get (query) {
    const source = 'xrpscan.com'
    if (is.possibleXrplAccount(query)) {
      try {
        const call = await fetch('https://api.xrpscan.com/api/v1/account/' + utf8.encode(query), {
          method: 'get',
          ...defaultFetchConfig
        })
        const response = await call.json()
        if (typeof response === 'object' && response !== null && typeof response.account === 'string' && typeof response.accountName === 'object' && response.accountName !== null) {
          return [{
            source,
            network: null,
            alias: response.accountName.name || query,
            account: response.account,
            tag: null,
            description: response.accountName.desc || ''
          }]
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }
    return []
  }
}

const xrpl = {
  async get (query) {
    const source = 'xrpl'
    if (is.possibleXrplAccount(query)) {
      try {
        const call = await fetch('https://s1.ripple.com:51234', {
          method: 'post',
          ...defaultFetchConfig,
          body: JSON.stringify({
            method: 'account_info',
            params: [ { account: query } ]
          }),
        })
        const response = await call.json()
        if (typeof response === 'object' && response !== null && typeof response.result === 'object' && response.result !== null && typeof response.result.account_data === 'object') {
          return [{
            source,
            network: null,
            alias: typeof response.result.account_data.Domain === 'string' && response.result.account_data.Domain !== '' ? Buffer.from(response.result.account_data.Domain, 'hex').toString('utf-8') : query,
            account: response.result.account_data.Account,
            tag: null,
            description: ''
          }]
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }
    return []
  }
}

const payId = {
  async get (query) {
    const source = 'payid'
    if (await is.possiblePayId(query)) {
      try {
        const asUrl = URL.parse(query.replace(/^\$/, 'https://'))
        const endpoint = asUrl.href + (
          asUrl.path === '/'
            ? '.well-known/pay'
            : ''
        )
        log('Lookup: payId', query, endpoint)
        const call = await fetch(endpoint, {
          method: 'get',
          ...defaultFetchConfig,
          headers: {
            'Accept': 'application/xrpl-mainnet+json; charset=utf-8'
          }    
        })
        const response = await call.json()
        if (typeof response === 'object' && response !== null && typeof response.addressDetails === 'object') {
          if (response.addressDetails !== null && typeof response.addressDetails.address === 'string') {
            if (response.addressDetails.address.match(/^X/)) {
              const decodedXaddress = taggedAddressCodec.Decode(response.addressDetails.address)
              const resolvedPayIdDestination = await resolver.get(decodedXaddress.account)
              const resolvedAliasses = resolvedPayIdDestination.matches.filter(m => {
                return m.alias !== m.account
              })
              
              return [{
                source,
                network: null,
                alias: resolvedAliasses.length > 0
                  ? resolvedAliasses[0].alias
                  : query,
                account: decodedXaddress.account,
                tag: decodedXaddress.tag === null ? null : Number(decodedXaddress.tag),
                description: query
              }]
            }
          }
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }
    return []
  }
}

const internalAccounts = {
  async get (query) {
    const source = 'xumm.app'
    if (is.possibleXrplAccount(query)) {
      try {
        const existing = await app.db(`
          SELECT 
            knownaccount_name,
            knownaccount_account
          FROM
            knownaccounts
          WHERE
            knownaccount_account LIKE CONCAT(:knownaccount_account, '%')
          AND
            knownaccount_currency = ''
          LIMIT 10
        `, {
          knownaccount_account: query
        })

        if (existing.length > 0) {
          return existing.map(a => {
            return {
              source,
              network: null,
              alias: a.knownaccount_name,
              account: a.knownaccount_account,
              tag: null,
              description: ''
            }
          })
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }

    return []
  }
}

const activeApps = [ payId, bithomp, xrpscan, internalAccounts, xrplns, xrpl ]

const app = {
  config: {},
  db: null,
  query: {},
  initializing: false,
  initialized: false,
  async initialize (req) {
    this.config = req.config
    this.db = req.db
    
    if (typeof req.query === 'object' && req.query !== null) {
      this.query = Object.assign({}, req.query)
    }

    if (!this.initializing) {
      this.initializing = true
      const reducedApps = activeApps.reduce((stack, current) => {
        if (typeof current.initialized !== 'undefined' && typeof current.initialize !== 'undefined') {
          stack.push(current.initialize())
          current.initialized = true
        }
        return stack
      }, [])
      try {
        await Promise.all(reducedApps)
      } catch (e) {
        log(e.message)
      }
      this.initialized = true
      return this.initialized
    }
  }
}

const resolver = {
  cache: {},
  async get (query) {
    /**
     * query = input, used for cache
     * lookupHandle = possibly decoded input, the value to work with
     *    eg. query = X address, lookupHandle = X address decoded to r-address
     */
    let lookupHandle = query
    // TODO: check if lookupHandle is X / T address, if so: decode

    const now = Math.round(new Date() / 1000)
    if (typeof this.cache[query] === 'undefined' || this.cache[query].cached < now - cacheSeconds) {
      this.cache[query] = {
        cached: now,
        explicitTests: {},
        matches: {}
      }

      this.cache[query].explicitTests = {
        emailAddress: is.validEmailAccount(lookupHandle),
        xrplAccount: is.possibleXrplAccount(lookupHandle)
      }
    
      const allApps = activeApps.reduce((stack, current) => {
        stack.push(current.get(lookupHandle))
        return stack
      }, [])
  
      this.cache[query].matches = await Promise.all(allApps).then(r => {
        return r.reduce((stack, current) => {
          current.forEach(c => stack.push(c))
          return stack
        }, [])
      })
    }

    if (is.possibleXrplAccount(lookupHandle) && lookupHandle.length >= 20) {
      // Populate backend cache
      knownAccount(app.db, lookupHandle, app.config)
    }

    return Object.assign({
      live: now === this.cache[query].cached
    }, this.cache[query])
  }
}

/**
  * Samples:
  *   rPdvC6ccq8hCdPKSPJkPmyZ4Mi1oG2FFkT
  *   hi<at>wietse.com
  *   WietseWind
  *   pepperew
  *   xrptipbot
  *   tacostand
  */

module.exports = async (handle, req) => {
  let query = handle.trim()

  if (!app.initialized) {
    log('Initializing')
    await app.initialize(req)
    log('Initialized')
  }

  if (is.possiblePackedAddress(query)) {
    try {
      const decoded = taggedAddressCodec.Decode(query)
      query = decoded.account
    } catch (e) {
      // Do nothing
    }
  }

  const resolved = await resolver.get(query)

  return {
    input: handle,
    ...resolved
  }
}
