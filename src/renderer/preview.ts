import type { MosaicRegion } from '../shared/types';

interface Region extends MosaicRegion {
  label: string;
}

interface HistoryEntry {
  regions: Region[];
}

let regions: Region[] = [];
let history: HistoryEntry[] = [];
let historyIndex = -1;

let image: HTMLImageElement | null = null;
let imageWidth = 0;
let imageHeight = 0;

// Canvas state
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let containerEl: HTMLElement;

// View state
let viewX = 0;
let viewY = 0;
let viewScale = 1;

// Drag state
let isDragging = false;
let isPanning = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCurrentX = 0;
let dragCurrentY = 0;
let panStartX = 0;
let panStartY = 0;
let panViewStartX = 0;
let panViewStartY = 0;

let highlightedRegionId: string | null = null;
let manualCounter = 0;

window.addEventListener('DOMContentLoaded', async () => {
  canvas = document.getElementById('canvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;
  containerEl = document.getElementById('canvas-container')!;

  const data = await window.damaAPI.getPreviewData();
  if (!data) return;

  // Load image
  image = new Image();
  image.onload = () => {
    imageWidth = image!.width;
    imageHeight = image!.height;
    regions = data.regions.map(r => ({
      ...r,
      label: r.label || r.type,
    }));
    pushHistory();
    fitToView();
    render();
    renderRegionList();
  };
  image.src = `data:image/png;base64,${data.imageBase64}`;

  // Setup events
  setupCanvasEvents();
  setupToolbar();
  setupBottomBar();
  setupKeyboard();
});

function pushHistory(): void {
  history = history.slice(0, historyIndex + 1);
  history.push({ regions: JSON.parse(JSON.stringify(regions)) });
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}

function undo(): void {
  if (historyIndex > 0) {
    historyIndex--;
    regions = JSON.parse(JSON.stringify(history[historyIndex].regions));
    render();
    renderRegionList();
    updateUndoRedoButtons();
  }
}

function redo(): void {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    regions = JSON.parse(JSON.stringify(history[historyIndex].regions));
    render();
    renderRegionList();
    updateUndoRedoButtons();
  }
}

function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('tool-undo') as HTMLButtonElement;
  const redoBtn = document.getElementById('tool-redo') as HTMLButtonElement;
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}

function fitToView(): void {
  const cw = containerEl.clientWidth;
  const ch = containerEl.clientHeight;
  const scaleX = cw / imageWidth;
  const scaleY = ch / imageHeight;
  viewScale = Math.min(scaleX, scaleY, 1) * 0.9;
  viewX = (cw - imageWidth * viewScale) / 2;
  viewY = (ch - imageHeight * viewScale) / 2;
}

function render(): void {
  const cw = containerEl.clientWidth;
  const ch = containerEl.clientHeight;
  canvas.width = cw;
  canvas.height = ch;

  ctx.clearRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(viewX, viewY);
  ctx.scale(viewScale, viewScale);

  // Draw image
  if (image) {
    ctx.drawImage(image, 0, 0);
  }

  // Draw enabled regions
  for (const region of regions) {
    if (!region.enabled) continue;

    const isHighlighted = region.id === highlightedRegionId;
    ctx.fillStyle = region.type === 'auto'
      ? (isHighlighted ? 'rgba(66, 133, 244, 0.5)' : 'rgba(66, 133, 244, 0.3)')
      : (isHighlighted ? 'rgba(244, 161, 66, 0.5)' : 'rgba(244, 161, 66, 0.3)');
    ctx.fillRect(region.x, region.y, region.width, region.height);

    ctx.strokeStyle = region.type === 'auto' ? '#4285f4' : '#f4a142';
    ctx.lineWidth = 2 / viewScale;
    ctx.strokeRect(region.x, region.y, region.width, region.height);
  }

  // Draw disabled regions with dashed border
  for (const region of regions) {
    if (region.enabled) continue;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1 / viewScale;
    ctx.setLineDash([4 / viewScale, 4 / viewScale]);
    ctx.strokeRect(region.x, region.y, region.width, region.height);
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Draw selection rectangle (in screen coordinates)
  if (isDragging) {
    const x1 = Math.min(dragStartX, dragCurrentX);
    const y1 = Math.min(dragStartY, dragCurrentY);
    const w = Math.abs(dragCurrentX - dragStartX);
    const h = Math.abs(dragCurrentY - dragStartY);

    ctx.strokeStyle = '#f4a142';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x1, y1, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(244, 161, 66, 0.15)';
    ctx.fillRect(x1, y1, w, h);
  }
}

function screenToImage(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - viewX) / viewScale,
    y: (sy - viewY) / viewScale,
  };
}

