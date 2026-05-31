// ui/floating-media.js - Floating, draggable, resizable, minimizable media player
// Supports video (loop, speed, seek) and image (zoom, pan) with minimize-to-bar

const t = (key) => window.miniappI18n?.t(key) ?? key;

const MIN_W = 320;
const MIN_H = 240;
const DEFAULT_W = 520;
const DEFAULT_H = 400;
const SPEED_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

let container = null;
let minimizedBar = null;
let videoEl = null;
let imgEl = null;
let isOpen = false;
let isMinimized = false;
let isVideoMode = false;
let playInterval = null;
let imgZoom = 1;

// Drag state
let dragState = null;
let resizeState = null;

export function initFloatingMedia() {
  if (container) return;
  buildDOM();
  bindGlobalEvents();
  // Expose for legacy callers
  window.openFloatingMedia = openMedia;
  window.closeFloatingMedia = closeMedia;
  window.isFloatingMediaOpen = () => isOpen;
  window.isFloatingMediaMinimized = () => isMinimized;
}

export function openMedia(src, caption = '', mediaType = 'image') {
  if (!src) return;
  initFloatingMedia();
  const isVid = mediaType === 'video' || isVideoSource(src);

  if (isMinimized) restoreFromMinimize();
  if (isOpen && videoEl) { videoEl.pause(); }

  if (isVid) openAsVideo(src, caption);
  else openAsImage(src, caption);

  isVideoMode = isVid;
  isOpen = true;
  isMinimized = false;

  minimizedBar.classList.add('hidden');
  container.classList.remove('hidden');
  container.style.opacity = '0';
  container.style.transform = 'scale(0.95)';
  requestAnimationFrame(() => {
    container.style.transition = 'opacity 0.22s cubic-bezier(.32,.72,0,1), transform 0.22s cubic-bezier(.32,.72,0,1)';
    container.style.opacity = '1';
    container.style.transform = 'scale(1)';
    setTimeout(() => { container.style.transition = ''; }, 250);
  });

  updateMinimizedThumbnail(src, isVid);
}

export function closeMedia() {
  if (!container) return;
  if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
  if (playInterval) { clearInterval(playInterval); playInterval = null; }
  imgZoom = 1;
  container.classList.add('hidden');
  minimizedBar.classList.add('hidden');
  isOpen = false;
  isMinimized = false;
}

export function isMediaOpen() { return isOpen; }
export function isMediaMinimized() { return isMinimized; }

