module.exports = {
  apps: [
    {
      name: 'merchant-dashboard',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/srv/x402/merchant-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    }
  ]
};
