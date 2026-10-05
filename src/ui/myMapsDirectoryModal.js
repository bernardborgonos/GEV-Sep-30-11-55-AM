/**
 * @module src/ui/myMapsDirectoryModal.js
 * "My Maps / Projects" Workspace Directory Modal matching the Carolina! Demo.
 * Includes categorized buckets (Private, Public, Group), Create Map dialog,
 * map duplication/deletion, and "Combine Maps" multi-layer overlay.
 */

import {
  listMaps,
  getLocalMapsSnapshot,
  createMap,
  duplicateMap,
  deleteMap,
  combineMaps,
  exportMapToGeoJson,
  importGeoJsonToMap,
} from '../data/firebaseMapsStore.js';
import { openConfirmModal, openAlertModal } from './confirmModal.js';

/**
 * Opens the "My Maps / Projects" Workspace Directory Modal.
 */
export async function openMyMapsDirectoryModal({ activeMapId, onSelectMap, onCombineMaps }) {
  let modalRoot = document.getElementById('my-maps-directory-modal-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'my-maps-directory-modal-root';
    document.body.appendChild(modalRoot);
  }

  // Load maps immediately from snapshot for 0ms instantaneous opening
  const initialSnapshot = getLocalMapsSnapshot();
  const { all, privateMaps, publicMaps, groupMaps, isCloudSynced } = initialSnapshot;

  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in" id="my-maps-backdrop">
      <div class="relative w-full max-w-5xl bg-[#111827] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100 font-sans transition-all duration-300" id="my-maps-dialog-card">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-700 bg-slate-900/90 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span class="material-symbols-outlined text-2xl">map</span>
            </span>
            <div>
              <h2 class="text-xl font-bold text-white flex items-center gap-2">
                My Maps / Projects Hub
                <span id="cloud-sync-status-badge" class="text-xs px-2.5 py-0.5 rounded-full border ${isCloudSynced ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-amber-500/40 bg-amber-950/40 text-amber-300'} font-mono">
                  ${isCloudSynced ? '● Cloud Synced (Firestore)' : '○ Local Storage Mode'}
                </span>
              </h2>
              <p class="text-xs text-slate-400">Manage spatial missions, collaborate on shared maps, or combine multiple operational layers.</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Normal / Maximize Segmented Control -->
            <div class="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
              <button type="button" id="mymaps-size-normal-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer bg-emerald-600 text-white" title="Normal Layout">
                <span class="material-symbols-outlined text-xs">picture_in_picture_alt</span> Normal
              </button>
              <button type="button" id="mymaps-size-max-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer text-slate-400 hover:text-white" title="Maximize Layout (Full Screen)">
                <span class="material-symbols-outlined text-xs">open_in_full</span> Maximize
              </button>
            </div>
            <!-- Close Button -->
            <button id="close-my-maps-btn" class="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition flex items-center justify-center cursor-pointer" aria-label="Close">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>
        </div>

        <!-- Toolbar: Search & Combine Action -->
        <div class="px-6 py-3 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-1 max-w-md">
            <div class="relative w-full">
              <span class="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
              <input id="search-maps-input" type="text" placeholder="Search maps by title, short code, or author..." class="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-400" />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <input type="file" id="import-geojson-file-input" accept=".geojson,application/geo+json,application/json" class="hidden" />
            <button id="import-geojson-btn" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition" title="Import Map from GeoJSON">
              <span class="material-symbols-outlined text-base text-emerald-400">upload_file</span> Import GeoJSON
            </button>
            <button id="combine-selected-maps-btn" class="px-3.5 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled title="Combine selected maps into active view">
              <span class="material-symbols-outlined text-base">layers</span> Combine Selected (<span id="combine-count">0</span>)
            </button>
            <button id="create-new-map-top-btn" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition">
              <span class="material-symbols-outlined text-base">add</span> + Create a new Map
            </button>
          </div>
        </div>

        <!-- 3-Column Categorized View matching video -->
        <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-950/50">
          
          <!-- Column 1: My Maps / Private Maps -->
          <div class="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div class="px-4 py-3 bg-emerald-950/30 border-b border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">lock</span> My Maps / Private Maps
              </span>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono" id="private-count">${privateMaps.length}</span>
            </div>
            <div class="flex-1 p-3 overflow-y-auto space-y-2 max-h-[50vh]" id="private-maps-list">
              ${renderMapList(privateMaps, activeMapId)}
            </div>
            <div class="p-3 border-t border-slate-800 bg-slate-900/30">
              <button class="create-map-trigger-btn w-full py-2 bg-slate-800/80 hover:bg-slate-700 text-emerald-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition">
                <span class="material-symbols-outlined text-sm">add</span> + Create a new Map
              </button>
            </div>
          </div>

          <!-- Column 2: Publicly shared Maps -->
          <div class="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div class="px-4 py-3 bg-sky-950/30 border-b border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">public</span> Publicly Shared Maps
              </span>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono" id="public-count">${publicMaps.length}</span>
            </div>
            <div class="flex-1 p-3 overflow-y-auto space-y-2 max-h-[50vh]" id="public-maps-list">
              ${renderMapList(publicMaps, activeMapId)}
            </div>
          </div>

          <!-- Column 3: Group Shared Maps -->
          <div class="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div class="px-4 py-3 bg-indigo-950/30 border-b border-slate-800 flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">groups</span> Group Shared Maps
              </span>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono" id="group-count">${groupMaps.length}</span>
            </div>
            <div class="flex-1 p-3 overflow-y-auto space-y-2 max-h-[50vh]" id="group-maps-list">
              ${renderMapList(groupMaps, activeMapId)}
            </div>
          </div>

        </div>

      </div>
    </div>
  `;

  // Selected map IDs for combine action
  const selectedMapIds = new Set();
  const combineBtn = modalRoot.querySelector('#combine-selected-maps-btn');
  const combineCountSpan = modalRoot.querySelector('#combine-count');

  function updateCombineUI() {
    combineCountSpan.textContent = selectedMapIds.size;
    combineBtn.disabled = selectedMapIds.size === 0;
  }

  // Bind events
  const closeModal = () => {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && modalRoot.innerHTML.trim() !== '') {
      closeModal();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // Close on backdrop click
  const backdrop = modalRoot.querySelector('#my-maps-backdrop');
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // Maximize / Restore wiring using Segmented Control (Normal, Maximize, Close)
  const mymapsSizeNormalBtn = modalRoot.querySelector('#mymaps-size-normal-btn');
  const mymapsSizeMaxBtn = modalRoot.querySelector('#mymaps-size-max-btn');
  const myMapsDialogCard = modalRoot.querySelector('#my-maps-dialog-card');
  const myMapsBackdrop = modalRoot.querySelector('#my-maps-backdrop');

  function setMyMapsSize(maximized) {
    if (maximized) {
      myMapsDialogCard.classList.remove('max-w-5xl', 'max-h-[90vh]', 'rounded-2xl');
      myMapsDialogCard.classList.add('w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none');
      myMapsBackdrop.classList.remove('p-4');
      
      mymapsSizeMaxBtn.classList.add('bg-emerald-600', 'text-white');
      mymapsSizeMaxBtn.classList.remove('text-slate-400', 'hover:text-white');
      mymapsSizeNormalBtn.classList.remove('bg-emerald-600', 'text-white');
      mymapsSizeNormalBtn.classList.add('text-slate-400', 'hover:text-white');
    } else {
      myMapsDialogCard.classList.remove('w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none');
      myMapsDialogCard.classList.add('max-w-5xl', 'max-h-[90vh]', 'rounded-2xl', 'w-full');
      myMapsBackdrop.classList.add('p-4');
      
      mymapsSizeNormalBtn.classList.add('bg-emerald-600', 'text-white');
      mymapsSizeNormalBtn.classList.remove('text-slate-400', 'hover:text-white');
      mymapsSizeMaxBtn.classList.remove('bg-emerald-600', 'text-white');
      mymapsSizeMaxBtn.classList.add('text-slate-400', 'hover:text-white');
    }
  }

  mymapsSizeNormalBtn?.addEventListener('click', () => setMyMapsSize(false));
  mymapsSizeMaxBtn?.addEventListener('click', () => setMyMapsSize(true));

  modalRoot.querySelector('#close-my-maps-btn')?.addEventListener('click', closeModal);

  // Trigger Create Map Modal
  const openCreateDialog = () => {
    openCreateMapModal(async (newMap) => {
      closeModal();
      if (onSelectMap) onSelectMap(newMap.id);
    });
  };

  modalRoot.querySelectorAll('.create-map-trigger-btn, #create-new-map-top-btn').forEach((btn) => {
    btn.addEventListener('click', openCreateDialog);
  });

  // Combine selected maps button
  combineBtn?.addEventListener('click', async () => {
    if (selectedMapIds.size === 0) return;
    const ids = Array.from(selectedMapIds);
    closeModal();
    if (onCombineMaps) onCombineMaps(ids);
  });

  // Map Item Event Delegations (Select, Duplicate, Delete, Checkbox)
  modalRoot.addEventListener('click', async (e) => {
    // Open Map Click
    const selectTrigger = e.target.closest('.map-title-trigger');
    if (selectTrigger) {
      const mapId = selectTrigger.getAttribute('data-map-id');
      closeModal();
      if (onSelectMap) onSelectMap(mapId);
      return;
    }

    // Duplicate Click
    const dupTrigger = e.target.closest('.duplicate-map-btn');
    if (dupTrigger) {
      const mapId = dupTrigger.getAttribute('data-map-id');
      dupTrigger.textContent = '...';
      const cloned = await duplicateMap(mapId);
      closeModal();
      // Re-open with updated list
      openMyMapsDirectoryModal({ activeMapId: cloned.id, onSelectMap, onCombineMaps });
      return;
    }

    // Delete Click
    const delTrigger = e.target.closest('.delete-map-btn');
    if (delTrigger) {
      const mapId = delTrigger.getAttribute('data-map-id');
      const mapName = delTrigger.getAttribute('data-map-name') || 'this map';
      openConfirmModal({
        title: 'Delete Map Project',
        message: `Are you sure you want to delete map "${mapName}"?`,
        details: 'All spatial layers and items associated with this map will be permanently removed.',
        confirmText: 'Delete Map',
        confirmColor: 'rose',
        onConfirm: async () => {
          await deleteMap(mapId);
          closeModal();
          openMyMapsDirectoryModal({ activeMapId: null, onSelectMap, onCombineMaps });
        },
      });
      return;
    }

    // Export GeoJSON Click
    const exportTrigger = e.target.closest('.export-map-btn');
    if (exportTrigger) {
      const mapId = exportTrigger.getAttribute('data-map-id');
      const mapName = exportTrigger.getAttribute('data-map-name') || 'map';
      try {
        const geoJson = await exportMapToGeoJson(mapId);
        const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${mapName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.geojson`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to export map to GeoJSON:', err);
      }
      return;
    }
  });

  // Import GeoJSON wiring
  const importFileInput = modalRoot.querySelector('#import-geojson-file-input');
  const importBtn = modalRoot.querySelector('#import-geojson-btn');

  importBtn?.addEventListener('click', () => {
    importFileInput?.click();
  });

  importFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const defaultName = file.name.replace(/\.[^/.]+$/, '');
      const created = await importGeoJsonToMap(parsed, defaultName);
      closeModal();
      if (onSelectMap) onSelectMap(created.id);
    } catch (err) {
      openAlertModal({
        title: 'Import Error',
        message: `Invalid GeoJSON file format: ${err.message}`,
        alertType: 'rose',
      });
    }
  });

  modalRoot.addEventListener('change', (e) => {
    const cb = e.target.closest('.combine-map-checkbox');
    if (cb) {
      const mapId = cb.getAttribute('data-map-id');
      if (cb.checked) {
        selectedMapIds.add(mapId);
      } else {
        selectedMapIds.delete(mapId);
      }
      updateCombineUI();
    }
  });

  // Filter input
  modalRoot.querySelector('#search-maps-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    modalRoot.querySelectorAll('.map-item-card').forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? 'flex' : 'none';
    });
  });

  // Background cloud refresh if Firestore or network has newer data
  listMaps().then((freshData) => {
    if (modalRoot.querySelector('#my-maps-backdrop')) {
      const privList = modalRoot.querySelector('#private-maps-list');
      const pubList = modalRoot.querySelector('#public-maps-list');
      const grpList = modalRoot.querySelector('#group-maps-list');
      const privCount = modalRoot.querySelector('#private-count');
      const pubCount = modalRoot.querySelector('#public-count');
      const grpCount = modalRoot.querySelector('#group-count');
      const badge = modalRoot.querySelector('#cloud-sync-status-badge');

      if (privList) privList.innerHTML = renderMapList(freshData.privateMaps, activeMapId);
      if (pubList) pubList.innerHTML = renderMapList(freshData.publicMaps, activeMapId);
      if (grpList) grpList.innerHTML = renderMapList(freshData.groupMaps, activeMapId);
      if (privCount) privCount.textContent = freshData.privateMaps.length;
      if (pubCount) pubCount.textContent = freshData.publicMaps.length;
      if (grpCount) grpCount.textContent = freshData.groupMaps.length;

      if (badge) {
        badge.className = `text-xs px-2.5 py-0.5 rounded-full border ${freshData.isCloudSynced ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-amber-500/40 bg-amber-950/40 text-amber-300'} font-mono`;
        badge.textContent = freshData.isCloudSynced ? '● Cloud Synced (Firestore)' : '○ Local Storage Mode';
      }
    }
  }).catch((err) => {
    console.warn('[MyMaps] Background sync note:', err);
  });
}

