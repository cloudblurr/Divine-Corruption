// ui/gallery.js - Sacred Gallery with bulk upload + AI generation + universal video support
import { getState, saveGallery } from '../state.js';
import { showToast } from './toast.js';
import { generateImage } from '../utils/ai.js';
import { openMedia } from './floating-media.js';
import { clearRemoteMediaStorage, uploadMediaFile, uploadMediaDataUrl } from '../utils/media-store.js';

let galleryGrid = null;
let emptyState = null;
let bulkZone = null;
let bulkInput = null;
let isBulkVisible = false;

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov|avi|mkv|m4v|3gp|flv|wmv)$/i;
const VIDEO_MIME_PREFIX = 'video/';

export function initGalleryUI() {
  galleryGrid = document.getElementById('gallery-grid');
  emptyState = document.getElementById('gallery-empty');
  bulkZone = document.getElementById('bulk-upload-zone');
  bulkInput = document.getElementById('bulk-file-input');

  // Update bulk input to accept videos too
  if (bulkInput) bulkInput.setAttribute('accept', 'image/*,video/*');

  renderGallery();
  setupBulkUpload();
  setupClearGalleryButton();
  setupGenerateButton();
}

function isVideoFile(file) {
  return file.type.startsWith(VIDEO_MIME_PREFIX) || VIDEO_EXTENSIONS.test(file.name);
}

function isVideoSrc(src) {
  if (!src) return false;
  if (src.startsWith('data:video')) return true;
  if (VIDEO_EXTENSIONS.test(src.split('?')[0])) return true;
  // Check for common video hosting patterns
  if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|streamable\.com/i.test(src)) return true;
  return false;
}

// ─── Bulk Upload ───
function setupBulkUpload() {
  const uploadBtn = document.getElementById('btn-upload-image');
  const browseBtn = document.getElementById('btn-browse-bulk');

  // Upload opens the file picker immediately and keeps the drop zone visible.
  if (uploadBtn) {
    uploadBtn.onclick = () => {
      isBulkVisible = true;
      if (bulkZone) bulkZone.classList.remove('hidden');
      requestAnimationFrame(() => bulkInput?.click());
    };
  }

  if (browseBtn) {
    browseBtn.onclick = (event) => {
      event.stopPropagation();
      bulkInput?.click();
    };
  }

  // File input change
  if (bulkInput) {
    bulkInput.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        processBulkUpload(files);
      }
      e.target.value = '';
    };
  }

  // Drag and drop on the zone
  if (bulkZone && !bulkZone.dataset.uploadBound) {
    bulkZone.dataset.uploadBound = 'true';

    bulkZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bulkZone.classList.add('drag-over');
    });

    bulkZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bulkZone.classList.remove('drag-over');
    });

    bulkZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bulkZone.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer?.files || []).filter(f =>
        f.type.startsWith('image/') || f.type.startsWith('video/')
      );
      if (files.length > 0) {
        processBulkUpload(files);
      } else {
        showToast('No valid images or videos found in the drop.', 'error');
      }
    });

    bulkZone.addEventListener('click', (e) => {
      if (e.target === bulkZone || e.target.closest('.flex.flex-col.items-center')) {
        if (!e.target.closest('#btn-browse-bulk') && !e.target.closest('#upload-progress-area')) {
          bulkInput?.click();
        }
      }
    });
  }
}

