const test = require('node:test');
const assert = require('node:assert');
const { dominantColor } = require('../src/contrast.js');

const rgba = (...px) => new Uint8Array(px.flat());

test('des pixels opaques blancs donnent white, des pixels opaques noirs donnent black', () => {
  assert.strictEqual(dominantColor({ pixels: rgba([255, 255, 255, 255], [250, 250, 250, 255]), channels: 4 }), 'white');
  assert.strictEqual(dominantColor({ pixels: rgba([0, 0, 0, 255], [10, 10, 10, 255]), channels: 4 }), 'black');
});

test('les pixels transparents sont ignorés (un fond transparent blanc ne fait pas gagner white)', () => {
  const pixels = rgba([255, 255, 255, 0], [255, 255, 255, 0], [255, 255, 255, 0], [0, 0, 0, 255]);
  assert.strictEqual(dominantColor({ pixels, channels: 4 }), 'black');
});

test('un tampon RGB (sans alpha) est accepté', () => {
  assert.strictEqual(dominantColor({ pixels: new Uint8Array([240, 240, 240, 250, 250, 250]), channels: 3 }), 'white');
  assert.strictEqual(dominantColor({ pixels: new Uint8Array([5, 5, 5, 20, 20, 20]), channels: 3 }), 'black');
});

test('un tampon entièrement transparent ou vide donne white par défaut', () => {
  assert.strictEqual(dominantColor({ pixels: rgba([0, 0, 0, 0]), channels: 4 }), 'white');
  assert.strictEqual(dominantColor({ pixels: new Uint8Array(0), channels: 4 }), 'white');
});
