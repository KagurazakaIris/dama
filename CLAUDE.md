# CLAUDE.md — AI Assistant Context for Dama Desktop

## What is this project?

Dama Desktop is an Electron clipboard privacy protection tool. It monitors the system clipboard for images, runs local OCR (PP-OCRv4 via ONNX Runtime) to detect text, matches sensitive patterns (ID cards, phone numbers, bank cards, IPs, etc.), and lets the user apply solid-black masking before pasting.

## Key Files

### Main Process (`src/main/`)

| File | Role |
|------|------|
| `index.ts` | Entry point. Wires clipboard monitor → OCR → sensitive detection → preview window. All IPC handlers defined here. |
| `clipboard-monitor.ts` | Polls clipboard every 500ms, emits `image-detected` event on new images. Uses MD5 hash dedup and a self-set guard to avoid re-triggering on own writes. |
| `ocr-engine.ts` | Full PP-OCRv4 inference pipeline. Lazy-loads `onnxruntime-node` and `sharp`. Detection: resize to max 960 (32-aligned), ImageNet normalize, BFS connected components on probability map. Recognition: resize to height 48, CTC greedy decode. **Output is post-softmax** — confidence = maxVal directly. |
| `model-manager.ts` | Downloads det/rec ONNX models + dictionary from hf-mirror.com to `app.getPath('userData')/models/`. Uses Node.js `https` module with manual redirect following (not Electron `net.fetch`). |
| `sensitive-detector.ts` | 7 regex patterns with priority. `detectSensitive(ocrResults, enabledPatterns)` returns `SensitiveMatch[]`. Each match links back to the `OcrResult` with bbox coordinates. |
| `mosaic-processor.ts` | `applyMosaic(imagePath, regions, blockSize)` — composites solid black rectangles over regions using sharp. Returns PNG buffer. |
| `window-manager.ts` | Manages 3 BrowserWindows (intercept, preview, settings). Stores preview data in memory for IPC retrieval. |
| `tray.ts` | System tray with toggle monitor / settings / quit menu. |
| `store.ts` | JSON persistence in userData. Default: all patterns enabled, monitoring on. |

### Renderer (`src/renderer/`)

- `preview.ts` — Canvas-based editor with zoom/pan, drag-to-draw regions, undo/redo, region list with checkboxes. ~390 lines.
- `intercept.ts` — 10s countdown dialog, mosaic/skip choice.
- `settings.ts` — Toggle patterns and monitoring behavior.

### Shared (`src/shared/types.ts`)

All interfaces: `OcrResult`, `SensitiveMatch`, `MosaicRegion`, `AppSettings`, `PreviewData`, `DamaAPI`.

### Build

- `forge.config.ts` — Electron Forge config. Native modules (`sharp`, `@img/*`, `onnxruntime-node`, `onnxruntime-common`) copied in `packageAfterPrune` hook. ONNX binaries stripped to current platform only.
- `vite.main.config.ts` — Externals: `sharp`, `onnxruntime-node`.
- `.github/workflows/build.yml` — CI builds for win-x64, mac-arm64, linux-x64. Tag `v*` creates GitHub Release.

## Data Flow

```
Clipboard image detected
  → Save to temp PNG
  → (Optional) Show intercept window (user picks mosaic/skip)
  → ocrEngine.recognize(tempPath) → OcrResult[]
  → detectSensitive(ocrResults) → SensitiveMatch[]
  → Map to MosaicRegion[] (bbox coordinates from OCR)
  → Show preview window with regions
  → User edits regions (enable/disable, add manual, undo/redo)
  → applyMosaic(imagePath, enabledRegions) → PNG buffer
  → Write to clipboard or save to file
```

## Common Pitfalls

- **Native modules**: `sharp` and `onnxruntime-node` must be externalized in Vite config and copied by the forge hook. They cannot be bundled.
- **ONNX output is post-softmax**: The rec model output (`softmax_11.tmp_0`) contains probabilities, not logits. Do NOT apply exp/softmax again.
- **Model download**: Uses Node.js `https` (not Electron `net.fetch`) because hf-mirror redirects to CloudFront signed URLs that `net.fetch` handles unreliably.
- **Windows DLL path**: `setupNativeModulePaths()` in index.ts adds `@img/sharp-libvips-win32-x64/lib` to PATH before sharp loads.
- **ASAR unpacking**: `packagerConfig.asar.unpackDir = 'node_modules'` — all native .node/.dll/.so files must be on real filesystem.
- **YAML in CI**: Inline JavaScript with `: ` (colon-space) breaks YAML plain scalars. Use `run: |` block scalar for multiline or complex commands.

## OCR Model Details

| Model | File | Source | Size |
|-------|------|--------|------|
| Detection (DBNet) | `ch_PP-OCRv4_det_infer.onnx` | hf-mirror.com/Desperado-JT/CH-PP-OCRv4 | ~4.6MB |
| Recognition (CRNN) | `ch_PP-OCRv4_rec_infer.onnx` | same repo | ~11MB |
| Dictionary | `ppocr_keys_v1.txt` | PaddlePaddle/PaddleOCR GitHub | ~26KB |

Models are cached in `~/.config/dama-desktop/models/` (Linux) or equivalent userData path.

## Sensitive Patterns (sensitive-detector.ts)

| Key | Name | Priority |
|-----|------|----------|
| `idCard` | 身份证号 | 20 |
| `bankCard` | 银行卡号 | 18 |
| `phone` | 手机号 | 15 |
| `email` | 邮箱 | 12 |
| `passport` | 护照号 | 10 |
| `ipAddress` | IP地址 | 8 |
| `licensePlate` | 车牌号 | 7 |

## Commands

```bash
npm start          # Dev mode
npm run typecheck  # Type check
npm run generate-icon  # Generate tray icon PNG
npx electron-forge make  # Build packages
```
