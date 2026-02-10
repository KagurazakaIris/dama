import { BrowserWindow, screen } from 'electron';
import path from 'path';
import type { PreviewData } from '../shared/types';

// Forge vite plugin declares these
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export class WindowManager {
  private interceptWindow: BrowserWindow | null = null;
  private previewWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;

  private interceptImageBase64: string = '';
  private previewData: PreviewData | null = null;
  private interceptResolve: ((action: 'mosaic' | 'skip') => void) | null = null;

  createInterceptWindow(imageBase64: string): Promise<'mosaic' | 'skip'> {
    return new Promise((resolve) => {
      if (this.interceptWindow) {
        this.interceptWindow.close();
      }

      this.interceptImageBase64 = imageBase64;

      const display = screen.getPrimaryDisplay();
      const { width, height } = display.workAreaSize;

      this.interceptWindow = new BrowserWindow({
        width: 400,
        height: 200,
        x: width - 420,
        y: height - 220,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        frame: false,
        transparent: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      this.loadPage(this.interceptWindow, 'intercept');

      // Auto-close after 10 seconds (default: skip)
      const autoCloseTimer = setTimeout(() => {
        if (this.interceptWindow && !this.interceptWindow.isDestroyed()) {
          this.interceptWindow.close();
          resolve('skip');
        }
      }, 10000);

      this.interceptWindow.on('closed', () => {
        clearTimeout(autoCloseTimer);
        this.interceptWindow = null;
      });

      this.interceptResolve = (action: 'mosaic' | 'skip') => {
        clearTimeout(autoCloseTimer);
        this.interceptResolve = null;
        if (this.interceptWindow && !this.interceptWindow.isDestroyed()) {
          this.interceptWindow.close();
        }
        resolve(action);
      };
    });
  }

  handleInterceptAction(action: 'mosaic' | 'skip'): void {
    if (this.interceptResolve) {
      this.interceptResolve(action);
    }
  }

  getInterceptImageBase64(): string {
    return this.interceptImageBase64;
  }

  createPreviewWindow(data: PreviewData): void {
    if (this.previewWindow) {
      this.previewWindow.close();
    }

    this.previewData = data;

    this.previewWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 500,
      title: 'Dama - 打码预览',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.loadPage(this.previewWindow, 'preview');

    this.previewWindow.on('closed', () => {
      this.previewWindow = null;
    });
  }

  getPreviewData(): PreviewData | null {
    return this.previewData;
  }

  closePreview(): void {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.close();
    }
  }

  createSettingsWindow(): void {
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 500,
      height: 500,
      resizable: false,
      title: 'Dama - 设置',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.loadPage(this.settingsWindow, 'settings');

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });
  }

  closeSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close();
    }
  }

  private loadPage(win: BrowserWindow, page: string): void {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/src/renderer/${page}.html`);
    } else {
      win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/src/renderer/${page}.html`));
    }
  }
}
