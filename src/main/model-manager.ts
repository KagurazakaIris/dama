import path from 'path';
import fs from 'fs';
import https from 'https';
import { app } from 'electron';

interface ModelFile {
  filename: string;
  url: string;
}

const MODEL_BASE = 'https://hf-mirror.com/Desperado-JT/CH-PP-OCRv4/resolve/main';
const DICT_URL = 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/ppocr_keys_v1.txt';

const MODEL_FILES: Record<string, ModelFile> = {
  det: {
    filename: 'ch_PP-OCRv4_det_infer.onnx',
    url: `${MODEL_BASE}/ch_PP-OCRv4_det_infer.onnx`,
  },
  rec: {
    filename: 'ch_PP-OCRv4_rec_infer.onnx',
    url: `${MODEL_BASE}/ch_PP-OCRv4_rec_infer.onnx`,
  },
  keys: {
    filename: 'ppocr_keys_v1.txt',
    url: DICT_URL,
  },
};

export class ModelManager {
  private modelsDir: string;

  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'models');
  }

  getModelPath(key: string): string {
    const model = MODEL_FILES[key];
    if (!model) throw new Error(`Unknown model: ${key}`);
    return path.join(this.modelsDir, model.filename);
  }

  isReady(): boolean {
    return Object.keys(MODEL_FILES).every(key => {
      return fs.existsSync(this.getModelPath(key));
    });
  }

  async ensureModels(onProgress?: (msg: string) => void): Promise<void> {
    fs.mkdirSync(this.modelsDir, { recursive: true });

    for (const [, model] of Object.entries(MODEL_FILES)) {
      const dest = path.join(this.modelsDir, model.filename);
      if (fs.existsSync(dest)) {
        console.log(`[ModelManager] ${model.filename} already exists`);
        continue;
      }

      const msg = `正在下载 ${model.filename}...`;
      console.log(`[ModelManager] ${msg}`);
      onProgress?.(msg);

      await this.downloadFile(model.url, dest);
      console.log(`[ModelManager] Downloaded ${model.filename}`);
    }

    onProgress?.('模型准备就绪');
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    const tmpPath = destPath + '.tmp';

    return new Promise<void>((resolve, reject) => {
      const doRequest = (requestUrl: string, redirectCount: number): void => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        https.get(requestUrl, { headers: { 'User-Agent': 'Dama-Desktop/1.0' } }, (res) => {
          // Follow redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log(`[ModelManager] Redirect ${res.statusCode} → ${res.headers.location.substring(0, 80)}...`);
            doRequest(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }

          const ws = fs.createWriteStream(tmpPath);
          res.pipe(ws);
          ws.on('finish', () => {
            try {
              fs.renameSync(tmpPath, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
          ws.on('error', (err) => {
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
            reject(err);
          });
        }).on('error', (err) => {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(err);
        });
      };

      doRequest(url, 0);
    });
  }
}
