const test = require('node:test');
const assert = require('node:assert');
const { loadProfile, decodeProfile } = require('../src/profile.js');

test('loadProfile expose les dimensions du PNG et du masque réduit au quart', () => {
  const p = loadProfile();
  assert.strictEqual(p.width, 820);
  assert.strictEqual(p.height, 304);
  assert.strictEqual(p.mask.width, 205);
  assert.strictEqual(p.mask.height, 76);
  assert.ok(p.mask.alpha instanceof Uint8Array);
  assert.strictEqual(p.mask.alpha.length, 205 * 76);
});

test('les luminances linéaires correspondent à une signature blanche et à une noire', () => {
  const { luminance } = loadProfile();
  assert.ok(luminance.white > 0.95, 'blanc: ' + luminance.white);
  assert.ok(luminance.black < 0.05, 'noir: ' + luminance.black);
});

test('le masque décrit un tracé fin : ni vide, ni plein, marge gauche transparente', () => {
  const { mask } = loadProfile();
  const nonZero = mask.alpha.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  const ratio = nonZero / mask.alpha.length;
  assert.ok(ratio >= 0.03 && ratio <= 0.6, 'part non nulle: ' + ratio);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < 20; x++) assert.strictEqual(mask.alpha[y * mask.width + x], 0, `colonne ${x} ligne ${y}`);
  }
});

test('decodeProfile décode le base64 sans API Node et rejette un masque de mauvaise taille', () => {
  const raw = { width: 4, height: 4, maskWidth: 2, maskHeight: 2, alphaBase64: 'AP8A/w==', luminance: { white: 1, black: 0 } };
  const p = decodeProfile(raw);
  assert.deepStrictEqual(Array.from(p.mask.alpha), [0, 255, 0, 255]);
  assert.throws(() => decodeProfile({ ...raw, maskWidth: 3 }), /masque/);
});
