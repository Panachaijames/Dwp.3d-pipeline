import './style.css';
import JSZip from 'jszip';

// ===== APP TEMPLATE =====
document.querySelector('#app').innerHTML = `
  <div class="app-container">
    <header class="app-header">
      <h1>Object Extractor AI</h1>
      <p>Select an object or describe it to isolate and extract using AI.</p>
    </header>

    <main class="main-grid">
      <!-- Control Panel -->
      <div class="controls-column">
        <div class="glass">
          <h2 class="section-title">1. Source Image</h2>

          <div id="dropZone" class="drop-zone">
            <input type="file" id="fileInput" class="hidden" accept="image/*">
            <div id="uploadPlaceholder" class="drop-zone-placeholder">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>Click, Drag, or Paste Image</span>
            </div>
            <div id="imageWrapper" class="image-wrapper hidden">
              <img id="previewImg" src="" alt="Preview">
              <canvas id="maskCanvas" class="mask-canvas"></canvas>
            </div>
          </div>

          <h2 class="section-title">2. Object Details & Selection</h2>
          <div class="controls-stack">
            <input type="text" id="promptInput" class="input-field"
              placeholder="What is the object? (e.g., 'chair')">

            <input type="text" id="customPromptInput" class="input-field input-field-sm"
              placeholder="Custom views/styles (e.g., 'front view, side view') [Optional]">

            <button id="openLightboxBtn" class="btn btn-secondary hidden">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Draw Selection Mask (Optional)
            </button>

            <div id="selectionStatus" class="selection-badge hidden" title="Click to edit selection">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Mask Applied
            </div>

            <div class="dimensions-section">
              <div class="dimensions-header">
                <span>Dimensions (Optional)</span>
                <select id="unitSelect" class="unit-select">
                  <option value="in">in</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                  <option value="ft">ft</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div class="dimensions-grid">
                <input type="number" id="dimHeight" class="input-field input-field-sm" placeholder="Height" min="0" step="any">
                <input type="number" id="dimWidth" class="input-field input-field-sm" placeholder="Width" min="0" step="any">
                <input type="number" id="dimDepth" class="input-field input-field-sm" placeholder="Depth" min="0" step="any">
              </div>
              <div class="dimensions-hint">The AI draws dimension lines and your exact values into each result. To change values, edit the fields and click Extract again.</div>
            </div>

            <button id="extractBtn" class="btn btn-primary">
              Extract Object Views
            </button>

            <button id="startOverBtn" class="btn btn-ghost hidden">
              Reset All
            </button>
          </div>

          <div id="statusMessage" class="status-message hidden"></div>
        </div>

        <!-- JSON Output -->
        <div id="metadataPanel" class="glass json-panel hidden">
          <h2 class="section-title-sm">Analysis</h2>
          <div class="json-output">
            <pre id="jsonOutput"></pre>
          </div>
        </div>
      </div>

      <!-- Result Gallery -->
      <div class="glass gallery-panel">
        <div class="gallery-header">
          <h2>Multi-View Results</h2>
          <div class="gallery-toolbar">
            <span id="resultCount" class="result-count hidden">0 Items</span>
            <button id="clearResultsBtn" class="btn btn-toolbar danger hidden">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
            <button id="downloadBtn" class="btn btn-toolbar hidden">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download All Zip
            </button>
          </div>
        </div>

        <div id="resultContainer" class="result-container">
          <div id="waitingPlaceholder" class="waiting-placeholder">
            Isolated object views will appear here...
          </div>
          <div id="loadingIndicator" class="loading-overlay hidden">
            <div class="loader"></div>
            <span class="loading-text">Analyzing mask and rendering views...</span>
          </div>
          <div id="resultsGallery" class="results-grid"></div>
        </div>
      </div>
    </main>

    <!-- Selection Lightbox Modal -->
    <div id="lightbox" class="lightbox-overlay hidden">
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-container">
        <div class="lightbox-header">
          <div>
            <h3>Draw around the object</h3>
            <p>Everything outside the line will be blacked out.</p>
          </div>
          <div class="lightbox-actions">
            <button id="clearDrawingBtn" class="btn-lightbox-clear">Clear</button>
            <button id="doneDrawingBtn" class="btn-lightbox-done">Done</button>
          </div>
        </div>
        <div class="lightbox-body">
          <div class="lightbox-image-container">
            <img id="lightboxImg" src="" draggable="false" alt="Source">
            <canvas id="drawingCanvas" class="drawing-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

// ===== DOM REFS =====
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const dropZone = $('dropZone');
const previewImg = $('previewImg');
const imageWrapper = $('imageWrapper');
const maskCanvas = $('maskCanvas');
const uploadPlaceholder = $('uploadPlaceholder');
const lightbox = $('lightbox');
const lightboxImg = $('lightboxImg');
const drawingCanvas = $('drawingCanvas');
const ctx = drawingCanvas.getContext('2d');
const promptInput = $('promptInput');
const customPromptInput = $('customPromptInput');
const extractBtn = $('extractBtn');
const openLightboxBtn = $('openLightboxBtn');
const doneDrawingBtn = $('doneDrawingBtn');
const clearDrawingBtn = $('clearDrawingBtn');
const startOverBtn = $('startOverBtn');
const selectionStatus = $('selectionStatus');
const resultsGallery = $('resultsGallery');
const metadataPanel = $('metadataPanel');
const jsonOutput = $('jsonOutput');
const resultCount = $('resultCount');
const clearResultsBtn = $('clearResultsBtn');
const downloadBtn = $('downloadBtn');
const waitingPlaceholder = $('waitingPlaceholder');
const loadingIndicator = $('loadingIndicator');
const statusMessage = $('statusMessage');
const dimHeight = $('dimHeight');
const dimWidth = $('dimWidth');
const dimDepth = $('dimDepth');
const unitSelect = $('unitSelect');

// ===== STATE =====
let base64Image = '';
let extractedImages = [];
let isDrawing = false;
let points = [];
let savedPath = [];

// ===== HELPERS =====
const showStatus = (msg, isError = false) => {
  statusMessage.textContent = msg;
  statusMessage.className = `status-message ${isError ? 'error' : 'info'}`;
  statusMessage.classList.remove('hidden');
};

const toggleLoading = (isLoading) => {
  extractBtn.disabled = isLoading;
  startOverBtn.disabled = isLoading;
  loadingIndicator.classList.toggle('hidden', !isLoading);
  if (isLoading) waitingPlaceholder.classList.add('hidden');
};

// ===== FILE HANDLING =====
const handleFile = (file) => {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    base64Image = e.target.result.split(',')[1];
    previewImg.src = e.target.result;
    lightboxImg.src = e.target.result;
    imageWrapper.classList.remove('hidden');
    uploadPlaceholder.classList.add('hidden');
    openLightboxBtn.classList.remove('hidden');
    startOverBtn.classList.remove('hidden');
    savedPath = [];
    points = [];
    drawMask();
    selectionStatus.classList.add('hidden');
    openLightboxBtn.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

dropZone.onclick = (e) => {
  if (e.target.closest('#imageWrapper')) return;
  fileInput.click();
};
fileInput.onchange = (e) => handleFile(e.target.files[0]);

dropZone.ondragover = (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
};
dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
dropZone.ondrop = (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
};

window.addEventListener('paste', (e) => {
  const item = e.clipboardData.items[0];
  if (item && item.type.startsWith('image/')) handleFile(item.getAsFile());
});

// ===== DRAWING LOGIC =====
const initLightboxCanvas = () => {
  drawingCanvas.width = drawingCanvas.clientWidth;
  drawingCanvas.height = drawingCanvas.clientHeight;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([8, 4]);
  if (points.length > 0) redrawPath();
};

openLightboxBtn.onclick = () => {
  lightbox.classList.remove('hidden');
  points = [...savedPath];
  setTimeout(initLightboxCanvas, 50);
};
selectionStatus.onclick = openLightboxBtn.onclick;

const getNormalizedPos = (e, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    nx: (clientX - rect.left) / rect.width,
    ny: (clientY - rect.top) / rect.height,
  };
};

drawingCanvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  points = [];
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  const pos = getNormalizedPos(e, drawingCanvas);
  points.push(pos);
  ctx.beginPath();
  ctx.moveTo(pos.nx * drawingCanvas.width, pos.ny * drawingCanvas.height);
});

drawingCanvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const pos = getNormalizedPos(e, drawingCanvas);
  points.push(pos);
  ctx.lineTo(pos.nx * drawingCanvas.width, pos.ny * drawingCanvas.height);
  ctx.stroke();
});

const stopDrawing = () => { isDrawing = false; };
window.addEventListener('mouseup', stopDrawing);

drawingCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isDrawing = true;
  points = [];
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  const pos = getNormalizedPos(e, drawingCanvas);
  points.push(pos);
  ctx.beginPath();
  ctx.moveTo(pos.nx * drawingCanvas.width, pos.ny * drawingCanvas.height);
});

drawingCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isDrawing) return;
  const pos = getNormalizedPos(e, drawingCanvas);
  points.push(pos);
  ctx.lineTo(pos.nx * drawingCanvas.width, pos.ny * drawingCanvas.height);
  ctx.stroke();
});

drawingCanvas.addEventListener('touchend', stopDrawing);

const redrawPath = () => {
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].nx * drawingCanvas.width, points[0].ny * drawingCanvas.height);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].nx * drawingCanvas.width, points[i].ny * drawingCanvas.height);
  }
  ctx.stroke();
};

clearDrawingBtn.onclick = () => {
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  points = [];
};

doneDrawingBtn.onclick = () => {
  savedPath = [...points];
  lightbox.classList.add('hidden');

  if (savedPath.length > 2) {
    selectionStatus.classList.remove('hidden');
    openLightboxBtn.classList.add('hidden');
  } else {
    selectionStatus.classList.add('hidden');
    openLightboxBtn.classList.remove('hidden');
  }
  drawMask();
};

// ===== MASK RENDERING =====
const drawMask = () => {
  const mCtx = maskCanvas.getContext('2d');
  maskCanvas.width = maskCanvas.clientWidth;
  maskCanvas.height = maskCanvas.clientHeight;
  mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

  if (savedPath.length < 3) return;

  mCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  mCtx.globalCompositeOperation = 'destination-out';
  mCtx.beginPath();
  mCtx.moveTo(savedPath[0].nx * maskCanvas.width, savedPath[0].ny * maskCanvas.height);
  for (let i = 1; i < savedPath.length; i++) {
    mCtx.lineTo(savedPath[i].nx * maskCanvas.width, savedPath[i].ny * maskCanvas.height);
  }
  mCtx.closePath();
  mCtx.fill();

  mCtx.globalCompositeOperation = 'source-over';
  mCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  mCtx.lineWidth = 2;
  mCtx.setLineDash([4, 4]);
  mCtx.stroke();
};

window.addEventListener('resize', () => {
  if (savedPath.length > 0) drawMask();
});

// ===== APP RESET =====
startOverBtn.onclick = () => {
  base64Image = '';
  extractedImages = [];
  points = [];
  savedPath = [];
  fileInput.value = '';
  previewImg.src = '';
  imageWrapper.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  openLightboxBtn.classList.add('hidden');
  selectionStatus.classList.add('hidden');
  promptInput.value = '';
  customPromptInput.value = '';
  dimHeight.value = '';
  dimWidth.value = '';
  dimDepth.value = '';
  unitSelect.value = 'in';
  resultsGallery.innerHTML = '';
  metadataPanel.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  clearResultsBtn.classList.add('hidden');
  resultCount.classList.add('hidden');
  waitingPlaceholder.classList.remove('hidden');
  statusMessage.classList.add('hidden');
  startOverBtn.classList.add('hidden');
  drawMask();
};

clearResultsBtn.onclick = () => {
  extractedImages = [];
  resultsGallery.innerHTML = '';
  resultCount.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  clearResultsBtn.classList.add('hidden');
  waitingPlaceholder.classList.remove('hidden');
};

// ===== CURRENT USER DIMENSIONS (sent to server at generate-time) =====
const getCurrentDims = () => ({
  height: dimHeight.value ? parseFloat(dimHeight.value) : null,
  width: dimWidth.value ? parseFloat(dimWidth.value) : null,
  depth: dimDepth.value ? parseFloat(dimDepth.value) : null,
  unit: unitSelect.value || 'in',
});

// ===== RESULT GALLERY =====
// The AI bakes dimension annotations into the image, so the result card just displays
// the PNG as-is. No client-side overlay, no bbox detection, no live updates.
const addResultToGallery = (base64Data, metadata, viewAngle = '') => {
  const objectName = metadata?.specific_object_name || metadata?.object_name || promptInput.value || 'Isolated_Object';
  const labelName = viewAngle || objectName;
  const fileName = `${objectName.replace(/\s+/g, '_')}_${viewAngle ? viewAngle.replace(/\s+/g, '_') : 'view'}_${extractedImages.length + 1}`;

  const entry = { data: base64Data, name: `${fileName}.png` };
  extractedImages.unshift(entry);

  const imgSrc = `data:image/png;base64,${base64Data}`;
  const div = document.createElement('div');
  div.className = 'result-card';
  div.innerHTML = `
    <img class="result-img" src="${imgSrc}" alt="${fileName}">
    <div class="result-card-overlay"></div>
    <div class="result-card-label">${labelName}</div>
  `;
  div.addEventListener('click', () => {
    const newTab = window.open();
    newTab.document.body.innerHTML = `<style>body{margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh}img{max-width:100%;max-height:100vh;background:#171717;padding:20px;border-radius:8px}</style><img src="${imgSrc}">`;
  });

  resultsGallery.prepend(div);
};

