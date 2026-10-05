/**
 * @module src/ui/activeMapHud.js
 * Renders the top-right Active Map Management Widget and the In-Canvas POI Callout Card
 * directly matching the Carolina! Demo video.
 *
 * Build Timestamp: 2026-09-25T01:26:00-07:00 (UTC 2026-09-25T08:26:00Z)
 */

import { SWATCH_COLORS } from './itemInspectorModal.js';
import { getCategoryColor, getCategoryIcon, getDomainColor, getCustomIconForPreset } from '../data/itemCategories.js';
import { extractGeodeticMetrics } from '../tools/geodeticItemExtractor.js';
import { toMgrsString, formatMgrsSpaced } from '../tools/mgrsHelper.js';
import { haversineDistanceMeters } from '../tools/geodesicMath.js';

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}?autoplay=0&enablejsapi=1`;
  }
  return null;
}

let lastHudProps = null;
let isHudCollapsed = false;
try {
  isHudCollapsed = localStorage.getItem('godseye_active_map_hud_collapsed') === 'true';
} catch (e) {
  // Ignore localStorage restrictions
}

export function toggleActiveMapHudCollapse(forceState) {
  if (typeof forceState === 'boolean') {
    isHudCollapsed = forceState;
  } else {
    isHudCollapsed = !isHudCollapsed;
  }
  try {
    localStorage.setItem('godseye_active_map_hud_collapsed', isHudCollapsed ? 'true' : 'false');
  } catch (e) {}
  if (lastHudProps) {
    renderActiveMapHud(lastHudProps);
  }
}

/**
 * Mounts or updates the Top-Right Active Map Widget.
 */
export function renderActiveMapHud({
  map,
  itemsCount,
  categories = [],
  hiddenCategories = new Set(),
  hiddenSubcategories = new Set(),
  selectedCategoryFilter = 'All',
  selectedSubcategoryFilter = 'All',
  onSelectCategoryFilter,
  onSelectSubcategoryFilter,
  onToggleCategory,
  onShowAllCategories,
  onHideAllCategories,
  onFlyToExtent,
  onStartTour,
  isTouring = false,
  onOpenMyMaps,
  onOpenCreateItem,
  onOpenDescription,
  onDuplicate,
  onDelete,
  onCombine,
  onExport,
  onOpenCustomTiles,
}) {
  lastHudProps = {
    map,
    itemsCount,
    categories,
    hiddenCategories,
    hiddenSubcategories,
    selectedCategoryFilter,
    selectedSubcategoryFilter,
    onSelectCategoryFilter,
    onSelectSubcategoryFilter,
    onToggleCategory,
    onShowAllCategories,
    onHideAllCategories,
    onFlyToExtent,
    onStartTour,
    isTouring,
    onOpenMyMaps,
    onOpenCreateItem,
    onOpenDescription,
    onDuplicate,
    onDelete,
    onCombine,
    onExport,
    onOpenCustomTiles,
  };

  let container = document.getElementById('active-map-hud-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'active-map-hud-container';
    container.className = 'fixed top-4 right-4 z-[9000] font-sans animate-fade-in';
    document.body.appendChild(container);
  }

  if (!map) {
    container.innerHTML = `
      <div class="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 shadow-xl backdrop-blur-sm flex items-center gap-2">
        <button id="hud-open-my-maps-btn" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition">
          <span class="material-symbols-outlined text-base">map</span> My Maps
        </button>
      </div>
    `;
    container.querySelector('#hud-open-my-maps-btn')?.addEventListener('click', onOpenMyMaps);
    return;
  }

  // Active Category details for subcategory extraction
  const activeCatObj = categories.find((c) => c.name === selectedCategoryFilter);
  const activeSubcategories = activeCatObj && Array.isArray(activeCatObj.subcategories) ? activeCatObj.subcategories : [];

  // Generate URL Intelligence-style adaptive chips for Level 1 Categories
  const categoryFiltersHtml = categories && categories.length > 0 ? `
    <div class="border-t border-slate-700/70 pt-2.5 pb-1">
      <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        <span class="flex items-center gap-1.5 text-slate-300">
          <span class="material-symbols-outlined text-xs text-sky-400">filter_alt</span> CATEGORIES (${categories.length})
        </span>
        <div class="flex items-center gap-1.5">
          <button id="hud-fly-extent-btn" type="button" class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-700/60 transition flex items-center gap-1 cursor-pointer" title="Fit camera to active filtered items">
            <span class="material-symbols-outlined text-[11px]">my_location</span> EXTENT
          </button>
          <button id="hud-cat-show-all" type="button" class="text-emerald-400 hover:text-emerald-300 transition cursor-pointer text-[9px] font-semibold">ALL</button>
          <span class="text-slate-600">•</span>
          <button id="hud-cat-hide-all" type="button" class="text-slate-400 hover:text-rose-400 transition cursor-pointer text-[9px] font-semibold">NONE</button>
        </div>
      </div>

      <!-- Level 1 Category Adaptive Chips Container (URL Intelligence style) -->
      <div class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
        <!-- ALL master chip -->
        <button type="button"
          class="hud-filter-chip ${selectedCategoryFilter === 'All' ? 'active ring-1 ring-emerald-400/80' : ''}"
          data-filter-category="All"
          style="${selectedCategoryFilter === 'All' ? 'background: rgba(16, 185, 129, 0.18); border-color: #10b981; color: #34d399;' : ''}"
          title="Show all map items across all categories">
          <span class="chip-icon material-symbols-outlined text-[11px]">public</span>
          <span class="chip-label">ALL</span>
          <span class="chip-count">(${itemsCount})</span>
        </button>

        ${categories.map((cat) => {
          const isSelected = selectedCategoryFilter === cat.name;
          const isVisible = !hiddenCategories.has(cat.name);
          const accent = getCategoryColor(cat.name);
          const icon = getCategoryIcon(cat.name);

          let activeStyle = '';
          if (isSelected) {
            activeStyle = `background: ${accent}26; border-color: ${accent}; color: #ffffff; box-shadow: 0 0 10px ${accent}40;`;
          } else if (!isVisible) {
            activeStyle = 'opacity: 0.4; text-decoration: line-through; border-color: rgba(255,255,255,0.06);';
          }

          return `
            <button type="button"
              class="hud-filter-chip ${isSelected ? 'active ring-1 ring-sky-400/80' : ''}"
              data-filter-category="${escapeHtml(cat.name)}"
              style="${activeStyle}"
              title="Click to isolate ${escapeHtml(cat.name)} · Shift-click to toggle">
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: ${accent};"></span>
              <span class="chip-icon material-symbols-outlined text-[11px]" style="color: ${accent};">${icon}</span>
              <span class="chip-label uppercase">${escapeHtml(cat.name)}</span>
              <span class="chip-count font-mono">(${cat.count})</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Level 2 Sub-Level Adaptive Chips (Shown when a category is selected and has subcategories) -->
      ${selectedCategoryFilter !== 'All' && activeSubcategories.length > 0 ? `
        <div class="mt-2 pt-2 border-t border-slate-800/80 animate-fade-in">
          <div class="text-[9px] font-bold uppercase tracking-wider text-cyan-400/90 mb-1.5 flex items-center gap-1 font-mono">
            <span class="material-symbols-outlined text-[11px]">account_tree</span> SUB-LEVEL (LEVEL 2):
          </div>
          <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
            <!-- All sub-levels chip -->
            <button type="button"
              class="hud-sub-chip ${selectedSubcategoryFilter === 'All' ? 'active ring-1 ring-cyan-400' : ''}"
              data-filter-subcategory="All"
              style="${selectedSubcategoryFilter === 'All' ? 'background: rgba(6, 182, 212, 0.2); border-color: #06b6d4; color: #67e8f9;' : ''}">
              <span>ALL SUB-LEVELS</span>
            </button>

            ${activeSubcategories.map((sub) => {
              const isSubSelected = selectedSubcategoryFilter === sub.name;
              return `
                <button type="button"
                  class="hud-sub-chip ${isSubSelected ? 'active ring-1 ring-cyan-400' : ''}"
                  data-filter-subcategory="${escapeHtml(sub.name)}"
                  style="${isSubSelected ? 'background: rgba(6, 182, 212, 0.2); border-color: #06b6d4; color: #ffffff;' : ''}"
                  title="Filter to ${escapeHtml(sub.name)}">
                  <span class="truncate max-w-[120px]">${escapeHtml(sub.name)}</span>
                  <span class="font-mono text-[8px] opacity-75">(${sub.count})</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  ` : '';

  container.innerHTML = `
    <div class="bg-[#1e293b]/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md p-3 min-w-[270px] max-w-[320px] text-slate-100 flex flex-col gap-2.5 transition-all duration-200">
      <!-- Top Row: Badge & Map Name & Controls -->
      <div class="flex items-start justify-between gap-2 ${isHudCollapsed ? '' : 'border-b border-slate-700/70 pb-2'}">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ACTIVE MAP
          </div>
          <h3 class="text-sm font-bold text-white truncate" title="${escapeHtml(map.name)}">${escapeHtml(map.name)}</h3>
          <div class="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
            <span>${itemsCount} items</span>
            <span>•</span>
            <span>${escapeHtml(map.visibility || 'private')}</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button id="hud-my-maps-btn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-1 transition shadow-sm cursor-pointer" title="Open My Maps Directory">
            <span class="material-symbols-outlined text-sm">folder</span> My Maps
          </button>
          <button id="hud-toggle-collapse-btn" type="button" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 rounded-lg text-xs font-mono font-bold text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center transition shadow-sm cursor-pointer select-none" title="${isHudCollapsed ? 'Maximize module (+)' : 'Minimize module (-)'}" aria-label="${isHudCollapsed ? 'Maximize module' : 'Minimize module'}">
            <span class="font-mono text-xs font-bold leading-none">${isHudCollapsed ? '(+)' : '(-)'}</span>
          </button>
        </div>
      </div>

      ${!isHudCollapsed ? `
      <!-- Action Buttons matching video top-right menu -->
      <div class="grid grid-cols-2 gap-1.5 text-xs">
        <button id="hud-add-item-btn" class="col-span-2 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center justify-center gap-1 shadow transition">
          <span class="material-symbols-outlined text-base">add_location_alt</span> + Create Item / Shape
        </button>
        <button id="hud-tour-btn" class="col-span-2 py-1.5 px-2 ${isTouring ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white'} font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow transition">
          <span class="material-symbols-outlined text-base">${isTouring ? 'stop_circle' : 'flight_takeoff'}</span>
          ${isTouring ? 'Stop Map Tour' : 'Tour Active Map'}
        </button>
        <button id="hud-desc-btn" class="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center gap-1 transition">
          <span class="material-symbols-outlined text-sm">description</span> Description
        </button>
        <button id="hud-duplicate-btn" class="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center gap-1 transition">
          <span class="material-symbols-outlined text-sm">content_copy</span> Duplicate
        </button>
        <button id="hud-export-btn" class="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center gap-1 transition">
          <span class="material-symbols-outlined text-sm">download</span> Export
        </button>
        <button id="hud-combine-btn" class="py-1 px-2 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 rounded-lg flex items-center justify-center gap-1 transition">
          <span class="material-symbols-outlined text-sm">layers</span> Combine
        </button>
        <button id="hud-custom-tiles-btn" class="col-span-2 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-emerald-500/50 text-emerald-300 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition">
          <span class="material-symbols-outlined text-sm text-emerald-400">add_photo_alternate</span> Custom Map Tiles (XYZ/WMS)
        </button>
        <button id="hud-delete-btn" class="col-span-2 py-1 px-2 bg-rose-950/50 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg flex items-center justify-center gap-1 transition">
          <span class="material-symbols-outlined text-sm">delete</span> Delete Map
        </button>
      </div>

      <!-- Categories Show / Hide Filter Drawer -->
      ${categoryFiltersHtml}
      ` : ''}
    </div>
  `;

  // Bind actions
  container.querySelector('#hud-my-maps-btn')?.addEventListener('click', onOpenMyMaps);
  container.querySelector('#hud-toggle-collapse-btn')?.addEventListener('click', () => {
    isHudCollapsed = !isHudCollapsed;
    try {
      localStorage.setItem('godseye_active_map_hud_collapsed', isHudCollapsed ? 'true' : 'false');
    } catch (e) {}
    if (lastHudProps) {
      renderActiveMapHud(lastHudProps);
    }
  });
  container.querySelector('#hud-add-item-btn')?.addEventListener('click', onOpenCreateItem);
  container.querySelector('#hud-tour-btn')?.addEventListener('click', onStartTour);
  container.querySelector('#hud-desc-btn')?.addEventListener('click', onOpenDescription);
  container.querySelector('#hud-duplicate-btn')?.addEventListener('click', onDuplicate);
  container.querySelector('#hud-export-btn')?.addEventListener('click', onExport);
  container.querySelector('#hud-delete-btn')?.addEventListener('click', onDelete);
  container.querySelector('#hud-combine-btn')?.addEventListener('click', onCombine);
  container.querySelector('#hud-custom-tiles-btn')?.addEventListener('click', onOpenCustomTiles);

  // Category filter triggers
  container.querySelector('#hud-cat-show-all')?.addEventListener('click', () => {
    if (onShowAllCategories) onShowAllCategories();
  });
  container.querySelector('#hud-cat-hide-all')?.addEventListener('click', () => {
    if (onHideAllCategories) onHideAllCategories();
  });
  container.querySelector('#hud-fly-extent-btn')?.addEventListener('click', () => {
    if (onFlyToExtent) onFlyToExtent();
  });

  // Level 1 Category Chips Click (URL Intelligence Focus / Isolation)
  container.querySelectorAll('.hud-filter-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const catName = chip.getAttribute('data-filter-category');
      if (!catName) return;

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Multi-select toggle mode via shift-click
        if (onToggleCategory) {
          const isCurrentlyHidden = hiddenCategories.has(catName);
          onToggleCategory(catName, isCurrentlyHidden);
        }
      } else {
        // Primary Single-Click Focus Filter Mode (matching URL Intelligence)
        if (onSelectCategoryFilter) {
          onSelectCategoryFilter(catName);
        }
      }
    });
  });

  // Level 2 Subcategory Chips Click
  container.querySelectorAll('.hud-sub-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const subName = chip.getAttribute('data-filter-subcategory');
      if (!subName) return;
      if (onSelectSubcategoryFilter) {
        onSelectSubcategoryFilter(subName);
      }
    });
  });
}