async function processBulkUpload(files) {
  const progressArea = document.getElementById('upload-progress-area');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');
  const thumbsGrid = document.getElementById('upload-thumbs-grid');

  if (!progressArea || !progressFill || !progressText || !thumbsGrid) return;

  progressArea.classList.remove('hidden');
  thumbsGrid.innerHTML = '';

  const total = files.length;
  let completed = 0;
  let errors = 0;
  const uploadedItems = [];

  progressFill.style.width = '0%';
  progressText.textContent = `0 / ${total} uploaded`;

  // Create thumbnail placeholders
  files.forEach((file, idx) => {
    const isVid = isVideoFile(file);
    const thumb = document.createElement('div');
    thumb.className = 'upload-thumb aspect-square';
    thumb.id = `upload-thumb-${idx}`;
    thumb.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center gap-1" style="background:var(--neu-bg);">
        ${isVid ? '<svg class="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' : ''}
        <svg class="w-4 h-4 animate-spin" style="color:var(--muted-foreground);" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
      <div class="upload-status">
        <svg class="w-5 h-5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
    `;
    thumbsGrid.appendChild(thumb);
  });

  const updateProgress = () => {
    const done = completed + errors;
    const pct = Math.round((done / total) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${completed} / ${total} uploaded${errors > 0 ? ` (${errors} failed)` : ''}`;
  };

  const uploadOne = async (file, i) => {
    const thumbEl = document.getElementById(`upload-thumb-${i}`);
    const isVid = isVideoFile(file);

    try {
      const uploaded = await uploadMediaFile(file, file.name);
      const mediaUrl = uploaded.url;

      const newItem = {
        id: (isVid ? 'vid-' : 'img-') + Date.now() + '-' + i,
        src: mediaUrl,
        storage: uploaded.storage,
        storageKey: uploaded.key,
        type: isVid ? 'video' : 'image',
        caption: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || (isVid ? 'Sacred video' : 'Sacred moment'),
        timestamp: new Date().toISOString()
      };
      uploadedItems.push(newItem);

      // Update thumbnail to show success
      if (thumbEl) {
        if (isVid) {
          thumbEl.innerHTML = `
            <video src="${mediaUrl}" class="w-full h-full object-cover" muted preload="metadata"></video>
            <div class="absolute inset-0 flex items-center justify-center bg-black/30">
              <svg class="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
            </div>
          `;
        } else {
          thumbEl.innerHTML = `<img src="${mediaUrl}" class="w-full h-full object-cover" alt="${file.name}" />`;
        }
        const statusDiv = document.createElement('div');
        statusDiv.className = 'upload-status done';
        statusDiv.innerHTML = '<svg class="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>';
        thumbEl.appendChild(statusDiv);
      }

      completed++;
    } catch (err) {
      errors++;
      if (thumbEl) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'upload-status error';
        statusDiv.innerHTML = '<svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>';
        const existing = thumbEl.querySelector('.upload-status');
        if (existing) existing.replaceWith(statusDiv);
        else thumbEl.appendChild(statusDiv);
      }
    }
    updateProgress();
  };

  await runLimited(files, 4, uploadOne);

  if (uploadedItems.length) {
    const state = getState();
    await saveGallery([...(state.gallery || []), ...uploadedItems]);
  }

  renderGallery();

  if (completed > 0) {
    showToast(`${completed} file${completed > 1 ? 's' : ''} added to the sacred gallery.${errors > 0 ? ` ${errors} failed.` : ''}`, errors > 0 ? 'warning' : 'success');
  } else {
    showToast('All uploads failed. Try again.', 'error');
  }

  setTimeout(() => {
    if (progressArea) progressArea.classList.add('hidden');
  }, 4000);
}

