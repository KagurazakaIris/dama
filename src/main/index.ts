import { app, ipcMain, NativeImage, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ClipboardMonitor } from './clipboard-monitor';
import { OcrEngine } from './ocr-engine';
import { ModelManager } from './model-manager';
import { detectSensitive } from './sensitive-detector';
import { applyMosaic } from './mosaic-processor';
import { WindowManager } from './window-manager';
import { TrayManager } from './tray';
import { getSettings, saveSettings } from './store';
import type { MosaicRegion, PreviewData } from '../shared/types';

const clipboardMonitor = new ClipboardMonitor();
const modelManager = new ModelManager();
const ocrEngine = new OcrEngine(modelManager);
const windowManager = new WindowManager();
const trayManager = new TrayManager();

let monitoring = true;
let processing = false;

function getTempPath(filename: string): string {
  return path.join(os.tmpdir(), filename);
}

async function handleImageDetected(image: NativeImage): Promise<void> {
  if (processing) return;
  const settings = getSettings();
  if (!settings.monitorEnabled) return;

  processing = true;

  try {
    // Save image to temp file
    const tempPath = getTempPath(`dama_${Date.now()}.png`);
    fs.writeFileSync(tempPath, image.toPNG());

    if (settings.autoProcess) {
      await processImage(tempPath, image);
      return;
    }

    // Show intercept dialog
    const imageBase64 = image.toPNG().toString('base64');
    const action = await windowManager.createInterceptWindow(imageBase64);

    if (action === 'mosaic') {
      await processImage(tempPath, image);
    } else {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  } finally {
    processing = false;
  }
}

async function processImage(tempPath: string, image: NativeImage): Promise<void> {
  const settings = getSettings();

  try {
    // Run OCR
    console.log('[processImage] Running OCR on', tempPath);
    const ocrResults = await ocrEngine.recognize(tempPath);
    console.log('[processImage] OCR found', ocrResults.length, 'text regions');
    for (const r of ocrResults) {
      console.log(`  [OCR] "${r.text}" (confidence: ${r.confidence.toFixed(3)}, bbox: ${r.bbox})`);
    }

    // Detect sensitive info
    const sensitiveMatches = detectSensitive(ocrResults, settings.sensitivePatterns);
    console.log('[processImage] Sensitive matches:', sensitiveMatches.length);
    for (const m of sensitiveMatches) {
      console.log(`  [Sensitive] ${m.patternName}: "${m.matchedText}"`);
    }

    // Convert matches to regions
    const regions: MosaicRegion[] = sensitiveMatches.map((match, i) => ({
      id: `auto-${i}`,
      x: match.ocrResult.bbox[0],
      y: match.ocrResult.bbox[1],
      width: match.ocrResult.bbox[2],
      height: match.ocrResult.bbox[3],
      type: 'auto' as const,
      label: `${match.patternName}: ${match.matchedText}`,
      enabled: true,
    }));

    // Get image dimensions
    const { width, height } = image.getSize();
    const imageBase64 = image.toPNG().toString('base64');

    // Show preview window
    const previewData: PreviewData = {
      imagePath: tempPath,
      imageBase64,
      regions,
      imageWidth: width,
      imageHeight: height,
    };

    windowManager.createPreviewWindow(previewData);
  } catch (err) {
    console.error('Failed to process image:', err);
    // Still show preview window without auto-detected regions
    const { width, height } = image.getSize();
    const imageBase64 = image.toPNG().toString('base64');
    windowManager.createPreviewWindow({
      imagePath: tempPath,
      imageBase64,
      regions: [],
      imageWidth: width,
      imageHeight: height,
    });
  }
}

// --- IPC Handlers ---

ipcMain.handle('get-intercept-image', () => {
  return windowManager.getInterceptImageBase64();
});

ipcMain.on('intercept-action', (_event, action: 'mosaic' | 'skip') => {
  windowManager.handleInterceptAction(action);
});

ipcMain.handle('get-preview-data', () => {
  return windowManager.getPreviewData();
});

ipcMain.handle('apply-mosaic', async (_event, regions: MosaicRegion[], blockSize: number) => {
  const data = windowManager.getPreviewData();
  if (!data) throw new Error('No preview data');
  const buffer = await applyMosaic(data.imagePath, regions, blockSize);
  return buffer.toString('base64');
});

ipcMain.handle('save-to-clipboard', async (_event, regions: MosaicRegion[], blockSize: number) => {
  const data = windowManager.getPreviewData();
  if (!data) throw new Error('No preview data');
  const buffer = await applyMosaic(data.imagePath, regions, blockSize);
  const image = nativeImage.createFromBuffer(buffer);
  clipboardMonitor.setImageGuarded(image);
  windowManager.closePreview();
});

ipcMain.handle('save-to-file', async (_event, regions: MosaicRegion[], blockSize: number) => {
  const data = windowManager.getPreviewData();
  if (!data) throw new Error('No preview data');
  const buffer = await applyMosaic(data.imagePath, regions, blockSize);

  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `dama_${Date.now()}.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });

  if (filePath) {
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
  return '';
});

ipcMain.on('close-preview', () => {
  windowManager.closePreview();
});

ipcMain.handle('get-settings', () => {
  return getSettings();
});

ipcMain.handle('save-settings', (_event, settings) => {
  saveSettings(settings);
  const s = getSettings();
  if (s.monitorEnabled && !monitoring) {
    clipboardMonitor.resume();
    monitoring = true;
  } else if (!s.monitorEnabled && monitoring) {
    clipboardMonitor.pause();
    monitoring = false;
  }
  trayManager.updateMenu(trayCallbacks);
});

ipcMain.on('close-settings', () => {
  windowManager.closeSettings();
});

// --- Tray callbacks ---

const trayCallbacks = {
  onToggleMonitor: () => {
    monitoring = !monitoring;
    if (monitoring) {
      clipboardMonitor.resume();
    } else {
      clipboardMonitor.pause();
    }
    const settings = getSettings();
    saveSettings({ ...settings, monitorEnabled: monitoring });
  },
  onSettings: () => {
    windowManager.createSettingsWindow();
  },
  onQuit: () => {
    ocrEngine.shutdown();
    clipboardMonitor.stop();
    app.quit();
  },
  isMonitoring: () => monitoring,
};

// --- Native module setup ---
// On Windows, add the libvips DLL directory to PATH so that sharp's
// native binding can find libvips-42.dll and other dependencies.
// Must run before sharp is loaded (sharp is lazy-loaded in mosaic-processor).
function setupNativeModulePaths(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  const libvipsDir = path.join(
    process.resourcesPath,
    'app.asar.unpacked', 'node_modules', '@img',
    'sharp-libvips-win32-x64', 'lib'
  );
  if (fs.existsSync(libvipsDir)) {
    process.env.PATH = `${libvipsDir};${process.env.PATH}`;
  }
}

// --- App lifecycle ---

app.whenReady().then(() => {
  setupNativeModulePaths();
  trayManager.create(trayCallbacks);
  clipboardMonitor.on('image-detected', handleImageDetected);
  clipboardMonitor.start(500);

  const settings = getSettings();
  monitoring = settings.monitorEnabled;
  if (!monitoring) {
    clipboardMonitor.pause();
  }
});

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed (tray app)
});

app.on('before-quit', () => {
  ocrEngine.shutdown();
  clipboardMonitor.stop();
  trayManager.destroy();
});
