const log = require('debug')('app:payid')
const xTagged = require('xrpl-tagged-address-codec')
const Levenshtein = require('levenshtein')

const express = require('express')
const router = express.Router()

// TODO: move to API's
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
    const slug = req.sanitizedPath.slice(1).split('+')[0]
    const payid = req.sanitizedPath.slice(1)

    const accounts = await expressApp.db(`
      SELECT
        CONCAT(
          users.user_slug,
          IF(
            useraccounts.useraccount_slug IS NULL,
            '',
            CONCAT('+', useraccounts.useraccount_slug)
          )
        ) as __full_slug,
        useraccounts.useraccount_account
      FROM
        users
      LEFT JOIN
        useraccounts ON (
          users.user_id = useraccounts.user_id
        )
      WHERE
        users.user_slug = :slug
        AND
        useraccounts.useraccount_allowlookup = 1
    `, {
      slug
    })

    let returnAccount
    if (accounts.length > 0) {
      const match = accounts.filter(a => {
        return a.__full_slug === payid
      })
      if (match.length === 1) {
        returnAccount = match[0].useraccount_account
      } else {
        // Check distance
        const sorted = accounts.map(a => {
          return Object.assign({}, {
            ...a,
            levenshtein: new Levenshtein(payid, a.__full_slug).distance
          })
        })
        .filter(a => {
          return a.levenshtein <= 3
        })
        .sort((a, b) => {
          return a.levenshtein - b.levenshtein
        })
        if (sorted.length > 0) {
          returnAccount = sorted[0].useraccount_account
        }
      }
    }

    if (returnAccount) {
      res.json({
        addressDetailType: 'CryptoAddressDetails',
        addressDetails: {
          address: xTagged.Encode({account: returnAccount, tag: null, test: !req.isMainNet})
        }
      })  
    } else {
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
