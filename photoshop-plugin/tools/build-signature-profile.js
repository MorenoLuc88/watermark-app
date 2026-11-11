// Outil de développement (Node + sharp) : précalcule ce dont le plugin a besoin pour choisir la couleur,
// car sharp n'existe pas dans Photoshop. Génère assets/signature-profile.js.
//   node photoshop-plugin/tools/build-signature-profile.js
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const assets = path.join(__dirname, '..', 'assets');
const BLOCK = 4; // le masque est réduit au quart

// Même formule que processor.js : sRGB (0-255) -> luminance linéaire (0-1)
function toLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

async function readRgba(file) {
  const { data, info } = await sharp(path.join(assets, file)).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Luminance linéaire moyenne des pixels opaques, pondérée par l'alpha
function meanLuminance({ data, width, height }) {
  let sum = 0, weight = 0;
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    if (a === 0) continue;
    const y = 0.2126 * toLinear(data[i * 4]) + 0.7152 * toLinear(data[i * 4 + 1]) + 0.0722 * toLinear(data[i * 4 + 2]);
    sum += y * a;
    weight += a;
  }
  return weight > 0 ? sum / weight : 0;
}

// Alpha moyen par bloc BLOCK x BLOCK
function reduceAlpha({ data, width, height }) {
  const mw = Math.floor(width / BLOCK), mh = Math.floor(height / BLOCK);
  const out = new Uint8Array(mw * mh);
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      let s = 0;
      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) s += data[((my * BLOCK + dy) * width + mx * BLOCK + dx) * 4 + 3];
      }
      out[my * mw + mx] = Math.round(s / (BLOCK * BLOCK));
    }
  }
  return { alpha: out, maskWidth: mw, maskHeight: mh };
}

(async () => {
  const white = await readRgba('Signature_Blanc.png');
  const black = await readRgba('Signature_noir.png');
  if (white.width !== black.width || white.height !== black.height) {
    throw new Error('Les deux signatures doivent avoir les mêmes dimensions');
  }
  const { alpha, maskWidth, maskHeight } = reduceAlpha(white);
  const profile = {
    width: white.width,
    height: white.height,
    maskWidth,
    maskHeight,
    alphaBase64: Buffer.from(alpha).toString('base64'),
    luminance: { white: meanLuminance(white), black: meanLuminance(black) },
  };
  const target = path.join(assets, 'signature-profile.js');
  fs.writeFileSync(target, '// Généré par tools/build-signature-profile.js : ne pas modifier à la main.\nmodule.exports = ' + JSON.stringify(profile, null, 2) + ';\n');
  console.log('écrit', target, `(${white.width}x${white.height}, masque ${maskWidth}x${maskHeight}, luminance`, profile.luminance, ')');
})();
