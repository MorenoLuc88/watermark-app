// ESSAI JETABLE (Tache 2 du plan) : verifie le comportement reel de Photoshop 26 / UXP.
// Rien ici n'est conserve dans le plugin final.
const { app, core, action, imaging, constants } = require('photoshop');
const { storage } = require('uxp');

const out = document.getElementById('out');
let journal = '';

async function persist() {
  // Le journal est aussi ecrit dans le dossier de donnees du plugin, pour pouvoir etre relu sans copier-coller.
  try {
    const folder = await storage.localFileSystem.getDataFolder();
    const file = await folder.createFile('spike-log.txt', { overwrite: true });
    await file.write(journal);
  } catch (e) { /* tant pis */ }
}

function log(...parts) {
  const line = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  journal += line + '\n';
  out.textContent = journal;
}

async function run(name, fn) {
  log('=== ' + name + ' ===');
  try {
    await fn();
    log('-> ' + name + ' : termine');
  } catch (e) {
    log('-> ' + name + ' : ECHEC', String(e && e.message), String(e && e.stack).split('\n').slice(0, 4).join(' | '));
  }
  await persist();
}

function doc() {
  const d = app.activeDocument;
  if (!d) throw new Error('Aucun document ouvert');
  return d;
}

// Zone en bas a droite, comme le plugin final : 30 % du petit cote, marge 30 px, ratio 820 x 304.
function targetBox(d) {
  const width = Math.round(Math.min(d.width, d.height) * 0.30);
  const height = Math.round(width * 304 / 820);
  const left = Math.max(0, d.width - width - 30);
  const top = Math.max(0, d.height - height - 30);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

async function readPixels(label, extra) {
  const d = doc();
  const b = targetBox(d);
  const options = Object.assign({
    documentID: d.id,
    sourceBounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
    colorSpace: 'RGB',
    componentSize: 8,
    colorProfile: 'sRGB IEC61966-2.1',
  }, extra);
  let result;
  await core.executeAsModal(async () => {
    result = await imaging.getPixels(options);
    const img = result.imageData;
    const data = await img.getData({ chunky: true });
    let r = 0, g = 0, bl = 0, n = 0;
    const comps = img.components;
    for (let i = 0; i + comps - 1 < data.length; i += comps) { r += data[i]; g += data[i + 1]; bl += data[i + 2]; n++; }
    log(label, {
      zone: b,
      imageData: { width: img.width, height: img.height, components: comps, colorSpace: String(img.colorSpace), componentSize: img.componentSize, hasAlpha: img.hasAlpha },
      dataLength: data.length,
      moyenneRVB: [Math.round(r / n), Math.round(g / n), Math.round(bl / n)],
      sourceBoundsRendu: result.sourceBounds,
    });
    img.dispose();
  }, { commandName: 'Essai lecture pixels' });
}

// P5
document.getElementById('p5').addEventListener('click', () => run('P5 document', async () => {
  const d = doc();
  log({
    photoshop: app.version,
    id: d.id,
    width: d.width, widthType: typeof d.width,
    height: d.height,
    mode: String(d.mode), modeType: typeof d.mode,
    bitsPerChannel: String(d.bitsPerChannel), bitsType: typeof d.bitsPerChannel,
    constantsDocumentMode: constants.DocumentMode ? Object.keys(constants.DocumentMode) : 'absent',
    constantsBits: constants.BitsPerChannelType ? Object.keys(constants.BitsPerChannelType) : 'absent',
    calques: d.layers.length,
  });
}));

// P6
document.getElementById('p6').addEventListener('click', () => run('P6 environnement', async () => {
  let req = 'echec';
  try { req = require('./helper.js').answer; } catch (e) { req = 'ECHEC ' + e.message; }
  let ls = 'echec';
  try { localStorage.setItem('spike', 'ok'); ls = localStorage.getItem('spike'); } catch (e) { ls = 'ECHEC ' + e.message; }
  log({
    requireLocal: req,
    localStorage: ls,
    atob: typeof atob,
    Buffer: typeof Buffer,
    TextDecoder: typeof TextDecoder,
    Uint8Array: typeof Uint8Array,
    clipboard: typeof navigator !== 'undefined' && navigator.clipboard ? 'present' : 'absent',
    photoshop: app.version,
  });
}));

// P1 : composite visible. A lancer deux fois, en masquant/affichant un calque entre les deux : la moyenne doit changer.
document.getElementById('p1').addEventListener('click', () => run('P1 composite', async () => {
  await readPixels('composite (sans layerID)', {});
}));

// P2 : calque actif seul.
document.getElementById('p2').addEventListener('click', () => run('P2 calque actif', async () => {
  const d = doc();
  const layer = d.activeLayers[0];
  if (!layer) throw new Error('Aucun calque actif');
  log('calque actif', { id: layer.id, name: layer.name, kind: String(layer.kind), bounds: layer.bounds });
  await readPixels('calque seul (layerID ' + layer.id + ')', { layerID: layer.id });
}));

// P3 / P4 : poser la signature (objet dynamique integre), la mettre a la bonne taille et position.
async function placeProbe(withHistoryGroup) {
  const d = doc();
  const b = targetBox(d);
  const statesBefore = d.historyStates ? d.historyStates.length : 'inconnu';

  const pluginFolder = await storage.localFileSystem.getPluginFolder();
  const assets = await pluginFolder.getEntry('assets');
  const file = await assets.getEntry('Signature_Blanc.png');
  const token = storage.localFileSystem.createSessionToken(file);

  const options = withHistoryGroup
    ? { commandName: 'Signer', historyStateInfo: { name: 'Signer', target: d } }
    : { commandName: 'Signer (essai sans groupe)' };

  await core.executeAsModal(async () => {
    await action.batchPlay([{
      _obj: 'placeEvent',
      null: { _path: token, _kind: 'local' },
      linked: false,
      _options: { dialogOptions: 'dontDisplay' },
    }], {});
    const layer = d.activeLayers[0];
    log('apres placeEvent', { name: layer.name, kind: String(layer.kind), bounds: layer.bounds });

    const wNow = layer.bounds.right - layer.bounds.left;
    const pct = (b.width / wNow) * 100;
    await layer.scale(pct, pct, constants.AnchorPosition.TOPLEFT);
    const b2 = layer.bounds;
    log('apres scale', { pct, bounds: b2, largeurObtenue: b2.right - b2.left, largeurAttendue: b.width });

    await layer.translate(b.left - b2.left, b.top - b2.top);
    layer.opacity = 100;
    layer.name = 'Signature LM';
    const b3 = layer.bounds;
    log('apres translate', {
      bounds: b3,
      attendu: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      ecart: { left: b3.left - b.left, top: b3.top - b.top, right: b3.right - b.right, bottom: b3.bottom - b.bottom },
      opacite: layer.opacity, nom: layer.name,
      ratioLargeur: ((b3.right - b3.left) / b.width).toFixed(3),
    });
  }, options);

  const statesAfter = d.historyStates ? d.historyStates.length : 'inconnu';
  log('etats d\'historique', { avant: statesBefore, apres: statesAfter, ajoutes: (typeof statesBefore === 'number' && typeof statesAfter === 'number') ? statesAfter - statesBefore : 'inconnu' });
}

document.getElementById('p3').addEventListener('click', () => run('P3 pose sans groupe', () => placeProbe(false)));
document.getElementById('p4').addEventListener('click', () => run('P4 pose avec groupe d\'historique', () => placeProbe(true)));

document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(journal); log('(journal copie)'); } catch (e) { log('copie impossible', e.message); }
});
document.getElementById('clear').addEventListener('click', () => { journal = ''; out.textContent = ''; });
