import { expect, test } from 'vitest';
import {
  isElementId,
  isOpaqueId,
  isTemplate,
  isUuid,
  looksSensitive,
} from '../src/collector/sanitize.js';

test.each([
  '/',
  '/board/:id',
  '/api/boards/:boardId/cards',
  '/settings/billing',
  '/v2/items',
  '/api/cards/:cardId/move',
])('accepts template %s', (value) => {
  expect(isTemplate(value)).toBe(true);
});

test.each([
  ['raw id', '/board/123'],
  ['uuid', '/board/3f2c1a4e-1b2c-4d5e-8f90-123456789abc'],
  ['hex id', '/board/deadbeefcafe'],
  ['id with 4 digits', '/board/b1234'],
  ['long token', '/reset/abcdefghijklmnopqrstuvwxyz1'],
  ['email', '/user/jane@example.com'],
  ['query string', '/boards?id=3'],
  ['fragment', '/boards#x'],
  ['full url', 'https://orqea.com/boards'],
  ['no leading slash', 'boards'],
  ['trailing slash', '/boards/'],
  ['uppercase word', '/Boards'],
  ['empty', ''],
  ['not a string', 42],
  ['too long', `/${'a'.repeat(200)}`],
  ['bad param', '/board/:1x'],
  ['empty segment', '//boards'],
])('rejects %s', (_label, value) => {
  expect(isTemplate(value)).toBe(false);
});

test('uuid check', () => {
  expect(isUuid('3F2C1A4E-1B2C-4D5E-8F90-123456789ABC')).toBe(true);
  expect(isUuid('nope')).toBe(false);
  expect(isUuid(3)).toBe(false);
});

test.each([
  'contact jane.doe@example.com',
  'from 192.168.1.20',
  'addr fe80:0:0:0:200:f8ff:fe21:67cf',
  'card 3f2c1a4e-1b2c-4d5e-8f90-123456789abc',
  'phone 0612345678',
  'jwt eyJhbGciOiJIUzI1NiJ9',
  'Bearer abc',
  'bad password',
  'GET https://x.test/a?token=1',
  'ref abcdefghijklmnopqrstuvwxyzABCDEFGH01',
])('flags sensitive message: %s', (text) => {
  expect(looksSensitive(text)).toBe(true);
});

test.each(['card is null', 'Cannot read properties of undefined', 'timeout after 30s'])(
  'lets a sanitised message through: %s',
  (text) => {
    expect(looksSensitive(text)).toBe(false);
  },
);

test('opaque ids and element ids', () => {
  expect(isOpaqueId('v_0123456789abcdef')).toBe(true);
  expect(isOpaqueId('short')).toBe(false);
  expect(isOpaqueId('jane@example.com')).toBe(false);
  expect(isOpaqueId('10.0.0.1-aaaaaa')).toBe(false);
  expect(isOpaqueId(null)).toBe(false);
  expect(isElementId('landing.hero.cta')).toBe(true);
  expect(isElementId('Sign up now')).toBe(false);
  expect(isElementId(undefined)).toBe(false);
});
