const Levenshtein = require('levenshtein')
// const log = require('@src/handler/log')('app:userprofile')

// TODO: Tests

module.exports = async (userSlug, PayId, db) => {
  let payid
  let slug

  if (typeof userSlug === 'string') {
    slug = userSlug.toLowerCase()
  }

  if (typeof PayId === 'string') {
    payid = PayId
    slug = payid.split('+')[0]
    // log(slug)

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

    let returnAccount = ''
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
    return returnAccount
  }

  return
}
