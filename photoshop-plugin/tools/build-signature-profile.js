// Outil de développement (Node + sharp) : précalcule ce dont le plugin a besoin pour choisir la couleur,
// car sharp n'existe pas dans Photoshop. Génère assets/signature-profile.js.
//   node photoshop-plugin/tools/build-signature-profile.js
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const assets = path.join(__dirname, '..', 'assets');

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

// Alpha plein format : le rééchantillonnage à la taille de la zone se fait dans le plugin (Lanczos-3, comme sharp).
function fullAlpha({ data, width, height }) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) out[i] = data[i * 4 + 3];
  return { alpha: out, maskWidth: width, maskHeight: height };
}

// Zone visible du PNG (pixels d'alpha > 0) : Photoshop mesure un calque sur cette zone, sans les marges transparentes.
function contentBounds({ data, width, height }) {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

(async () => {
  const white = await readRgba('Signature_Blanc.png');
  const black = await readRgba('Signature_noir.png');
  if (white.width !== black.width || white.height !== black.height) {
    throw new Error('Les deux signatures doivent avoir les mêmes dimensions');
  }
  const { alpha, maskWidth, maskHeight } = fullAlpha(white);
  const profile = {
    width: white.width,
    height: white.height,
    maskWidth,
    maskHeight,
    alphaBase64: Buffer.from(alpha).toString('base64'),
    luminance: { white: meanLuminance(white), black: meanLuminance(black) },
    content: contentBounds(white),
  };
  const target = path.join(assets, 'signature-profile.js');
  fs.writeFileSync(target, '// Généré par tools/build-signature-profile.js : ne pas modifier à la main.\nmodule.exports = ' + JSON.stringify(profile, null, 2) + ';\n');
  console.log('écrit', target, `(${white.width}x${white.height}, masque ${maskWidth}x${maskHeight}, luminance`, profile.luminance, ')');
})();
