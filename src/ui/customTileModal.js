/**
 * Custom Tile Layers Modal & Configuration Interface.
 * Allows users to add, configure, test, toggle, and inspect custom tile layers:
 * XYZ URL templates, WMS, WMTS, ArcGIS MapServer, and 3D Tiles.
 */

import { getCustomTileLayerManager, PRESET_CUSTOM_TILES } from '../data/customTileLayers.js';
import { openConfirmModal, openAlertModal } from './confirmModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function openCustomTileModal(viewer, onLayersChanged) {
  const existing = document.getElementById('custom-tile-modal');
  if (existing) existing.remove();

  const tileManager = getCustomTileLayerManager(viewer);
  let allLayers = tileManager.getAllLayers();
  let editingLayerId = null;

  const modal = document.createElement('div');
  modal.id = 'custom-tile-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans';

  const renderContent = () => {
    allLayers = tileManager.getAllLayers();

    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-2xl text-emerald-400">layers</span>
            <div>
              <h2 class="text-base font-bold text-white flex items-center gap-2">
                Custom Map Tiles & Imagery Overlays
                <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">XYZ / WMS / WMTS / 3D Tiles</span>
              </h2>
              <p class="text-xs text-slate-400">Connect your custom tile server, orthophotos, or external GIS imagery endpoints.</p>
            </div>
          </div>
          <button id="modal-close-btn" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <span class="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <!-- Body / Content -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- Action Bar -->
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span>Configured Layers (${allLayers.length})</span>
            </h3>
            <div class="flex items-center gap-2">
              <button id="btn-add-new-tile" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow transition">
                <span class="material-symbols-outlined text-sm">add</span> Add Custom Tile URL
              </button>
            </div>
          </div>

          <!-- Add/Edit Form (Hidden by default unless editing) -->
          <div id="tile-form-container" class="${editingLayerId ? 'block' : 'hidden'} bg-slate-950/90 border border-emerald-500/40 rounded-xl p-4 space-y-3.5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 id="form-heading" class="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">tune</span> ${editingLayerId ? 'Edit Tile Layer' : 'Add New Custom Tile Layer'}
              </h4>
              <button id="form-cancel-btn" class="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label class="block text-slate-300 font-medium mb-1">Layer Name</label>
                <input id="input-tile-name" type="text" placeholder="e.g. Sentinel-2 Satellite / Custom Aerial" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label class="block text-slate-300 font-medium mb-1">Tile Service Type</label>
                <select id="input-tile-type" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500">
                  <option value="xyz">XYZ / Slippy Tiles (e.g. {z}/{x}/{y}.png)</option>
                  <option value="wms">WMS (Web Map Service)</option>
                  <option value="wmts">WMTS (Web Map Tile Service)</option>
                  <option value="arcgis">ArcGIS MapServer / ImageServer</option>
                  <option value="3dtiles">3D Tiles (tileset.json)</option>
                </select>
              </div>

              <div class="md:col-span-2">
                <label class="block text-slate-300 font-medium mb-1">URL Template / Endpoint</label>
                <input id="input-tile-url" type="text" placeholder="https://example.com/tiles/{z}/{x}/{y}.png" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-[11px] placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                <p id="url-hint" class="text-[10px] text-slate-400 mt-1">Use {z}, {x}, {y} placeholders for XYZ tiles. Use {s} for subdomains.</p>
              </div>

              <div id="subdomains-group">
                <label class="block text-slate-300 font-medium mb-1">Subdomains (optional)</label>
                <input id="input-tile-subdomains" type="text" placeholder="e.g. abc or 0123" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
              </div>

              <div id="layers-group">
                <label class="block text-slate-300 font-medium mb-1">WMS/WMTS Layers (comma-separated)</label>
                <input id="input-tile-layers" type="text" placeholder="e.g. 0,1,imagery" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label class="block text-slate-300 font-medium mb-1">Attribution / Credit</label>
                <input id="input-tile-attribution" type="text" placeholder="e.g. © My Organization, OpenStreetMap" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
              </div>

              <div>
                <label class="block text-slate-300 font-medium mb-1">Opacity (<span id="opacity-val-label">85</span>%)</label>
                <input id="input-tile-opacity" type="range" min="10" max="100" value="85" class="w-full accent-emerald-500 cursor-pointer" />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button id="form-save-btn" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow transition flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">check</span> Save Layer
              </button>
            </div>
          </div>

          <!-- Layers List -->
          <div class="space-y-2.5">
            ${allLayers.map((l) => {
              const isActive = tileManager.isLayerActive(l.id);
              const opacityPercent = Math.round((l.opacity ?? 0.85) * 100);
              return `
                <div class="p-3 rounded-xl bg-slate-950/60 border ${isActive ? 'border-emerald-500/60 shadow-lg shadow-emerald-950/30' : 'border-slate-800'} transition flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div class="flex items-start gap-3 min-w-0 flex-1">
                    <label class="flex items-center gap-2 cursor-pointer mt-0.5">
                      <input type="checkbox" class="tile-toggle-checkbox accent-emerald-500 rounded cursor-pointer w-4 h-4" data-id="${escapeHtml(l.id)}" ${isActive ? 'checked' : ''} />
                    </label>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-bold text-sm text-white truncate">${escapeHtml(l.name || 'Untitled Layer')}</h4>
                        <span class="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">${escapeHtml(l.type || 'xyz')}</span>
                        ${isActive ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-400">ACTIVE ON GLOBE</span>' : ''}
                      </div>
                      <p class="text-[11px] font-mono text-slate-400 truncate mt-0.5" title="${escapeHtml(l.url)}">${escapeHtml(l.url)}</p>
                      ${l.description ? `<p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(l.description)}</p>` : ''}
                    </div>
                  </div>

                  <!-- Controls: Opacity & Actions -->
                  <div class="flex items-center gap-3 self-end md:self-center">
                    <div class="flex items-center gap-1.5 text-xs text-slate-400">
                      <span class="text-[10px] font-mono">OPACITY</span>
                      <input type="range" class="tile-opacity-slider w-20 accent-emerald-500 cursor-pointer" data-id="${escapeHtml(l.id)}" min="10" max="100" value="${opacityPercent}" />
                      <span class="text-[10px] font-mono text-slate-300 w-7">${opacityPercent}%</span>
                    </div>

                    <div class="flex items-center gap-1">
                      <button class="tile-edit-btn p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition" data-id="${escapeHtml(l.id)}" title="Edit Layer">
                        <span class="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button class="tile-delete-btn p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition" data-id="${escapeHtml(l.id)}" title="Delete Layer">
                        <span class="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span class="flex items-center gap-1">
            <span class="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
            Changes are saved and synced instantly to the Cesium 3D globe.
          </span>
          <button id="modal-done-btn" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition">
            Close
          </button>
        </div>
      </div>
    `;

    bindModalEvents();
  };

  const bindModalEvents = () => {
    // Close modal
    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#modal-done-btn')?.addEventListener('click', () => modal.remove());

    // Add New Tile Button
    modal.querySelector('#btn-add-new-tile')?.addEventListener('click', () => {
      editingLayerId = 'new';
      renderContent();
      const formContainer = modal.querySelector('#tile-form-container');
      formContainer?.classList.remove('hidden');
      modal.querySelector('#input-tile-name')?.focus();
    });

    // Form cancel
    modal.querySelector('#form-cancel-btn')?.addEventListener('click', () => {
      editingLayerId = null;
      renderContent();
    });

    // Opacity input label live feedback
    const opacityInput = modal.querySelector('#input-tile-opacity');
    const opacityLabel = modal.querySelector('#opacity-val-label');
    opacityInput?.addEventListener('input', (e) => {
      if (opacityLabel) opacityLabel.textContent = e.target.value;
    });

    // Service type change hints
    modal.querySelector('#input-tile-type')?.addEventListener('change', (e) => {
      const type = e.target.value;
      const urlInput = modal.querySelector('#input-tile-url');
      const hint = modal.querySelector('#url-hint');
      const subdomainsGroup = modal.querySelector('#subdomains-group');
      const layersGroup = modal.querySelector('#layers-group');

      if (type === 'xyz') {
        hint.textContent = 'Use {z}, {x}, {y} placeholders for XYZ tiles. Use {s} for subdomains.';
        if (!urlInput.value) urlInput.placeholder = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        subdomainsGroup.style.display = 'block';
        layersGroup.style.display = 'none';
      } else if (type === 'arcgis') {
        hint.textContent = 'Enter the ArcGIS MapServer or ImageServer REST endpoint URL.';
        if (!urlInput.value) urlInput.placeholder = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer';
        subdomainsGroup.style.display = 'none';
        layersGroup.style.display = 'none';
      } else if (type === 'wms') {
        hint.textContent = 'Enter the base WMS service URL and specify layer names.';
        if (!urlInput.value) urlInput.placeholder = 'https://ahocevar.com/geoserver/wms';
        subdomainsGroup.style.display = 'none';
        layersGroup.style.display = 'block';
      } else if (type === 'wmts') {
        hint.textContent = 'Enter the WMTS service URL and specify layer identifiers.';
        if (!urlInput.value) urlInput.placeholder = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/WMTS';
        subdomainsGroup.style.display = 'none';
        layersGroup.style.display = 'block';
      } else if (type === '3dtiles') {
        hint.textContent = 'Enter the direct URL to the 3D tileset.json file.';
        if (!urlInput.value) urlInput.placeholder = 'https://example.com/3d-tiles/tileset.json';
        subdomainsGroup.style.display = 'none';
        layersGroup.style.display = 'none';
      }
    });

    // Populate form if editing existing
    if (editingLayerId && editingLayerId !== 'new') {
      const current = allLayers.find((l) => l.id === editingLayerId);
      if (current) {
        modal.querySelector('#input-tile-name').value = current.name || '';
        modal.querySelector('#input-tile-type').value = current.type || 'xyz';
        modal.querySelector('#input-tile-url').value = current.url || '';
        modal.querySelector('#input-tile-subdomains').value = current.subdomains || '';
        modal.querySelector('#input-tile-layers').value = current.layers || '';
        modal.querySelector('#input-tile-attribution').value = current.attribution || '';
        const opVal = Math.round((current.opacity ?? 0.85) * 100);
        modal.querySelector('#input-tile-opacity').value = opVal;
        if (opacityLabel) opacityLabel.textContent = opVal;
      }
    }

    // Save Layer
    modal.querySelector('#form-save-btn')?.addEventListener('click', async () => {
      const name = modal.querySelector('#input-tile-name')?.value.trim();
      const type = modal.querySelector('#input-tile-type')?.value;
      const url = modal.querySelector('#input-tile-url')?.value.trim();
      const subdomains = modal.querySelector('#input-tile-subdomains')?.value.trim();
      const layers = modal.querySelector('#input-tile-layers')?.value.trim();
      const attribution = modal.querySelector('#input-tile-attribution')?.value.trim();
      const opacity = Number(modal.querySelector('#input-tile-opacity')?.value || 85) / 100;

      if (!name) {
        openAlertModal({
          title: 'Layer Name Required',
          message: 'Please enter a name for this custom tile layer.',
          alertType: 'amber',
        });
        return;
      }
      if (!url) {
        openAlertModal({
          title: 'Tile URL Required',
          message: 'Please enter a valid tile URL template (e.g. {z}/{x}/{y}.png) or endpoint.',
          alertType: 'amber',
        });
        return;
      }

      const id = editingLayerId && editingLayerId !== 'new' ? editingLayerId : `custom-tile-${Date.now()}`;
      try {
        await tileManager.saveLayer({
          id,
          name,
          type,
          url,
          subdomains,
          layers,
          attribution,
          opacity,
          enabled: true,
        });

        editingLayerId = null;
        renderContent();
        if (onLayersChanged) onLayersChanged();
      } catch (err) {
        openAlertModal({
          title: 'Activation Error',
          message: `Failed to activate tile layer: ${err.message || err}`,
          alertType: 'rose',
        });
      }
    });

    // Checkbox toggles
    modal.querySelectorAll('.tile-toggle-checkbox').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const checked = e.target.checked;
        try {
          await tileManager.toggleLayer(id, checked);
          renderContent();
          if (onLayersChanged) onLayersChanged();
        } catch (err) {
          openAlertModal({
            title: 'Toggle Error',
            message: `Failed to toggle layer: ${err.message || err}`,
            alertType: 'rose',
          });
          renderContent();
        }
      });
    });

    // Opacity sliders
    modal.querySelectorAll('.tile-opacity-slider').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const id = e.target.getAttribute('data-id');
        const opacity = Number(e.target.value) / 100;
        tileManager.setLayerOpacity(id, opacity);
      });
    });

    // Edit buttons
    modal.querySelectorAll('.tile-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        editingLayerId = id;
        renderContent();
      });
    });

    // Delete buttons
    modal.querySelectorAll('.tile-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const target = allLayers.find((l) => l.id === id);
        openConfirmModal({
          title: 'Delete Tile Layer',
          message: `Delete custom tile layer "${target?.name || 'this layer'}"?`,
          details: 'This custom layer configuration will be removed from your saved layers.',
          confirmText: 'Delete Layer',
          confirmColor: 'rose',
          onConfirm: () => {
            tileManager.deleteLayer(id);
            renderContent();
            if (onLayersChanged) onLayersChanged();
          },
        });
      });
    });
  };

  document.body.appendChild(modal);
  renderContent();
}
