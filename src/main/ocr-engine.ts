import path from 'path';
import fs from 'fs';
import type { OcrResult } from '../shared/types';
import { ModelManager } from './model-manager';

// Lazy-load onnxruntime-node (native module)
let _ort: typeof import('onnxruntime-node') | null = null;
function getOrt(): typeof import('onnxruntime-node') {
  if (!_ort) {
    _ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
  }
  return _ort!;
}

// Lazy-load sharp (native module)
let _sharp: typeof import('sharp') | null = null;
function getSharp(): typeof import('sharp') {
  if (!_sharp) {
    _sharp = require('sharp') as typeof import('sharp');
  }
  return _sharp!;
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

// Use 'any' for ONNX session type to avoid complex generics with InferenceSessionFactory
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnnxSession = any;

export class OcrEngine {
  private modelManager: ModelManager;
  private detSession: OnnxSession = null;
  private recSession: OnnxSession = null;
  private dictionary: string[] = [];
  private initialized = false;

  constructor(modelManager: ModelManager) {
    this.modelManager = modelManager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.modelManager.ensureModels((msg) => {
      console.log(`[OcrEngine] ${msg}`);
    });

    const ort = getOrt();

    const detPath = this.modelManager.getModelPath('det');
    const recPath = this.modelManager.getModelPath('rec');
    const keysPath = this.modelManager.getModelPath('keys');

    console.log('[OcrEngine] Loading detection model...');
    this.detSession = await ort.InferenceSession.create(detPath, {
      executionProviders: ['cpu'],
    });

    console.log('[OcrEngine] Loading recognition model...');
    this.recSession = await ort.InferenceSession.create(recPath, {
      executionProviders: ['cpu'],
    });

    // Load character dictionary
    const keysContent = fs.readFileSync(keysPath, 'utf-8');
    this.dictionary = keysContent.split('\n').filter(line => line.length > 0);

    this.initialized = true;
    console.log(`[OcrEngine] Ready. Dictionary size: ${this.dictionary.length}`);
  }

  async recognize(imagePath: string): Promise<OcrResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const sharp = getSharp();

    // Load image
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const origWidth = metadata.width!;
    const origHeight = metadata.height!;

    // Get raw RGB pixels
    const rawBuffer = await image
      .removeAlpha()
      .raw()
      .toBuffer();

    // Step 1: Text detection
    const boxes = await this.runDetection(rawBuffer, origWidth, origHeight);
    if (boxes.length === 0) return [];

    // Step 2: Text recognition for each detected box
    const results: OcrResult[] = [];
    for (const box of boxes) {
      // Clamp to image bounds
      const x = Math.max(0, Math.round(box.x));
      const y = Math.max(0, Math.round(box.y));
      const w = Math.min(Math.round(box.width), origWidth - x);
      const h = Math.min(Math.round(box.height), origHeight - y);
      if (w <= 0 || h <= 0) continue;

      // Crop the text region
      const cropBuffer = await sharp(imagePath)
        .extract({ left: x, top: y, width: w, height: h })
        .removeAlpha()
        .raw()
        .toBuffer();

      const rec = await this.runRecognition(cropBuffer, w, h);
      if (rec.text.length === 0 || rec.confidence < 0.3) continue;

      results.push({
        text: rec.text,
        confidence: rec.confidence,
        bbox: [x, y, w, h],
        polygon: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
      });
    }

    return results;
  }

  private async runDetection(
    rawRgb: Buffer, origWidth: number, origHeight: number,
  ): Promise<BBox[]> {
    const ort = getOrt();

    // Resize: max side = 960, both dims divisible by 32
    const maxSide = 960;
    let scale = 1;
    if (Math.max(origWidth, origHeight) > maxSide) {
      scale = maxSide / Math.max(origWidth, origHeight);
    }
    let resizedW = Math.round(origWidth * scale);
    let resizedH = Math.round(origHeight * scale);
    // Round to multiple of 32
    resizedW = Math.max(32, Math.ceil(resizedW / 32) * 32);
    resizedH = Math.max(32, Math.ceil(resizedH / 32) * 32);

    // Resize image using sharp
    const sharp = getSharp();
    const resizedBuffer = await sharp(rawRgb, {
      raw: { width: origWidth, height: origHeight, channels: 3 },
    })
      .resize(resizedW, resizedH, { fit: 'fill' })
      .raw()
      .toBuffer();

    // Normalize and transpose from HWC to CHW
    // Det: scale 1/255, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const chw = new Float32Array(3 * resizedH * resizedW);
    const planeSize = resizedH * resizedW;

    for (let i = 0; i < planeSize; i++) {
      for (let c = 0; c < 3; c++) {
        const pixel = resizedBuffer[i * 3 + c] / 255.0;
        chw[c * planeSize + i] = (pixel - mean[c]) / std[c];
      }
    }

    // Create tensor and run inference
    const inputTensor = new ort.Tensor('float32', chw, [1, 3, resizedH, resizedW]);

    const inputNames = this.detSession!.inputNames;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeds: Record<string, any> = {};
    feeds[inputNames[0]] = inputTensor;

    const output = await this.detSession!.run(feeds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputVal = (Object.values(output) as any[])[0];
    const outputData = outputVal.data as Float32Array;

    // Post-process: threshold → connected components → bounding boxes
    const scaleX = origWidth / resizedW;
    const scaleY = origHeight / resizedH;

    return this.detPostProcess(outputData, resizedW, resizedH, scaleX, scaleY);
  }

  private detPostProcess(
    probMap: Float32Array,
    mapW: number,
    mapH: number,
    scaleX: number,
    scaleY: number,
  ): BBox[] {
    const thresh = 0.3;
    const boxThresh = 0.5;
    const minArea = 16;
    const expandRatio = 0.3; // simplified unclip: expand by 30%

    // Create binary map
    const binary = new Uint8Array(mapW * mapH);
    for (let i = 0; i < binary.length; i++) {
      binary[i] = probMap[i] > thresh ? 1 : 0;
    }

    // Connected component labeling (BFS flood fill)
    const visited = new Uint8Array(mapW * mapH);
    const boxes: BBox[] = [];
    const dx = [0, 0, 1, -1];
    const dy = [1, -1, 0, 0];

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const idx = y * mapW + x;
        if (!binary[idx] || visited[idx]) continue;

        // BFS
        let minX = x, maxX = x, minY = y, maxY = y;
        let scoreSum = 0;
        let area = 0;
        const queue: number[] = [x, y];
        visited[idx] = 1;
        let qi = 0;

        while (qi < queue.length) {
          const cx = queue[qi++];
          const cy = queue[qi++];
          const cidx = cy * mapW + cx;
          scoreSum += probMap[cidx];
          area++;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);

          for (let d = 0; d < 4; d++) {
            const nx = cx + dx[d];
            const ny = cy + dy[d];
            if (nx >= 0 && nx < mapW && ny >= 0 && ny < mapH) {
              const nidx = ny * mapW + nx;
              if (binary[nidx] && !visited[nidx]) {
                visited[nidx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }

        // Filter by area and score
        if (area < minArea) continue;
        const avgScore = scoreSum / area;
        if (avgScore < boxThresh) continue;

        // Compute bounding box with expansion (simplified unclip)
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const padX = bw * expandRatio;
        const padY = bh * expandRatio;

        const boxX = (minX - padX) * scaleX;
        const boxY = (minY - padY) * scaleY;
        const boxW = (bw + 2 * padX) * scaleX;
        const boxH = (bh + 2 * padY) * scaleY;

        boxes.push({
          x: Math.max(0, boxX),
          y: Math.max(0, boxY),
          width: boxW,
          height: boxH,
          score: avgScore,
        });
      }
    }

    return boxes;
  }

  private async runRecognition(
    rawRgb: Buffer, cropW: number, cropH: number,
  ): Promise<{ text: string; confidence: number }> {
    const ort = getOrt();
    const sharp = getSharp();

    // Resize to height 48, preserve aspect ratio
    const targetH = 48;
    const ratio = targetH / cropH;
    const targetW = Math.max(1, Math.round(cropW * ratio));

    const resizedBuffer = await sharp(rawRgb, {
      raw: { width: cropW, height: cropH, channels: 3 },
    })
      .resize(targetW, targetH, { fit: 'fill' })
      .raw()
      .toBuffer();

    // Normalize: (pixel/255 - 0.5) / 0.5 = pixel/127.5 - 1
    const chw = new Float32Array(3 * targetH * targetW);
    const planeSize = targetH * targetW;

    for (let i = 0; i < planeSize; i++) {
      for (let c = 0; c < 3; c++) {
        chw[c * planeSize + i] = resizedBuffer[i * 3 + c] / 127.5 - 1.0;
      }
    }

    // Create tensor and run inference
    const inputTensor = new ort.Tensor('float32', chw, [1, 3, targetH, targetW]);

    const inputNames = this.recSession!.inputNames;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeds: Record<string, any> = {};
    feeds[inputNames[0]] = inputTensor;

    const output = await this.recSession!.run(feeds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputTensor = (Object.values(output) as any[])[0];
    const outputData = outputTensor.data as Float32Array;
    const [, timesteps, numClasses] = outputTensor.dims as number[];

    // CTC greedy decode
    return this.ctcDecode(outputData, timesteps, numClasses);
  }

  private ctcDecode(
    logits: Float32Array,
    timesteps: number,
    numClasses: number,
  ): { text: string; confidence: number } {
    let text = '';
    let scoreSum = 0;
    let charCount = 0;
    let prevIdx = 0;

    for (let t = 0; t < timesteps; t++) {
      const offset = t * numClasses;

      // Find argmax
      let maxIdx = 0;
      let maxVal = logits[offset];
      for (let c = 1; c < numClasses; c++) {
        const val = logits[offset + c];
        if (val > maxVal) {
          maxVal = val;
          maxIdx = c;
        }
      }

      // CTC: skip blank (0) and consecutive duplicates
      if (maxIdx !== 0 && maxIdx !== prevIdx) {
        // Compute softmax probability for confidence
        let expSum = 0;
        for (let c = 0; c < numClasses; c++) {
          expSum += Math.exp(logits[offset + c] - maxVal);
        }
        const prob = 1.0 / expSum;
        scoreSum += prob;
        charCount++;

        // Map to character (index 0 = blank, so char = dict[maxIdx - 1])
        const charIdx = maxIdx - 1;
        if (charIdx < this.dictionary.length) {
          text += this.dictionary[charIdx];
        }
      }

      prevIdx = maxIdx;
    }

    return {
      text,
      confidence: charCount > 0 ? scoreSum / charCount : 0,
    };
  }

  shutdown(): void {
    this.detSession = null;
    this.recSession = null;
    this.initialized = false;
  }
}
