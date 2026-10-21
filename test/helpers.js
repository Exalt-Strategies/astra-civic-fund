const { Readable } = require('stream');

function fakeReq({ method = 'POST', body, headers = {}, url = '/' } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.headers = { 'x-forwarded-for': '1.2.3.4', ...headers };
  req.url = url;
  return req;
}

function fakeRes() {
  const res = {
    statusCode: 200, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ? String(b) : ''; this.ended = true; },
  };
  res.json = () => JSON.parse(res.body);
  return res;
}

module.exports = { fakeReq, fakeRes };
