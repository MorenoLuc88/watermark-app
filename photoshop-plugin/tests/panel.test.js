// Vérification statique du panneau (il ne peut s'ouvrir que dans Photoshop) : les fichiers et identifiants
// que panel.js utilise existent bien.
//
// Règle UXP mesurée dans Photoshop 28 (journal : « Module not found: "./profile.js". Parent module folder was: "./" ») :
// le script chargé par la page résout ses require depuis la RACINE du plugin, alors qu'un module requis les résout
// depuis son propre dossier.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptSrc = (html.match(/<script[^>]+src="([^"]+)"/) || [])[1];
const panelFile = path.join(root, scriptSrc || 'panel.js');
const panel = fs.existsSync(panelFile) ? fs.readFileSync(panelFile, 'utf8') : '';

const requiresOf = (source) => [...source.matchAll(/require\('(\.[^']+)'\)/g)].map(m => m[1]);

// Parcourt les require locaux depuis le script de la page ; renvoie les modules introuvables selon la règle UXP.
function missingModules() {
  const missing = [];
  const seen = new Set();
  (function visit(file, baseDir) {
    for (const rel of requiresOf(fs.readFileSync(file, 'utf8'))) {
      const target = path.join(baseDir, rel);
      if (!fs.existsSync(target)) { missing.push(`${path.relative(root, file)} -> ${rel}`); continue; }
      if (seen.has(target)) continue;
      seen.add(target);
      visit(target, path.dirname(target));
    }
  })(panelFile, root);
  return missing;
}

test('index.html charge un script qui existe', () => {
  assert.ok(scriptSrc, 'balise <script src> absente');
  assert.ok(fs.existsSync(panelFile), scriptSrc + ' introuvable');
});

test('chaque identifiant lu par le panneau existe dans index.html', () => {
  const used = [...panel.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(used.length >= 8, 'identifiants trouvés : ' + used.join(','));
  for (const id of new Set(used)) assert.ok(html.includes(`id="${id}"`), `id="${id}" manquant dans index.html`);
});

test('tous les require locaux, à chaque niveau, se résolvent comme dans UXP (racine du plugin pour le script de la page)', () => {
  assert.ok(requiresOf(panel).length >= 5);
  assert.deepStrictEqual(missingModules(), []);
});

test('tous les require locaux ont l\'extension .js (obligatoire dans UXP)', () => {
  const files = [panelFile];
  for (const f of fs.readdirSync(path.join(root, 'src'))) if (f.endsWith('.js')) files.push(path.join(root, 'src', f));
  for (const f of files) for (const m of requiresOf(fs.readFileSync(f, 'utf8'))) assert.match(m, /\.js$/, `${path.basename(f)}: ${m}`);
});

test('le panneau propose les 7 positions et les boutons Signer / Inverser', () => {
  for (const p of ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-left', 'top-center', 'center']) {
    assert.ok(html.includes(`value="${p}"`), p);
  }
  assert.ok(html.includes('id="sign"') && html.includes('id="invert"'));
});

test('une erreur au démarrage (require introuvable...) est affichée dans le panneau au lieu de le laisser muet', () => {
  assert.match(panel, /function fatal\(/);
  assert.match(panel, /try\s*{\s*main\(\);?\s*}\s*catch\s*\(e\)\s*{\s*fatal\(e\);?\s*}/);
  // aucun require en dehors de main() : sinon une erreur ferait échouer le script avant le try
  const beforeMain = panel.slice(0, panel.indexOf('function main('));
  assert.ok(!/require\(/.test(beforeMain), 'require hors de main()');
});
