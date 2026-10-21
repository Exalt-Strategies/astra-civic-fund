const { send, onlyMethod } = require('./_lib/http');

function make({ env }) {
  return async function config(req, res) {
    if (!onlyMethod(req, res, 'GET')) return;
    send(res, 200, { stripePk: env.STRIPE_PUBLISHABLE_KEY || '' });
  };
}

module.exports = make({ env: process.env });
module.exports.make = make;
