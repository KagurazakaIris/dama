import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import type { OcrResult } from '../shared/types';

export class OcrBridge {
  private process: ChildProcess | null = null;
  private pending: Map<number, {
    resolve: (value: OcrResult[]) => void;
    reject: (err: Error) => void;
  }> = new Map();
  private requestId = 0;
  private buffer = '';
  private initialized = false;
  private initResolve: (() => void) | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise<void>((resolve, reject) => {
      const pythonScript = this.getPythonScriptPath();
      this.process = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout!.setEncoding('utf-8');
      this.process.stdout!.on('data', (data: string) => {
        this.buffer += data;
        this.processBuffer();
      });

      this.process.stderr!.on('data', (data: Buffer) => {
        console.error('[OCR stderr]', data.toString());
      });

      this.process.on('error', (err) => {
        console.error('[OCR process error]', err);
        this.initialized = false;
        reject(err);
      });

      this.process.on('exit', (code) => {
        console.log('[OCR process exited]', code);
        this.initialized = false;
        this.process = null;
      });

      // Wait for ready response with timeout
      const timeout = setTimeout(() => {
        reject(new Error('OCR process initialization timeout'));
      }, 60000);

      this.initResolve = () => {
        clearTimeout(timeout);
        this.initialized = true;
        this.initResolve = null;
        resolve();
      };
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line);

        // Handle init response
        if (this.initResolve && msg.status === 'ok' && msg.id === undefined) {
          this.initResolve();
          continue;
        }

        // Handle request responses
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.status === 'ok') {
            resolve(msg.results || []);
          } else {
            reject(new Error(msg.error || 'OCR failed'));
          }
        }
      } catch (err) {
        console.error('[OCR] Failed to parse response:', line);
      }
    }
  }

  async recognize(imagePath: string): Promise<OcrResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const id = ++this.requestId;
    return new Promise<OcrResult[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sendRaw({ cmd: 'ocr', image_path: imagePath, id });

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('OCR request timeout'));
        }
      }, 30000);
    });
  }

  shutdown(): void {
    if (this.process) {
      this.sendRaw({ cmd: 'shutdown' });
      setTimeout(() => {
        if (this.process) {
          this.process.kill();
          this.process = null;
        }
      }, 2000);
    }
    this.initialized = false;
  }

  private sendRaw(msg: Record<string, unknown>): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(JSON.stringify(msg) + '\n');
    }
  }

  private getPythonScriptPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'python', 'ocr_server.py');
    }
    return path.join(app.getAppPath(), 'python', 'ocr_server.py');
  }
}
