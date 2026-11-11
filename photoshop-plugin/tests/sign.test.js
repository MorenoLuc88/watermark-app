const test = require('node:test');
const assert = require('node:assert');
const { createSigner, SignError } = require('../src/sign.js');
const { computeBox, visibleRect } = require('../src/placement.js');
const { loadProfile } = require('../src/profile.js');
const { DEFAULT_SETTINGS } = require('../src/settings.js');

const profile = loadProfile();
const DOC = { id: 1, width: 2000, height: 1000, mode: 'RGB', bitsPerChannel: 8 };

// Faux Photoshop : enregistre l'ordre des appels. gray = niveau de gris du fond renvoyé à la lecture.
function makeFakePs({ doc = DOC, gray = 20, existing = null, existingColor = 'white', failOn = null } = {}) {
  const calls = [];
  let layers = existing ? (Array.isArray(existing) ? [...existing] : [existing]) : [];
  const ps = {
    calls,
    placed: [],
    async getDocument() { calls.push('getDocument'); if (failOn === 'getDocument') throw new Error('boom'); return doc; },
    async readCompositeRegion(d, box) {
      calls.push('readCompositeRegion');
      if (failOn === 'readCompositeRegion') throw new Error('boom');
      return { pixels: new Uint8Array(box.width * box.height * 3).fill(gray), channels: 3, width: box.width, height: box.height };
    },
    async findSignatureLayer() { calls.push('findSignatureLayer'); return layers[0] || null; },
    async removeLayer(d, id) { calls.push('removeLayer:' + id); layers = layers.filter(l => l.id !== id); },
    async detectLayerColor() { calls.push('detectLayerColor'); return existingColor; },
    async placeSignature(d, args) { calls.push('placeSignature'); ps.placed.push(args); },
    async runAsSingleHistoryState(d, name, fn) { calls.push('history:' + name); return fn(); },
  };
  return ps;
}

const signer = (ps, settings = DEFAULT_SETTINGS) => createSigner({ ps, profile, getSettings: () => settings });
const rejectsWith = (p, code) => assert.rejects(p, e => e instanceof SignError && e.code === code, 'code attendu ' + code);

test('sign sans document ouvert lève NO_DOCUMENT et n\'appelle aucune autre action', async () => {
  const ps = makeFakePs({ doc: null });
  await rejectsWith(signer(ps).sign(), 'NO_DOCUMENT');
  assert.deepStrictEqual(ps.calls, ['getDocument']);
});

test('sign refuse CMYK, niveaux de gris et 32 bits (UNSUPPORTED_MODE) sans rien poser', async () => {
  for (const doc of [{ ...DOC, mode: 'CMYK' }, { ...DOC, mode: 'GRAYSCALE' }, { ...DOC, bitsPerChannel: 32 }]) {
    const ps = makeFakePs({ doc });
    await rejectsWith(signer(ps).sign(), 'UNSUPPORTED_MODE');
    assert.ok(!ps.calls.includes('placeSignature'), JSON.stringify(doc));
    assert.ok(!ps.calls.some(c => c.startsWith('history:')), JSON.stringify(doc));
  }
});

test('sign accepte RGB 8 bits et RGB 16 bits', async () => {
  for (const bitsPerChannel of [8, 16]) {
    const ps = makeFakePs({ doc: { ...DOC, bitsPerChannel } });
    const r = await signer(ps).sign();
    assert.strictEqual(r.color, 'white');
    assert.strictEqual(ps.placed.length, 1);
  }
});

test('sign supprime la signature existante avant de lire les pixels, et n\'en laisse qu\'une', async () => {
  const ps = makeFakePs({ existing: { id: 7, bounds: { left: 1, top: 1, width: 10, height: 4 }, opacity: 100 } });
  await signer(ps).sign();
  assert.deepStrictEqual(ps.calls, ['getDocument', 'history:Signer', 'findSignatureLayer', 'removeLayer:7', 'findSignatureLayer', 'readCompositeRegion', 'placeSignature']);
  assert.strictEqual(ps.placed.length, 1);
});

test('sign supprime toutes les signatures existantes (calque dupliqué à la main) avant de mesurer', async () => {
  const b = { left: 1, top: 1, width: 10, height: 4 };
  const ps = makeFakePs({ existing: [{ id: 7, bounds: b, opacity: 100 }, { id: 8, bounds: b, opacity: 100 }] });
  await signer(ps).sign();
  const removals = ps.calls.filter(c => c.startsWith('removeLayer'));
  assert.deepStrictEqual(removals, ['removeLayer:7', 'removeLayer:8']);
  assert.ok(ps.calls.lastIndexOf('removeLayer:8') < ps.calls.indexOf('readCompositeRegion'));
  assert.strictEqual(ps.placed.length, 1);
});

