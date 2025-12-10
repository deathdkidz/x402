module.exports = {
  apps: [
    {
      name: 'netpay-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/srv/x402/netpay-web',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
