import test from 'node:test';
import assert from 'node:assert/strict';
import createViteConfig from '../../vite.config.js';

function mockReqRes(url = '/api/rentals') {
  const req = {
    method: 'GET',
    url,
  };
  let statusCode = 200;
  let headers = {};
  let body = '';

  const res = {
    writeHead(code, h) {
      statusCode = code;
      headers = { ...headers, ...h };
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    end(data) {
      body = data;
    },
  };

  return { req, res, getResult: () => ({ statusCode, headers, body: body ? JSON.parse(body) : null }) };
}

test('rentals proxy responds with listings array and HIT cache header', async () => {
  const config = createViteConfig({ mode: 'test' });
  const plugin = config.plugins.find((p) => p.name === 'rentals-proxy');
  assert.ok(plugin, 'rentals-proxy plugin present');

  let middleware;
  const server = {
    middlewares: {
      use(route, handler) {
        if (route === '/api/rentals') middleware = handler;
      },
    },
  };

  plugin.configureServer(server);
  assert.ok(typeof middleware === 'function', 'middleware installed');

  const { req, res, getResult } = mockReqRes('/api/rentals');
  await middleware(req, res);
  const result = getResult();

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['X-Rentals-Cache'], 'HIT');
  assert.ok(Array.isArray(result.body.listings));
  assert.ok(result.body.listings.length > 0);
  assert.equal(result.body.source, 'Inside Airbnb');
});

test('rentals proxy filters by city', async () => {
  const config = createViteConfig({ mode: 'test' });
  const plugin = config.plugins.find((p) => p.name === 'rentals-proxy');

  let middleware;
  const server = {
    middlewares: {
      use(route, handler) {
        if (route === '/api/rentals') middleware = handler;
      },
    },
  };
  plugin.configureServer(server);

  const { req, res, getResult } = mockReqRes('/api/rentals?city=austin');
  await middleware(req, res);
  const result = getResult();

  assert.equal(result.statusCode, 200);
  assert.ok(result.body.listings.length > 0);
  for (const item of result.body.listings) {
    assert.equal(item.city, 'austin');
  }
});

test('rentals proxy filters by roomType and maxPrice', async () => {
  const config = createViteConfig({ mode: 'test' });
  const plugin = config.plugins.find((p) => p.name === 'rentals-proxy');

  let middleware;
  const server = {
    middlewares: {
      use(route, handler) {
        if (route === '/api/rentals') middleware = handler;
      },
    },
  };
  plugin.configureServer(server);

  const { req, res, getResult } = mockReqRes('/api/rentals?roomType=private&maxPrice=80');
  await middleware(req, res);
  const result = getResult();

  assert.equal(result.statusCode, 200);
  for (const item of result.body.listings) {
    assert.ok(item.room_type.toLowerCase().includes('private'));
    assert.ok(item.price <= 80);
  }
});
