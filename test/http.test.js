const test = require('node:test');
const assert = require('node:assert/strict');
const { readRaw, readJson, send, clientIp, onlyMethod, query, errInfo } = require('../api/_lib/http');
const { fakeReq, fakeRes } = require('./helpers');

test('readRaw returns the exact bytes', async () => {
  const buf = await readRaw(fakeReq({ body: '{"a":1}' }));
  assert.equal(buf.toString(), '{"a":1}');
});

test('readRaw rejects bodies over the limit', async () => {
  await assert.rejects(readRaw(fakeReq({ body: '01234567890123456789' }), 10), /Body too large/);
});

test('readJson returns null for a body over 1 MB', async () => {
  const big = '"' + 'a'.repeat(1_100_000) + '"';
  assert.equal(await readJson(fakeReq({ body: big })), null);
});

test('readJson returns null for non-object JSON', async () => {
  assert.equal(await readJson(fakeReq({ body: '[1,2]' })), null);
  assert.equal(await readJson(fakeReq({ body: '"x"' })), null);
  assert.equal(await readJson(fakeReq({ body: 'null' })), null);
  assert.equal(await readJson(fakeReq({ body: '42' })), null);
});

test('readJson parses a stream body and returns null on bad JSON', async () => {
  assert.deepEqual(await readJson(fakeReq({ body: { a: 1 } })), { a: 1 });
  assert.equal(await readJson(fakeReq({ body: '{bad' })), null);
  assert.deepEqual(await readJson(fakeReq({})), {});
});

test('readJson prefers an already-parsed req.body', async () => {
  const req = fakeReq({});
  req.body = { b: 2 };
  assert.deepEqual(await readJson(req), { b: 2 });
});

test('send writes JSON with no-store', () => {
  const res = fakeRes();
  send(res, 201, { ok: true });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.json(), { ok: true });
});

test('clientIp uses the first x-forwarded-for entry', () => {
  assert.equal(clientIp(fakeReq({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })), '9.9.9.9');
});

test('onlyMethod rejects other methods with 405', () => {
  const res = fakeRes();
  assert.equal(onlyMethod(fakeReq({ method: 'GET' }), res, 'POST'), false);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(onlyMethod(fakeReq({ method: 'POST' }), fakeRes(), 'POST'), true);
});

test('query parses the URL search params', () => {
  assert.equal(query(fakeReq({ url: '/api/portal?t=abc' })).get('t'), 'abc');
});

test('clientIp prefers x-real-ip over x-forwarded-for', () => {
  assert.equal(clientIp(fakeReq({ headers: { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '9.9.9.9' } })), '7.7.7.7');
});

test('clientIp falls back to the socket address, then unknown', () => {
  const a = fakeReq({});
  a.headers = {};
  a.socket = { remoteAddress: '5.5.5.5' };
  assert.equal(clientIp(a), '5.5.5.5');
  const b = fakeReq({});
  b.headers = {};
  assert.equal(clientIp(b), 'unknown');
});

test('readRaw rejects immediately when the body was already consumed', async () => {
  const req = fakeReq({ body: '{"a":1}' });
  await readRaw(req);
  assert.equal(req.readableEnded, true);
  await assert.rejects(readRaw(req), /Body already consumed/);
});

test('readRaw rejects when the request is complete and fully read but never ended', async () => {
  const req = fakeReq({ body: 'x' });
  Object.defineProperty(req, 'readableEnded', { value: false });
  Object.defineProperty(req, 'readableDidRead', { value: true });
  Object.defineProperty(req, 'readableLength', { value: 0 });
  req.complete = true;
  await assert.rejects(readRaw(req), /Body already consumed/);
});

test('readRaw still reads a complete request whose body is buffered and unread', async () => {
  const req = fakeReq({ body: 'abc' });
  req.complete = true;
  assert.equal((await readRaw(req)).toString(), 'abc');
});

test('errInfo includes the error name and never the message', () => {
  const abort = Object.assign(new Error('jane@example.org secret'), { name: 'AbortError' });
  const out = errInfo(abort);
  assert.match(out, /name=AbortError/);
  assert.doesNotMatch(out, /jane|secret/);
  assert.match(errInfo(new TypeError('boom')), /name=TypeError/);
  assert.equal(errInfo(null), '');
});