async function runLimited(items, limit, task) {
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

function setupClearGalleryButton() {
  const clearBtn = document.getElementById('btn-clear-gallery');
  if (!clearBtn) return;
  clearBtn.onclick = async () => {
    if (!confirm('Clear all gallery records and remote media storage so you can re-upload fresh media?')) return;
    clearBtn.disabled = true;
    clearBtn.textContent = 'Clearing...';
    try {
      await saveGallery([]);
      await clearRemoteMediaStorage().catch((err) => {
        console.warn('[gallery] remote clear failed:', err);
      });
      renderGallery();
      showToast('Gallery storage cleared. You can re-upload fresh media now.', 'success');
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = 'Clear Storage';
    }
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Generate Button ───
function setupGenerateButton() {
  const genBtn = document.getElementById('btn-generate-image');
  if (genBtn) {
    genBtn.onclick = openGenerateModal;
  }
}

// ─── Gallery Rendering ───
async function addImageToGallery(src, caption = '') {
  const state = getState();
  let stored = { url: src, storage: 'external' };
  if (src?.startsWith('data:')) {
    stored = await uploadMediaDataUrl(src, { filename: 'generated-image.png', contentType: 'image/png', caption });
  }
  const newItem = {
    id: 'img-' + Date.now(),
    src: stored.url,
    storage: stored.storage,
    storageKey: stored.key,
    type: isVideoSrc(stored.url) ? 'video' : 'image',
    caption: caption || 'Sacred moment',
    timestamp: new Date().toISOString()
  };

  const updated = [...(state.gallery || []), newItem];
  await saveGallery(updated);

  renderGallery();
  showToast('Added to the sacred gallery.', 'success');
}

function renderGallery() {
  const state = getState();
  const items = state.gallery || [];

  if (!galleryGrid) return;

  galleryGrid.innerHTML = '';

  if (items.length === 0) {
    emptyState?.classList.remove('hidden');
    return;
  } else {
    emptyState?.classList.add('hidden');
  }

  items.forEach(item => {
    const isVid = item.type === 'video' || isVideoSrc(item.src);
    const card = document.createElement('div');

    if (isVid) {
      card.className = 'group relative overflow-hidden rounded-2xl border aspect-square gallery-video-thumb';
      card.style.cssText = 'border-color:var(--border);background:var(--neu-bg);box-shadow:4px 4px 10px var(--neu-shadow-dark),-4px -4px 10px var(--neu-shadow-light);transition:transform 0.2s ease,box-shadow 0.2s ease;';

      card.innerHTML = `
        <video src="${item.src}" class="w-full h-full object-cover" muted preload="metadata" playsinline></video>
        <div class="video-play-overlay">
          <div class="video-play-btn">
            <svg class="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="video-type-badge">Video</div>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <div class="text-xs text-white/90 truncate">${item.caption}</div>
        </div>
        <button class="delete-btn absolute top-2 right-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full text-white text-xs transition" style="background:rgba(0,0,0,0.6);" aria-label="Delete video">&#10005;</button>
      `;

      // Try to get video duration
      const videoEl = card.querySelector('video');
      if (videoEl) {
        videoEl.addEventListener('loadedmetadata', () => {
          if (videoEl.duration && isFinite(videoEl.duration)) {
            const mins = Math.floor(videoEl.duration / 60);
            const secs = Math.floor(videoEl.duration % 60);
            const badge = document.createElement('div');
            badge.className = 'video-duration-badge';
            badge.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            card.appendChild(badge);
          }
        });
      }
    } else {
      card.className = 'group relative overflow-hidden rounded-2xl border aspect-square';
      card.style.cssText = 'border-color:var(--border);background:var(--neu-bg);box-shadow:4px 4px 10px var(--neu-shadow-dark),-4px -4px 10px var(--neu-shadow-light);transition:transform 0.2s ease,box-shadow 0.2s ease;';

      card.innerHTML = `
        <img src="${item.src}" alt="${item.caption}" class="gallery-img w-full h-full object-cover" loading="lazy" />
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <div class="text-xs text-white/90 truncate">${item.caption}</div>
        </div>
        <button class="delete-btn absolute top-2 right-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full text-white text-xs transition" style="background:rgba(0,0,0,0.6);" aria-label="Delete image">&#10005;</button>
      `;
    }

    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '6px 6px 14px var(--neu-shadow-dark),-6px -6px 14px var(--neu-shadow-light)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.boxShadow = '4px 4px 10px var(--neu-shadow-dark),-4px -4px 10px var(--neu-shadow-light)';
    });

    // Click to open media viewer
    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      openMedia(item.src, item.caption || '', item.type || 'image');
    });

    // Delete
    card.querySelector('.delete-btn').onclick = async (e) => {
      e.stopImmediatePropagation();
      const currentState = getState();
      const updated = currentState.gallery.filter(i => i.id !== item.id);
      await saveGallery(updated);
      renderGallery();
    };

    galleryGrid.appendChild(card);
  });
}

function openGenerateModal() {
  const modal = document.getElementById('modal-generate');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const promptInput = document.getElementById('gen-prompt');
  const cancelBtn = document.getElementById('btn-cancel-gen');
  const genBtn = document.getElementById('btn-do-generate');
  const loading = document.getElementById('gen-loading');

  promptInput.value = '';

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    genBtn.onclick = null;
    cancelBtn.onclick = null;
    loading.classList.add('hidden');
  };

  cancelBtn.onclick = close;

  genBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showToast('Please describe the sacred scene.', 'error');
      return;
    }

    genBtn.disabled = true;
    loading.classList.remove('hidden');
    genBtn.textContent = 'Generating...';

    const imageUrl = await generateImage(prompt);

    genBtn.disabled = false;
    loading.classList.add('hidden');
    genBtn.textContent = 'Generate Image';

    if (imageUrl) {
      await addImageToGallery(imageUrl, prompt.slice(0, 60));
      showToast('Sacred image generated and added to the gallery.', 'success');
      close();
    } else {
      showToast('Image generation failed. Try a different description.', 'error');
    }
  };

  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
}
