const express = require('express');
const { Pool } = require('pg');

function createApp(pool, info = {}) {
  const app = express();
  const env = info.env || 'local';
  const version = info.version || 'dev';

  // Used by Ansible after every deploy (and by Docker/monitoring)
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', env, version });
    } catch (err) {
      res.status(503).json({ status: 'db_down' });
    }
  });

  app.get('/', async (req, res) => {
    try {
      await pool.query('INSERT INTO visits(path) VALUES ($1)', ['/']);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM visits');
      res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>MySite (${env})</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem}
.tag{display:inline-block;padding:.2rem .6rem;border-radius:.4rem;background:#eef;font-family:monospace}</style></head>
<body><h1>MySite</h1>
<p>Environment: <span class="tag">${env}</span> &nbsp; Version: <span class="tag">${version}</span></p>
<p>This page has been viewed <strong>${rows[0].n}</strong> times (stored in this environment's own Postgres database).</p>
</body></html>`);
    } catch (err) {
      console.error(err);
      res.status(500).send('Database error');
    }
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp(pool, {
    env: process.env.APP_ENV,
    version: process.env.APP_VERSION,
  });
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`listening on ${port}`));
}
