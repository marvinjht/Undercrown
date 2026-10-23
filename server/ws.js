// A small WebSocket server (RFC 6455) on top of Node's http module, so the server needs no packages.
// Text messages only (the game sends JSON). Handles ping/pong, close, fragmented and large frames.
'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 8 * 1024 * 1024;   // 8 MB: a whole tournament round of fights fits easily

class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock; this.buf = Buffer.alloc(0); this.frags = []; this.fragOp = 0; this.open = true;
    sock.setNoDelay(true);
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  send(text) {
    if (!this.open) return;
    const payload = Buffer.from(text, 'utf8');
    this._frame(0x1, payload);
  }
  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code, 0);
    try { this._frame(0x8, b); this.sock.end(); } catch (e) { /* gone */ }
    this._closed();
  }
  _frame(op, payload) {
    const n = payload.length;
    let head;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    head[0] = 0x80 | op;
    try { this.sock.write(Buffer.concat([head, payload])); } catch (e) { this._closed(); }
  }
  _closed() {
    if (!this.open) return;
    this.open = false;
    try { this.sock.destroy(); } catch (e) { /* gone */ }
    this.emit('close');
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MESSAGE) { this.close(1009); return; }
      const mOff = off; if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = b.subarray(off, off + len);
      if (masked) {
        const mask = b.subarray(mOff, mOff + 4), out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }
      this.buf = b.subarray(off + len);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._frame(0xA, payload); continue; }   // ping -> pong
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2) { this.frags = [payload]; this.fragOp = op; }
      else if (op === 0x0) this.frags.push(payload);
      else continue;
      if (fin) {
        const all = Buffer.concat(this.frags); this.frags = [];
        if (this.fragOp === 0x1) this.emit('message', all.toString('utf8'));
      }
    }
  }
}

// Turns an http server's upgrade requests on `path` into Socket objects
function attach(server, path, onConnection) {
  server.on('upgrade', (req, sock) => {
    const url = (req.url || '').split('?')[0];
    const key = req.headers['sec-websocket-key'];
    if (url !== path || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onConnection(new Socket(sock), req);
  });
}

module.exports = { attach };
