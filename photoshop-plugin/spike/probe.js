// ESSAI JETABLE (Tache 2 du plan), v0.0.2 : verifie le comportement reel de Photoshop / UXP.
// Rien ici n'est conserve dans le plugin final.
const { app, core, action, imaging, constants } = require('photoshop');
const { storage } = require('uxp');

const out = document.getElementById('out');
let journal = '';

async function persist() {
  // Le journal est ecrit dans le dossier de donnees du plugin, pour etre relu sans copier-coller.
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

// Boite complete de la signature (PNG 820 x 304, marges transparentes comprises) : 30 % du petit cote, marge 30 px.
function targetBox(d) {
  const width = Math.round(Math.min(d.width, d.height) * 0.30);
  const height = Math.round(width * 304 / 820);
  const left = Math.max(0, d.width - width - 30);
  const top = Math.max(0, d.height - height - 30);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

// Zone du texte visible dans le PNG (alpha > 0), en pixels du PNG 820 x 304.
const CONTENT = { left: 104, top: 64, width: 600, height: 176 };

function averageRgb(img, data, onlyOpaque) {
  const comps = img.components;
  let r = 0, g = 0, b = 0, n = 0, amin = 255, amax = 0;
  for (let i = 0; i + comps - 1 < data.length; i += comps) {
    const a = comps === 4 ? data[i + 3] : 255;
    if (comps === 4) { amin = Math.min(amin, a); amax = Math.max(amax, a); }
    if (onlyOpaque && a < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return { moyenneRVB: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null, pixelsCompte: n, alphaMin: comps === 4 ? amin : 'sans alpha', alphaMax: comps === 4 ? amax : 'sans alpha' };
}

// P5
document.getElementById('p5').addEventListener('click', () => run('P5 document', async () => {
  const d = doc();
  log({
    photoshop: app.version,
    id: d.id,
    width: d.width, widthType: typeof d.width,
    height: d.height,
    resolution: d.resolution,
    mode: String(d.mode), modeType: typeof d.mode,
    bitsPerChannel: String(d.bitsPerChannel), bitsType: typeof d.bitsPerChannel,
    profil: String(d.colorProfileName),
    constantsDocumentMode: constants.DocumentMode ? Object.keys(constants.DocumentMode) : 'absent',
    constantsBits: constants.BitsPerChannelType ? Object.keys(constants.BitsPerChannelType) : 'absent',
    calques: d.layers.length,
  });
}));

// P6 : environnement (sans toucher au presse-papiers, qui exige une permission de manifest)
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
    photoshop: app.version,
  });
}));

// P1 : composite visible (a relancer apres avoir pose une signature : la moyenne doit changer)
document.getElementById('p1').addEventListener('click', () => run('P1 composite', async () => {
  const d = doc();
  const b = targetBox(d);
  await core.executeAsModal(async () => {
    const res = await imaging.getPixels({
      documentID: d.id,
      sourceBounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      colorSpace: 'RGB', componentSize: 8, colorProfile: 'sRGB IEC61966-2.1',
    });
    const img = res.imageData;
    const data = await img.getData({ chunky: true });
    log('composite', { zone: b, calques: d.layers.length, components: img.components, hasAlpha: img.hasAlpha }, averageRgb(img, data, false));
    img.dispose();
  }, { commandName: 'Essai lecture composite' });
}));

