module.exports = {
  apps: [
    {
      name: 'uQuik',
      script: 'YOUR_SCRIPT_NAME.js',
      watch: false,
      exec_mode: 'cluster',
      instances: 'max',
      wait_ready: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
