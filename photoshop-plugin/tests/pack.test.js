const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const path = require('node:path');
const { buildZip, listPackageFiles } = require('../tools/pack.js');

// Relit une archive ZIP : renvoie [{ name, data }] en décompressant chaque entrée depuis le répertoire central.
function readZip(buf) {
  const eocd = buf.length - 22;
  assert.strictEqual(buf.readUInt32LE(eocd), 0x06054b50, 'fin de répertoire central');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50, 'entrée du répertoire central');
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    assert.strictEqual(buf.readUInt32LE(localOffset), 0x04034b50, 'en-tête local');
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    out.push({ name, data: zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compSize)) });
    p += 46 + nameLen;
  }
  return out;
}

test('buildZip produit une archive relisible, noms en / et accents conservés', () => {
  const files = [
    { name: 'manifest.json', data: Buffer.from('{"a":1}') },
    { name: 'assets\\Signature é.png', data: Buffer.alloc(5000, 7) },
    { name: 'vide.txt', data: Buffer.alloc(0) },
  ];
  const back = readZip(buildZip(files));
  assert.deepStrictEqual(back.map(f => f.name), ['manifest.json', 'assets/Signature é.png', 'vide.txt']);
  files.forEach((f, i) => assert.ok(back[i].data.equals(f.data), f.name));
});

test('listPackageFiles du plugin exclut tests, outils et essai, et garde manifest, sources et signatures', () => {
  const root = path.join(__dirname, '..');
  const names = listPackageFiles(root, ['tests', 'tools', 'spike']).map(f => f.name);
  assert.ok(names.includes('manifest.json'));
  assert.ok(names.includes('assets/Signature_Blanc.png'));
  assert.ok(names.includes('src/sign.js'));
  assert.ok(!names.some(n => /^(tests|tools|spike)\//.test(n)), names.filter(n => /^(tests|tools|spike)\//.test(n)).join(','));
  assert.ok(!names.some(n => n.includes('\\')), 'chemins en /');
});

test('listPackageFiles de l\'essai ne contient que le dossier spike', () => {
  const names = listPackageFiles(path.join(__dirname, '..', 'spike')).map(f => f.name);
  assert.ok(names.includes('manifest.json') && names.includes('probe.js') && names.includes('icons/plugin@1x.png'));
});
