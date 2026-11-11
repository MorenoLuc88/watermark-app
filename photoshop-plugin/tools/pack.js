// Fabrique le paquet .ccx (archive ZIP) du plugin, installable d'un double-clic via Creative Cloud.
//   node photoshop-plugin/tools/pack.js   → dist-plugin/LM-Signature-<version>.ccx
// Même méthode que le plugin Backdrop Clean (ZIP écrit à la main, sans dépendance). Nécessite Node 22+ (zlib.crc32).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PLUGIN_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(PLUGIN_ROOT, '..', 'dist-plugin');

// Liste récursive des fichiers de `root` (chemins relatifs avec /). `exclude` : dossiers de premier niveau à ignorer.
function listPackageFiles(root, exclude = []) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (exclude.includes(rel.split('/')[0])) continue;
      if (e.isDirectory()) walk(full);
      else out.push({ name: rel, data: fs.readFileSync(full) });
    }
  })(root);
  return out;
}

// Archive ZIP (deflate) : files = [{ name, data: Buffer }] → Buffer
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);      // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cenBuf, end]);
}

function pack() {
  const files = listPackageFiles(PLUGIN_ROOT, ['tests', 'tools']);
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'manifest.json'), 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, `LM-Signature-${manifest.version}.ccx`);
  fs.writeFileSync(dest, buildZip(files));
  console.log(`Paquet créé : ${dest} (${files.length} fichiers)`);
  return dest;
}

if (require.main === module) pack();

module.exports = { buildZip, listPackageFiles, pack };