// ─── DOM Construction ─────────────────────────────────────────────
function buildDOM() {
  container = document.createElement('div');
  container.id = 'floating-media-modal';
  container.className = 'hidden';
  container.innerHTML = `
    <div class="fm-resize-handle" aria-label="Resize"></div>
    <div class="fm-header">
      <div class="fm-drag-handle" aria-label="Drag to move">
        <div class="fm-drag-dots">
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="fm-title-area">
        <div class="fm-title" id="fm-title">Media</div>
      </div>
      <div class="fm-header-actions">
        <button class="fm-header-btn" id="fm-minimize" title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
        </button>
        <button class="fm-header-btn fm-close" id="fm-close" title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>

    <div class="fm-media-area">
      <div class="fm-video-container hidden" id="fm-video-container">
        <video class="fm-video" id="fm-video" playsinline preload="metadata"></video>
        <div class="fm-play-overlay" id="fm-play-overlay">
          <div class="fm-play-icon">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="fm-video-spinner hidden" id="fm-video-spinner">
          <div class="animate-spin rounded-full h-8 w-8 border-2 border-amber-400/30 border-t-amber-400"></div>
        </div>
      </div>

      <div class="fm-image-container hidden" id="fm-image-container">
        <img class="fm-image" id="fm-image" alt="" draggable="false" />
        <div class="fm-image-spinner hidden" id="fm-image-spinner">
          <div class="animate-spin rounded-full h-8 w-8 border-2 border-amber-400/30 border-t-amber-400"></div>
        </div>
      </div>
    </div>

    <div class="fm-controls-video hidden" id="fm-controls-video">
      <div class="fm-progress-wrap" id="fm-progress-wrap">
        <div class="fm-progress-bg"></div>
        <div class="fm-progress-fill" id="fm-progress-fill"></div>
        <div class="fm-progress-thumb" id="fm-progress-thumb"></div>
        <div class="fm-progress-hover" id="fm-progress-hover"></div>
      </div>
      <div class="fm-controls-row">
        <div class="fm-controls-left">
          <button class="fm-ctrl-btn" id="fm-play" title="Play">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="fm-ctrl-btn" id="fm-stop" title="Stop">
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          </button>
          <div class="fm-time" id="fm-time">0:00 / 0:00</div>
        </div>
        <div class="fm-controls-right">
          <button class="fm-ctrl-btn active" id="fm-mute" title="Mute">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path id="fm-volume-wave" d="M15.5 8.5a5 5 0 010 7"/></svg>
          </button>
          <label class="fm-volume-wrap" title="Volume">
            <input id="fm-volume" type="range" min="0" max="1" step="0.01" value="0.75" />
          </label>
          <button class="fm-ctrl-btn" id="fm-loop" title="Loop">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          </button>
          <div class="fm-speed-group">
            <button class="fm-ctrl-btn fm-speed-btn" id="fm-speed" title="Speed">1×</button>
            <div class="fm-speed-dropdown hidden" id="fm-speed-dropdown"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="fm-controls-image hidden" id="fm-controls-image">
      <div class="fm-controls-row">
        <div class="fm-controls-left">
          <button class="fm-ctrl-btn" id="fm-zoom-out" title="Zoom out">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M8 11h6"/></svg>
          </button>
          <div class="fm-zoom-label" id="fm-zoom-label">100%</div>
          <button class="fm-ctrl-btn" id="fm-zoom-in" title="Zoom in">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/></svg>
          </button>
          <button class="fm-ctrl-btn" id="fm-zoom-reset" title="Reset zoom">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          </button>
        </div>
        <div class="fm-controls-right">
          <button class="fm-ctrl-btn" id="fm-download-img" title="Download">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Minimized bar
  minimizedBar = document.createElement('div');
  minimizedBar.id = 'floating-media-minimized';
  minimizedBar.className = 'hidden';
  minimizedBar.innerHTML = `
    <div class="fm-mini-thumb" id="fm-mini-thumb"></div>
    <div class="fm-mini-title" id="fm-mini-title">Media</div>
    <button class="fm-mini-btn" id="fm-mini-restore" title="Restore">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
    </button>
    <button class="fm-mini-btn" id="fm-mini-close" title="Close">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  document.body.appendChild(minimizedBar);

  // Cache elements
  videoEl = document.getElementById('fm-video');
  imgEl = document.getElementById('fm-image');
  document.getElementById('fm-speed').textContent = '1x';
}

// ─── Event Binding ────────────────────────────────────────────────
function bindGlobalEvents() {
  // Header buttons
  document.getElementById('fm-close').onclick = () => closeMedia();
  document.getElementById('fm-minimize').onclick = () => minimize();

  // Minimized bar buttons
  document.getElementById('fm-mini-restore').onclick = () => restoreFromMinimize();
  document.getElementById('fm-mini-close').onclick = () => closeMedia();

  // Drag (header + dots)
  const handle = container.querySelector('.fm-drag-handle');
  handle.addEventListener('mousedown', startDrag);
  handle.addEventListener('touchstart', startDrag, { passive: false });

  // Resize
  const resizer = container.querySelector('.fm-resize-handle');
  resizer.addEventListener('mousedown', startResize);
  resizer.addEventListener('touchstart', startResize, { passive: false });

  // Global move/up
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);

  // OracleViewer intentionally stays open while the user reads/types in chat.
  // Use Close, Minimize, or Escape for explicit lifecycle control.

  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen && !isMinimized) closeMedia();
  });

  // Video controls
  bindVideoControls();
  // Image controls
  bindImageControls();
}

// ─── Drag ─────────────────────────────────────────────────────────
function startDrag(e) {
  if (e.target.closest('.fm-header-btn')) return;
  e.preventDefault();
  const rect = container.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  dragState = { ox: cx - rect.left, oy: cy - rect.top, sx: rect.left, sy: rect.top, moved: false };
  container.classList.add('dragging');
}

function startResize(e) {
  e.preventDefault();
  e.stopPropagation();
  const rect = container.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  resizeState = { sx: cx, sy: cy, sw: rect.width, sh: rect.height };
  container.classList.add('resizing');
}

