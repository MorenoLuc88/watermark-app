const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

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
      webSecurity: false
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
      .map(f => path.join(dir, f));
  } catch(e) {
    return [];
  }
});

async function analyzeLuminosity(imagePath, x, y, w, h) {
  try {
    const { data } = await sharp(imagePath)
      .extract({
        left:   Math.max(0, Math.round(x)),
        top:    Math.max(0, Math.round(y)),
        width:  Math.max(1, Math.round(w)),
        height: Math.max(1, Math.round(h))
      })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
  } catch { return 128; }
}

ipcMain.handle('process-photo', async (event, { inputPath, outputPath, options }) => {
  try {
    const { position, sizePercent, opacity, margin, wmWhitePath, wmBlackPath } = options;

    const meta = await sharp(inputPath).metadata();
    const imgW = meta.width;
    const imgH = meta.height;

    const baseSize = Math.min(imgW, imgH);
    const wmW = Math.round(baseSize * (sizePercent / 100));
    const wmMeta = await sharp(wmWhitePath).metadata();
    const wmH = Math.round(wmW / (wmMeta.width / wmMeta.height));

    const m = margin;
    let x, y;
    switch (position) {
      case 'bottom-right':  x = imgW - wmW - m; y = imgH - wmH - m; break;
      case 'bottom-left':   x = m;               y = imgH - wmH - m; break;
      case 'bottom-center': x = Math.round((imgW - wmW) / 2); y = imgH - wmH - m; break;
      case 'top-right':     x = imgW - wmW - m; y = m; break;
      case 'top-left':      x = m;               y = m; break;
      case 'top-center':    x = Math.round((imgW - wmW) / 2); y = m; break;
      case 'center':        x = Math.round((imgW - wmW) / 2); y = Math.round((imgH - wmH) / 2); break;
      default:              x = imgW - wmW - m; y = imgH - wmH - m;
    }

    x = Math.max(0, Math.min(x, imgW - wmW));
    y = Math.max(0, Math.min(y, imgH - wmH));

    const lum = await analyzeLuminosity(inputPath, x, y, wmW, wmH);
    const useWhite = lum < 128;
    const wmPath = useWhite ? wmWhitePath : wmBlackPath;

    const opacityFactor = opacity / 100;

    // Redimensionner le filigrane en conservant la transparence PNG
    const wmRaw = await sharp(wmPath)
      .resize(wmW, wmH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Modifier uniquement le canal alpha pour l'opacite
    const { data: wmData, info: wmInfo } = wmRaw;
    for (let i = 3; i < wmData.length; i += 4) {
      wmData[i] = Math.round(wmData[i] * opacityFactor);
    }

    const wmResized = await sharp(wmData, {
      raw: { width: wmInfo.width, height: wmInfo.height, channels: 4 }
    }).png().toBuffer();

    // Assurer que le dossier de sortie existe
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    await sharp(inputPath)
      .composite([{ input: wmResized, left: x, top: y, blend: 'over' }])
      .toFile(outputPath);

    return { success: true, usedColor: useWhite ? 'white' : 'black', luminosity: Math.round(lum) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-image-info', async (event, filePath) => {
  try {
    const meta = await sharp(filePath).metadata();
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch { return null; }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.handle('get-assets-path', () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, 'assets');
});
