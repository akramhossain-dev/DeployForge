const http = require('node:http');

http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, fixture: 'phase6-compose', path: request.url }));
}).listen(3000, '0.0.0.0');
