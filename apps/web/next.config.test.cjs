const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const configPath = path.join(__dirname, 'next.config.js');

function loadConfig(nodeEnv, internalApiUrl) {
  process.env.NODE_ENV = nodeEnv;
  if (internalApiUrl) process.env.INTERNAL_API_URL = internalApiUrl;
  else delete process.env.INTERNAL_API_URL;
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
}

test('proxies same-origin API requests to the Docker API service in production', async () => {
  const config = loadConfig('production');
  assert.deepEqual(await config.rewrites(), [{
    source: '/api/:path*',
    destination: 'http://api:3001/:path*',
  }]);
});

test('proxies API requests to the local backend during development', async () => {
  const config = loadConfig('development');
  assert.deepEqual(await config.rewrites(), [{
    source: '/api/:path*',
    destination: 'http://localhost:3001/:path*',
  }]);
});

test('supports an explicit internal API URL without a trailing slash', async () => {
  const config = loadConfig('production', 'http://custom-api:4000/');
  assert.deepEqual(await config.rewrites(), [{
    source: '/api/:path*',
    destination: 'http://custom-api:4000/:path*',
  }]);
});
