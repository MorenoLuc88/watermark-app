// Réglages du plugin : valeurs par défaut et normalisation (bornes identiques aux curseurs de l'appli de lot).
const { POSITIONS } = require('./placement.js');

const DEFAULT_SETTINGS = { position: 'bottom-right', sizePercent: 30, opacity: 100, margin: 30 };

const LIMITS = {
  sizePercent: [3, 50],
  opacity: [10, 100],
  margin: [0, 150],
};

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function clampedInt(value, [min, max], fallback) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Renvoie toujours un objet complet et valide, quelle que soit la valeur lue (localStorage, panneau...).
function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    position: POSITIONS.includes(r.position) ? r.position : DEFAULT_SETTINGS.position,
    sizePercent: clampedInt(r.sizePercent, LIMITS.sizePercent, DEFAULT_SETTINGS.sizePercent),
    opacity: clampedInt(r.opacity, LIMITS.opacity, DEFAULT_SETTINGS.opacity),
    margin: clampedInt(r.margin, LIMITS.margin, DEFAULT_SETTINGS.margin),
  };
}

module.exports = { DEFAULT_SETTINGS, LIMITS, normalizeSettings };
