const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { processPhoto } = require('./processor');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'LM Watermark',
    backgroundColor: '#0f0f0f',
    show: false
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Chemin du fichier de config utilisateur
function getConfigPath() {
  return path.join(app.getPath('userData'), 'wm-config.json');
}

function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function saveConfig(data) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
  } catch {}
}

// Retourner les chemins des filigranes (config ou assets par defaut)
ipcMain.handle('get-watermark-paths', () => {
  const config = loadConfig();
  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, 'assets');

  const whitePath = config.wmWhite || path.join(assetsPath, 'Signature_Blanc.png');
  const blackPath = config.wmBlack || path.join(assetsPath, 'Signature_noir.png');

  return {
    white: fs.existsSync(whitePath) ? whitePath : null,
    black: fs.existsSync(blackPath) ? blackPath : null,
  };
});

// Choisir un filigrane manuellement
ipcMain.handle('select-watermark', async (event, color) => {
  if (color !== 'white' && color !== 'black') return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner le filigrane ' + color,
    filters: [{ name: 'PNG', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;

  const selectedPath = result.filePaths[0];
  const config = loadConfig();
  if (color === 'white') config.wmWhite = selectedPath;
  else config.wmBlack = selectedPath;
  saveConfig(config);

  return selectedPath;
});

ipcMain.handle('select-photos', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner des photos',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'] }],
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Dossier de sortie',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-input-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner un dossier de photos',
    properties: ['openDirectory']
  });
  if (result.canceled) return [];
  const dir = result.filePaths[0];
  const exts = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];
  try {
    return fs.readdirSync(dir)
      .filter(f => exts.includes(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(f => path.join(dir, f));
  } catch { return []; }
});

ipcMain.handle('process-photo', (event, args) => processPhoto(args));

ipcMain.handle('get-image-info', async (event, filePath) => {
  try {
    const meta = await sharp(filePath).metadata();
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch { return null; }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

// Conserver pour compatibilite
ipcMain.handle('get-assets-path', () => {
  if (app.isPackaged) return path.join(process.resourcesPath, 'assets');
  return path.join(__dirname, 'assets');
});
