document.addEventListener('DOMContentLoaded', () => {

let photos = [];
let outputDir = null;
let wmWhitePath = null;
let wmBlackPath = null;
let isProcessing = false;
let statDone = 0, statWhite = 0, statBlack = 0, statErrors = 0;

const gallery           = document.getElementById('gallery');
const galleryContainer  = document.getElementById('gallery-container');
const dropArea          = document.getElementById('drop-area');
const photoCount        = document.getElementById('photo-count');
const statusMsg         = document.getElementById('status-msg');
const progressBar       = document.getElementById('progress-bar');
const outputPathDisplay = document.getElementById('output-path-display');
const btnProcess        = document.getElementById('btn-process');
const btnClear          = document.getElementById('btn-clear');
const btnOpenOutput     = document.getElementById('btn-open-output');

const sliders = {
  size:    { el: document.getElementById('size'),    val: document.getElementById('size-val'),    suffix: '%'  },
  opacity: { el: document.getElementById('opacity'), val: document.getElementById('opacity-val'), suffix: '%'  },
  margin:  { el: document.getElementById('margin'),  val: document.getElementById('margin-val'),  suffix: 'px' },
  quality: { el: document.getElementById('quality'), val: document.getElementById('quality-val'), suffix: ''   },
};
Object.values(sliders).forEach(s => {
  if (s.el && s.val) s.el.addEventListener('input', () => { s.val.textContent = s.el.value + s.suffix; });
});

// ---- Init filigranes ----
async function initWatermarks() {
  try {
    const paths = await window.api.getWatermarkPaths();
    wmWhitePath = paths.white;
    wmBlackPath = paths.black;
    updateWmUI('white', wmWhitePath);
    updateWmUI('black', wmBlackPath);
    updateProcessBtn();
  } catch(e) {
    statusMsg.textContent = 'Erreur init: ' + e.message;
  }
}

function updateWmUI(color, filePath) {
  const dot  = document.getElementById('dot-' + color);
  const name = document.getElementById('wm-' + color + '-name');
  if (!dot || !name) return;
  dot.classList.remove('ok', 'err');
  if (filePath) {
    dot.classList.add('ok');
    const parts = filePath.replace(/\\/g, '/').split('/');
    name.textContent = parts[parts.length - 1];
    name.title = filePath;
  } else {
    dot.classList.add('err');
    name.textContent = 'cliquer pour choisir';
  }
}

// Clic sur signature blanc
document.getElementById('btn-wm-white').addEventListener('click', async () => {
  const p = await window.api.selectWatermark('white');
  if (p) { wmWhitePath = p; updateWmUI('white', p); updateProcessBtn(); }
});

// Clic sur signature noir
document.getElementById('btn-wm-black').addEventListener('click', async () => {
  const p = await window.api.selectWatermark('black');
  if (p) { wmBlackPath = p; updateWmUI('black', p); updateProcessBtn(); }
});

// ---- Import photos ----
document.getElementById('btn-files').addEventListener('click', async () => {
  try {
    const files = await window.api.selectPhotos();
    if (files && files.length) addPhotos(files);
  } catch(e) { statusMsg.textContent = 'Erreur: ' + e.message; }
});

document.getElementById('btn-folder').addEventListener('click', async () => {
  try {
    const files = await window.api.selectInputDir();
    if (files && files.length) addPhotos(files);
  } catch(e) { statusMsg.textContent = 'Erreur: ' + e.message; }
});

document.getElementById('btn-output-dir').addEventListener('click', async () => {
  try {
    const dir = await window.api.selectOutputDir();
    if (dir) { outputDir = dir; outputPathDisplay.textContent = dir; btnOpenOutput.disabled = false; }
  } catch(e) {}
});

// ---- Drag & drop ----
function setupDrop(el) {
  el.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('active'); });
  el.addEventListener('dragleave', () => dropArea.classList.remove('active'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.classList.remove('active');
    const files = Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|tiff?)$/i.test(f.name))
      .map(f => f.path).filter(Boolean);
    if (files.length) addPhotos(files);
  });
}
setupDrop(dropArea);
setupDrop(galleryContainer);
dropArea.addEventListener('click', () => document.getElementById('btn-files').click());

// ---- Photos ----
function addPhotos(filePaths) {
  const existing = new Set(photos.map(p => p.path));
  const newFiles = filePaths.filter(f => f && !existing.has(f));
  if (!newFiles.length) return;
  newFiles.forEach(fp => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2);
    const parts = fp.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1];
    photos.push({ id, path: fp, name, status: 'pending' });
    renderCard({ id, path: fp, name });
  });
  updateUI();
}

function renderCard(photo) {
  dropArea.style.display = 'none';
  galleryContainer.style.display = 'block';
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.id = 'card-' + photo.id;
  const imgSrc = 'file:///' + photo.path.replace(/\\/g, '/');
  card.innerHTML =
    '<img class="photo-thumb" src="' + imgSrc + '" loading="lazy">' +
    '<div class="photo-info"><span class="photo-name" title="' + photo.name + '">' + photo.name + '</span>' +
    '<span class="badge pending" id="badge-' + photo.id + '">attente</span></div>' +
    '<button class="photo-remove" data-id="' + photo.id + '">x</button>';
  gallery.appendChild(card);
  card.querySelector('.photo-remove').addEventListener('click', () => removePhoto(photo.id));
}

