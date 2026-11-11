// Profil précalculé des signatures (voir tools/build-signature-profile.js).
// Aucune API Node ici : ce fichier tourne aussi dans Photoshop (UXP).

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// raw: { width, height, maskWidth, maskHeight, alphaBase64, luminance: { white, black } }
function decodeProfile(raw) {
  const alpha = decodeBase64(raw.alphaBase64);
  if (alpha.length !== raw.maskWidth * raw.maskHeight) {
    throw new Error(`masque de signature invalide : ${alpha.length} valeurs pour ${raw.maskWidth}x${raw.maskHeight}`);
  }
  return {
    width: raw.width,
    height: raw.height,
    mask: { width: raw.maskWidth, height: raw.maskHeight, alpha },
    luminance: { white: raw.luminance.white, black: raw.luminance.black },
  };
}

function loadProfile() {
  return decodeProfile(require('../assets/signature-profile.js'));
}

module.exports = { decodeProfile, loadProfile };
