const http = require('node:http');

http.createServer((_request, response) => {
  response.writeHead(503, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: false, fixture: 'phase6-intentional-failure' }));
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