/**
 * Generates HTML list of maps matching the video styling.
 */
function renderMapList(maps, activeMapId) {
  if (!maps || maps.length === 0) {
    return `<div class="p-4 text-center text-xs text-slate-500 italic">No maps in this directory.</div>`;
  }

  return maps
    .map((m) => {
      const isActive = m.id === activeMapId;
      return `
      <div class="map-item-card p-3 rounded-lg border ${isActive ? 'border-emerald-500/80 bg-emerald-950/30 ring-1 ring-emerald-500' : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'} flex items-start justify-between gap-2 transition group">
        <div class="flex items-start gap-2.5 flex-1 min-w-0">
          <input type="checkbox" class="combine-map-checkbox mt-1 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer" data-map-id="${m.id}" title="Select to combine" />
          <div class="flex-1 min-w-0">
            <button class="map-title-trigger text-left font-semibold text-sm text-slate-100 hover:text-emerald-400 transition truncate block w-full" data-map-id="${m.id}">
              ${escapeHtml(m.name)}
            </button>
            <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>by <span class="text-slate-300 font-medium">${escapeHtml(m.author || 'admin')}</span></span>
              <span>•</span>
              <span class="font-mono text-emerald-400">${m.itemsCount || 0} items</span>
            </div>
            ${m.shortCode ? `<div class="text-[10px] text-slate-500 font-mono mt-0.5">code: ${escapeHtml(m.shortCode)}</div>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100">
          <button class="export-map-btn p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800 transition text-xs" data-map-id="${m.id}" data-map-name="${escapeHtml(m.name)}" title="Export as GeoJSON">
            <span class="material-symbols-outlined text-sm">download</span>
          </button>
          <button class="duplicate-map-btn p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition text-xs" data-map-id="${m.id}" title="Duplicate map">
            <span class="material-symbols-outlined text-sm">content_copy</span>
          </button>
          <button class="delete-map-btn p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition text-xs" data-map-id="${m.id}" data-map-name="${escapeHtml(m.name)}" title="Delete map">
            <span class="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>
    `;
    })
    .join('');
}

/**
 * Opens the "Create Item / Create Map" Dialog matching video 00:14-00:52.
 */
export function openCreateMapModal(onCreated) {
  let modalRoot = document.getElementById('create-map-modal-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'create-map-modal-root';
    document.body.appendChild(modalRoot);
  }

  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-[100010] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in font-sans" id="create-map-modal-backdrop">
      <div class="relative w-full max-w-md bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-700 bg-slate-900/80 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold uppercase tracking-wider text-emerald-400">Map Project</span>
            <h2 class="text-lg font-bold text-white">Create Item / New Map</h2>
          </div>
          <button id="close-create-map-btn" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
            <span class="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <!-- Form fields from video 00:14-00:52 -->
        <div class="p-6 space-y-4 text-sm">
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-name">Name *</label>
            <input id="new-map-name" type="text" placeholder="e.g., Sample Map Sept 21 2026" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400" required />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-code">Short Code</label>
            <input id="new-map-code" type="text" placeholder="e.g., asd34545656" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-400" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-group">Group</label>
              <select id="new-map-group" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-xs">
                <option value="None">None</option>
                <option value="Admins" selected>Admins</option>
                <option value="Registered">Registered</option>
                <option value="Anonymous">Anonymous</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-vis">Visibility</label>
              <select id="new-map-vis" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-xs">
                <option value="private" selected>Private</option>
                <option value="public">Public</option>
                <option value="group">Group</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-style">Map Style Selector</label>
            <select id="new-map-style" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-xs">
              <option value="osm" selected>OpenStreetMap Standard</option>
              <option value="satellite">ESRI Satellite Photoreal</option>
              <option value="dark">Dark Minimal Tactical</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="new-map-desc">Description</label>
            <textarea id="new-map-desc" rows="2" placeholder="Mission briefing or map context notes..." class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-xs"></textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-700 bg-slate-900/60 flex items-center justify-end gap-2">
          <button type="button" id="cancel-create-map-btn" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition">
            Cancel
          </button>
          <button type="button" id="confirm-create-map-btn" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5">
            <span class="material-symbols-outlined text-base">check</span> OK
          </button>
        </div>

      </div>
    </div>
  `;

  const closeDialog = () => {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onKeyDownCreate);
  };

  const onKeyDownCreate = (e) => {
    if (e.key === 'Escape' && modalRoot.innerHTML.trim() !== '') {
      closeDialog();
    }
  };
  document.addEventListener('keydown', onKeyDownCreate);

  const backdrop = modalRoot.querySelector('#create-map-modal-backdrop');
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog();
  });

  modalRoot.querySelector('#close-create-map-btn')?.addEventListener('click', closeDialog);
  modalRoot.querySelector('#cancel-create-map-btn')?.addEventListener('click', closeDialog);

  modalRoot.querySelector('#confirm-create-map-btn')?.addEventListener('click', async () => {
    const nameInput = modalRoot.querySelector('#new-map-name');
    const name = nameInput?.value?.trim();
    if (!name) {
      if (nameInput) {
        nameInput.focus();
        nameInput.classList.add('ring-2', 'ring-rose-500');
        setTimeout(() => nameInput.classList.remove('ring-2', 'ring-rose-500'), 2500);
      }
      return;
    }

    const shortCode = modalRoot.querySelector('#new-map-code')?.value?.trim();
    const group = modalRoot.querySelector('#new-map-group')?.value;
    const visibility = modalRoot.querySelector('#new-map-vis')?.value;
    const mapStyle = modalRoot.querySelector('#new-map-style')?.value;
    const description = modalRoot.querySelector('#new-map-desc')?.value?.trim();

    const created = await createMap({
      name,
      shortCode,
      group,
      visibility,
      mapStyle,
      description,
      author: 'admin',
    });

    closeDialog();
    if (onCreated) onCreated(created);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
