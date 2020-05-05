const bugsnag = require('@bugsnag/js')
const bugsnagExpress = require('@bugsnag/plugin-express')

module.exports = async function (expressApp) {
  if (typeof expressApp.config.bugsnagKey !== 'undefined') {
    const bugsnagClient = bugsnag.start({
      apiKey: expressApp.config.bugsnagKey,
      autoTrackSessions: false,
      releaseStage: expressApp.config.__env || 'dev',
      redactedKeys: [
        /^secret$/i,
        /^authorization$/i
      ],
      plugins: [bugsnagExpress]
    })
    const middleware = bugsnagClient.getPlugin('express')
    expressApp.use(middleware.requestHandler)
    expressApp.use(middleware.errorHandler)
    expressApp.bugsnagClient = bugsnagClient
  }
}
