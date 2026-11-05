import { createServer } from 'node:http';
import { handleRequest } from './app.ts';

const port = Number(process.env.PORT ?? 3001);
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 32768) { res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"error":{"code":"BODY_TOO_LARGE"}}'); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks) });
    const response = await handleRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":{"code":"INTERNAL_ERROR"}}'); }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Backend local: http://127.0.0.1:${port}/api/v1/health`));
