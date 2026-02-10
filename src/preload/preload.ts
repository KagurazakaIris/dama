import { contextBridge, ipcRenderer } from 'electron';
import type { DamaAPI, MosaicRegion, AppSettings } from '../shared/types';

const api: DamaAPI = {
  // Intercept window
  getInterceptImage: () => ipcRenderer.invoke('get-intercept-image'),
  interceptAction: (action) => ipcRenderer.send('intercept-action', action),

  // Preview window
  getPreviewData: () => ipcRenderer.invoke('get-preview-data'),
  applyMosaic: (regions, blockSize) => ipcRenderer.invoke('apply-mosaic', regions, blockSize),
  saveToClipboard: (regions, blockSize) => ipcRenderer.invoke('save-to-clipboard', regions, blockSize),
  saveToFile: (regions, blockSize) => ipcRenderer.invoke('save-to-file', regions, blockSize),
  closePreview: () => ipcRenderer.send('close-preview'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  closeSettings: () => ipcRenderer.send('close-settings'),
};

contextBridge.exposeInMainWorld('damaAPI', api);
