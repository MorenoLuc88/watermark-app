// Logique de traitement d'image (sans dépendance à Electron, donc testable avec Node seul)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Contraste (ratio WCAG) au-delà duquel un pixel est considéré comme "assez lisible"
const CONTRAST_CAP = 4.5;

// Table sRGB (0-255) -> luminance linéaire (0-1)
const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Cache des filigranes redimensionnés : évite de les recalculer pour chaque photo
const wmCache = new Map();
const WM_CACHE_MAX = 24;

function cacheSet(key, value) {
  if (wmCache.size >= WM_CACHE_MAX) wmCache.delete(wmCache.keys().next().value);
  wmCache.set(key, value);
}

// L'orientation EXIF 5 à 8 échange largeur et hauteur
function orientedSize(meta) {
  return meta.orientation >= 5
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

function computePlacement(position, imgW, imgH, wmW, wmH, m) {
  let x, y;
  switch (position) {
    case 'bottom-left':   x = m;                            y = imgH - wmH - m; break;
    case 'bottom-center': x = Math.round((imgW - wmW) / 2); y = imgH - wmH - m; break;
    case 'top-right':     x = imgW - wmW - m;               y = m; break;
    case 'top-left':      x = m;                            y = m; break;
    case 'top-center':    x = Math.round((imgW - wmW) / 2); y = m; break;
    case 'center':        x = Math.round((imgW - wmW) / 2); y = Math.round((imgH - wmH) / 2); break;
    case 'bottom-right':
    default:              x = imgW - wmW - m;               y = imgH - wmH - m;
  }
  return {
    x: Math.max(0, Math.min(x, imgW - wmW)),
    y: Math.max(0, Math.min(y, imgH - wmH)),
  };
}

// Redimensionne le filigrane, applique l'opacité et mesure sa couleur réelle.
async function prepareWatermark(wmPath, targetW, imgW, imgH, opacityFactor) {
  const mtime = fs.statSync(wmPath).mtimeMs;
  const key = `${wmPath}|${mtime}|${targetW}|${imgW}x${imgH}|${opacityFactor}`;
  if (wmCache.has(key)) return wmCache.get(key);

  const meta = await sharp(wmPath).metadata();
  let w = targetW;
  let h = Math.max(1, Math.round(w * meta.height / meta.width));
  // Le filigrane ne doit jamais dépasser de la photo
  if (w > imgW || h > imgH) {
    const f = Math.min(imgW / w, imgH / h);
    w = Math.max(1, Math.floor(w * f));
    h = Math.max(1, Math.floor(h * f));
  }

  const { data, info } = await sharp(wmPath)
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = info.width * info.height;
  const alpha = new Uint8Array(px);
  let lumSum = 0, aSum = 0;
  for (let i = 0; i < px; i++) {
    const a = data[i * 4 + 3];
    alpha[i] = a;
    if (a > 0) {
      const y = 0.2126 * LINEAR[data[i * 4]] + 0.7152 * LINEAR[data[i * 4 + 1]] + 0.0722 * LINEAR[data[i * 4 + 2]];
      lumSum += y * a;
      aSum += a;
      data[i * 4 + 3] = Math.round(a * opacityFactor);
    }
  }

  const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const prepared = {
    buffer,
    alpha,
    width: info.width,
    height: info.height,
    luminance: aSum > 0 ? lumSum / aSum : 0, // couleur réelle du filigrane (linéaire, 0-1)
  };
  cacheSet(key, prepared);
  return prepared;
}

// Lit la zone de la photo (orientation EXIF appliquée) qui sera sous le filigrane.
async function readRegion(inputPath, x, y, w, h) {
  return sharp(inputPath)
    .rotate()
    .extract({ left: x, top: y, width: w, height: h })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// Note de lisibilité d'un filigrane sur la zone : contraste moyen, pondéré par la forme
// réelle du filigrane (les pixels transparents ne comptent pas) et plafonné pour qu'une
// moitié très contrastée ne compense pas une moitié illisible.
function scoreReadability(region, wm, opacityFactor) {
  const { data, info } = region;
  const ch = info.channels;
  const px = wm.width * wm.height;
  let num = 0, den = 0, lumaSum = 0;
  for (let i = 0; i < px; i++) {
    const a = wm.alpha[i] / 255;
    if (a === 0) continue;
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    const yBg = 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
    const k = a * opacityFactor;
    const yRes = yBg * (1 - k) + wm.luminance * k;
    const hi = Math.max(yRes, yBg), lo = Math.min(yRes, yBg);
    num += a * Math.min((hi + 0.05) / (lo + 0.05), CONTRAST_CAP);
    lumaSum += a * (0.299 * r + 0.587 * g + 0.114 * b);
    den += a;
  }
  return den > 0 ? { score: num / den, luma: lumaSum / den } : { score: 1, luma: 128 };
}

function applyOutputFormat(pipeline, ext, quality) {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return pipeline.jpeg({ quality, chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0' });
    case 'png':
      return pipeline.png({ compressionLevel: 6 });
    case 'webp':
      return pipeline.webp({ quality });
    case 'tif':
    case 'tiff':
      // LZW est sans perte : le réglage de qualité n'y a pas d'effet.
      // Sharp ne sait pas écrire l'EXIF en TIFF (le profil ICC est conservé).
      return pipeline.tiff({ compression: 'lzw' });
    default:
      return pipeline;
  }
}

async function processPhoto({ inputPath, outputPath, options }) {
  try {
    const { position, sizePercent, opacity, margin, quality = 92, wmWhitePath, wmBlackPath } = options;

    if (path.resolve(inputPath).toLowerCase() === path.resolve(outputPath).toLowerCase()) {
      return { success: false, error: "Le fichier de sortie écraserait l'original (changez le suffixe ou le dossier)" };
    }
    if (!wmWhitePath || !wmBlackPath) return { success: false, error: 'Filigranes manquants' };

    const meta = await sharp(inputPath).metadata();
    const { width: imgW, height: imgH } = orientedSize(meta);

    const opacityFactor = opacity / 100;
    const targetW = Math.max(1, Math.round(Math.min(imgW, imgH) * (sizePercent / 100)));
    const m = Math.max(0, margin);

    // Chaque variante est évaluée à son emplacement exact
    const candidates = {};
    const regions = new Map();
    for (const [color, wmPath] of [['white', wmWhitePath], ['black', wmBlackPath]]) {
      const wm = await prepareWatermark(wmPath, targetW, imgW, imgH, opacityFactor);
      const { x, y } = computePlacement(position, imgW, imgH, wm.width, wm.height, m);
      const rkey = `${x},${y},${wm.width},${wm.height}`;
      if (!regions.has(rkey)) regions.set(rkey, await readRegion(inputPath, x, y, wm.width, wm.height));
      candidates[color] = { wm, x, y, ...scoreReadability(regions.get(rkey), wm, opacityFactor) };
    }

    const useWhite = candidates.white.score >= candidates.black.score;
    const chosen = useWhite ? candidates.white : candidates.black;

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const ext = path.extname(outputPath).slice(1).toLowerCase();
    let pipeline = sharp(inputPath)
      .rotate() // applique l'orientation EXIF
      .composite([{ input: chosen.wm.buffer, left: chosen.x, top: chosen.y, blend: 'over' }])
      .keepMetadata(); // conserve EXIF, copyright, profil colorimétrique
    pipeline = applyOutputFormat(pipeline, ext, quality);
    await pipeline.toFile(outputPath);

    return {
      success: true,
      usedColor: useWhite ? 'white' : 'black',
      luminosity: Math.round(chosen.luma),
      contrast: { white: +candidates.white.score.toFixed(2), black: +candidates.black.score.toFixed(2) },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { processPhoto, computePlacement, orientedSize };
