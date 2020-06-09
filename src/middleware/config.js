const fs = require('fs')
const path = require('path')

const config = {
  port: process.env.PORT || 3001,
  mode: process.env.NODE_ENV || 'development'
}

const opts = {
  loaded: false
}

module.exports = async function (expressApp) {
  let loadedConfig = {}

  // Tested config load delay, works
  // await new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     resolve()
  //   }, 3000)
  // })
  
  if (!opts.loaded) {
    await new Promise((resolve, reject) => {
      fs.readFile(path.resolve(__dirname, `../../${config.mode}.json`), (err, data) => {
        if (err) {
          reject(new Error('CONFIG FILE ERROR:', err.toString()))
        } else {
          try {
            loadedConfig = JSON.parse(data.toString('utf8'))
            resolve(loadedConfig)
          } catch (e) {
            reject(new Error('CONFIG FILE PARSE ERROR', e.toString()))
          }
        }
      })
    })
  }
  
  if (typeof expressApp === 'undefined' || typeof expressApp.use === 'undefined') {
    opts.loaded = true
    return Object.assign(config, loadedConfig)
  } else {
    opts.loaded = true
    // Apply config to Express
    expressApp.config = Object.assign(config, loadedConfig)
    expressApp.use((req, res, next) => {
      req.config = expressApp.config
      next()
    })  
  }

  return expressApp.config
}
