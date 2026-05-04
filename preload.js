const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectPhotos: () => ipcRenderer.invoke('select-photos'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  selectInputDir: () => ipcRenderer.invoke('select-input-dir'),
  processPhoto: (args) => ipcRenderer.invoke('process-photo', args),
  getImageInfo: (filePath) => ipcRenderer.invoke('get-image-info', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),
});
