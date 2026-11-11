// Teste ps.js contre un faux Photoshop calqué sur les mesures de l'essai (docs/superpowers/specs/…-spike-findings.md).
const test = require('node:test');
const assert = require('node:assert');
const { createPs } = require('../src/ps.js');
const { createSigner } = require('../src/sign.js');
const { loadProfile } = require('../src/profile.js');
const { DEFAULT_SETTINGS } = require('../src/settings.js');
const { visibleRect, computeBox } = require('../src/placement.js');

function makeLayer(props = {}) {
  const layer = {
    id: 1, name: 'calque', kind: 'pixel', opacity: 100, layers: [],
    bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    deleted: false, scaled: null, translated: null,
    delete() { layer.deleted = true; },
    async scale(w, h, anchor) {
      const b = layer.bounds;
      layer.scaled = { w, h, anchor };
      layer.bounds = { left: b.left, top: b.top, right: b.left + Math.round((b.right - b.left) * w / 100), bottom: b.top + Math.round((b.bottom - b.top) * h / 100) };
    },
    async translate(dx, dy) {
      const b = layer.bounds;
      layer.translated = { dx, dy };
      layer.bounds = { left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy };
    },
    ...props,
  };
  return layer;
}

function makeHost({ doc, pixels } = {}) {
  const calls = [];
  const host = {
    calls,
    getPixelsArgs: [],
    disposed: 0,
    photoshop: {
      app: { documents: doc ? [doc] : [], activeDocument: doc || null },
      core: {
        async executeAsModal(fn, opts) {
          calls.push('modal:' + opts.commandName);
          return fn({
            hostControl: {
              async suspendHistory(o) { calls.push('suspend:' + o.name + ':' + o.documentID); return 99; },
              async resumeHistory(id) { calls.push('resume:' + id); },
            },
          });
        },
      },
      action: {
        async batchPlay(cmds) {
          calls.push('batchPlay:' + cmds[0]._obj + ':' + cmds[0].null._path + ':linked=' + cmds[0].linked);
          // Photoshop pose un objet dynamique au centre, sur sa zone visible (2000 x 586 dans l'essai)
          const placed = makeLayer({ id: 9, name: 'Signature_Blanc', kind: 'smartObject', bounds: { left: 804, top: 2443, right: 2804, bottom: 3029 } });
          doc.layers.unshift(placed);
          doc.activeLayers = [placed];
        },
      },
      imaging: {
        async getPixels(args) {
          host.getPixelsArgs.push(args);
          const p = pixels || { components: 3, width: 4, height: 2, data: new Uint8Array(4 * 2 * 3).fill(90) };
          return {
            sourceBounds: args.sourceBounds,
            imageData: {
              width: p.width, height: p.height, components: p.components,
              async getData() { return p.data; },
              dispose() { host.disposed++; },
            },
          };
        },
      },
      constants: {
        DocumentMode: { BITMAP: 'bitmapMode', CMYK: 'CMYKColorMode', GRAYSCALE: 'grayscaleMode', RGB: 'RGBColorMode' },
        BitsPerChannelType: { ONE: 'bitDepth1', EIGHT: 'bitDepth8', SIXTEEN: 'bitDepth16', THIRTYTWO: 'bitDepth32' },
        AnchorPosition: { TOPLEFT: 'topLeft' },
      },
    },
    uxp: {
      storage: {
        localFileSystem: {
          async getPluginFolder() {
            return { async getEntry(name) { calls.push('entry:' + name); return { async getEntry(f) { calls.push('entry:' + f); return { name: f }; } }; } };
          },
          createSessionToken(file) { return 'token:' + file.name; },
        },
      },
    },
  };
  return host;
}

const makeDoc = (props = {}) => ({ id: 60, width: 3648, height: 5472, mode: 'RGBColorMode', bitsPerChannel: 'bitDepth8', layers: [], activeLayers: [], ...props });

test('getDocument renvoie null quand aucun document n\'est ouvert', async () => {
  const ps = createPs(makeHost({ doc: null }));
  assert.strictEqual(await ps.getDocument(), null);
});

test('getDocument normalise le mode (nom de la constante) et la profondeur (nombre)', async () => {
  const cases = [
    [{ mode: 'RGBColorMode', bitsPerChannel: 'bitDepth8' }, 'RGB', 8],
    [{ mode: 'RGBColorMode', bitsPerChannel: 'bitDepth16' }, 'RGB', 16],
    [{ mode: 'CMYKColorMode', bitsPerChannel: 'bitDepth8' }, 'CMYK', 8],
    [{ mode: 'grayscaleMode', bitsPerChannel: 'bitDepth32' }, 'GRAYSCALE', 32],
  ];
  for (const [props, mode, bits] of cases) {
    const ps = createPs(makeHost({ doc: makeDoc(props) }));
    assert.deepStrictEqual(await ps.getDocument(), { id: 60, width: 3648, height: 5472, mode, bitsPerChannel: bits }, JSON.stringify(props));
  }
});