function setupCanvasEvents(): void {
  containerEl.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click: pan
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panViewStartX = viewX;
      panViewStartY = viewY;
      containerEl.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0) {
      // Left click: draw rectangle
      const rect = containerEl.getBoundingClientRect();
      isDragging = true;
      dragStartX = e.clientX - rect.left;
      dragStartY = e.clientY - rect.top;
      dragCurrentX = dragStartX;
      dragCurrentY = dragStartY;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      viewX = panViewStartX + (e.clientX - panStartX);
      viewY = panViewStartY + (e.clientY - panStartY);
      render();
      return;
    }

    if (isDragging) {
      const rect = containerEl.getBoundingClientRect();
      dragCurrentX = e.clientX - rect.left;
      dragCurrentY = e.clientY - rect.top;
      render();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      containerEl.style.cursor = 'crosshair';
      return;
    }

    if (isDragging) {
      isDragging = false;
      const rect = containerEl.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Convert screen coords to image coords
      const p1 = screenToImage(Math.min(dragStartX, endX), Math.min(dragStartY, endY));
      const p2 = screenToImage(Math.max(dragStartX, endX), Math.max(dragStartY, endY));

      const w = p2.x - p1.x;
      const h = p2.y - p1.y;

      // Only add if the rectangle is large enough
      if (w > 5 && h > 5) {
        manualCounter++;
        regions.push({
          id: `manual-${manualCounter}`,
          x: p1.x,
          y: p1.y,
          width: w,
          height: h,
          type: 'manual',
          label: `手动区域 ${manualCounter}`,
          enabled: true,
        });
        pushHistory();
        renderRegionList();
      }

      render();
    }
  });

  // Scroll to zoom
  containerEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = containerEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = viewScale * factor;

    if (newScale < 0.1 || newScale > 10) return;

    // Zoom toward mouse position
    viewX = mx - (mx - viewX) * factor;
    viewY = my - (my - viewY) * factor;
    viewScale = newScale;

    render();
  }, { passive: false });

  window.addEventListener('resize', () => {
    render();
  });
}

function setupToolbar(): void {
  document.getElementById('tool-undo')!.addEventListener('click', undo);
  document.getElementById('tool-redo')!.addEventListener('click', redo);
}

function renderRegionList(): void {
  const list = document.getElementById('region-list')!;
  list.innerHTML = '';

  for (const region of regions) {
    const item = document.createElement('div');
    item.className = `region-item${region.id === highlightedRegionId ? ' highlighted' : ''}`;
    item.dataset.id = region.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = region.enabled;
    checkbox.addEventListener('change', () => {
      region.enabled = checkbox.checked;
      pushHistory();
      render();
    });

    const tag = document.createElement('span');
    tag.className = `region-tag ${region.type}`;
    tag.textContent = region.type === 'auto' ? '自动' : '手动';

    const label = document.createElement('span');
    label.className = 'region-label';
    label.textContent = region.label;
    label.title = region.label;

    item.appendChild(checkbox);
    item.appendChild(tag);
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      highlightedRegionId = region.id;
      // Jump to region
      const cw = containerEl.clientWidth;
      const ch = containerEl.clientHeight;
      viewX = cw / 2 - (region.x + region.width / 2) * viewScale;
      viewY = ch / 2 - (region.y + region.height / 2) * viewScale;
      render();
      renderRegionList();
    });

    list.appendChild(item);
  }
}

function setupBottomBar(): void {
  const mosaicSlider = document.getElementById('mosaic-size') as HTMLInputElement;
  const mosaicValue = document.getElementById('mosaic-value')!;

  mosaicSlider.addEventListener('input', () => {
    mosaicValue.textContent = mosaicSlider.value;
  });

  document.getElementById('btn-clipboard')!.addEventListener('click', async () => {
    const blockSize = parseInt(mosaicSlider.value);
    const enabledRegions = regions.filter(r => r.enabled);
    await window.damaAPI.saveToClipboard(enabledRegions, blockSize);
  });

  document.getElementById('btn-save')!.addEventListener('click', async () => {
    const blockSize = parseInt(mosaicSlider.value);
    const enabledRegions = regions.filter(r => r.enabled);
    await window.damaAPI.saveToFile(enabledRegions, blockSize);
  });

  document.getElementById('btn-cancel')!.addEventListener('click', () => {
    window.damaAPI.closePreview();
  });

  document.getElementById('btn-select-all')!.addEventListener('click', () => {
    regions.forEach(r => r.enabled = true);
    pushHistory();
    render();
    renderRegionList();
  });

  document.getElementById('btn-select-none')!.addEventListener('click', () => {
    regions.forEach(r => r.enabled = false);
    pushHistory();
    render();
    renderRegionList();
  });
}

function setupKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });
}
