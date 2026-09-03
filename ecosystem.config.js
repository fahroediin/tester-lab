// PM2 process definitions for tester-lab.
//
// Model: production and staging run as two separate app instances, each from
// its own checkout directory with its own .env file. The app loads .env from
// its working directory (via `import 'dotenv/config'`), so keep the two
// checkouts and their .env files separate.
//
// Suggested layout on the VPS:
//   /var/www/tester-lab           -> git branch main    (.env -> production Supabase)
//   /var/www/tester-lab-staging   -> git branch develop (.env -> staging Supabase)
//
// Usage:
//   pm2 start ecosystem.config.js --only tester-lab            # production
//   pm2 start ecosystem.config.js --only tester-lab-staging    # staging
//   pm2 save                                                   # persist across reboots
//
// PORT is read from each directory's .env (production e.g. 3000, staging e.g. 3001).

module.exports = {
  apps: [
    {
      name: 'tester-lab',
      cwd: '/var/www/tester-lab',
      script: 'dist/server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'tester-lab-staging',
      cwd: '/var/www/tester-lab-staging',
      script: 'dist/server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'staging'
      }
    }
  ]
};
