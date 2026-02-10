# Dama Desktop

Clipboard privacy protection tool for Windows, macOS, and Linux.

Monitors clipboard images, detects sensitive information (ID numbers, phone numbers, bank cards, IP addresses, etc.) via local OCR, and applies solid-black masking before pasting.

## Architecture

```
Electron Main Process
├── Clipboard Monitor    (500ms polling, MD5 dedup)
├── OCR Engine           (ONNX Runtime + PP-OCRv4)
├── Sensitive Detector   (regex pattern matching)
├── Mosaic Processor     (sharp, solid black fill)
├── Window Manager       (intercept / preview / settings)
├── Tray Manager         (system tray icon + menu)
└── Model Manager        (auto-download from hf-mirror)

Renderer (vanilla TypeScript, no framework)
├── Intercept Window     (10s countdown, mosaic/skip)
├── Preview Window       (canvas editor, region list, undo/redo)
└── Settings Window      (toggle patterns, auto-process)
```

## Tech Stack

- **Electron 34** + TypeScript 5.7 + Vite 6
- **onnxruntime-node** — PP-OCRv4 ONNX models (det + rec), runs locally on CPU
- **sharp** — image preprocessing and mosaic compositing
- **Electron Forge** — packaging (ZIP / DEB / RPM)

## Prerequisites

- Node.js 22+
- npm 10+
- Linux: `dpkg`, `fakeroot`, `rpm` (for building .deb/.rpm packages)

## Development

```bash
# Install dependencies
npm ci

# Generate tray icon
npm run generate-icon

# Run in dev mode
npm start

# Type check
npm run typecheck
```

## Building

```bash
# Package for current platform
npx electron-forge make

# Cross-platform (via CI)
# See .github/workflows/build.yml
```

Output in `out/make/` — ZIP on all platforms, plus .deb and .rpm on Linux.

## Project Structure

```
src/
├── main/
│   ├── index.ts               # App entry, IPC handlers, pipeline orchestration
│   ├── clipboard-monitor.ts   # Clipboard image polling
│   ├── ocr-engine.ts          # ONNX inference (det + rec + CTC decode)
│   ├── model-manager.ts       # Model download from hf-mirror
│   ├── sensitive-detector.ts  # Regex patterns (7 types)
│   ├── mosaic-processor.ts    # Solid black fill via sharp composite
│   ├── window-manager.ts      # BrowserWindow lifecycle
│   ├── tray.ts                # System tray
│   ├── store.ts               # JSON settings persistence
│   └── ocr-bridge.ts          # (unused) Python PaddleOCR bridge
├── preload/
│   └── preload.ts             # contextBridge API
├── renderer/
│   ├── intercept.{html,ts,css}
│   ├── preview.{html,ts,css}
│   └── settings.{html,ts,css}
└── shared/
    └── types.ts               # Shared TypeScript interfaces
```

## OCR Pipeline

1. **Detection**: PP-OCRv4 det model — resize to max 960px (32-aligned), ImageNet normalization, connected component labeling on probability map
2. **Recognition**: PP-OCRv4 rec model — crop each text box, resize to height 48, CTC greedy decode with 6623-character dictionary
3. **Models** (~16MB total): auto-downloaded to `userData/models/` on first run from `hf-mirror.com`

## Sensitive Patterns

| Type | Key | Example |
|------|-----|---------|
| ID Card (18-digit) | `idCard` | 110101199001011234 |
| Bank Card | `bankCard` | 6222 0200 1234 5678 |
| Phone | `phone` | 13812345678 |
| Email | `email` | user@example.com |
| IP Address | `ipAddress` | 192.168.1.1 |
| Passport | `passport` | G12345678 |
| License Plate | `licensePlate` | 京A12345 |

## CI/CD

GitHub Actions builds on push to `master`:
- Windows x64 (ZIP)
- macOS arm64 (ZIP)
- Linux x64 (DEB + RPM + ZIP)

Tag `v*` triggers GitHub Release with all artifacts.

## License

MIT
