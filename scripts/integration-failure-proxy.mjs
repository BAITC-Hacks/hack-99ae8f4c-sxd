// Local browser QA only: forwards the production demo while injecting optional failures.
// Start the app on 3103, then: node scripts/integration-failure-proxy.mjs
import http from 'node:http';

http.createServer((request, response) => {
  if (request.url === '/api/analyze' || request.url === '/api/outlook') {
    request.resume();
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Injected integration-test outage. Please retry.' }));
    return;
  }
  const upstream = http.request({ hostname: 'localhost', port: 3103, path: request.url, method: request.method, headers: request.headers }, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Start the production demo on port 3103 first.'); });
  request.pipe(upstream);
}).listen(3104, 'localhost', () => console.info('Failure-injection browser QA: http://localhost:3104'));
