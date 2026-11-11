const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
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

test('listPackageFiles du plugin exclut tests et outils, et garde manifest, page, panneau, sources et signatures', () => {
  const root = path.join(__dirname, '..');
  const names = listPackageFiles(root, ['tests', 'tools']).map(f => f.name);
  for (const expected of ['manifest.json', 'index.html', 'panel.js', 'assets/Signature_Blanc.png', 'assets/signature-profile.js', 'src/sign.js', 'icons/plugin@1x.png']) {
    assert.ok(names.includes(expected), expected + ' absent du paquet');
  }
  assert.ok(!names.some(n => /^(tests|tools)\//.test(n)), names.filter(n => /^(tests|tools)\//.test(n)).join(','));
  assert.ok(!names.some(n => n.includes('\\')), 'chemins en /');
});

test('listPackageFiles n\'exclut que les dossiers de premier niveau demandés', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-pack-'));
  try {
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.mkdirSync(path.join(dir, 'src', 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tests', 'a.js'), 'x');
    fs.writeFileSync(path.join(dir, 'src', 'tests', 'b.js'), 'y');
    fs.writeFileSync(path.join(dir, 'c.js'), 'z');
    const names = listPackageFiles(dir, ['tests']).map(f => f.name).sort();
    assert.deepStrictEqual(names, ['c.js', 'src/tests/b.js']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('crc32 fonctionne sans zlib.crc32 (Node 18 ou vieux Node 20) et donne le CRC standard', () => {
  const { crc32Fallback } = require('../tools/pack.js');
  assert.strictEqual(crc32Fallback(Buffer.from('123456789')), 0xCBF43926); // valeur de référence du CRC-32
  assert.strictEqual(crc32Fallback(Buffer.alloc(0)), 0);
  const data = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 255));
  if (typeof zlib.crc32 === 'function') assert.strictEqual(crc32Fallback(data), zlib.crc32(data));
});

test('buildZip donne la même archive que zlib.crc32 soit disponible ou non', () => {
  const files = [{ name: 'a.txt', data: Buffer.from('bonjour') }, { name: 'b/c.bin', data: Buffer.alloc(3000, 9) }];
  const withNative = buildZip(files);
  const original = zlib.crc32;
  zlib.crc32 = undefined; // simule un Node sans zlib.crc32
  try {
    assert.ok(buildZip(files).equals(withNative));
  } finally {
    zlib.crc32 = original;
  }
});
