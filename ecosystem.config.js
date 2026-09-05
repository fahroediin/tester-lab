// PM2 process definitions for tester-lab.
//
// Model: production and staging run as two separate app instances, each from
// its own checkout directory with its own .env file. The app loads .env from
// its working directory (via `import 'dotenv/config'`), so keep the two
// checkouts and their .env files separate.
//
// No `cwd` is set here on purpose: PM2 resolves the script relative to the
// directory you start it from, which keeps this file portable across machines.
// Start each app from inside its own checkout:
//
//   cd /path/to/tester-lab          && pm2 start ecosystem.config.js --only tester-lab
//   cd /path/to/tester-lab-staging  && pm2 start ecosystem.config.js --only tester-lab-staging
//   pm2 save                                                    # persist across reboots
//
// PORT is read from each directory's .env (production e.g. 3000, staging e.g. 3001).
// Staging should also lower MAX_CONCURRENT_TESTS / MAX_CONCURRENT_GENERATIONS,
// since each running test spawns a headless Chromium.

const base = {
  script: 'dist/server/index.js',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_restarts: 10,
  // Restart before a leaked browser process can exhaust a small VPS.
  max_memory_restart: '500M'
};

module.exports = {
  apps: [
    {
      ...base,
      name: 'tester-lab',
      env: { NODE_ENV: 'production' }
    },
    {
      ...base,
      name: 'tester-lab-staging',
      env: { NODE_ENV: 'staging' }
    }
  ]
};