test('sign sans signature existante ne supprime rien', async () => {
  const ps = makeFakePs();
  await signer(ps).sign();
  assert.deepStrictEqual(ps.calls, ['getDocument', 'history:Signer', 'findSignatureLayer', 'readCompositeRegion', 'placeSignature']);
});

test('sign vise la zone visible de la boîte de computeBox, avec la couleur choisie et l\'opacité des réglages', async () => {
  const settings = { position: 'top-left', sizePercent: 20, opacity: 70, margin: 10 };
  const box = computeBox({ position: 'top-left', docWidth: 2000, docHeight: 1000, sizePercent: 20, margin: 10, sourceWidth: profile.width, sourceHeight: profile.height });
  const visible = visibleRect(box, profile);

  const dark = makeFakePs({ gray: 20 });
  const r1 = await signer(dark, settings).sign();
  assert.deepStrictEqual(dark.placed, [{ color: 'white', visible, opacity: 70 }]);
  assert.deepStrictEqual(r1.box, box);

  const light = makeFakePs({ gray: 235 });
  const r2 = await signer(light, settings).sign();
  assert.strictEqual(r2.color, 'black');
  assert.deepStrictEqual(light.placed, [{ color: 'black', visible, opacity: 70 }]);
});

test('sign lit les pixels dans la boîte complète (pas seulement la zone visible)', async () => {
  const ps = makeFakePs();
  let readBox = null;
  const original = ps.readCompositeRegion;
  ps.readCompositeRegion = async (d, b) => { readBox = b; return original(d, b); };
  await signer(ps).sign();
  assert.deepStrictEqual(readBox, computeBox({ ...DEFAULT_SETTINGS, docWidth: 2000, docHeight: 1000, sourceWidth: profile.width, sourceHeight: profile.height }));
});

test('sign utilise les réglages normalisés si le panneau en fournit de mauvais', async () => {
  const ps = makeFakePs();
  await signer(ps, { sizePercent: 'abc', opacity: 9999, position: 'nowhere', margin: -3 }).sign();
  assert.strictEqual(ps.placed[0].opacity, 100);
});

test('sign est exécuté dans un seul état d\'historique nommé « Signer »', async () => {
  const ps = makeFakePs();
  await signer(ps).sign();
  assert.deepStrictEqual(ps.calls.filter(c => c.startsWith('history:')), ['history:Signer']);
});

test('sign transforme une exception de Photoshop en SignError PS_ERROR en gardant la cause', async () => {
  for (const failOn of ['getDocument', 'readCompositeRegion']) {
    const ps = makeFakePs({ failOn });
    await assert.rejects(signer(ps).sign(), e => e instanceof SignError && e.code === 'PS_ERROR' && e.cause.message === 'boom' && /boom/.test(e.message), failOn);
  }
});

test('invert garde la position et l\'opacité d\'un calque déplacé par Luc, dans la couleur opposée', async () => {
  const existing = { id: 7, bounds: { left: 111, top: 222, width: 333, height: 123 }, opacity: 80 };
  const ps = makeFakePs({ existing, existingColor: 'white' });
  const r = await signer(ps).invert();
  assert.strictEqual(r.color, 'black');
  assert.deepStrictEqual(ps.placed, [{ color: 'black', visible: existing.bounds, opacity: 80 }]);
  assert.ok(ps.calls.indexOf('removeLayer:7') < ps.calls.indexOf('placeSignature'), 'suppression avant la pose');
  assert.deepStrictEqual(ps.calls.filter(c => c.startsWith('history:')), ['history:Inverser la signature']);
});

test('invert bascule aussi de noir vers blanc', async () => {
  const ps = makeFakePs({ existing: { id: 3, bounds: { left: 0, top: 0, width: 50, height: 20 }, opacity: 100 }, existingColor: 'black' });
  assert.strictEqual((await signer(ps).invert()).color, 'white');
});

test('invert sans signature lève NO_SIGNATURE sans ouvrir d\'état d\'historique', async () => {
  const ps = makeFakePs({ existing: null });
  await rejectsWith(signer(ps).invert(), 'NO_SIGNATURE');
  assert.ok(!ps.calls.some(c => c.startsWith('history:')));
});

test('invert sans document lève NO_DOCUMENT', async () => {
  await rejectsWith(signer(makeFakePs({ doc: null })).invert(), 'NO_DOCUMENT');
});
