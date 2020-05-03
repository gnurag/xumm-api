// const Levenshtein = require('levenshtein')
const stringSimilarity = require('string-similarity')
const humanize = require('humanize-string')
const log = require('@src/handler/log')('app:userprofile')

// TODO: Tests

module.exports = async (userSlug, PayId, db) => {
  let payid
  let slug

  if (typeof userSlug === 'string') {
    slug = userSlug.toLowerCase()
  }

  if (typeof PayId === 'string') {
    payid = decodeURI(PayId).split('$')[0]
    slug = payid.split('+')[0]
    // log({payid, slug})

    const accounts = await db(`
      SELECT
        CONCAT(
          users.user_slug,
          IF(
            useraccounts.useraccount_slug IS NULL,
            '',
            CONCAT('+', useraccounts.useraccount_slug)
          )
        ) as __full_slug,
        useraccounts.useraccount_account,
        users.user_name,
        useraccounts.useraccount_slug
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
    
    // log({accounts})

    let returnAccount = {}
    if (accounts.length > 0) {
      const match = accounts.filter(a => {
        return a.__full_slug === payid
      })
      if (match.length === 1) {
        returnAccount = {
          account: match[0].useraccount_account,
          name: match[0].user_name + (
            match[0].useraccount_slug
              ? ' (' + match[0].useraccount_slug.replace(/^(.)/, _ => { return _.toUpperCase() }) + ')'
              : ''
          )
        }
      } else {
        // Check distance
        const sorted = accounts.map(a => {
          return Object.assign({}, {
            ...a,
            __sim: stringSimilarity.compareTwoStrings(payid, a.__full_slug)
          })
        })
        .filter(a => {
          return a.__sim > .7
        })
        .sort((a, b) => {
          return b.__sim - a.__sim
        })

        // log({sorted})
        if (sorted.length > 0) {
          returnAccount = {
            account: sorted[0].useraccount_account,
            name: sorted[0].user_name + (
              sorted[0].useraccount_slug
                ? ' (' + sorted[0].useraccount_slug.replace(/^(.)/, _ => { return _.toUpperCase() }) + ')'
                : ''
            }
          }
        }
      }
    }

    // if (typeof returnAccount.name === 'string') {
    //   returnAccount.name = humanize(returnAccount.name)
    //     .replace(/\s(.)/g, $1 => { return $1.toUpperCase() })
    //     .replace(/^(.)/, $1 => { return $1.toUpperCase() })
    // }

    return returnAccount
  }

  return
}
