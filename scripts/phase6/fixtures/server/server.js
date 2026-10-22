const http = require('node:http');

const port = Number(process.env.PORT || 3000);
http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, fixture: 'phase6-server', path: request.url }));
}).listen(port, '0.0.0.0');
