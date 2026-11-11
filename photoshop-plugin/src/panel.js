// Panneau « LM Signature » : relie l'interface à createSigner. Seul fichier qui touche au DOM.
const photoshop = require('photoshop');
const uxp = require('uxp');
const { loadProfile } = require('./profile.js');
const { createPs } = require('./ps.js');
const { createSigner } = require('./sign.js');
const { normalizeSettings, DEFAULT_SETTINGS } = require('./settings.js');
const { errorMessage } = require('./messages.js');

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'lm-signature-settings';
const COLOR_NAMES = { white: 'blanche', black: 'noire' };

function readSettings() {
  return normalizeSettings({
    position: $('position').value,
    sizePercent: $('size').value,
    opacity: $('opacity').value,
    margin: $('margin').value,
  });
}

function showSettings(s) {
  $('position').value = s.position;
  $('size').value = s.sizePercent;
  $('opacity').value = s.opacity;
  $('margin').value = s.margin;
  $('size-val').textContent = s.sizePercent + '%';
  $('opacity-val').textContent = s.opacity + '%';
  $('margin-val').textContent = s.margin + ' px';
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings())); } catch (e) { /* mémorisation facultative */ }
}

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

function setStatus(text, isError) {
  $('status').textContent = text;
  $('status').className = isError ? 'error' : '';
}

function setBusy(busy) {
  $('sign').disabled = busy;
  $('invert').disabled = busy;
}

function scoresText(scores) {
  return scores ? ` (lisibilité : blanc ${scores.white.toFixed(1)}, noir ${scores.black.toFixed(1)})` : '';
}

try {
  const profile = loadProfile();
  const ps = createPs({ photoshop, uxp });
  const signer = createSigner({ ps, profile, getSettings: readSettings });

  async function run(action, describe) {
    setBusy(true);
    setStatus('En cours…', false);
    try {
      setStatus(describe(await action()), false);
    } catch (e) {
      setStatus(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  $('sign').addEventListener('click', () => run(
    () => signer.sign(),
    (r) => `Signature ${COLOR_NAMES[r.color]} posée${scoresText(r.scores)}.`
  ));
  $('invert').addEventListener('click', () => run(
    () => signer.invert(),
    (r) => `Signature inversée : elle est maintenant ${COLOR_NAMES[r.color]}.`
  ));
} catch (e) {
  setStatus('Le plugin n\'a pas pu démarrer : ' + (e && e.message ? e.message : e), true);
  setBusy(true);
}

showSettings(loadSettings());
for (const id of ['position', 'size', 'opacity', 'margin']) {
  $(id).addEventListener('input', () => { showSettings(readSettings()); saveSettings(); });
  $(id).addEventListener('change', () => { showSettings(readSettings()); saveSettings(); });
}
