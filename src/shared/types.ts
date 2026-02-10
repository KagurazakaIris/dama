export interface OcrResult {
  text: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  polygon: number[][];
}

export interface SensitiveMatch {
  patternName: string;
  matchedText: string;
  ocrResult: OcrResult;
}

export interface MosaicRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'auto' | 'manual';
  label?: string;
  enabled: boolean;
}

export interface AppSettings {
  monitorEnabled: boolean;
  autoProcess: boolean;
  mosaicBlockSize: number;
  sensitivePatterns: Record<string, boolean>;
}

export interface PreviewData {
  imagePath: string;
  imageBase64: string;
  regions: MosaicRegion[];
  imageWidth: number;
  imageHeight: number;
}

export interface DamaAPI {
  // Intercept window
  getInterceptImage: () => Promise<string>;
  interceptAction: (action: 'mosaic' | 'skip') => void;

  // Preview window
  getPreviewData: () => Promise<PreviewData>;
  applyMosaic: (regions: MosaicRegion[], blockSize: number) => Promise<string>;
  saveToClipboard: (regions: MosaicRegion[], blockSize: number) => Promise<void>;
  saveToFile: (regions: MosaicRegion[], blockSize: number) => Promise<string>;
  closePreview: () => void;

  // Settings
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  closeSettings: () => void;
}

declare global {
  interface Window {
    damaAPI: DamaAPI;
  }
}
