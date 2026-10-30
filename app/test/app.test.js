const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server');

function start(pool) {
  return new Promise((resolve) => {
    const server = createApp(pool, { env: 'test', version: 'abc123' }).listen(0, () =>
      resolve(server)
    );
  });
}

test('/health is ok when the database answers', async () => {
  const server = await start({ query: async () => ({ rows: [{ n: 1 }] }) });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'ok');
  server.close();
});

test('/health is 503 when the database is down', async () => {
  const server = await start({
    query: async () => {
      throw new Error('down');
    },
  });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.strictEqual(res.status, 503);
  server.close();
});

test('home page shows the environment and visit count', async () => {
  const server = await start({ query: async () => ({ rows: [{ n: 42 }] }) });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
  const body = await res.text();
  assert.match(body, /test/);
  assert.match(body, /42/);
  server.close();
});