test('findSignatureLayer retrouve « Signature LM » même dans un groupe, avec bornes visibles et opacité', async () => {
  const sig = makeLayer({ id: 9, name: 'Signature LM', kind: 'smartObject', opacity: 80, bounds: { left: 2663, top: 5121, right: 3462, bottom: 5356 } });
  const group = makeLayer({ id: 7, name: 'Frequency Separation', kind: 'group', layers: [makeLayer({ id: 6, name: 'high' }), sig] });
  const doc = makeDoc({ layers: [group, makeLayer({ id: 1, name: 'Arrière-plan' })] });
  const ps = createPs(makeHost({ doc }));
  assert.deepStrictEqual(await ps.findSignatureLayer(doc), { id: 9, bounds: { left: 2663, top: 5121, width: 799, height: 235 }, opacity: 80 });
});

test('findSignatureLayer renvoie null sans calque « Signature LM »', async () => {
  const doc = makeDoc({ layers: [makeLayer({ id: 1, name: 'Signature' }), makeLayer({ id: 2, name: 'signature lm ' })] });
  assert.strictEqual(await createPs(makeHost({ doc })).findSignatureLayer(doc), null);
});

test('removeLayer supprime le calque (même dans un groupe) dans une étape modale', async () => {
  const inner = makeLayer({ id: 9, name: 'Signature LM' });
  const doc = makeDoc({ layers: [makeLayer({ id: 7, kind: 'group', layers: [inner] })] });
  const host = makeHost({ doc });
  await createPs(host).removeLayer(doc, 9);
  assert.strictEqual(inner.deleted, true);
  assert.deepStrictEqual(host.calls, ['modal:Supprimer la signature']);
});

test('runAsSingleHistoryState : modale, suspension, action, reprise — et reprise même si l\'action échoue', async () => {
  const doc = makeDoc();
  const host = makeHost({ doc });
  const ps = createPs(host);
  const value = await ps.runAsSingleHistoryState(doc, 'Signer', async () => { host.calls.push('action'); return 'ok'; });
  assert.strictEqual(value, 'ok');
  assert.deepStrictEqual(host.calls, ['modal:Signer', 'suspend:Signer:60', 'action', 'resume:99']);

  host.calls.length = 0;
  await assert.rejects(ps.runAsSingleHistoryState(doc, 'Signer', async () => { throw new Error('boom'); }), /boom/);
  assert.deepStrictEqual(host.calls, ['modal:Signer', 'suspend:Signer:60', 'resume:99']);
});

test('readCompositeRegion lit le composite sRGB 8 bits de la boîte, copie les pixels et libère l\'image', async () => {
  const doc = makeDoc();
  const data = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  const host = makeHost({ doc, pixels: { components: 3, width: 4, height: 2, data } });
  const r = await createPs(host).readCompositeRegion(doc, { left: 2524, top: 5036, width: 1094, height: 406 });
  assert.deepStrictEqual(host.getPixelsArgs, [{
    documentID: 60,
    sourceBounds: { left: 2524, top: 5036, right: 3618, bottom: 5442 },
    colorSpace: 'RGB', componentSize: 8, colorProfile: 'sRGB IEC61966-2.1',
  }]);
  assert.strictEqual(r.channels, 3);
  assert.strictEqual(r.width, 4);
  assert.strictEqual(r.height, 2);
  assert.deepStrictEqual(Array.from(r.pixels), Array.from(data));
  assert.notStrictEqual(r.pixels, data, 'copie, pas la mémoire de l\'image libérée');
  assert.strictEqual(host.disposed, 1);
});

test('readCompositeRegion accepte 4 composantes (document à plusieurs calques)', async () => {
  const doc = makeDoc();
  const host = makeHost({ doc, pixels: { components: 4, width: 1, height: 1, data: Uint8Array.from([10, 20, 30, 255]) } });
  const r = await createPs(host).readCompositeRegion(doc, { left: 0, top: 0, width: 1, height: 1 });
  assert.strictEqual(r.channels, 4);
});

test('une lecture dans une étape déjà modale ne rouvre pas de modale (pas de modale imbriquée)', async () => {
  const doc = makeDoc();
  const host = makeHost({ doc });
  const ps = createPs(host);
  await ps.runAsSingleHistoryState(doc, 'Signer', () => ps.readCompositeRegion(doc, { left: 0, top: 0, width: 4, height: 2 }));
  assert.deepStrictEqual(host.calls.filter(c => c.startsWith('modal:')), ['modal:Signer']);
});

