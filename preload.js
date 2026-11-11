const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectPhotos:       () => ipcRenderer.invoke('select-photos'),
  selectOutputDir:    () => ipcRenderer.invoke('select-output-dir'),
  selectInputDir:     () => ipcRenderer.invoke('select-input-dir'),
  processPhoto:       (args) => ipcRenderer.invoke('process-photo', args),
  getImageInfo:       (filePath) => ipcRenderer.invoke('get-image-info', filePath),
  openFolder:         (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getAssetsPath:      () => ipcRenderer.invoke('get-assets-path'),
  getWatermarkPaths:  () => ipcRenderer.invoke('get-watermark-paths'),
  selectWatermark:    (color) => ipcRenderer.invoke('select-watermark', color),
  // File.path n'existe plus à partir d'Electron 32 : webUtils est la méthode officielle
  getPathForFile:     (file) => webUtils.getPathForFile(file),
});
