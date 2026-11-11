// Vérification statique du panneau (il ne peut s'ouvrir que dans Photoshop) : les fichiers et identifiants
// que panel.js utilise existent bien.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src', 'panel.js'), 'utf8');

test('index.html charge src/panel.js, qui existe', () => {
  assert.match(html, /<script[^>]+src="src\/panel\.js"/);
});

test('chaque identifiant lu par panel.js existe dans index.html', () => {
  const used = [...panel.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(used.length >= 8, 'identifiants trouvés : ' + used.join(','));
  for (const id of new Set(used)) assert.ok(html.includes(`id="${id}"`), `id="${id}" manquant dans index.html`);
});

test('chaque module local requis par panel.js existe, avec son extension (obligatoire dans UXP)', () => {
  const mods = [...panel.matchAll(/require\('(\.[^']+)'\)/g)].map(m => m[1]);
  assert.ok(mods.length >= 5);
  for (const m of mods) {
    assert.match(m, /\.js$/, m + ' sans extension .js');
    assert.ok(fs.existsSync(path.join(root, 'src', m)), m + ' introuvable');
  }
});

test('le panneau propose les 7 positions et les boutons Signer / Inverser', () => {
  for (const p of ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-left', 'top-center', 'center']) {
    assert.ok(html.includes(`value="${p}"`), p);
  }
  assert.ok(html.includes('id="sign"') && html.includes('id="invert"'));
});
