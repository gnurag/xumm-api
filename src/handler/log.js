const log = require('debug')('app')
// const logLocally = log.extend('logger')

const logInstances = {}

module.exports = name => {
  let key = name.replace(/^app:/, '')
  if (Object.keys(logInstances).indexOf(key) < 0) {
    // logLocally('Initiated logger: [' +key + ']', key)
    logInstances[key] = log.extend(key)
  } else {
    // logLocally('Logger exists', key)
  }

  return logInstances[key]
}