function onPointerMove(e) {
  const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

  if (resizeState) {
    e.preventDefault();
    const nw = Math.max(MIN_W, resizeState.sw + (cx - resizeState.sx));
    const nh = Math.max(MIN_H, resizeState.sh + (cy - resizeState.sy));
    container.style.width = nw + 'px';
    container.style.height = nh + 'px';
    return;
  }

  if (dragState) {
    e.preventDefault();
    dragState.moved = true;
    let nx = cx - dragState.ox;
    let ny = cy - dragState.oy;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    nx = Math.max(0, Math.min(nx, window.innerWidth - w));
    ny = Math.max(0, Math.min(ny, window.innerHeight - h));
    container.style.left = nx + 'px';
    container.style.top = ny + 'px';
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.transform = 'none';
  }
}

function onPointerUp() {
  if (resizeState) {
    container.classList.remove('resizing');
    resizeState = null;
  }
  if (dragState) {
    container.classList.remove('dragging');
    if (!dragState.moved) {
      container.style.left = '';
      container.style.top = '';
      container.style.right = '';
      container.style.bottom = '';
      container.style.transform = '';
    }
    dragState = null;
  }
}

// ─── Minimize / Restore ──────────────────────────────────────────
function minimize() {
  if (!isOpen) return;
  isMinimized = true;
  if (videoEl && !videoEl.paused) videoEl.pause();

  container.style.transition = 'opacity 0.18s, transform 0.18s';
  container.style.opacity = '0';
  container.style.transform = 'scale(0.85) translateY(20px)';
  setTimeout(() => {
    container.classList.add('hidden');
    container.style.transition = '';
    container.style.opacity = '';
    container.style.transform = '';
    minimizedBar.classList.remove('hidden');
    minimizedBar.style.opacity = '0';
    minimizedBar.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
      minimizedBar.style.transition = 'opacity 0.2s, transform 0.2s';
      minimizedBar.style.opacity = '1';
      minimizedBar.style.transform = 'translateY(0)';
      setTimeout(() => { minimizedBar.style.transition = ''; }, 220);
    });
  }, 200);
}

function restoreFromMinimize() {
  if (!isMinimized) return;
  isMinimized = false;
  minimizedBar.style.transition = 'opacity 0.15s, transform 0.15s';
  minimizedBar.style.opacity = '0';
  minimizedBar.style.transform = 'translateY(12px)';
  setTimeout(() => {
    minimizedBar.classList.add('hidden');
    minimizedBar.style.transition = '';
    minimizedBar.style.opacity = '';
    minimizedBar.style.transform = '';
    container.classList.remove('hidden');
    container.style.opacity = '0';
    container.style.transform = 'scale(0.92)';
    requestAnimationFrame(() => {
      container.style.transition = 'opacity 0.2s cubic-bezier(.32,.72,0,1), transform 0.2s cubic-bezier(.32,.72,0,1)';
      container.style.opacity = '1';
      container.style.transform = 'scale(1)';
      setTimeout(() => { container.style.transition = ''; }, 220);
    });
  }, 170);
}

function updateMinimizedThumbnail(src, isVid) {
  const thumb = document.getElementById('fm-mini-thumb');
  const title = document.getElementById('fm-mini-title');
  if (!thumb) return;
  if (isVid) {
    thumb.innerHTML = `<video src="${src}" class="w-full h-full object-cover" muted preload="metadata" playsinline></video>`;
  } else {
    thumb.innerHTML = `<img src="${src}" class="w-full h-full object-cover" alt="thumb" />`;
  }
}

// ─── Open Video ───────────────────────────────────────────────────
function openAsVideo(src, caption) {
  document.getElementById('fm-video-container').classList.remove('hidden');
  document.getElementById('fm-image-container').classList.add('hidden');
  document.getElementById('fm-controls-video').classList.remove('hidden');
  document.getElementById('fm-controls-image').classList.add('hidden');
  document.getElementById('fm-title').textContent = caption || 'Video';
  document.getElementById('fm-mini-title').textContent = caption || 'Video';

  // Reset controls
  const loopBtn = document.getElementById('fm-loop');
  loopBtn.classList.add('active');
  loopBtn.title = 'Loop: ON';

  const speedBtn = document.getElementById('fm-speed');
  speedBtn.textContent = '1×';
  speedBtn.classList.remove('slow');
  speedBtn.textContent = '1x';

  document.getElementById('fm-progress-fill').style.width = '0%';
  document.getElementById('fm-progress-thumb').style.left = '0%';
  document.getElementById('fm-time').textContent = '0:00 / 0:00';

  updatePlayButton(false);
  showSpinner('video');

  videoEl.src = src;
  videoEl.loop = true;
  videoEl.volume = Number(document.getElementById('fm-volume')?.value || 0.75);
  videoEl.muted = false;
  videoEl.playbackRate = 1;
  videoEl.load();

  videoEl.onloadeddata = () => {
    hideSpinner('video');
    document.getElementById('fm-play-overlay').classList.remove('hidden');
    updateVolumeDisplay();
    videoEl.play().catch(() => {});
  };
  videoEl.onerror = () => {
    hideSpinner('video');
    document.getElementById('fm-play-overlay').classList.remove('hidden');
  };
  videoEl.ontimeupdate = () => updateProgress();
  videoEl.onplay = () => { updatePlayButton(true); document.getElementById('fm-play-overlay').classList.add('hidden'); };
  videoEl.onpause = () => updatePlayButton(false);
  videoEl.onseeking = () => showSpinner('video');
  videoEl.onseeked = () => hideSpinner('video');
}

