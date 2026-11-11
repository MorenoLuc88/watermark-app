// Les icônes déclarées dans le manifest existent aux 4 échelles attendues par Photoshop (nom@1x, @1.25x, @1.5x, @2x),
// ont la bonne taille et le bon style : pictogramme clair (thème sombre) ou foncé (thème clair) pour le panneau,
// carré plein pour la liste des plugins.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const SCALES = [1, 1.25, 1.5, 2];

const declared = [
  ...manifest.entrypoints.flatMap(e => e.icons || []),
  ...(manifest.icons || []),
];

function scaledPath(iconPath, scale) {
  const { dir, name, ext } = path.parse(iconPath);
  return path.join(root, dir, `${name}@${scale}x${ext}`);
}

async function stats(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0, lum = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3];
    if (a > 128) { opaque++; lum += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; }
  }
  return { width: info.width, height: info.height, coverage: opaque / (info.width * info.height), meanLum: opaque ? lum / opaque : 0 };
}

test('chaque icône du manifest existe aux 4 échelles, à la taille attendue', async () => {
  assert.ok(declared.length >= 3, 'icônes déclarées : ' + declared.length);
  for (const icon of declared) {
    assert.deepStrictEqual(icon.scale, SCALES, icon.path);
    for (const s of SCALES) {
      const file = scaledPath(icon.path, s);
      assert.ok(fs.existsSync(file), path.relative(root, file) + ' manquant');
      const st = await stats(file);
      assert.strictEqual(st.width, Math.round(icon.width * s), file);
      assert.strictEqual(st.height, Math.round(icon.height * s), file);
    }
  }
});

test('icône du panneau : pictogramme clair pour les thèmes sombres, foncé pour les thèmes clairs, ni vide ni plein', async () => {
  for (const icon of declared.filter(i => /panel-/.test(i.path))) {
    const st = await stats(scaledPath(icon.path, 2));
    assert.ok(st.coverage > 0.08 && st.coverage < 0.6, `${icon.path} couverture ${st.coverage.toFixed(2)}`);
    if (icon.theme.includes('dark')) assert.ok(st.meanLum > 180, `${icon.path} trop sombre pour un thème sombre (${st.meanLum.toFixed(0)})`);
    else assert.ok(st.meanLum < 110, `${icon.path} trop claire pour un thème clair (${st.meanLum.toFixed(0)})`);
  }
});

test('icône du plugin (liste des modules) : carré coloré plein, comme Backdrop Clean', async () => {
  const icon = declared.find(i => /plugin/.test(i.path));
  const st = await stats(scaledPath(icon.path, 2));
  assert.ok(st.coverage > 0.8, 'couverture ' + st.coverage.toFixed(2));
});
