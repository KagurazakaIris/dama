import { clipboard, NativeImage } from 'electron';
import crypto from 'crypto';
import { EventEmitter } from 'events';

export class ClipboardMonitor extends EventEmitter {
  private lastHash: string = '';
  private paused: boolean = false;
  private selfSetFlag: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs = 500): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), intervalMs);
    // Initialize with current clipboard content hash
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      this.lastHash = this.computeHash(image);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setImageGuarded(image: NativeImage): void {
    this.selfSetFlag = true;
    clipboard.writeImage(image);
    this.lastHash = this.computeHash(image);
    setTimeout(() => {
      this.selfSetFlag = false;
    }, 200);
  }

  private check(): void {
    if (this.paused || this.selfSetFlag) return;

    const image = clipboard.readImage();
    if (image.isEmpty()) return;

    const hash = this.computeHash(image);
    if (hash !== this.lastHash) {
      this.lastHash = hash;
      this.emit('image-detected', image);
    }
  }

  private computeHash(image: NativeImage): string {
    const buffer = image.toPNG();
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}
