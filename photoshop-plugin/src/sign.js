// Enchaînement « Signer » / « Inverser ». Ne parle jamais directement à Photoshop :
// toutes les actions passent par l'objet `ps` injecté (voir ps.js), ce qui permet de tout tester avec un faux.
const { computeBox } = require('./placement.js');
const { chooseColor } = require('./contrast.js');
const { normalizeSettings } = require('./settings.js');

class SignError extends Error {
  // code : "NO_DOCUMENT" | "UNSUPPORTED_MODE" | "NO_SIGNATURE" | "PS_ERROR"
  constructor(code, message, cause) {
    super(message);
    this.name = 'SignError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

const SUPPORTED_MODE = 'RGB';
const SUPPORTED_DEPTHS = [8, 16];

// Les exceptions inattendues de Photoshop deviennent des SignError("PS_ERROR") avec la cause d'origine.
async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SignError) throw e;
    throw new SignError('PS_ERROR', e && e.message ? e.message : String(e), e);
  }
}

function createSigner({ ps, profile, getSettings }) {
  async function requireDocument() {
    const doc = await ps.getDocument();
    if (!doc) throw new SignError('NO_DOCUMENT', 'Aucun document ouvert');
    if (doc.mode !== SUPPORTED_MODE || !SUPPORTED_DEPTHS.includes(doc.bitsPerChannel)) {
      throw new SignError('UNSUPPORTED_MODE', `Mode non pris en charge : ${doc.mode} ${doc.bitsPerChannel} bits`);
    }
    return doc;
  }

  function sign() {
    return guarded(async () => {
      const doc = await requireDocument();
      const settings = normalizeSettings(getSettings());
      return ps.runAsSingleHistoryState(doc, 'Signer', async () => {
        // La signature existante est retirée avant la mesure : elle ne doit pas fausser l'analyse.
        const existing = await ps.findSignatureLayer(doc);
        if (existing) await ps.removeLayer(doc, existing.id);

        const box = computeBox({
          position: settings.position,
          docWidth: doc.width,
          docHeight: doc.height,
          sizePercent: settings.sizePercent,
          margin: settings.margin,
          sourceWidth: profile.width,
          sourceHeight: profile.height,
        });
        const region = await ps.readCompositeRegion(doc, box);
        const { color, scores } = chooseColor({ ...region, profile, opacity: settings.opacity });
        await ps.placeSignature(doc, { color, box, opacity: settings.opacity });
        return { color, box, scores };
      });
    });
  }

  function invert() {
    return guarded(async () => {
      const doc = await requireDocument();
      const existing = await ps.findSignatureLayer(doc);
      if (!existing) throw new SignError('NO_SIGNATURE', 'Aucune signature à inverser');
      return ps.runAsSingleHistoryState(doc, 'Inverser la signature', async () => {
        const current = await ps.detectLayerColor(doc, existing.id);
        const color = current === 'white' ? 'black' : 'white';
        await ps.removeLayer(doc, existing.id);
        // Même position et même opacité que le calque actuel (Luc a pu le déplacer)
        await ps.placeSignature(doc, { color, box: existing.bounds, opacity: existing.opacity });
        return { color, box: existing.bounds };
      });
    });
  }

  return { sign, invert };
}

module.exports = { SignError, createSigner };
