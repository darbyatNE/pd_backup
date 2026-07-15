import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ClientErrorLogger } from '../src/middleware/clientErrorLogger.js';

function mockRes() {
  return {
    statusCode: undefined,
    body: undefined,
    sent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.sent = true;
      this.body = payload;
      return this;
    },
  };
}

describe('constructor defaults', () => {
  test('applies default log group and region when unset', () => {
    const logger = new ClientErrorLogger({ enabled: false });
    assert.equal(logger.enabled, false);
    assert.equal(logger.logGroupName, '/client/powerdime-frontend-errors');
    assert.ok(logger.region);
  });

  test('honors explicit options', () => {
    const logger = new ClientErrorLogger({
      enabled: false,
      logGroupName: '/custom/group',
      region: 'eu-west-1',
    });
    assert.equal(logger.logGroupName, '/custom/group');
    assert.equal(logger.region, 'eu-west-1');
  });

  test('enabled defaults to true and initializes a stream cache', () => {
    const logger = new ClientErrorLogger();
    assert.equal(logger.enabled, true);
    assert.ok(logger.streamCache instanceof Map);
  });
});

describe('_sanitizeErrorData', () => {
  const logger = new ClientErrorLogger({ enabled: false });

  test('redacts passwords, tokens, api keys and bearer headers', () => {
    const out = logger._sanitizeErrorData({
      errorMessage: 'password=hunter2 token: abc123 api_key=zzz',
      errorStack: 'Authorization: Bearer secrettoken',
    });
    assert.match(out.errorMessage, /\[REDACTED\]/);
    assert.doesNotMatch(out.errorMessage, /hunter2/);
    assert.doesNotMatch(out.errorMessage, /abc123/);
    assert.doesNotMatch(out.errorMessage, /zzz/);
    assert.match(out.errorStack, /\[REDACTED\]/);
    assert.doesNotMatch(out.errorStack, /secrettoken/);
  });

  test('redacts SSNs and credit card numbers', () => {
    const out = logger._sanitizeErrorData({
      errorMessage: 'ssn 123-45-6789 card 4111111111111111',
    });
    assert.doesNotMatch(out.errorMessage, /123-45-6789/);
    assert.doesNotMatch(out.errorMessage, /4111111111111111/);
  });

  test('leaves benign strings untouched and tolerates non-string fields', () => {
    const out = logger._sanitizeErrorData({
      errorMessage: 'Something broke',
      errorStack: undefined,
      url: null,
    });
    assert.equal(out.errorMessage, 'Something broke');
    assert.equal(out.errorStack, undefined);
    assert.equal(out.url, null);
  });

  test('sanitizes breadcrumb data by serializing it', () => {
    const out = logger._sanitizeErrorData({
      errorMessage: 'x',
      breadcrumbs: [{ type: 'api', data: { token: 'abc123' } }],
    });
    assert.equal(typeof out.breadcrumbs[0].data, 'string');
    assert.match(out.breadcrumbs[0].data, /\[REDACTED\]/);
  });

  test('preserves untouched fields via spread', () => {
    const out = logger._sanitizeErrorData({
      errorMessage: 'x',
      severity: 'fatal',
      sessionId: 's-1',
    });
    assert.equal(out.severity, 'fatal');
    assert.equal(out.sessionId, 's-1');
  });
});

describe('_generateFingerprint', () => {
  const logger = new ClientErrorLogger({ enabled: false });

  test('combines error type with a normalized message', () => {
    const fp = logger._generateFingerprint({ errorType: 'TypeError', errorMessage: 'boom' });
    assert.equal(fp, 'TypeError:boom');
  });

  test('normalizes numbers, UUIDs and URLs so similar errors group together', () => {
    const a = logger._generateFingerprint({
      errorType: 'Error',
      errorMessage: 'Failed 42 at https://a.com/x for 550e8400-e29b-41d4-a716-446655440000',
    });
    const b = logger._generateFingerprint({
      errorType: 'Error',
      errorMessage: 'Failed 99 at https://b.com/y for 550e8400-e29b-41d4-a716-446655440001',
    });
    // The message-normalization collapses the dynamic number/UUID/URL parts, so
    // two structurally-identical errors produce the same fingerprint.
    assert.equal(a, b);
    assert.match(a, /N/);
    assert.match(a, /URL/);
  });

  test('tolerates a missing error message', () => {
    const fp = logger._generateFingerprint({ errorType: 'Error' });
    assert.equal(fp, 'Error:');
  });

  test('truncates the fingerprint to 100 characters', () => {
    const fp = logger._generateFingerprint({
      errorType: 'Error',
      errorMessage: 'x'.repeat(500),
    });
    assert.ok(fp.length <= 100);
  });
});

describe('middleware', () => {
  test('returns 204 when logging is disabled', async () => {
    const logger = new ClientErrorLogger({ enabled: false });
    const res = mockRes();
    await logger.middleware()({ body: {} }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.sent, true);
  });

  test('returns 400 when errorMessage is missing', async () => {
    const logger = new ClientErrorLogger({ enabled: true });
    logger._logToCloudWatch = async () => {};
    const res = mockRes();
    await logger.middleware()({ body: { errorType: 'Error' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /errorMessage is required/);
  });

  test('returns 200 and delegates to CloudWatch for a valid report', async () => {
    const logger = new ClientErrorLogger({ enabled: true });
    let received;
    logger._logToCloudWatch = async (data) => {
      received = data;
    };
    const res = mockRes();
    await logger.middleware()({ body: { errorMessage: 'kaboom', severity: 'warning' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.equal(received.errorMessage, 'kaboom');
    assert.equal(received.severity, 'warning');
  });

  test('defaults severity to error and stamps a timestamp', async () => {
    const logger = new ClientErrorLogger({ enabled: true });
    let received;
    logger._logToCloudWatch = async (data) => {
      received = data;
    };
    const res = mockRes();
    await logger.middleware()({ body: { errorMessage: 'x' } }, res);
    assert.equal(received.severity, 'error');
    assert.equal(typeof received.timestamp, 'number');
  });

  test('returns 500 when sanitization throws', async () => {
    const logger = new ClientErrorLogger({ enabled: true });
    const originalConsoleError = console.error;
    console.error = () => {};
    logger._sanitizeErrorData = () => {
      throw new Error('sanitize failure');
    };
    const res = mockRes();
    try {
      await logger.middleware()({ body: { errorMessage: 'x' } }, res);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /Failed to process error report/);
  });

  test('does not throw when CloudWatch logging rejects (fire-and-forget)', async () => {
    const logger = new ClientErrorLogger({ enabled: true });
    const originalConsoleError = console.error;
    console.error = () => {};
    logger._logToCloudWatch = async () => {
      throw new Error('cw down');
    };
    const res = mockRes();
    try {
      await logger.middleware()({ body: { errorMessage: 'x' } }, res);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(res.statusCode, 200);
  });
});