// ─── Open Image ───────────────────────────────────────────────────
function openAsImage(src, caption) {
  document.getElementById('fm-video-container').classList.add('hidden');
  document.getElementById('fm-image-container').classList.remove('hidden');
  document.getElementById('fm-controls-video').classList.add('hidden');
  document.getElementById('fm-controls-image').classList.remove('hidden');
  document.getElementById('fm-title').textContent = caption || 'Image';
  document.getElementById('fm-mini-title').textContent = caption || 'Image';

  imgZoom = 1;
  updateZoomDisplay();
  showSpinner('image');
  imgEl.style.transform = `scale(1)`;
  imgEl.style.cursor = 'zoom-in';

  imgEl.onload = () => hideSpinner('image');
  imgEl.onerror = () => hideSpinner('image');
  imgEl.src = src;
}

// ─── Video Controls ──────────────────────────────────────────────
function bindVideoControls() {
  // Play/Pause
  document.getElementById('fm-play').onclick = () => {
    if (!videoEl.src) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  };

  // Play overlay
  document.getElementById('fm-play-overlay').onclick = () => {
    if (!videoEl.src) return;
    videoEl.play().catch(() => {});
  };

  // Stop
  document.getElementById('fm-stop').onclick = () => {
    videoEl.pause();
    videoEl.currentTime = 0;
    updateProgress();
    document.getElementById('fm-play-overlay').classList.remove('hidden');
  };

  // Loop
  const loopBtn = document.getElementById('fm-loop');
  loopBtn.onclick = () => {
    videoEl.loop = !videoEl.loop;
    loopBtn.classList.toggle('active', videoEl.loop);
    loopBtn.title = videoEl.loop ? 'Loop: ON' : 'Loop: OFF';
  };

  const muteBtn = document.getElementById('fm-mute');
  const volumeInput = document.getElementById('fm-volume');
  muteBtn.onclick = () => {
    videoEl.muted = !videoEl.muted;
    updateVolumeDisplay();
  };
  volumeInput.oninput = () => {
    videoEl.volume = Number(volumeInput.value || 0);
    videoEl.muted = videoEl.volume === 0;
    updateVolumeDisplay();
  };

  // Speed
  const speedBtn = document.getElementById('fm-speed');
  const speedDrop = document.getElementById('fm-speed-dropdown');

  speedBtn.onclick = (e) => {
    e.stopPropagation();
    speedDrop.classList.toggle('hidden');
    if (!speedDrop.classList.contains('hidden')) buildSpeedDropdown();
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.fm-speed-group')) speedDrop.classList.add('hidden');
  });

  // Progress bar seek
  const progWrap = document.getElementById('fm-progress-wrap');
  progWrap.addEventListener('click', (e) => {
    if (!videoEl.duration || !isFinite(videoEl.duration)) return;
    const rect = progWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = pct * videoEl.duration;
  });

  // Progress bar hover preview
  progWrap.addEventListener('mousemove', (e) => {
    const hover = document.getElementById('fm-progress-hover');
    if (!videoEl.duration || !isFinite(videoEl.duration)) { hover.style.opacity = '0'; return; }
    const rect = progWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    hover.style.opacity = '1';
    hover.style.left = (pct * 100) + '%';
    hover.textContent = formatTime(pct * videoEl.duration);
  });
  progWrap.addEventListener('mouseleave', () => {
    document.getElementById('fm-progress-hover').style.opacity = '0';
  });
}

