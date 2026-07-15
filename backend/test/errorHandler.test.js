import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { errorHandler } from '../src/middleware/errorHandler.js';

// The handler logs via console.error; silence it so test output stays clean.
let originalConsoleError;
beforeEach(() => {
  originalConsoleError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalConsoleError;
});

function mockRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('errorHandler uses err.statusCode and err.message when provided', () => {
  const res = mockRes();
  errorHandler({ statusCode: 404, message: 'Not Found' }, {}, res, () => {});

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not Found' });
});

test('errorHandler defaults to 500 and a generic message', () => {
  const res = mockRes();
  errorHandler({}, {}, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Internal Server Error');
});

test('errorHandler includes the stack only in development', () => {
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    const res = mockRes();
    errorHandler({ message: 'boom', stack: 'STACK' }, {}, res, () => {});
    assert.equal(res.body.stack, 'STACK');

    process.env.NODE_ENV = 'production';
    const res2 = mockRes();
    errorHandler({ message: 'boom', stack: 'STACK' }, {}, res2, () => {});
    assert.equal(res2.body.stack, undefined);
    assert.ok(!('stack' in res2.body));
  } finally {
    process.env.NODE_ENV = prev;
  }
});