// ===== DOWNLOAD =====
downloadBtn.onclick = async () => {
  if (extractedImages.length === 0) return;
  if (extractedImages.length === 1) {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${extractedImages[0].data}`;
    link.download = extractedImages[0].name;
    link.click();
    return;
  }
  const zip = new JSZip();
  extractedImages.forEach((entry) => zip.file(entry.name, entry.data, { base64: true }));
  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = 'extracted_objects.zip';
  link.click();
};

// ===== AI EXTRACTION =====
extractBtn.onclick = async () => {
  if (!base64Image) return showStatus('Please provide an image.', true);

  toggleLoading(true);
  showStatus('Applying mask and generating multiple perspective views...');

  // Build masked image
  let imageToSend = base64Image;
  if (savedPath.length > 2) {
    const tempCanvas = document.createElement('canvas');
    const imgEl = new Image();
    imgEl.src = `data:image/png;base64,${base64Image}`;
    await new Promise((r) => (imgEl.onload = r));

    tempCanvas.width = imgEl.naturalWidth;
    tempCanvas.height = imgEl.naturalHeight;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tCtx.beginPath();
    tCtx.moveTo(savedPath[0].nx * tempCanvas.width, savedPath[0].ny * tempCanvas.height);
    for (let i = 1; i < savedPath.length; i++) {
      tCtx.lineTo(savedPath[i].nx * tempCanvas.width, savedPath[i].ny * tempCanvas.height);
    }
    tCtx.closePath();
    tCtx.clip();
    tCtx.drawImage(imgEl, 0, 0);
    imageToSend = tempCanvas.toDataURL('image/png').split(',')[1];
  }

  // Build views
  let views = [];
  const customInputVal = customPromptInput.value.trim();
  if (customInputVal) {
    const customList = customInputVal.split(',').map((s) => s.trim()).filter((s) => s);
    views = customList.map((v) => ({
      id: v.length > 25 ? v.substring(0, 25) + '...' : v,
      instruction: `Generate a realistic view of the isolated object focusing exactly on this perspective, style, or instruction: "${v}".`,
    }));
  } else {
    views = [
      {
        id: 'Front View',
        instruction:
          'Render the object as a STRAIGHT-ON FRONT VIEW (camera positioned dead-center in front of the object, perpendicular to its front face, at eye level). Only the FRONT face should be visible; the sides and back should NOT be visible. This is a clean head-on product shot.',
      },
      {
        id: 'Side Profile',
        instruction:
          'Render the object as a PURE 90° SIDE PROFILE (camera positioned directly to the RIGHT side of the object, perpendicular to its front). Only ONE SIDE should be visible; the front and back should NOT be visible. This MUST be a clean side silhouette, completely different from the front view.',
      },
      {
        id: '3/4 Back View',
        instruction:
          'Render the object ROTATED so the camera sees it from a 3/4 BACK-RIGHT angle (camera positioned roughly 150° from dead-center front — behind and to the right of the object, at eye level). The BACK and the RIGHT side must be the dominant visible surfaces. This view MUST show the object from behind, not from the front.',
      },
    ];
  }

  const dims = getCurrentDims();
  const hasDims = dims.height || dims.width || dims.depth;
  const dimensions = hasDims ? dims : undefined;

  let successCount = 0;
  let sharedMetadata = { object_name: promptInput.value || 'Isolated_Object', confidence_score: 0.95 };
  let metadataRendered = false;

  const promises = views.map(async (view, index) => {
    try {
      const body = {
        imageToSend,
        originalImage: index === 0 ? base64Image : undefined,
        promptText: promptInput.value,
        viewInstruction: view.instruction,
        includeAnalysis: index === 0,
        dimensions,
      };

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.error) throw new Error(result.error);

      let parsedFromText = null;
      if (result.textData) {
        try {
          const jsonStr = result.textData.match(/\{[\s\S]*\}/)?.[0] || result.textData;
          parsedFromText = JSON.parse(jsonStr);
        } catch (e) {
          console.warn('Could not parse JSON', e);
        }
      }

      if (parsedFromText && !metadataRendered && (parsedFromText.specific_object_name || parsedFromText.object_category)) {
        sharedMetadata = parsedFromText;
        jsonOutput.textContent = JSON.stringify(sharedMetadata, null, 2);
        metadataPanel.classList.remove('hidden');
        metadataRendered = true;
      }

      if (result.imageData) {
        addResultToGallery(result.imageData, sharedMetadata, view.id);
        successCount++;
      }
    } catch (error) {
      console.error(`Extraction error for ${view.id}:`, error);
    }
  });

  await Promise.all(promises);

  toggleLoading(false);

  if (successCount > 0) {
    resultCount.textContent = `${extractedImages.length} Views Generated`;
    resultCount.classList.remove('hidden');
    downloadBtn.classList.remove('hidden');
    clearResultsBtn.classList.remove('hidden');
    showStatus('Extraction complete!');
  } else {
    showStatus('Failed to isolate object views. Please try a clearer selection or prompt.', true);
    if (extractedImages.length === 0) {
      waitingPlaceholder.classList.remove('hidden');
    }
  }
};

promptInput.onkeydown = (e) => { if (e.key === 'Enter') extractBtn.click(); };
customPromptInput.onkeydown = (e) => { if (e.key === 'Enter') extractBtn.click(); };
