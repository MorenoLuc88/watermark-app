// Choix de la signature blanche ou noire : portage de scoreReadability() de processor.js.
// Pour chaque pixel sous la signature : contraste WCAG entre le fond et le fond mélangé à la signature
// (selon l'opacité), pondéré par la forme réelle de la signature (alpha du masque), plafonné à 4,5.

const CONTRAST_CAP = 4.5;

// Table sRGB (0-255) -> luminance linéaire (0-1), identique à processor.js
const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function lanczos3(x) {
  if (x === 0) return 1;
  if (Math.abs(x) >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

// Poids Lanczos-3 pour passer de srcLen à dstLen échantillons (noyau élargi en réduction, comme sharp)
function axisWeights(srcLen, dstLen) {
  const scale = srcLen / dstLen;
  const stretch = Math.max(1, scale);
  const out = [];
  for (let d = 0; d < dstLen; d++) {
    const center = (d + 0.5) * scale - 0.5;
    const first = Math.ceil(center - 3 * stretch);
    const last = Math.floor(center + 3 * stretch);
    const idx = [], w = [];
    let total = 0;
    for (let s = first; s <= last; s++) {
      const wt = lanczos3((s - center) / stretch);
      idx.push(Math.min(srcLen - 1, Math.max(0, s)));
      w.push(wt);
      total += wt;
    }
    for (let i = 0; i < w.length; i++) w[i] /= total;
    out.push({ idx, w });
  }
  return out;
}

// Rééchantillonne le masque alpha (0-255) à la taille de la zone avec le même filtre que sharp (Lanczos-3),
// pour que les bords de la signature aient la même netteté que dans l'appli de lot. Renvoie des alphas 0-1.
function resampleMask(mask, width, height) {
  const hx = axisWeights(mask.width, width);
  const vy = axisWeights(mask.height, height);

  const tmp = new Float32Array(width * mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < width; x++) {
      const { idx, w } = hx[x];
      let sum = 0;
      for (let i = 0; i < idx.length; i++) sum += mask.alpha[y * mask.width + idx[i]] * w[i];
      tmp[y * width + x] = sum;
    }
  }

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const { idx, w } = vy[y];
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < idx.length; i++) sum += tmp[idx[i] * width + x] * w[i];
      out[y * width + x] = Math.min(255, Math.max(0, sum)) / 255;
    }
  }
  return out;
}

// pixels : zone sous la signature (RGB ou RGBA, 8 bits) ; opacity : 0 à 100.
function chooseColor({ pixels, channels, width, height, profile, opacity }) {
  const k0 = opacity / 100;
  const alphaMap = resampleMask(profile.mask, width, height);
  const fg = profile.luminance;
  const sum = { white: 0, black: 0 };
  let den = 0, lumaSum = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alphaMap[y * width + x];
      if (a < 0.002) continue;

      const i = (y * width + x) * channels;
      let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (channels === 4) {
        // Aplatissement sur blanc, comme à l'enregistrement en JPEG
        const pa = pixels[i + 3] / 255;
        r = r * pa + 255 * (1 - pa);
        g = g * pa + 255 * (1 - pa);
        b = b * pa + 255 * (1 - pa);
      }
      const ri = Math.round(r), gi = Math.round(g), bi = Math.round(b);
      const yBg = 0.2126 * LINEAR[ri] + 0.7152 * LINEAR[gi] + 0.0722 * LINEAR[bi];
      const k = a * k0;

      for (const color of ['white', 'black']) {
        const yRes = yBg * (1 - k) + fg[color] * k;
        const hi = Math.max(yRes, yBg), lo = Math.min(yRes, yBg);
        sum[color] += a * Math.min((hi + 0.05) / (lo + 0.05), CONTRAST_CAP);
      }
      lumaSum += a * (0.299 * r + 0.587 * g + 0.114 * b);
      den += a;
    }
  }

  const scores = den > 0 ? { white: sum.white / den, black: sum.black / den } : { white: 1, black: 1 };
  return { color: scores.white >= scores.black ? 'white' : 'black', scores, luma: den > 0 ? lumaSum / den : 128 };
}

// Couleur d'une signature déjà posée, d'après ses pixels : luminosité moyenne des pixels opaques.
// Sert à « Inverser » sans mémoriser la couleur. Par défaut (rien d'opaque) : white.
function dominantColor({ pixels, channels }) {
  let sum = 0, n = 0;
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue;
    sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    n++;
  }
  return n === 0 || sum / n >= 127.5 ? 'white' : 'black';
}

module.exports = { chooseColor, dominantColor };
