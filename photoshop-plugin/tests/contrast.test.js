const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { chooseColor } = require('../src/contrast.js');
const { computeBox } = require('../src/placement.js');
const { loadProfile } = require('../src/profile.js');
const { processPhoto } = require('../../processor.js');

const profile = loadProfile();
const assets = path.join(__dirname, '..', 'assets');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-contrast-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// 1200x800 : signature réduite (240 px depuis 820) ; 5472x3648 : signature agrandie (1094 px), le cas réel de Luc
const SIZES = [[5472, 3648], [1200, 800]];
const DEFAULT_SIZE = [1200, 800];

function box([W, H] = DEFAULT_SIZE) {
  return computeBox({ position: 'bottom-right', docWidth: W, docHeight: H, sizePercent: 30, margin: 30, sourceWidth: profile.width, sourceHeight: profile.height });
}

// Image uniforme, ou "moitié": noire avec une colonne blanche qui couvre ~56 % de la zone de la signature
// Chaque image n'est créée qu'une fois : sous Windows, sharp garde le fichier ouvert et refuse de le réécrire.
const images = new Map();
function makeImage(kind, size = DEFAULT_SIZE) {
  const key = kind + size.join('x');
  if (!images.has(key)) images.set(key, createImage(kind, size, key));
  return images.get(key);
}

async function createImage(kind, size, key) {
  const [W, H] = size;
  const file = path.join(tmp, key + '.jpg');
  const gray = { dark: 20, light: 235, mid: 118 }[kind];
  if (gray !== undefined) {
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: gray, g: gray, b: gray } } }).jpeg({ quality: 100 }).toFile(file);
  } else {
    const b = box(size);
    const colLeft = b.left + Math.round(b.width * 0.44);
    const white = await sharp({ create: { width: W - colLeft, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: white, left: colLeft, top: 0 }]).jpeg({ quality: 100 }).toFile(file);
  }
  return file;
}

async function readZone(file, size = DEFAULT_SIZE) {
  const b = box(size);
  const { data, info } = await sharp(file).extract({ left: b.left, top: b.top, width: b.width, height: b.height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { pixels: data, channels: info.channels, width: info.width, height: info.height };
}

async function viaApp(file) {
  const r = await processPhoto({
    inputPath: file, outputPath: path.join(tmp, 'out_' + path.basename(file)),
    options: { position: 'bottom-right', sizePercent: 30, opacity: 100, margin: 30, quality: 92, wmWhitePath: path.join(assets, 'Signature_Blanc.png'), wmBlackPath: path.join(assets, 'Signature_noir.png') },
  });
  assert.ok(r.success, r.error);
  return r;
}

test('fond sombre → signature blanche, fond clair → signature noire', async () => {
  const dark = chooseColor({ ...(await readZone(await makeImage('dark'))), profile, opacity: 100 });
  const light = chooseColor({ ...(await readZone(await makeImage('light'))), profile, opacity: 100 });
  assert.strictEqual(dark.color, 'white');
  assert.strictEqual(light.color, 'black');
});

test('parité avec l\'appli : même couleur et scores à moins de 0,05 (sombre, clair, gris moyen, moitié/moitié)', async () => {
  for (const size of SIZES) {
    for (const kind of ['dark', 'light', 'mid', 'half']) {
      const label = `${kind} ${size.join('x')}`;
      const file = await makeImage(kind, size);
      const app = await viaApp(file);
      const mine = chooseColor({ ...(await readZone(file, size)), profile, opacity: 100 });
      assert.strictEqual(mine.color, app.usedColor, `${label}: couleur`);
      assert.ok(Math.abs(mine.scores.white - app.contrast.white) < 0.05, `${label}: score blanc ${mine.scores.white} vs ${app.contrast.white}`);
      assert.ok(Math.abs(mine.scores.black - app.contrast.black) < 0.05, `${label}: score noir ${mine.scores.black} vs ${app.contrast.black}`);
    }
  }
});

test('pixels entièrement transparents : comptés comme blancs (aplatissement JPEG) → signature noire', () => {
  const b = box();
  const rgba = new Uint8Array(b.width * b.height * 4); // tout à 0, alpha compris
  const r = chooseColor({ pixels: rgba, channels: 4, width: b.width, height: b.height, profile, opacity: 100 });
  assert.strictEqual(r.color, 'black');
});

test('un pixel semi-transparent est mélangé sur du blanc avant le calcul', () => {
  const b = box();
  const n = b.width * b.height;
  const rgba = new Uint8Array(n * 4);
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgba.set([0, 0, 0, 128], i * 4);          // noir à 50 % sur blanc ≈ gris 127
    rgb.set([127, 127, 127], i * 3);
  }
  const a = chooseColor({ pixels: rgba, channels: 4, width: b.width, height: b.height, profile, opacity: 100 });
  const c = chooseColor({ pixels: rgb, channels: 3, width: b.width, height: b.height, profile, opacity: 100 });
  assert.ok(Math.abs(a.scores.white - c.scores.white) < 0.05, `${a.scores.white} vs ${c.scores.white}`);
  assert.ok(Math.abs(a.scores.black - c.scores.black) < 0.05, `${a.scores.black} vs ${c.scores.black}`);
});

test('une opacité plus faible garde la couleur mais baisse les scores', async () => {
  const zone = await readZone(await makeImage('dark'));
  const full = chooseColor({ ...zone, profile, opacity: 100 });
  const faint = chooseColor({ ...zone, profile, opacity: 40 });
  assert.strictEqual(faint.color, full.color);
  assert.ok(faint.scores.white < full.scores.white, `${faint.scores.white} < ${full.scores.white}`);
});
