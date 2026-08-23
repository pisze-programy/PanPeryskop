#!/usr/bin/env node
// Byte-counting CONNECT proxy — relays HTTPS traffic to a Webshare residential
// HTTP proxy and counts the payload bytes that actually flow through Webshare.
// Used to measure the real daily MB cost of a full seed run. New tool file.
//
// Usage:
//   WEBSHARE_UPSTREAM=host:port WEBSHARE_USER=u WEBSHARE_PASS=p \
//     STATS_FILE=/tmp/proxy-stats.json node count-proxy.mjs
// Then point HTTPS_PROXY at http://127.0.0.1:PORT (default 1088).
// Stats are written to STATS_FILE every 2s and on exit.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 1088);
const UP_HOST = process.env.WEBSHARE_UPSTREAM || 'p.webshare.io:80';
const USER = process.env.WEBSHARE_USER || '';
const PASS = process.env.WEBSHARE_PASS || '';
const STATS = process.env.STATS_FILE || '/tmp/proxy-stats.json';

let up = 0;
let down = 0;
let connects = 0;
let errs = 0;

function writeStats() {
  try {
    fs.writeFileSync(STATS, JSON.stringify({
      connects, up, down,
      upMB: +(up / 1048576).toFixed(3),
      downMB: +(down / 1048576).toFixed(3),
      totalMB: +((up + down) / 1048576).toFixed(3),
    }));
  } catch { /* noop */ }
}
setInterval(writeStats, 2000).unref();
const onExit = () => { writeStats(); process.exit(0); };
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);

const [uphost, upport] = UP_HOST.split(':');

const server = http.createServer();
server.on('connect', (req, clientSock, head) => {
  connects++;
  const target = req.url || ''; // "host:port"
  const upSock = net.connect(Number(upport), uphost);
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

  upSock.on('connect', () => {
    upSock.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${auth}\r\n\r\n`);
  });

  let buf = Buffer.alloc(0);
  let relayed = false;
  let pendingToUp = head && head.length ? head : Buffer.alloc(0);

  upSock.on('data', (c) => {
    if (!relayed) {
      buf = Buffer.concat([buf, c]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const status = buf.slice(0, idx).toString().split('\r\n')[0];
      if (!/^HTTP\/1\.[01] 200/.test(status)) {
        errs++;
        clientSock.destroy();
        upSock.destroy();
        return;
      }
      buf = buf.slice(idx + 4);
      relayed = true;
      clientSock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (buf.length) {
        down += buf.length;
        clientSock.write(buf);
      }
      if (pendingToUp.length) {
        up += pendingToUp.length;
        upSock.write(pendingToUp);
      }
      return;
    }
    down += c.length;
    clientSock.write(c);
  });

  clientSock.on('data', (c) => {
    if (!relayed) {
      pendingToUp = Buffer.concat([pendingToUp, c]);
      return;
    }
    up += c.length;
    upSock.write(c);
  });

  const kill = () => { try { clientSock.destroy(); } catch {} try { upSock.destroy(); } catch {} };
  clientSock.on('error', kill);
  upSock.on('error', () => { errs++; kill(); });
  clientSock.on('close', () => upSock.destroy());
  upSock.on('close', () => clientSock.destroy());
});

server.on('error', (e) => console.error('count-proxy error:', e.message));
server.listen(PORT, '127.0.0.1', () => console.log(`count-proxy on 127.0.0.1:${PORT} -> ${UP_HOST} (stats: ${STATS})`));