function buildSpeedDropdown() {
  const drop = document.getElementById('fm-speed-dropdown');
  const current = videoEl.playbackRate;
  drop.innerHTML = SPEED_OPTIONS.map(s =>
    `<div class="fm-speed-opt${Math.abs(s - current) < 0.001 ? ' active' : ''}" data-speed="${s}">
      ${s === 0.1 ? '🐌 0.1×' : s + '×'}
    </div>`
  ).join('');
  drop.innerHTML = SPEED_OPTIONS.map(s =>
    `<div class="fm-speed-opt${Math.abs(s - current) < 0.001 ? ' active' : ''}" data-speed="${s}">
      ${s < 1 ? 'Slow ' : ''}${s}x
    </div>`
  ).join('');
  drop.querySelectorAll('.fm-speed-opt').forEach(opt => {
    opt.onclick = (e) => {
      e.stopPropagation();
      const spd = parseFloat(opt.dataset.speed);
      videoEl.playbackRate = spd;
      document.getElementById('fm-speed').textContent = spd + '×';
      document.getElementById('fm-speed').textContent = spd + 'x';
      document.getElementById('fm-speed').classList.toggle('slow', spd < 1);
      drop.classList.add('hidden');
    };
  });
}

function updateVolumeDisplay() {
  const btn = document.getElementById('fm-mute');
  const wave = document.getElementById('fm-volume-wave');
  const muted = videoEl.muted || videoEl.volume === 0;
  btn?.classList.toggle('active', !muted);
  if (wave) wave.style.display = muted ? 'none' : '';
  if (btn) btn.title = muted ? 'Unmute' : 'Mute';
}

function updateProgress() {
  if (!videoEl.duration || !isFinite(videoEl.duration)) return;
  const pct = (videoEl.currentTime / videoEl.duration) * 100;
  document.getElementById('fm-progress-fill').style.width = pct + '%';
  document.getElementById('fm-progress-thumb').style.left = pct + '%';
  document.getElementById('fm-time').textContent = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoEl.duration);
}

function updatePlayButton(playing) {
  const btn = document.getElementById('fm-play');
  if (playing) {
    btn.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    btn.title = 'Pause';
  } else {
    btn.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    btn.title = 'Play';
  }
}

// ─── Image Controls ──────────────────────────────────────────────
function bindImageControls() {
  document.getElementById('fm-zoom-in').onclick = () => { imgZoom = Math.min(4, imgZoom + 0.25); applyZoom(); };
  document.getElementById('fm-zoom-out').onclick = () => { imgZoom = Math.max(0.25, imgZoom - 0.25); applyZoom(); };
  document.getElementById('fm-zoom-reset').onclick = () => { imgZoom = 1; applyZoom(); };
  document.getElementById('fm-download-img').onclick = () => {
    if (!imgEl.src) return;
    const a = document.createElement('a');
    a.href = imgEl.src;
    a.download = 'sacred-image';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Scroll to zoom
  const imgContainer = document.getElementById('fm-image-container');
  imgContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    imgZoom = Math.max(0.25, Math.min(4, imgZoom + delta));
    applyZoom();
  }, { passive: false });

  // Click to zoom in/out toggle
  imgEl.addEventListener('click', () => {
    if (imgZoom <= 1) { imgZoom = 2; imgEl.style.cursor = 'zoom-out'; }
    else { imgZoom = 1; imgEl.style.cursor = 'zoom-in'; }
    applyZoom();
  });
}

function applyZoom() {
  imgEl.style.transform = `scale(${imgZoom})`;
  imgEl.style.cursor = imgZoom > 1 ? 'zoom-out' : 'zoom-in';
  updateZoomDisplay();
}

function updateZoomDisplay() {
  document.getElementById('fm-zoom-label').textContent = Math.round(imgZoom * 100) + '%';
}

// ─── Helpers ──────────────────────────────────────────────────────
function isVideoSource(src) {
  if (!src) return false;
  if (src.startsWith('data:video')) return true;
  if (/\.(mp4|webm|ogg|mov|avi|mkv|m4v|3gp|flv|wmv)(\?|$)/i.test(src)) return true;
  if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|streamable\.com|twitch\.tv/i.test(src)) return true;
  return false;
}

function showSpinner(type) {
  const el = document.getElementById(type === 'video' ? 'fm-video-spinner' : 'fm-image-spinner');
  if (el) el.classList.remove('hidden');
}

function hideSpinner(type) {
  const el = document.getElementById(type === 'video' ? 'fm-video-spinner' : 'fm-image-spinner');
  if (el) el.classList.add('hidden');
}

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
