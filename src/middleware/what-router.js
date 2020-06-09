module.exports = async function (expressApp) {
  expressApp.use((req, res, next) => {
    if (typeof req.headers['accept'] !== 'undefined' &&
      (
        req.headers['accept'].match(/application\/[a-z]+-[a-z]+\+json/i) ||
        req.headers['accept'].match(/application\/payid\+json/i) ||
        Object.keys(req.headers).indexOf('payid-version') > -1
      ) &&
      req.hostname === req.config.userProfileLocation
    ) {
      req.routeType = 'payid'
    } else if (typeof req.headers['content-type'] !== 'undefined' && req.headers['content-type'].match(/application\/json/i)) {
      req.routeType = 'api'
    } else if (typeof req.headers['upgrade'] !== 'undefined' && req.headers['upgrade'].match(/websocket/i)) {
      req.routeType = 'wss'
    } else {
      req.routeType = 'web'
    }
    req.url = '/' + req.routeType + req.url

    if (req.url.match(/^\/(web|api|payid|wss)\/(web|api|payid|wss)/)) {
      req.url = req.url.slice(4)
      req.routeType = req.url.slice(1, 4)
    }

    next('route')
  })
}