test('placeSignature : pose, met à l\'échelle sur la zone visible, déplace, règle opacité et nom', async () => {
  const doc = makeDoc();
  const host = makeHost({ doc });
  const target = { left: 2663, top: 5121, width: 800, height: 235 };
  await createPs(host).placeSignature(doc, { color: 'white', visible: target, opacity: 85 });

  assert.ok(host.calls.includes('entry:assets') && host.calls.includes('entry:Signature_Blanc.png'));
  assert.ok(host.calls.includes('batchPlay:placeEvent:token:Signature_Blanc.png:linked=false'), host.calls.join(' | '));
  const layer = doc.layers[0];
  assert.deepStrictEqual(layer.scaled, { w: 40, h: 40, anchor: 'topLeft' }); // 800 / 2000 visibles
  assert.deepStrictEqual(layer.bounds, { left: 2663, top: 5121, right: 3463, bottom: 5121 + 234 });
  assert.strictEqual(layer.opacity, 85);
  assert.strictEqual(layer.name, 'Signature LM');
});

test('placeSignature choisit le PNG noir pour la couleur black', async () => {
  const doc = makeDoc();
  const host = makeHost({ doc });
  await createPs(host).placeSignature(doc, { color: 'black', visible: { left: 0, top: 0, width: 400, height: 100 }, opacity: 100 });
  assert.ok(host.calls.some(c => c.includes('token:Signature_noir.png')), host.calls.join(' | '));
});

test('detectLayerColor lit les pixels du calque (zone visible) : signature blanche -> white, noire -> black', async () => {
  const sig = makeLayer({ id: 9, name: 'Signature LM', kind: 'smartObject', bounds: { left: 2663, top: 5121, right: 3462, bottom: 5356 } });
  const doc = makeDoc({ layers: [sig] });
  for (const [rgb, expected] of [[255, 'white'], [0, 'black']]) {
    const host = makeHost({ doc, pixels: { components: 4, width: 2, height: 1, data: Uint8Array.from([rgb, rgb, rgb, 255, 0, 0, 0, 0]) } });
    assert.strictEqual(await createPs(host).detectLayerColor(doc, 9), expected);
    assert.deepStrictEqual(host.getPixelsArgs[0].sourceBounds, { left: 2663, top: 5121, right: 3462, bottom: 5356 });
    assert.strictEqual(host.getPixelsArgs[0].layerID, 9);
  }
});

// --- Bout en bout : createSigner + createPs sur un faux Photoshop. getDocument() renvoie une fiche (id, taille, mode) :
// les autres fonctions doivent retrouver le vrai document par son id (bug réel : « layers is not iterable »).
function makeEndToEnd() {
  const doc = makeDoc({ layers: [makeLayer({ id: 1, name: 'Arrière-plan' })] });
  const host = makeHost({ doc });
  const read = host.photoshop.imaging.getPixels;
  host.photoshop.imaging.getPixels = async (args) => {
    // une lecture de calque (layerID) renvoie la signature blanche ; sinon le composite sombre
    if (args.layerID !== undefined) {
      args = { ...args };
      host.getPixelsArgs.push(args);
      return { sourceBounds: args.sourceBounds, imageData: { width: 2, height: 1, components: 4, async getData() { return Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 0]); }, dispose() { host.disposed++; } } };
    }
    return read(args);
  };
  host.photoshop.app.documents = [doc];
  const profile = loadProfile();
  const ps = createPs(host);
  return { doc, host, profile, signer: createSigner({ ps, profile, getSettings: () => DEFAULT_SETTINGS }) };
}

test('bout en bout : sign pose une signature « Signature LM » blanche sur la zone visible attendue', async () => {
  const { doc, profile, signer } = makeEndToEnd();
  const result = await signer.sign();
  assert.strictEqual(result.color, 'white');
  const sig = doc.layers.find(l => l.name === 'Signature LM');
  assert.ok(sig, 'calque Signature LM créé');
  const box = computeBox({ ...DEFAULT_SETTINGS, docWidth: doc.width, docHeight: doc.height, sourceWidth: profile.width, sourceHeight: profile.height });
  const v = visibleRect(box, profile);
  assert.strictEqual(sig.bounds.left, v.left);
  assert.strictEqual(sig.bounds.top, v.top);
  assert.ok(Math.abs((sig.bounds.right - sig.bounds.left) - v.width) <= 1);
});

test("bout en bout : un second sign remplace la signature au lieu d'en empiler une autre", async () => {
  const { doc, signer } = makeEndToEnd();
  await signer.sign();
  await signer.sign();
  assert.strictEqual(doc.layers.filter(l => l.name === 'Signature LM' && !l.deleted).length, 1);
});

test('bout en bout : invert passe de blanc à noir en gardant la position du calque', async () => {
  const { doc, host, signer } = makeEndToEnd();
  await signer.sign();
  const before = doc.layers.find(l => l.name === 'Signature LM' && !l.deleted).bounds;
  const result = await signer.invert();
  assert.strictEqual(result.color, 'black');
  assert.ok(host.calls.some(c => c.includes('token:Signature_noir.png')), 'PNG noir posé');
  const after = doc.layers.find(l => l.name === 'Signature LM' && !l.deleted);
  assert.strictEqual(after.bounds.left, before.left);
  assert.strictEqual(after.bounds.top, before.top);
});
