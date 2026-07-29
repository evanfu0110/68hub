const assert = require('node:assert/strict');
const http = require('node:http');
const { app, net, session } = require('electron');

app.whenReady().then(async () => {
  const proxy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      url: request.url,
      cookie: request.headers.cookie || '',
    }));
  });

  try {
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://127.0.0.1:${address.port}`,
    });
    const response = await net.fetch('http://68hub.invalid/system-proxy-smoke', {
      headers: { Cookie: 'auth=system-proxy-smoke' },
    });
    const payload = await response.json();
    assert.equal(payload.url, 'http://68hub.invalid/system-proxy-smoke');
    assert.equal(payload.cookie, 'auth=system-proxy-smoke');
  } finally {
    await session.defaultSession.setProxy({ mode: 'system' });
    await new Promise((resolve) => proxy.close(resolve));
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
