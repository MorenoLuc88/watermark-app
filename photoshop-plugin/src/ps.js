// Seule couche qui parle à Photoshop. Elle reçoit l'API en paramètre (createPs) pour pouvoir être testée avec
// un faux Photoshop ; panel.js la branche sur les vrais modules « photoshop » et « uxp ».
// Les comportements utilisés ont été mesurés dans Photoshop 28 : voir docs/superpowers/specs/…-spike-findings.md.
const { dominantColor } = require('./contrast.js');

const LAYER_NAME = 'Signature LM';
const SIGNATURE_FILES = { white: 'Signature_Blanc.png', black: 'Signature_noir.png' };
const BITS = { ONE: 1, EIGHT: 8, SIXTEEN: 16, THIRTYTWO: 32 };

// Nom de la constante Photoshop qui a cette valeur (ex. « RGBColorMode » -> « RGB »)
function constantName(map, value) {
  const key = Object.keys(map || {}).find(k => map[k] === value);
  return key || String(value);
}

// Parcourt les calques, groupes compris, du plus haut au plus bas
function findLayer(layers, predicate) {
  for (const layer of layers) {
    if (predicate(layer)) return layer;
    if (layer.layers && layer.layers.length) {
      const inner = findLayer(layer.layers, predicate);
      if (inner) return inner;
    }
  }
  return null;
}

function createPs({ photoshop, uxp }) {
  const { app, core, action, imaging, constants } = photoshop;
  const { storage } = uxp;

  // Photoshop refuse les étapes modales imbriquées : une opération lancée dans une étape déjà modale s'y exécute.
  let modalDepth = 0;
  async function inModal(name, fn) {
    if (modalDepth > 0) return fn();
    return core.executeAsModal(async () => {
      modalDepth++;
      try { return await fn(); } finally { modalDepth--; }
    }, { commandName: name });
  }

  // getDocument() ne renvoie qu'une fiche (id, taille, mode) : les opérations sur les calques retrouvent le vrai
  // document par son id.
  function liveDocument(info) {
    const docs = app.documents;
    for (let i = 0; i < docs.length; i++) if (docs[i].id === info.id) return docs[i];
    throw new Error('Le document n’est plus ouvert');
  }

  async function readPixels(args) {
    const result = await imaging.getPixels(args);
    const img = result.imageData;
    try {
      const data = await img.getData({ chunky: true });
      // Copie : la mémoire de l'image est libérée par dispose()
      return { pixels: new Uint8Array(data), channels: img.components, width: img.width, height: img.height };
    } finally {
      img.dispose();
    }
  }

  return {
    async getDocument() {
      const d = app.activeDocument;
      if (!d || !app.documents || app.documents.length === 0) return null;
      return {
        id: d.id,
        width: d.width,
        height: d.height,
        mode: constantName(constants.DocumentMode, d.mode),
        bitsPerChannel: BITS[constantName(constants.BitsPerChannelType, d.bitsPerChannel)] || 0,
      };
    },

    // Composite visible (tous calques confondus) de la zone, en sRGB 8 bits. 3 ou 4 composantes selon le document.
    readCompositeRegion(doc, box) {
      return inModal('Lire la zone sous la signature', () => readPixels({
        documentID: doc.id,
        sourceBounds: { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height },
        colorSpace: 'RGB',
        componentSize: 8,
        colorProfile: 'sRGB IEC61966-2.1',
      }));
    },

    async findSignatureLayer(doc) {
      const layer = findLayer(liveDocument(doc).layers, l => l.name === LAYER_NAME);
      if (!layer) return null;
      const b = layer.bounds;
      return {
        id: layer.id,
        bounds: { left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top },
        opacity: layer.opacity,
      };
    },

    removeLayer(doc, layerId) {
      return inModal('Supprimer la signature', async () => {
        const layer = findLayer(liveDocument(doc).layers, l => l.id === layerId);
        if (layer) layer.delete();
      });
    },

    // Couleur d'une signature déjà posée, d'après ses pixels
    detectLayerColor(doc, layerId) {
      return inModal('Lire la signature', async () => {
        const live = liveDocument(doc);
        const layer = findLayer(live.layers, l => l.id === layerId);
        const b = layer.bounds;
        // Luc a pu déplacer la signature en partie hors de l'image : on ne lit que ce qui est dans le cadre
        const clamped = {
          left: Math.max(0, b.left), top: Math.max(0, b.top),
          right: Math.min(live.width, b.right), bottom: Math.min(live.height, b.bottom),
        };
        const inside = clamped.right > clamped.left && clamped.bottom > clamped.top;
        const { pixels, channels } = await readPixels({
          documentID: doc.id,
          layerID: layerId,
          sourceBounds: inside ? clamped : { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
          colorSpace: 'RGB',
          componentSize: 8,
        });
        return dominantColor({ pixels, channels });
      });
    },

    // Pose le PNG (objet dynamique intégré) : `visible` = zone visible visée (Photoshop mesure un calque sans
    // les marges transparentes du PNG).
    placeSignature(doc, { color, visible, opacity }) {
      return inModal('Poser la signature', async () => {
        const assets = await (await storage.localFileSystem.getPluginFolder()).getEntry('assets');
        const file = await assets.getEntry(SIGNATURE_FILES[color]);
        const token = storage.localFileSystem.createSessionToken(file);
        // Photoshop insère le nouveau calque juste au-dessus du calque SÉLECTIONNÉ : on sélectionne d'abord le calque
        // du haut, sinon des calques visibles situés au-dessus pourraient masquer la signature.
        const live = liveDocument(doc);
        let top = null;
        for (const l of live.layers) { top = l; break; }
        const commands = [];
        if (top) commands.push({ _obj: 'select', _target: [{ _ref: 'layer', _id: top.id }], makeVisible: false });
        commands.push({
          _obj: 'placeEvent',
          null: { _path: token, _kind: 'local' },
          linked: false,
          _options: { dialogOptions: 'dontDisplay' },
        });
        await action.batchPlay(commands, {});

        const layer = live.activeLayers[0];
        const placed = layer.bounds;
        const pct = (visible.width / (placed.right - placed.left)) * 100;
        await layer.scale(pct, pct, constants.AnchorPosition.TOPLEFT);
        const scaled = layer.bounds;
        await layer.translate(visible.left - scaled.left, visible.top - scaled.top);
        layer.opacity = opacity;
        layer.name = LAYER_NAME;
      });
    },

    // Tout ce que fait `fn` forme une seule étape d'historique (Ctrl+Z l'annule d'un coup).
    runAsSingleHistoryState(doc, name, fn) {
      return core.executeAsModal(async (ctx) => {
        modalDepth++;
        let suspension = null;
        try {
          suspension = await ctx.hostControl.suspendHistory({ documentID: doc.id, name });
          return await fn();
        } finally {
          if (suspension !== null) await ctx.hostControl.resumeHistory(suspension);
          modalDepth--;
        }
      }, { commandName: name });
    },
  };
}

module.exports = { createPs, LAYER_NAME };