/**
 * Shows the Description / Instructions modal for the active map (video 03:32-03:38).
 */
export function openMapDescriptionModal(map, items = [], onEditDetails) {
  let modalRoot = document.getElementById('map-description-modal-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'map-description-modal-root';
    document.body.appendChild(modalRoot);
  }

  // Handle optional parameter shift if items array is omitted
  let finalItems = items;
  let finalOnEditDetails = onEditDetails;
  if (typeof items === 'function') {
    finalOnEditDetails = items;
    finalItems = [];
  }

  // Group items by Category (Level 1) and Subcategory (Level 2)
  const grouped = {};
  if (Array.isArray(finalItems)) {
    finalItems.forEach((it) => {
      const l1 = it.category || 'Unassigned / General';
      const l2 = it.subcategory || 'General';
      if (!grouped[l1]) {
        grouped[l1] = {};
      }
      grouped[l1][l2] = (grouped[l1][l2] || 0) + 1;
    });
  }

  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-[10010] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in font-sans" id="map-desc-backdrop">
      <div class="relative w-full max-w-md bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 transition-all duration-300" id="map-desc-dialog">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-700 bg-slate-900/80 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-emerald-400">description</span>
            <h3 class="text-base font-bold text-white">Description &amp; Briefing</h3>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Normal / Maximize Segmented Control -->
            <div class="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
              <button type="button" id="map-desc-size-normal-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer bg-emerald-600 text-white" title="Normal Layout">
                <span class="material-symbols-outlined text-xs">picture_in_picture_alt</span> Normal
              </button>
              <button type="button" id="map-desc-size-max-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer text-slate-400 hover:text-white" title="Maximize Layout (Full Screen)">
                <span class="material-symbols-outlined text-xs">open_in_full</span> Maximize
              </button>
            </div>
            <!-- Close Button -->
            <button id="close-map-desc-btn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition flex items-center justify-center cursor-pointer" aria-label="Close dialog">
              <span class="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-4 text-sm flex-1 overflow-y-auto">
          <div>
            <h4 class="text-lg font-bold text-white">${escapeHtml(map.name)}</h4>
            <div class="text-xs text-slate-400 font-mono mt-0.5">Author: ${escapeHtml(map.author || 'admin')} • Code: ${escapeHtml(map.shortCode || 'N/A')}</div>
          </div>

          <div class="bg-slate-900/80 border border-slate-800 rounded-lg p-4 text-slate-200 text-xs leading-relaxed min-h-[80px]">
            ${escapeHtml(map.description || 'No detailed instructions provided for this map project.')}
          </div>

          <!-- Category Details (Level 1 & Level 2) -->
          <div class="space-y-2 border-t border-slate-800 pt-3">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-cyan-400">account_tree</span>
              Map Item Taxonomy &amp; Layer Counts
            </span>
            <div class="bg-slate-950/60 rounded-lg border border-slate-800 p-3 max-h-40 overflow-y-auto space-y-2.5 custom-scrollbar text-xs">
              ${Object.keys(grouped).length === 0 ? `
                <div class="text-slate-500 italic text-center py-2">No categorized items on this map.</div>
              ` : Object.entries(grouped).map(([l1, subMap]) => `
                <div class="space-y-1">
                  <!-- Level 1 Category -->
                  <div class="flex items-center justify-between font-semibold text-emerald-400 border-b border-slate-800/80 pb-0.5">
                    <span>${escapeHtml(l1)}</span>
                    <span class="text-[10px] font-mono bg-emerald-950 px-1.5 py-0.5 rounded text-emerald-300 font-bold">Level 1</span>
                  </div>
                  <!-- Level 2 Subcategories -->
                  <div class="pl-3 space-y-1">
                    ${Object.entries(subMap).map(([l2, count]) => `
                      <div class="flex items-center justify-between text-slate-300 font-mono text-[11px]">
                        <span class="flex items-center gap-1">
                          <span class="w-1 h-1 rounded-full bg-slate-500"></span>
                          ${escapeHtml(l2)}
                        </span>
                        <span class="text-sky-300 font-bold">${count} ${count === 1 ? 'item' : 'items'} <span class="text-[9px] text-slate-500 bg-slate-900 border border-slate-800 px-1 py-0.5 rounded ml-1 font-normal font-sans">Level 2</span></span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <button id="edit-map-desc-trigger" class="text-xs text-emerald-400 hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">edit</span> Edit Details
            </button>
          </div>
        </div>

        <div class="px-6 py-3 border-t border-slate-700 bg-slate-900/60 flex justify-end">
          <button id="ok-map-desc-btn" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition">
            OK
          </button>
        </div>
      </div>
    </div>
  `;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const closeDialog = () => {
    window.removeEventListener('keydown', onKeyDown);
    modalRoot.innerHTML = '';
  };
  modalRoot.querySelector('#close-map-desc-btn')?.addEventListener('click', closeDialog);
  modalRoot.querySelector('#ok-map-desc-btn')?.addEventListener('click', closeDialog);
  modalRoot.querySelector('#map-desc-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'map-desc-backdrop') closeDialog();
  });
  modalRoot.querySelector('#edit-map-desc-trigger')?.addEventListener('click', () => {
    closeDialog();
    if (finalOnEditDetails) finalOnEditDetails();
  });

  // Modal Sizing Controls
  const sizeNormalBtn = modalRoot.querySelector('#map-desc-size-normal-btn');
  const sizeMaxBtn = modalRoot.querySelector('#map-desc-size-max-btn');
  const modalDialog = modalRoot.querySelector('#map-desc-dialog');
  const backdropEl = modalRoot.querySelector('#map-desc-backdrop');

  function setModalSize(maximized) {
    if (maximized) {
      modalDialog.classList.remove('max-w-md', 'rounded-xl');
      modalDialog.classList.add('w-screen', 'h-screen', 'max-w-none', 'rounded-none');
      backdropEl.classList.remove('p-4');
      
      sizeMaxBtn.classList.add('bg-emerald-600', 'text-white');
      sizeMaxBtn.classList.remove('text-slate-400', 'hover:text-white');
      sizeNormalBtn.classList.remove('bg-emerald-600', 'text-white');
      sizeNormalBtn.classList.add('text-slate-400', 'hover:text-white');
    } else {
      modalDialog.classList.remove('w-screen', 'h-screen', 'max-w-none', 'rounded-none');
      modalDialog.classList.add('max-w-md', 'rounded-xl', 'w-full');
      backdropEl.classList.add('p-4');
      
      sizeNormalBtn.classList.add('bg-emerald-600', 'text-white');
      sizeNormalBtn.classList.remove('text-slate-400', 'hover:text-white');
      sizeMaxBtn.classList.remove('bg-emerald-600', 'text-white');
      sizeMaxBtn.classList.add('text-slate-400', 'hover:text-white');
    }
  }

  sizeNormalBtn?.addEventListener('click', () => setModalSize(false));
  sizeMaxBtn?.addEventListener('click', () => setModalSize(true));
}

/**
 * Renders an in-canvas Intelligence Callout Card for any geometry item
 * (Point of Interest, Polyline / Road, Polygon / Perimeter Zone)
 * displaying: Name, Description, Tactical Icon, Color Palette, Center, Edit, and Delete.
 */
export function showItemCalloutCard({ screenPosition, item, onColorChange, onEdit, onDelete, onFlyTo }) {
  let card = document.getElementById('in-canvas-poi-callout');
  if (!card) {
    card = document.createElement('div');
    card.id = 'in-canvas-poi-callout';
    card.className = 'fixed z-[9500] bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl p-4 min-w-[280px] max-w-[340px] font-sans text-slate-100 animate-fade-in pointer-events-auto';
    document.body.appendChild(card);
  }

  // Determine tactical icon & badge based on item type
  let defaultIcon = 'pin_drop';
  let typeLabel = 'POINT OF INTEREST (POI)';
  if (item.type === 'polyline') {
    defaultIcon = 'timeline';
    typeLabel = 'POLYLINE / ROAD';
  } else if (item.type === 'polygon') {
    defaultIcon = 'crop_square';
    typeLabel = 'POLYGON / PERIMETER ZONE';
  }

  const iconName = item.icon || defaultIcon;
  const itemColor = item.color || '#10b981';

  // Extract / resolve live Geodetic Telemetry metrics
  const metrics = item.geodeticMetrics || extractGeodeticMetrics(item.coordinates, item.measurementType || item.type);
  let telemetryHtml = '';
  if (metrics && metrics.measurementType) {
    if (metrics.measurementType === 'bearing') {
      telemetryHtml = `
        <div class="mb-2.5 p-2 rounded-lg bg-[#0b1329]/95 border border-cyan-500/40 text-[11px] font-mono shadow-inner">
          <div class="flex items-center justify-between text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
            <span class="flex items-center gap-1">🧭 COMPASS BEARING &amp; AZIMUTH</span>
            <span class="text-slate-400 font-semibold">${metrics.pointCount} pts</span>
          </div>
          <div class="text-sm font-black text-cyan-300 font-mono tracking-tight">${metrics.forwardFormatted || `${metrics.forwardBearingDeg}° ${metrics.forwardCardinal}`}</div>
          <div class="text-[10px] text-slate-300 mt-0.5 truncate">Back: <span class="text-amber-300 font-semibold">${metrics.reciprocalFormatted || `${metrics.backAzimuthDeg}°`}</span> · Range: <span class="text-emerald-300 font-semibold">${metrics.rangeFormatted}</span></div>
          ${metrics.targetMgrs ? `<div class="text-[9px] text-slate-400 mt-1 flex items-center justify-between border-t border-slate-800/80 pt-1"><span class="text-cyan-300 font-bold">MGRS</span><span class="text-white">${metrics.targetMgrs}</span></div>` : ''}
        </div>
      `;
    } else if (metrics.measurementType === 'elevation') {
      telemetryHtml = `
        <div class="mb-2.5 p-2 rounded-lg bg-[#0b1329]/95 border border-emerald-500/40 text-[11px] font-mono shadow-inner">
          <div class="flex items-center justify-between text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
            <span class="flex items-center gap-1">⛰️ ELEVATION &amp; SLOPE PROFILE</span>
            <span class="text-slate-400 font-semibold">${metrics.pointCount} pts</span>
          </div>
          <div class="text-sm font-black text-emerald-300 font-mono tracking-tight">${metrics.deltaFormatted || `Δh ${metrics.deltaM} m`}</div>
          <div class="text-[10px] text-slate-300 mt-0.5 truncate">${metrics.basePeakFormatted || `Base: ${metrics.baseAltitudeM}m ➔ Peak: ${metrics.peakAltitudeM}m`}</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">${metrics.slopeFormatted || `Slope: ${metrics.slopePct}%`} · Slant: ${metrics.slantDistKm >= 1 ? `${metrics.slantDistKm} km` : `${metrics.slantDistM} m`}</div>
          ${metrics.peakMgrs ? `<div class="text-[9px] text-slate-400 mt-1 flex items-center justify-between border-t border-slate-800/80 pt-1"><span class="text-emerald-300 font-bold">SUMMIT MGRS</span><span class="text-white">${metrics.peakMgrs}</span></div>` : ''}
        </div>
      `;
    } else if (metrics.measurementType === 'area') {
      telemetryHtml = `
        <div class="mb-2.5 p-2 rounded-lg bg-[#0b1329]/95 border border-cyan-500/40 text-[11px] font-mono shadow-inner">
          <div class="flex items-center justify-between text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
            <span class="flex items-center gap-1">⬡ ENCLOSED SURFACE AREA</span>
            <span class="text-slate-400 font-semibold">${metrics.pointCount} pts</span>
          </div>
          <div class="text-sm font-black text-cyan-300 font-mono tracking-tight">${metrics.areaFormatted || `${metrics.areaHectares} ha`}</div>
          <div class="text-[10px] text-slate-300 mt-0.5 truncate">Perimeter: <span class="text-white font-semibold">${metrics.perimeterFormatted || `${metrics.perimeterMeters} m`}</span></div>
          ${metrics.centroidMgrs ? `<div class="text-[9px] text-slate-400 mt-1 flex items-center justify-between border-t border-slate-800/80 pt-1"><span class="text-cyan-300 font-bold">CENTROID MGRS</span><span class="text-white">${metrics.centroidMgrs}</span></div>` : ''}
        </div>
      `;
    } else if (metrics.measurementType === 'distance' && metrics.totalMeters > 0) {
      telemetryHtml = `
        <div class="mb-2.5 p-2 rounded-lg bg-[#0b1329]/95 border border-amber-500/40 text-[11px] font-mono shadow-inner">
          <div class="flex items-center justify-between text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-1">
            <span class="flex items-center gap-1">📏 TOTAL GEODESIC DISTANCE</span>
            <span class="text-slate-400 font-semibold">${metrics.pointCount} pts</span>
          </div>
          <div class="text-sm font-black text-amber-300 font-mono tracking-tight">${metrics.distanceFormatted || `${metrics.totalMeters} m`}</div>
          <div class="text-[10px] text-slate-300 mt-0.5 truncate">Nautical: <span class="text-white font-semibold">${metrics.totalNm} NM</span> · ${metrics.pointCount} Waypoints</div>
          ${metrics.terminusMgrs ? `<div class="text-[9px] text-slate-400 mt-1 flex items-center justify-between border-t border-slate-800/80 pt-1"><span class="text-amber-300 font-bold">TERMINUS MGRS</span><span class="text-white">${metrics.terminusMgrs}</span></div>` : ''}
        </div>
      `;
    }
  }

  let parsedCoords = [];
  if (item.coordinates) {
    try {
      parsedCoords = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
      if (!telemetryHtml && Array.isArray(parsedCoords) && parsedCoords.length > 0) {
        const pt = parsedCoords[0];
        if (pt && pt.lat != null && pt.lng != null) {
          const mgrsStr = formatMgrsSpaced(toMgrsString(pt.lat, pt.lng, 5));
          telemetryHtml = `
            <div class="mb-2.5 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] font-mono flex items-center justify-between">
              <span class="text-amber-300 font-bold flex items-center gap-1"><span class="material-symbols-outlined text-xs">grid_4x4</span> MGRS</span>
              <span class="text-white font-semibold">${mgrsStr}</span>
            </div>
          `;
        }
      }
    } catch (_) {}
  }

  const displayDesc = item.description || (metrics && metrics.summary ? metrics.summary : 'No description provided.');

  // Parse User Data for Rich Visual Overlay Popups
  let userData = null;
  if (item.userData) {
    try {
      userData = typeof item.userData === 'string' ? JSON.parse(item.userData) : item.userData;
    } catch (_e) {
      userData = item.userData;
    }
  }

  let userDataHtml = '';
  if (userData && (userData.text?.trim() || userData.videoUrl?.trim() || userData.audioUrl?.trim() || (userData.calls && userData.calls.length > 0))) {
    let textHtml = '';
    if (userData.text?.trim()) {
      let formatted = escapeHtml(userData.text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
        .replace(/\n- (.*?)/g, '<br>• $1');
      textHtml = `
        <div class="text-[11px] text-slate-300 bg-slate-900/40 p-2 rounded border border-slate-800/80 leading-relaxed font-sans whitespace-pre-line">
          ${formatted}
        </div>
      `;
    }

    let videoHtml = '';
    if (userData.videoUrl?.trim()) {
      const ytUrl = getYoutubeEmbedUrl(userData.videoUrl);
      if (ytUrl) {
        videoHtml = `
          <div class="rounded overflow-hidden border border-slate-800 bg-black aspect-video max-h-[140px] my-1 relative">
            <iframe src="${ytUrl}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>
        `;
      } else {
        videoHtml = `
          <div class="rounded overflow-hidden border border-slate-800 bg-black aspect-video max-h-[140px] my-1 relative">
            <video src="${escapeHtml(userData.videoUrl)}" controls class="w-full h-full object-cover"></video>
          </div>
        `;
      }
    }

    let audioHtml = '';
    if (userData.audioUrl?.trim()) {
      const ytUrl = getYoutubeEmbedUrl(userData.audioUrl);
      if (ytUrl) {
        audioHtml = `
          <div class="rounded border border-slate-800 bg-slate-900/95 p-2 my-1 space-y-1">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-amber-400 text-xs animate-pulse">waves</span>
              <span class="text-[9px] text-slate-400 font-mono truncate flex-1">YouTube Audio Track</span>
            </div>
            <div class="rounded overflow-hidden border border-slate-800 bg-black h-20 relative">
              <iframe src="${ytUrl}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>
        `;
      } else {
        audioHtml = `
          <div class="rounded border border-slate-800 bg-slate-900/95 p-2 my-1 space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-amber-400 text-xs animate-pulse">waves</span>
              <span class="text-[9px] text-slate-400 font-mono truncate flex-1">${escapeHtml(userData.audioUrl.substring(userData.audioUrl.lastIndexOf('/') + 1) || 'Audio Feed')}</span>
            </div>
            <audio src="${escapeHtml(userData.audioUrl)}" controls class="w-full h-8"></audio>
          </div>
        `;
      }
    }

    let callsHtml = '';
    if (userData.calls && userData.calls.length > 0) {
      const cards = userData.calls.map(call => {
        if (call.source === 'local') {
          if (call.field === 'coords') {
            const coordsToDisplay = parsedCoords.length > 0 ? parsedCoords : [{ lat: Number(item.latitude) || 14.5995, lng: Number(item.longitude) || 120.9842 }];
            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 space-y-0.5 animate-fade-in">
                <span class="font-bold text-emerald-400 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[10px]">explore</span> 
                  Coordinates:
                  ${parsedCoords.length === 0 ? '<span class="text-[8px] bg-amber-950 text-amber-400 px-1 rounded scale-90">DEFAULT</span>' : ''}
                </span>
                <div class="font-mono text-[9px] bg-slate-950/60 p-1 rounded border border-slate-900/60 leading-normal">${coordsToDisplay.map((c, i) => {
                  const latVal = c && c.lat !== undefined ? Number(c.lat) : 0;
                  const lngVal = c && c.lng !== undefined ? Number(c.lng) : 0;
                  return `#${i+1}: ${latVal.toFixed(4)}°, ${lngVal.toFixed(4)}°`;
                }).join(' | ')}</div>
              </div>
            `;
          } else if (call.field === 'telemetry') {
            const metricsSummary = metrics?.summary || `Point checkpoint at ${(Number(item.latitude) || 14.5995).toFixed(5)}°, ${(Number(item.longitude) || 120.9842).toFixed(5)}° WGS84 with active geodetic tracking.`;
            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 space-y-0.5 animate-fade-in">
                <span class="font-bold text-cyan-400 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[10px]">straighten</span> 
                  Telemetry:
                  ${!metrics?.summary ? '<span class="text-[8px] bg-cyan-950 text-cyan-400 px-1 rounded scale-90">AUTO</span>' : ''}
                </span>
                <div class="font-mono text-[9px] leading-relaxed bg-slate-950/60 p-1 rounded border border-slate-900/60 italic">${escapeHtml(metricsSummary)}</div>
              </div>
            `;
          } else if (call.field === 'attachments') {
            const hasImage = !!item.imageUrl;
            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 space-y-1 animate-fade-in">
                <span class="font-bold text-slate-300 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[10px]">attach_file</span> 
                  Attachments:
                </span>
                ${hasImage ? `
                  <div class="flex items-center gap-2 bg-slate-950/60 p-1 rounded border border-slate-900/40">
                    <img src="${escapeHtml(item.imageUrl)}" class="w-6 h-6 rounded object-cover border border-slate-700" />
                    <a href="${escapeHtml(item.imageUrl)}" target="_blank" class="text-emerald-400 hover:underline truncate text-[9px] max-w-[150px]">${escapeHtml(item.imageUrl)}</a>
                  </div>
                ` : `
                  <div class="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-lg border border-slate-900/40">
                    <div class="relative w-6 h-6 rounded-full border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-center overflow-hidden shrink-0">
                      <div class="absolute inset-0 border-t border-emerald-500/70 rounded-full animate-spin"></div>
                      <span class="material-symbols-outlined text-emerald-400 text-[9px]">radar</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-[8px] text-emerald-400 font-bold leading-none">TARGET RADAR</div>
                      <div class="text-[7px] text-slate-500 truncate leading-none">Scanning grid sweep...</div>
                    </div>
                  </div>
                `}
              </div>
            `;
          } else if (call.field === 'details') {
            const cat = item.category || 'Tactical Entity';
            const subcat = item.subcategory || 'Unclassified Landmark';
            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[10px] text-slate-300 space-y-1 animate-fade-in">
                <span class="font-bold text-sky-400 flex items-center gap-1">
                  <span class="material-symbols-outlined text-[10px]">badge</span> 
                  Taxonomy:
                </span>
                <div class="flex flex-wrap gap-1">
                  <span class="px-1 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-semibold border border-emerald-900/30 text-[8px] font-mono leading-none">
                    ${escapeHtml(cat)}
                  </span>
                  <span class="px-1 py-0.5 rounded bg-sky-950/80 text-sky-400 font-semibold border border-sky-900/30 text-[8px] font-mono leading-none">
                    ${escapeHtml(subcat)}
                  </span>
                </div>
              </div>
            `;
          }
        } else if (call.source === 'neighbor') {
          const list = window.__mapProjectManager?.items || [];
          const neighbor = list.find(it => it.id === call.itemId);
          if (neighbor) {
            let neighborCoords = [];
            try {
              neighborCoords = typeof neighbor.coordinates === 'string' ? JSON.parse(neighbor.coordinates) : neighbor.coordinates;
            } catch (_e) {}

            const pt1 = parsedCoords[0] || { lat: Number(item.latitude) || 14.5995, lng: Number(item.longitude) || 120.9842 };
            const pt2 = neighborCoords[0] || pt1;

            let distanceString = '0.00 km';
            if (typeof haversineDistanceMeters === 'function') {
              const meters = haversineDistanceMeters(pt1, pt2);
              distanceString = meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
            }

            const neighborAlt = neighbor.extrudedHeight ? `${neighbor.extrudedHeight}m MSL` : 'SFC';
            const neighborL3 = neighbor.level3 || neighbor.subcategory || 'General';

            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 space-y-1 animate-fade-in">
                <div class="flex items-center justify-between font-bold">
                  <span class="text-amber-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[11px]">link</span>
                    [LINKED] ${escapeHtml(neighbor.name || 'Checkpoint')}
                  </span>
                  <span class="text-cyan-400 font-mono text-[9px]">${distanceString}</span>
                </div>
                <div class="grid grid-cols-2 gap-1 text-[8px] font-mono bg-slate-950/60 p-1.5 rounded border border-slate-900/60 mt-1">
                  <div>Alt: <span class="text-slate-300 font-semibold">${neighborAlt}</span></div>
                  <div class="truncate">Class: <span class="text-slate-300 font-semibold">${escapeHtml(neighborL3)}</span></div>
                </div>
              </div>
            `;
          } else {
            return `
              <div class="p-2 bg-slate-900/90 rounded-lg border border-rose-950 text-[10px] text-rose-400 flex items-center gap-1">
                <span class="material-symbols-outlined text-xs">error</span>
                Linked neighbor item not found
              </div>
            `;
          }
        }
        return '';
      }).filter(Boolean).join('');
      if (cards) {
        callsHtml = `<div class="space-y-1 mt-1">${cards}</div>`;
      }
    }

    userDataHtml = `
      <div class="border-t border-slate-800/90 pt-2 pb-1.5 text-xs">
        <div class="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1.5">
          <span class="material-symbols-outlined text-xs">database</span>
          User Data Panel
        </div>
        <div class="space-y-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 max-h-[160px] overflow-y-auto">
          ${textHtml}
          ${videoHtml}
          ${audioHtml}
          ${callsHtml}
        </div>
      </div>
    `;
  }

  const customIconUrl = item.customIconUrl || getCustomIconForPreset(item.level3, item.category, itemColor);
  const domainAccent = itemColor || getDomainColor(item.category);

  const iconDisplayHtml = customIconUrl
    ? `
      <div class="w-9 h-9 rounded-full flex items-center justify-center p-0.5 bg-slate-900 shadow-md flex-shrink-0" style="border: 2px solid ${domainAccent};">
        <img src="${escapeHtml(customIconUrl)}" class="w-full h-full object-contain rounded-full" alt="Icon" />
      </div>
    `
    : `<span id="callout-tactical-icon" class="material-symbols-outlined text-2xl transition-colors" style="color: ${itemColor};">${iconName}</span>`;

  card.innerHTML = `
    <div class="relative">
      <button id="close-poi-card-btn" class="absolute -top-1 -right-1 text-slate-400 hover:text-white p-1" aria-label="Close callout">
        <span class="material-symbols-outlined text-base">close</span>
      </button>

      <!-- Tactical Icon & Item Name -->
      <div class="flex items-center gap-2 mb-2 pr-6">
        ${iconDisplayHtml}
        <div class="min-w-0 flex-1">
          <h4 id="callout-item-name" class="font-bold text-sm text-white truncate" title="${escapeHtml(item.name || 'Untitled Item')}">${escapeHtml(item.name || 'Untitled Item')}</h4>
          <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span class="text-[10px] font-mono text-emerald-400 tracking-wider">${typeLabel}</span>
            ${item.category ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-semibold truncate max-w-[120px]">${escapeHtml(item.category)}</span>` : ''}
            ${item.subcategory ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-700/80 text-sky-300 font-medium truncate max-w-[110px]">${escapeHtml(item.subcategory)}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Live Geodetic Telemetry Badge Card -->
      ${telemetryHtml}

      ${item.imageUrl && /^(https?:\/\/|data:image\/)/i.test(item.imageUrl) ? `
        <div class="w-full h-32 bg-black rounded-lg overflow-hidden border border-slate-800 mb-2.5 flex items-center justify-center">
          <img src="${escapeHtml(item.imageUrl)}" alt="Attached intelligence" class="w-full h-full object-cover" />
        </div>
      ` : ''}

      <!-- Description -->
      <div class="text-xs text-slate-300 mb-2.5 max-h-[100px] overflow-y-auto leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 font-mono whitespace-pre-line custom-scrollbar">
        ${escapeHtml(displayDesc)}
      </div>

      <!-- Saved User Data Section -->
      ${userDataHtml}

      <!-- Color Palette (Minimized with Hover Tooltip Popover) -->
      <div class="border-t border-slate-800/90 pt-2 pb-1.5 flex items-center justify-between">
        <span class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
          <span class="material-symbols-outlined text-xs text-slate-400">palette</span>
          Color Active
        </span>
        
        <!-- Interactive swatches tooltip trigger -->
        <div class="relative group inline-block">
          <button type="button" class="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 flex items-center gap-1.5 transition cursor-pointer" title="Hover to select a new tactical color">
            <span id="callout-swatch-indicator" class="inline-block w-2.5 h-2.5 rounded-full border border-white/40" style="background-color: ${itemColor};"></span>
            <span id="callout-hex-indicator" class="text-[10px] font-mono text-slate-400">${itemColor}</span>
            <span class="material-symbols-outlined text-xs text-slate-500">expand_less</span>
          </button>
          
          <!-- Tooltip Popover (displayed on hover of trigger group) -->
          <div class="absolute bottom-full right-0 mb-2.5 hidden group-hover:block z-[9999] bg-slate-950 border border-slate-800 p-2.5 rounded-xl shadow-2xl animate-fade-in w-[172px]">
            <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center flex items-center justify-center gap-1">
              <span class="material-symbols-outlined text-[10px] text-amber-400">palette</span> Change Color
            </div>
            <div class="grid grid-cols-4 gap-1.5 justify-items-center">
              ${SWATCH_COLORS.map(
                (c) => `
                <button type="button" class="callout-color-btn w-6 h-6 rounded transition hover:scale-125 border border-black/30 shadow cursor-pointer ${c.toLowerCase() === itemColor.toLowerCase() ? 'ring-2 ring-white scale-110' : 'opacity-85 hover:opacity-100'}" style="background-color: ${c};" data-color="${c}" title="${c}"></button>
              `
              ).join('')}
            </div>
            <!-- Popover downward triangle pointer -->
            <div class="absolute top-full right-6 -mt-1.5 border-4 border-transparent border-t-slate-950"></div>
          </div>
        </div>
      </div>

      <!-- Author & Metadata -->
      <div class="text-[10px] text-slate-500 border-t border-slate-800 pt-2 mb-2.5 flex items-center justify-between">
        <span>Added by <strong class="text-slate-300">${escapeHtml(item.author || 'admin')}</strong></span>
        <span class="font-mono text-slate-400 text-[9px]">${item.type.toUpperCase()}</span>
      </div>

      <!-- Bottom Action Row: Center, Edit, Delete -->
      <div class="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs">
        <button id="flyto-poi-btn" class="text-slate-300 hover:text-white flex items-center gap-1 font-medium transition">
          <span class="material-symbols-outlined text-sm text-sky-400">my_location</span> Center
        </button>
        <div class="flex items-center gap-3">
          <button id="edit-poi-btn" class="text-emerald-400 hover:underline flex items-center gap-1 font-semibold transition">
            <span class="material-symbols-outlined text-sm">edit</span> Edit
          </button>
          <button id="delete-poi-btn" class="text-rose-400 hover:underline flex items-center gap-1 font-semibold transition">
            <span class="material-symbols-outlined text-sm">delete</span> Delete
          </button>
        </div>
      </div>
    </div>
  `;

  // Position near screen position
  if (screenPosition) {
    const cardWidth = 300;
    const cardHeight = item.imageUrl ? 320 : 220;
    let left = screenPosition.x - cardWidth / 2;
    let top = screenPosition.y - cardHeight - 20;

    // Viewport clamps
    left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, left));
    top = Math.max(16, Math.min(window.innerHeight - cardHeight - 16, top));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  } else {
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  // Handlers
  card.querySelector('#close-poi-card-btn')?.addEventListener('click', () => card.remove());
  card.querySelector('#flyto-poi-btn')?.addEventListener('click', () => {
    if (onFlyTo) onFlyTo();
  });
  card.querySelector('#edit-poi-btn')?.addEventListener('click', () => {
    card.remove();
    if (onEdit) onEdit();
  });
  card.querySelector('#delete-poi-btn')?.addEventListener('click', () => {
    card.remove();
    if (onDelete) onDelete();
  });

  // Color Palette swatch buttons
  card.querySelectorAll('.callout-color-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newColor = btn.getAttribute('data-color');
      if (!newColor) return;

      try {
        btn.disabled = true;

        // Update local card UI state
        card.querySelectorAll('.callout-color-btn').forEach((b) => {
          b.classList.remove('ring-2', 'ring-white', 'scale-110');
        });
        btn.classList.add('ring-2', 'ring-white', 'scale-110');

        const tacticalIcon = card.querySelector('#callout-tactical-icon');
        if (tacticalIcon) tacticalIcon.style.color = newColor;

        const swatchIndicator = card.querySelector('#callout-swatch-indicator');
        if (swatchIndicator) swatchIndicator.style.backgroundColor = newColor;

        const hexIndicator = card.querySelector('#callout-hex-indicator');
        if (hexIndicator) hexIndicator.textContent = newColor;

        // Notify caller to update item in store and Cesium globe
        if (onColorChange) {
          await onColorChange(newColor);
        }
      } catch (error) {
        console.error('POI Callout color update failed gracefully:', error);
        showNonBlockingNotification('Unable to sync color update with cloud store.', 'warning');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// Backwards compatibility alias
export const showPoiCalloutCard = showItemCalloutCard;

export function hidePoiCalloutCard() {
  const card = document.getElementById('in-canvas-poi-callout');
  if (card) card.remove();
}

/**
 * Disposes active map HUD overlays, callouts, and modals to avoid memory leaks.
 */
export function disposeActiveMapHud() {
  const container = document.getElementById('active-map-hud-container');
  if (container) container.remove();
  hidePoiCalloutCard();
  const descRoot = document.getElementById('map-description-modal-root');
  if (descRoot) descRoot.remove();
  lastHudProps = null;
}

/**
 * Shows non-blocking auto-dismissing toast notification.
 */
export function showNonBlockingNotification(message, type = 'info') {
  let toastContainer = document.getElementById('gev-nonblocking-toast-root');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'gev-nonblocking-toast-root';
    toastContainer.className = 'fixed bottom-5 right-5 z-[100060] flex flex-col gap-2 pointer-events-none font-sans';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const borderCol = type === 'warning' ? 'border-amber-500/70 text-amber-200' : type === 'error' ? 'border-rose-500/70 text-rose-200' : 'border-emerald-500/70 text-emerald-200';
  const icon = type === 'warning' ? 'warning' : type === 'error' ? 'error' : 'info';

  toast.className = `pointer-events-auto flex items-center gap-2 px-3.5 py-2.5 bg-slate-900/95 border ${borderCol} rounded-xl shadow-2xl text-xs backdrop-blur-md animate-fade-in transition-all duration-300 select-none`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-sm flex-shrink-0">${icon}</span>
    <span class="leading-tight">${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Creates custom crisp HTML divIcon for 2D Leaflet rendering with domain accent ring.
 * Checks for customIconUrl or preset icon and encloses in a 2px domain accent border ring.
 */
export function createTacticalLeafletIcon(item, LInstance) {
  if (!LInstance) return null;
  const domainColor = item.color || getDomainColor(item.category) || '#3b82f6';
  const iconUrl = item.customIconUrl || getCustomIconForPreset(item.level3, item.category, item.color);
  const iconHtml = iconUrl
    ? `<img src="${iconUrl}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 50%;" />`
    : `<span class="material-symbols-outlined" style="color: #ffffff; font-size: 16px;">${item.icon || 'pin_drop'}</span>`;

  return LInstance.divIcon({
    className: 'custom-leaflet-tactical-icon',
    html: `
      <div style="
        background: #0f172a;
        border: 2px solid ${domainColor};
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px ${domainColor}88, 0 4px 6px rgba(0,0,0,0.5);
      ">
        ${iconHtml}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
