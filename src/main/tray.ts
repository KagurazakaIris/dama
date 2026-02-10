import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';

export class TrayManager {
  private tray: Tray | null = null;

  create(callbacks: {
    onToggleMonitor: () => void;
    onSettings: () => void;
    onQuit: () => void;
    isMonitoring: () => boolean;
  }): void {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'resources', 'icon.png');

    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) throw new Error('empty');
    } catch {
      icon = this.createDefaultIcon();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Dama - 剪贴板隐私保护');
    this.updateMenu(callbacks);
  }

  updateMenu(callbacks: {
    onToggleMonitor: () => void;
    onSettings: () => void;
    onQuit: () => void;
    isMonitoring: () => boolean;
  }): void {
    if (!this.tray) return;

    const monitoring = callbacks.isMonitoring();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: monitoring ? '暂停监控' : '启动监控',
        click: () => {
          callbacks.onToggleMonitor();
          this.updateMenu(callbacks);
        },
      },
      { type: 'separator' },
      {
        label: '设置',
        click: callbacks.onSettings,
      },
      { type: 'separator' },
      {
        label: '退出',
        click: callbacks.onQuit,
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private createDefaultIcon(): Electron.NativeImage {
    // Create a simple 16x16 colored square as default icon
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buffer[i * 4] = 66;       // R
      buffer[i * 4 + 1] = 133;  // G
      buffer[i * 4 + 2] = 244;  // B
      buffer[i * 4 + 3] = 255;  // A
    }
    return nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
