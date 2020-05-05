module.exports = {
  apps: [{
    name: 'XRPLSIGN',
    script: 'index.js',
    watch: false,
    instances: 2,
    exec_mode: 'cluster',
    ignore_watch: ["node_modules", "db", ".git"],
    env: {
      DEBUG: 'app:*',
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_devnodebug: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      DEBUG: 'app:*',
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
