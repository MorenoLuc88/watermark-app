// Calcul de la boîte de la signature (même règles que processor.js, pour des résultats identiques à l'appli de lot).
// La taille s'applique à la largeur complète du PNG, marges transparentes comprises.

const POSITIONS = ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-left', 'top-center', 'center'];

function placeInDocument(position, docW, docH, w, h, m) {
  let x, y;
  switch (position) {
    case 'bottom-left':   x = m;                           y = docH - h - m; break;
    case 'bottom-center': x = Math.round((docW - w) / 2);  y = docH - h - m; break;
    case 'top-right':     x = docW - w - m;                y = m; break;
    case 'top-left':      x = m;                           y = m; break;
    case 'top-center':    x = Math.round((docW - w) / 2);  y = m; break;
    case 'center':        x = Math.round((docW - w) / 2);  y = Math.round((docH - h) / 2); break;
    case 'bottom-right':
    default:              x = docW - w - m;                y = docH - h - m;
  }
  return {
    left: Math.max(0, Math.min(x, docW - w)),
    top: Math.max(0, Math.min(y, docH - h)),
  };
}

function computeBox({ position, docWidth, docHeight, sizePercent, margin, sourceWidth, sourceHeight }) {
  let width = Math.max(1, Math.round(Math.min(docWidth, docHeight) * (sizePercent / 100)));
  let height = Math.max(1, Math.round(width * sourceHeight / sourceWidth));

  // La signature ne doit jamais dépasser du document
  if (width > docWidth || height > docHeight) {
    const f = Math.min(docWidth / width, docHeight / height);
    width = Math.max(1, Math.floor(width * f));
    height = Math.max(1, Math.floor(height * f));
  }

  const { left, top } = placeInDocument(position, docWidth, docHeight, width, height, Math.max(0, margin));
  return { left, top, width, height };
}

module.exports = { POSITIONS, computeBox };
