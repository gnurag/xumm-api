const log = require('@src/handler/log')('app:user-profile-page')

module.exports = async (params, expressApp, invoker) => {
  if (invoker !== 'web') {
    throw new Error('User profile: invoker not implemented')
  }
  // const db = expressApp.db

  // wietse$xumm.me
  // wietse+savings$xumm.me
  // wietse+tipbot$xumm.me

  log('user-profile-page', params)

  return params
}