function removePhoto(id) {
  photos = photos.filter(p => p.id !== id);
  const card = document.getElementById('card-' + id);
  if (card) card.remove();
  updateUI();
}

function updateUI() {
  photoCount.textContent = photos.length + ' photo(s)';
  btnClear.disabled = photos.length === 0;
  updateProcessBtn();
  if (photos.length === 0) { dropArea.style.display = 'flex'; galleryContainer.style.display = 'none'; }
}

function updateProcessBtn() {
  const wmOk = wmWhitePath && wmBlackPath;
  btnProcess.disabled = photos.length === 0 || isProcessing || !wmOk;
  if (!wmOk) {
    btnProcess.title = 'Choisissez les deux filigranes avant de continuer';
  } else {
    btnProcess.title = '';
  }
}

btnClear.addEventListener('click', () => {
  photos = []; gallery.innerHTML = ''; resetStats();
  progressBar.style.width = '0%'; statusMsg.textContent = 'Pret'; updateUI();
});

document.getElementById('btn-remove-done').addEventListener('click', () => {
  photos = photos.filter(p => p.status !== 'done');
  document.querySelectorAll('.photo-card.done').forEach(c => c.remove());
  updateUI();
});

btnOpenOutput.addEventListener('click', () => {
  const dir = outputDir || (photos[0] ? photos[0].path.replace(/[^\\\/]+$/, '') : null);
  if (dir) window.api.openFolder(dir);
});

// ---- Traitement ----
btnProcess.addEventListener('click', async () => {
  if (isProcessing) return;
  isProcessing = true; btnProcess.disabled = true; resetStats();

  const position     = document.getElementById('position').value;
  const sizePercent  = parseInt(document.getElementById('size').value);
  const opacity      = parseInt(document.getElementById('opacity').value);
  const margin       = parseInt(document.getElementById('margin').value);
  const quality      = parseInt(document.getElementById('quality').value);
  const outputFormat = document.getElementById('output-format').value;
  const suffix       = document.getElementById('suffix').value || '_wm';

  const toProcess = photos.filter(p => p.status !== 'done');
  let processed = 0;

  for (const photo of toProcess) {
    setBadge(photo.id, 'processing', 'analyse...');
    const pathNorm  = photo.path.replace(/\//g, '\\');
    const lastSlash = pathNorm.lastIndexOf('\\');
    const dir       = lastSlash > -1 ? pathNorm.substring(0, lastSlash) : pathNorm;
    const outDir    = outputDir || dir;
    const dotIdx    = photo.name.lastIndexOf('.');
    const baseName  = dotIdx > -1 ? photo.name.slice(0, dotIdx) : photo.name;
    const origExt   = dotIdx > -1 ? photo.name.slice(dotIdx + 1).toLowerCase() : 'jpg';
    const outExt    = outputFormat === 'same' ? origExt : outputFormat;
    const outPath   = outDir + '\\' + baseName + suffix + '.' + outExt;

    statusMsg.textContent = 'Traitement ' + (processed + 1) + '/' + toProcess.length + ' - ' + photo.name;

    const result = await window.api.processPhoto({
      inputPath: photo.path, outputPath: outPath,
      options: { position, sizePercent, opacity, margin, quality, wmWhitePath, wmBlackPath }
    });

    processed++;
    progressBar.style.width = Math.round((processed / toProcess.length) * 100) + '%';

    if (result.success) {
      photo.status = 'done';
      document.getElementById('card-' + photo.id)?.classList.add('done');
      setBadge(photo.id, result.usedColor === 'white' ? 'white-wm' : 'black-wm',
        result.usedColor === 'white' ? 'blanc' : 'noir');
      statDone++;
      if (result.usedColor === 'white') statWhite++; else statBlack++;
    } else {
      photo.status = 'error';
      document.getElementById('card-' + photo.id)?.classList.add('error');
      setBadge(photo.id, 'error-badge', 'erreur');
      statErrors++;
    }
    updateStats();
  }

  statusMsg.textContent = 'Termine - ' + statDone + ' traitee(s), ' + statErrors + ' erreur(s)';
  isProcessing = false; updateProcessBtn();
  if (statDone > 0) btnOpenOutput.disabled = false;
});

function setBadge(id, cls, text) {
  const b = document.getElementById('badge-' + id);
  if (b) { b.className = 'badge ' + cls; b.textContent = text; }
}
function resetStats() { statDone = 0; statWhite = 0; statBlack = 0; statErrors = 0; updateStats(); }
function updateStats() {
  document.getElementById('stat-done').textContent   = statDone;
  document.getElementById('stat-white').textContent  = statWhite;
  document.getElementById('stat-black').textContent  = statBlack;
  document.getElementById('stat-errors').textContent = statErrors;
}

initWatermarks();

}); // fin DOMContentLoaded
