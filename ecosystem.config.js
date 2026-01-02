module.exports = {
  apps: [{
    name: 'aim-whatsapp-router',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,          // Auto-restart if crashes
    watch: false,
    max_memory_restart: '500M', // Restart if memory exceeds 500MB
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};

