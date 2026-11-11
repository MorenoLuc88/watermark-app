const test = require('node:test');
const assert = require('node:assert');
const { computeBox, POSITIONS } = require('../src/placement.js');
const { computePlacement } = require('../../processor.js');

const SRC = { sourceWidth: 820, sourceHeight: 304 };

test('portrait 3648x5472, 30 %, marge 30, bas droite : boîte de 1094x406 collée en bas à droite', () => {
  const box = computeBox({ position: 'bottom-right', docWidth: 3648, docHeight: 5472, sizePercent: 30, margin: 30, ...SRC });
  assert.deepStrictEqual(box, { left: 3648 - 1094 - 30, top: 5472 - 406 - 30, width: 1094, height: 406 });
});

test('paysage 5472x3648 : même largeur que le portrait (taille calculée sur le petit côté)', () => {
  const box = computeBox({ position: 'bottom-right', docWidth: 5472, docHeight: 3648, sizePercent: 30, margin: 30, ...SRC });
  assert.strictEqual(box.width, 1094);
  assert.strictEqual(box.height, 406);
});

test('les 7 positions donnent les mêmes left/top que computePlacement de l\'appli', () => {
  assert.strictEqual(POSITIONS.length, 7);
  for (const [w, h] of [[3648, 5472], [5472, 3648], [1200, 800]]) {
    for (const position of POSITIONS) {
      const box = computeBox({ position, docWidth: w, docHeight: h, sizePercent: 30, margin: 30, ...SRC });
      const expected = computePlacement(position, w, h, box.width, box.height, 30);
      // computePlacement renvoie { x, y } ; le plugin les nomme left/top
      assert.deepStrictEqual({ left: box.left, top: box.top }, { left: expected.x, top: expected.y }, `${position} ${w}x${h}`);
    }
  }
});

test('signature plus grande que l\'image : la boîte reste entièrement dans le document', () => {
  const box = computeBox({ position: 'bottom-right', docWidth: 100, docHeight: 60, sizePercent: 50, margin: 500, ...SRC });
  assert.ok(box.left >= 0 && box.top >= 0, JSON.stringify(box));
  assert.ok(box.left + box.width <= 100, JSON.stringify(box));
  assert.ok(box.top + box.height <= 60, JSON.stringify(box));
  assert.ok(box.width >= 1 && box.height >= 1);
});

test('signature plus haute que l\'image (document très large et plat) : réduite proportionnellement', () => {
  const box = computeBox({ position: 'center', docWidth: 5000, docHeight: 10, sizePercent: 50, margin: 0, ...SRC });
  assert.ok(box.height <= 10 && box.width <= 5000, JSON.stringify(box));
  assert.ok(Math.abs(box.width / box.height - 820 / 304) < 0.5, 'proportions conservées : ' + JSON.stringify(box));
});

test('une position inconnue retombe sur bas droite', () => {
  const a = computeBox({ position: 'nowhere', docWidth: 2000, docHeight: 1000, sizePercent: 30, margin: 30, ...SRC });
  const b = computeBox({ position: 'bottom-right', docWidth: 2000, docHeight: 1000, sizePercent: 30, margin: 30, ...SRC });
  assert.deepStrictEqual(a, b);
});
