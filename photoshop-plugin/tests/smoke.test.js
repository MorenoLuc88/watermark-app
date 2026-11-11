const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('le manifest est un JSON valide pour Photoshop (manifest v5)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.manifestVersion, 5);
  assert.strictEqual(manifest.host.app, 'PS');
});

test('les deux signatures PNG sont embarquées dans le plugin', () => {
  for (const f of ['Signature_Blanc.png', 'Signature_noir.png']) {
    assert.ok(fs.existsSync(path.join(root, 'assets', f)), f + ' manquant');
  }
});
