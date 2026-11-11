const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_SETTINGS, normalizeSettings } = require('../src/settings.js');

test('les valeurs par défaut sont celles décidées par Luc', () => {
  assert.deepStrictEqual(DEFAULT_SETTINGS, { position: 'bottom-right', sizePercent: 30, opacity: 100, margin: 30 });
});

test('une valeur absente ou illisible donne les réglages par défaut', () => {
  assert.deepStrictEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepStrictEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepStrictEqual(normalizeSettings('x'), DEFAULT_SETTINGS);
  assert.deepStrictEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test('la taille est bornée entre 3 et 50 %', () => {
  assert.strictEqual(normalizeSettings({ sizePercent: 999 }).sizePercent, 50);
  assert.strictEqual(normalizeSettings({ sizePercent: 1 }).sizePercent, 3);
});

test('l\'opacité est bornée entre 10 et 100 %', () => {
  assert.strictEqual(normalizeSettings({ opacity: 0 }).opacity, 10);
  assert.strictEqual(normalizeSettings({ opacity: 250 }).opacity, 100);
});

test('la marge est bornée entre 0 et 150 px', () => {
  assert.strictEqual(normalizeSettings({ margin: -5 }).margin, 0);
  assert.strictEqual(normalizeSettings({ margin: 400 }).margin, 150);
});

test('une position inconnue retombe sur bas droite, une position valide est conservée', () => {
  assert.strictEqual(normalizeSettings({ position: 'nowhere' }).position, 'bottom-right');
  assert.strictEqual(normalizeSettings({ position: 'top-left' }).position, 'top-left');
});

test('une valeur non numérique retombe sur le défaut, un nombre en chaîne est accepté', () => {
  assert.strictEqual(normalizeSettings({ sizePercent: 'abc' }).sizePercent, 30);
  assert.strictEqual(normalizeSettings({ sizePercent: '25' }).sizePercent, 25);
  assert.strictEqual(normalizeSettings({ margin: NaN }).margin, 30);
  assert.strictEqual(normalizeSettings({ opacity: Infinity }).opacity, 100);
});

test('les décimales sont arrondies à l\'entier', () => {
  assert.strictEqual(normalizeSettings({ sizePercent: 24.6 }).sizePercent, 25);
});
