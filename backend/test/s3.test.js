import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateS3Key } from '../src/services/s3.js';

test('generateS3Key uses the new role/category structure when both are provided', () => {
  const key = generateS3Key('user-1', 'documents', 'report.pdf', 'seller', 'technical');
  const parts = key.split('/');

  assert.equal(parts[0], 'seller');
  assert.equal(parts[1], 'user-1');
  assert.equal(parts[2], 'technical');
  assert.match(parts[3], /^\d+-report\.pdf$/);
});

test('generateS3Key falls back to the legacy folder structure without role/category', () => {
  const key = generateS3Key('user-2', 'power-plans', 'load.csv');
  const parts = key.split('/');

  assert.equal(parts[0], 'power-plans');
  assert.equal(parts[1], 'user-2');
  assert.match(parts[2], /^\d+-load\.csv$/);
});

test('generateS3Key falls back to legacy structure when only role is provided', () => {
  const key = generateS3Key('user-3', 'documents', 'a.pdf', 'buyer', null);
  assert.ok(key.startsWith('documents/user-3/'));
});

test('generateS3Key falls back to legacy structure when only category is provided', () => {
  const key = generateS3Key('user-4', 'documents', 'a.pdf', null, 'ppa');
  assert.ok(key.startsWith('documents/user-4/'));
});

test('generateS3Key sanitizes unsafe characters in the filename', () => {
  const key = generateS3Key('user-5', 'documents', 'my file (final)@2024!.pdf');
  const filename = key.split('/').pop();

  assert.match(filename, /^\d+-my_file__final__2024_\.pdf$/);
  assert.doesNotMatch(filename, /[^a-zA-Z0-9._-]/);
});

test('generateS3Key preserves dots and hyphens in the filename', () => {
  const key = generateS3Key('user-6', 'documents', 'report-v1.2.final.pdf');
  const filename = key.split('/').pop();

  assert.ok(filename.endsWith('-report-v1.2.final.pdf'));
});

test('generateS3Key embeds a millisecond timestamp prefix on the filename', () => {
  const before = Date.now();
  const key = generateS3Key('user-7', 'documents', 'a.pdf');
  const after = Date.now();

  const timestamp = Number(key.split('/').pop().split('-')[0]);
  assert.ok(Number.isInteger(timestamp));
  assert.ok(timestamp >= before && timestamp <= after);
});
