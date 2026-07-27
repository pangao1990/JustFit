'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Math.max(1, Number(process.env.JUSTFIT_PORT) || 4173);
const host = '127.0.0.1';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav'
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const relative = pathname === '/' ? 'web/index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const filename = safePath(request.url);
  if (!filename) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filename, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream'
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`JustFit preview: http://${host}:${port}/`);
  console.log('Press Ctrl+C to stop.');
});