// P7 : le plan complet : poser la signature, positionnee d'apres ses bornes VISIBLES, en un seul etat d'historique (suspendHistory)
document.getElementById('p7').addEventListener('click', () => run('P7 pose complete + historique', async () => {
  const d = doc();
  const b = targetBox(d);
  const s = b.width / 820;
  const exp = {
    left: Math.round(b.left + CONTENT.left * s), top: Math.round(b.top + CONTENT.top * s),
    width: Math.round(CONTENT.width * s), height: Math.round(CONTENT.height * s),
  };
  exp.right = exp.left + exp.width; exp.bottom = exp.top + exp.height;

  const pluginFolder = await storage.localFileSystem.getPluginFolder();
  const assets = await pluginFolder.getEntry('assets');
  const file = await assets.getEntry('Signature_Blanc.png');
  const token = storage.localFileSystem.createSessionToken(file);

  const before = d.historyStates.length;
  await core.executeAsModal(async (ctx) => {
    let suspension = null;
    try {
      suspension = await ctx.hostControl.suspendHistory({ documentID: d.id, name: 'Signer' });
      log('suspendHistory ok', suspension);
    } catch (e) {
      log('suspendHistory ECHEC', String(e && e.message));
    }
    try {
      await action.batchPlay([{ _obj: 'placeEvent', null: { _path: token, _kind: 'local' }, linked: false, _options: { dialogOptions: 'dontDisplay' } }], {});
      const layer = d.activeLayers[0];
      const b1 = layer.bounds;
      log('apres placeEvent', { id: layer.id, kind: String(layer.kind), visible: { l: b1.left, t: b1.top, w: b1.right - b1.left, h: b1.bottom - b1.top } });

      const pct = (exp.width / (b1.right - b1.left)) * 100;
      await layer.scale(pct, pct, constants.AnchorPosition.TOPLEFT);
      const b2 = layer.bounds;
      await layer.translate(exp.left - b2.left, exp.top - b2.top);
      layer.opacity = 100;
      layer.name = 'Signature LM';
      const b3 = layer.bounds;
      log('resultat', {
        layerId: layer.id,
        obtenu: { left: b3.left, top: b3.top, right: b3.right, bottom: b3.bottom },
        attendu: { left: exp.left, top: exp.top, right: exp.right, bottom: exp.bottom },
        ecart: { left: b3.left - exp.left, top: b3.top - exp.top, right: b3.right - exp.right, bottom: b3.bottom - exp.bottom },
        boiteComplete: b,
      });
    } finally {
      if (suspension !== null) { await ctx.hostControl.resumeHistory(suspension); log('resumeHistory ok'); }
    }
  }, { commandName: 'Signer' });
  const after = d.historyStates.length;
  log('etats d\'historique', { avant: before, apres: after, ajoutes: after - before, attendu: 1 });
}));

// P8 : lire les pixels du calque actif (la signature, un objet dynamique) : couleur reconnaissable ?
document.getElementById('p8').addEventListener('click', () => run('P8 pixels du calque actif', async () => {
  const d = doc();
  const layer = d.activeLayers[0];
  if (!layer) throw new Error('Aucun calque actif');
  const bnd = layer.bounds;
  log('calque', { id: layer.id, name: layer.name, kind: String(layer.kind), bounds: { l: bnd.left, t: bnd.top, r: bnd.right, b: bnd.bottom } });
  await core.executeAsModal(async () => {
    const res = await imaging.getPixels({
      documentID: d.id, layerID: layer.id,
      sourceBounds: { left: bnd.left, top: bnd.top, right: bnd.right, bottom: bnd.bottom },
      colorSpace: 'RGB', componentSize: 8,
    });
    const img = res.imageData;
    const data = await img.getData({ chunky: true });
    log('pixels du calque', { components: img.components, hasAlpha: img.hasAlpha, width: img.width, height: img.height }, averageRgb(img, data, true));
    img.dispose();
  }, { commandName: 'Essai lecture calque' });
}));

// P9 : lister les calques (groupes compris), puis supprimer ceux nommes "Signature LM" (nettoyage des essais)
document.getElementById('p9').addEventListener('click', () => run('P9 lister et nettoyer', async () => {
  const d = doc();
  const all = [];
  (function walk(layers, depth) {
    for (const l of layers) {
      all.push({ id: l.id, name: l.name, kind: String(l.kind), depth });
      if (l.layers && l.layers.length) walk(l.layers, depth + 1);
    }
  })(d.layers, 0);
  log('calques', all);
  const targets = all.filter(x => x.name === 'Signature LM');
  let removed = 0;
  await core.executeAsModal(async () => {
    for (const t of targets) {
      const find = (layers) => { for (const l of layers) { if (l.id === t.id) return l; if (l.layers && l.layers.length) { const f = find(l.layers); if (f) return f; } } return null; };
      const layer = find(d.layers);
      if (layer) { layer.delete(); removed++; }
    }
  }, { commandName: 'Nettoyage essai' });
  log('supprimes', { trouves: targets.length, supprimes: removed, restants: d.layers.length });
}));

document.getElementById('clear').addEventListener('click', () => { journal = ''; out.textContent = ''; });
