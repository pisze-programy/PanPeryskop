#!/usr/bin/env node
// IPv4-forcing HTTP CONNECT proxy for the VPS.
//
// Why: tailscaled's own HTTP/SOCKS proxy resolves the target hostname and dials
// it, and its resolver prefers IPv6 (AAAA). The exit node's path (phone/Mac
// cellular/home) has no IPv6 route → every dial to a dual-stack host fails with
// CONNECT 500. This proxy instead:
//   1. receives CONNECT host:443 from the client (node fetch via HTTPS_PROXY),
//   2. resolves the host to IPv4 only (dns family 4),
//   3. dials that IPv4 address through tailscaled's SOCKS5 server (which honors
//      the selected exit node) — so traffic still egresses via the phone/Mac,
//   4. pipes bytes both ways.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

const LISTEN_PORT = Number(process.env.LISTEN_PORT || 1057);
const SOCKS_HOST = process.env.SOCKS_HOST || '127.0.0.1';
const SOCKS_PORT = Number(process.env.SOCKS_PORT || 1055);

// Minimal SOCKS5 CONNECT (no auth) to `address:port`. Address must be IPv4.
function socks5Connect(address, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS_PORT, SOCKS_HOST);
    let buf = Buffer.alloc(0);
    let stage = 'method'; // method -> reply
    const fail = (e) => { sock.destroy(); reject(e); };
    sock.on('error', fail);
    sock.on('connect', () => {
      sock.write(Buffer.from([0x05, 0x01, 0x00])); // version 5, 1 method, no-auth
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'method') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) return fail(new Error('socks5: method rejected'));
        buf = buf.subarray(2);
        stage = 'reply';
        const ip = address.split('.').map(Number);
        const req = Buffer.from([
          0x05, 0x01, 0x00, 0x01, // CONNECT, IPv4
          ip[0], ip[1], ip[2], ip[3],
          port >> 8, port & 0xff,
        ]);
        sock.write(req);
      } else if (stage === 'reply') {
        if (buf.length < 10) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) return fail(new Error(`socks5: connect failed (${buf[1]})`));
        sock.removeListener('error', fail);
        resolve(sock);
      }
    });
  });
}

const server = http.createServer();
server.on('connect', (req, clientSocket, head) => {
  const [host, portStr] = (req.url || '').split(':');
  const port = parseInt(portStr, 10) || 443;
  (async () => {
    const { address } = await dns.lookup(host, { family: 4 });
    const upstream = await socks5Connect(address, port);
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) upstream.write(head);
    // Errors on either side are per-connection noise (exit-node drops, resets) —
    // destroy the pair instead of letting an unhandled 'error' kill the process.
    clientSocket.on('error', () => upstream.destroy());
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  })().catch(() => clientSocket.destroy());
});
server.on('error', (e) => console.error('ipv4-proxy server error:', e.message));
server.listen(LISTEN_PORT, '127.0.0.1', () => console.log(`ipv4-proxy listening on 127.0.0.1:${LISTEN_PORT} -> socks5 ${SOCKS_HOST}:${SOCKS_PORT}`));
