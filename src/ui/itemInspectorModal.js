/**
 * @module src/ui/itemInspectorModal.js
 * 4-Tab Spatial Item Inspector Modal (General, Coordinates, Attachments, Details)
 * with rich formatting, direct image upload/drag-and-drop, geocoding, and color swatches.
 *
 * Build Timestamp: 2026-09-25T01:26:00-07:00 (UTC 2026-09-25T08:26:00Z)
 */

import L from 'leaflet';

if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head?.appendChild(link);
}
import { 
  getAvailableCategories, 
  registerCustomCategory, 
  registerCustomClassification,
  getCategoryColor, 
  getLevel1Options,
  getLevel2Options,
  getLevel3Presets,
  getDomainColor,
  getDomainIcon,
  getCustomIconForPreset,
} from '../data/itemCategories.js';
import {
  extractGeodeticMetrics,
  generateGeodeticDescription,
  normalizeItemCoordinates,
} from '../tools/geodeticItemExtractor.js';
import { toMgrsString, formatMgrsSpaced } from '../tools/mgrsHelper.js';
import { getMapProjectManager } from './mapProjectManager.js';
import { openConfirmModal, openAlertModal } from './confirmModal.js';
import { haversineDistanceMeters } from '../tools/geodesicMath.js';
import { getTacticalHoverHtml } from './tacticalHoverTooltip.js';
import { openTaxonomyImportExportModal } from './taxonomyImportExportModal.js';

// 16 Tactical / Visual Palette Colors matching the video
export const SWATCH_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#eab308',
  '#16a34a', '#059669', '#0d9488', '#0284c7',
  '#2563eb', '#4f46e5', '#7c3aed', '#9333ea',
  '#c026d3', '#db2777', '#475569', '#1e293b',
];

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}?autoplay=0&enablejsapi=1`;
  }
  return null;
}

export const PRESET_ICONS = [
  { id: 'pin_drop', label: 'Pin Drop' },
  { id: 'flag', label: 'Checkpoint' },
  { id: 'radar', label: 'Radar Station' },
  { id: 'shield', label: 'Defense Zone' },
  { id: 'visibility', label: 'Surveillance / POI' },
  { id: 'directions_boat', label: 'Harbor / Vessel' },
  { id: 'flight', label: 'Airfield / Heli' },
  { id: 'warning', label: 'Hazard Area' },
  { id: 'camera_alt', label: 'CCTV / Recon' },
  { id: 'location_city', label: 'Building / Facility' },
  { id: 'anchor', label: 'Anchorage' },
  { id: 'star', label: 'HQ / High Value' },
];

export function getRecommendedIcons(level2Text, level3Text) {
  const l2 = (level2Text || '').toLowerCase();
  const l3 = (level3Text || '').toLowerCase();

  const ICON_TAGS = {
    'pin_drop': ['pin', 'drop', 'point', 'marker', 'general', 'location', 'landmark', 'place'],
    'flag': ['checkpoint', 'gate', 'border', 'sentry', 'security', 'post', 'watch', 'fob'],
    'radar': ['radar', 'station', 'early warning', 'airspace', 'tower', 'antenna', 'telecommunications', 'microwave', 'satellite', 'cell'],
    'shield': ['defense', 'fort', 'bunker', 'zone', 'restricted', 'military', 'operations', 'hq', 'command', 'c2', 'security', 'exclusion'],
    'visibility': ['surveillance', 'poi', 'early warning', 'watch', 'lookout', 'obs', 'observation', 'sigint', 'recon'],
    'directions_boat': ['harbor', 'vessel', 'maritime', 'dock', 'pier', 'wharf', 'port', 'anchorage', 'fishing', 'coast guard', 'lighthouse', 'beacon', 'submarine'],
    'flight': ['flight', 'airfield', 'heli', 'runway', 'taxiway', 'aircraft', 'fighter', 'hangar', 'airport'],
    'warning': ['hazard', 'area', 'danger', 'minefield', 'spillway', 'volcano', 'storm', 'surge', 'risk', 'seismic', 'fault', 'flood'],
    'camera_alt': ['cctv', 'recon', 'surveillance', 'camera', 'drone', 'security', 'video'],
    'location_city': ['building', 'facility', 'capitol', 'government', 'bureau', 'hospital', 'data center', 'noc', 'office', 'cbd', 'hub', 'mall'],
    'anchor': ['anchorage', 'mooring', 'maritime', 'port', 'dock', 'boat', 'vessel', 'submerged', 'wreck', 'shoal'],
    'star': ['hq', 'high value', 'command', 'c2', 'joc', 'toc', 'capitol', 'executive', 'scif'],
  };

  const scores = {};
  for (const [iconId, tags] of Object.entries(ICON_TAGS)) {
    let score = 0;
    tags.forEach(tag => {
      if (l2.includes(tag)) score += 3;
      if (l3.includes(tag)) score += 5;
    });
    scores[iconId] = score;
  }

  return [...PRESET_ICONS].sort((a, b) => {
    const scoreA = scores[a.id] || 0;
    const scoreB = scores[b.id] || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return PRESET_ICONS.indexOf(a) - PRESET_ICONS.indexOf(b);
  });
}

export function getRecommendedIconScore(iconId, level2Text, level3Text) {
  const l2 = (level2Text || '').toLowerCase();
  const l3 = (level3Text || '').toLowerCase();

  const ICON_TAGS = {
    'pin_drop': ['pin', 'drop', 'point', 'marker', 'general', 'location', 'landmark', 'place'],
    'flag': ['checkpoint', 'gate', 'border', 'sentry', 'security', 'post', 'watch', 'fob'],
    'radar': ['radar', 'station', 'early warning', 'airspace', 'tower', 'antenna', 'telecommunications', 'microwave', 'satellite', 'cell'],
    'shield': ['defense', 'fort', 'bunker', 'zone', 'restricted', 'military', 'operations', 'hq', 'command', 'c2', 'security', 'exclusion'],
    'visibility': ['surveillance', 'poi', 'early warning', 'watch', 'lookout', 'obs', 'observation', 'sigint', 'recon'],
    'directions_boat': ['harbor', 'vessel', 'maritime', 'dock', 'pier', 'wharf', 'port', 'anchorage', 'fishing', 'coast guard', 'lighthouse', 'beacon', 'submarine'],
    'flight': ['flight', 'airfield', 'heli', 'runway', 'taxiway', 'aircraft', 'fighter', 'hangar', 'airport'],
    'warning': ['hazard', 'area', 'danger', 'minefield', 'spillway', 'volcano', 'storm', 'surge', 'risk', 'seismic', 'fault', 'flood'],
    'camera_alt': ['cctv', 'recon', 'surveillance', 'camera', 'drone', 'security', 'video'],
    'location_city': ['building', 'facility', 'capitol', 'government', 'bureau', 'hospital', 'data center', 'noc', 'office', 'cbd', 'hub', 'mall'],
    'anchor': ['anchorage', 'mooring', 'maritime', 'port', 'dock', 'boat', 'vessel', 'submerged', 'wreck', 'shoal'],
    'star': ['hq', 'high value', 'command', 'c2', 'joc', 'toc', 'capitol', 'executive', 'scif'],
  };

  const tags = ICON_TAGS[iconId] || [];
  let score = 0;
  tags.forEach(tag => {
    if (l2.includes(tag)) score += 3;
    if (l3.includes(tag)) score += 5;
  });
  return score;
}

/**
 * Creates and renders the 4-tab Item Inspector Modal.
 */
export function openItemInspectorModal({ item, mapId, onSave, onDelete, onFlyTo, mapProjectManager, viewer }) {
  const isNew = !item?.id;
  const itemData = {
    id: item?.id || '',
    mapId: mapId || '',
    name: item?.name || (item?.type === 'marker' ? 'point of interest' : item?.type === 'polyline' ? 'polyline' : 'polygon'),
    type: item?.type || 'marker',
    description: item?.description || '',
    icon: item?.icon || 'pin_drop',
    color: item?.color || (item?.type === 'marker' ? '#dc2626' : item?.type === 'polyline' ? '#7c3aed' : '#2563eb'),
    fillColor: item?.fillColor || '#2563eb',
    fillOpacity: typeof item?.fillOpacity === 'number' ? item?.fillOpacity : 0.45,
    imageUrl: item?.imageUrl || '',
    author: item?.author || 'admin',
    authorUid: item?.authorUid || 'admin_local',
    category: item?.category || 'Tactical & Defense',
    subcategory: item?.subcategory || 'Command & Control (C2)',
    level3: item?.level3 || '',
    customIconUrl: item?.customIconUrl || (item?.level3 ? getCustomIconForPreset(item.level3) : null),
    _hasUploadedCustomIcon: Boolean(item?.customIconUrl && !getCustomIconForPreset(item?.level3)),
    coordinates: item?.coordinates || '[]',
    extrudedHeight: Number(item?.extrudedHeight) || 0,
    altitudeMode: item?.altitudeMode || 'clamp',
    measurementType: item?.measurementType || '',
    geodeticMetrics: item?.geodeticMetrics || null,
    hoverBehavior: item?.hoverBehavior || 'bubble',
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userData: item?.userData || null,
  };

  let userData = {
    text: '',
    videoUrl: '',
    audioUrl: '',
    calls: []
  };
  if (itemData.userData) {
    try {
      const parsed = typeof itemData.userData === 'string' ? JSON.parse(itemData.userData) : itemData.userData;
      if (parsed && typeof parsed === 'object') {
        userData = {
          text: parsed.text || '',
          videoUrl: parsed.videoUrl || '',
          audioUrl: parsed.audioUrl || '',
          calls: Array.isArray(parsed.calls) ? parsed.calls : []
        };
      }
    } catch (_e) {
      userData = {
        text: itemData.userData?.text || '',
        videoUrl: itemData.userData?.videoUrl || '',
        audioUrl: itemData.userData?.audioUrl || '',
        calls: Array.isArray(itemData.userData?.calls) ? itemData.userData.calls : []
      };
    }
  }

  let parsedCoords = [];
  try {
    parsedCoords = typeof itemData.coordinates === 'string' ? JSON.parse(itemData.coordinates) : itemData.coordinates;
  } catch (_e) {
    parsedCoords = [];
  }

  // Derive measurement classification and extract live geodetic telemetry
  const measurementType = item?.measurementType ||
    item?.geodeticMetrics?.measurementType ||
    (item?.name?.toLowerCase().startsWith('bearing') ? 'bearing' :
     item?.name?.toLowerCase().startsWith('elevation') ? 'elevation' :
     item?.type);
  let liveMetrics = item?.geodeticMetrics || extractGeodeticMetrics(parsedCoords, measurementType);

  // If item description is empty or placeholder, auto-prefill with the generated geodetic report!
  if (!itemData.description.trim() && liveMetrics && liveMetrics.summary) {
    itemData.description = generateGeodeticDescription(liveMetrics);
  }

  // Ensure root overlay container
  let modalRoot = document.getElementById('item-inspector-modal-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'item-inspector-modal-root';
    document.body.appendChild(modalRoot);
  }

  const primaryLat = Number.isFinite(parsedCoords[0]?.lat) ? parsedCoords[0].lat : 14.5995;
  const primaryLng = Number.isFinite(parsedCoords[0]?.lng) ? parsedCoords[0].lng : 120.9842;
  const primaryAlt = parsedCoords[0]?.alt ?? 0;

  modalRoot.innerHTML = `
    <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in animate-fade-in-backdrop" id="item-modal-backdrop">
      <div class="relative w-full max-w-xl bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100 font-sans transition-all duration-300" id="item-modal-dialog">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-700/80 bg-slate-900/60 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold uppercase tracking-wider text-emerald-400">${itemData.type.toUpperCase()}</span>
            <h2 class="text-xl font-bold text-white">${isNew ? 'Create Item' : 'Update Item'}</h2>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Normal / Maximize Segmented Control -->
            <div class="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
              <button type="button" id="item-modal-size-normal-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer bg-emerald-600 text-white" title="Normal Layout (560px)">
                <span class="material-symbols-outlined text-xs">picture_in_picture_alt</span> Normal
              </button>
              <button type="button" id="item-modal-size-max-btn" class="px-2 py-1 text-[10px] font-bold rounded transition-all duration-150 flex items-center gap-1 cursor-pointer text-slate-400 hover:text-white" title="Maximize Layout (Full Screen)">
                <span class="material-symbols-outlined text-xs">open_in_full</span> Maximize
              </button>
            </div>
            <!-- Close Button -->
            <button type="button" id="close-inspector-modal-btn" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition flex items-center justify-center cursor-pointer" aria-label="Close dialog">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>
        </div>

        <!-- 5-Tabs Navigation Bar matching video -->
        <div class="flex border-b border-slate-700 bg-slate-900/30 px-6 pt-2 gap-2" role="tablist">
          <button class="item-tab-btn active px-4 py-2 text-sm font-medium border-b-2 border-emerald-400 text-white transition flex items-center gap-1.5" data-tab="general" role="tab">
            <span class="material-symbols-outlined text-base">info</span> General
          </button>
          <button class="item-tab-btn px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5" data-tab="coordinates" role="tab">
            <span class="material-symbols-outlined text-base">explore</span> Coordinates
          </button>
          <button class="item-tab-btn px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5" data-tab="attachments" role="tab">
            <span class="material-symbols-outlined text-base">attach_file</span> Attachments
          </button>
          <button class="item-tab-btn px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5" data-tab="details" role="tab">
            <span class="material-symbols-outlined text-base">badge</span> Details
          </button>
          <button class="item-tab-btn px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5" data-tab="userdata" role="tab">
            <span class="material-symbols-outlined text-base">database</span> User Data
          </button>
        </div>

        <!-- Tab Contents -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          
          <!-- TAB 1: GENERAL -->
          <div id="tab-general" class="item-tab-pane space-y-4">
            
            <!-- Inline Tactical Symbology & Theme User Guide Banner -->
            <div class="bg-slate-900/80 border border-slate-700/80 rounded-xl p-2.5 shadow-sm">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-base text-sky-400">menu_book</span>
                  <div>
                    <span class="text-xs font-semibold text-slate-200">Tactical Symbology & Color Theme Guide</span>
                    <span class="text-[10px] text-slate-400 block sm:inline sm:ml-2">MIL-STD-2525 Symbology • Affiliation Codes • 3-Tier Hierarchy</span>
                  </div>
                </div>
                <button type="button" id="toggle-tactical-guide-btn" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 font-semibold text-[11px] border border-slate-700 transition flex items-center gap-1 cursor-pointer">
                  <span class="material-symbols-outlined text-xs">help_outline</span> Instructions & Guide
                </button>
              </div>

              <!-- Collapsible Guide Panel -->
              <div id="tactical-guide-panel" class="hidden mt-3 pt-3 border-t border-slate-800/80 space-y-3 text-xs text-slate-300">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  
                  <div class="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                    <div class="font-semibold text-emerald-400 flex items-center gap-1 mb-1">
                      <span class="material-symbols-outlined text-sm">account_tree</span> 3-Tier Taxonomy
                    </div>
                    <ul class="space-y-1 text-[11px] text-slate-400">
                      <li><strong class="text-slate-200">Level 1 (Domain):</strong> Primary theater (Tactical, Maritime, Airspace, etc.).</li>
                      <li><strong class="text-slate-200">Level 2 (Sub-Level):</strong> Tactical functional branch.</li>
                      <li><strong class="text-slate-200">Level 3 (Classification):</strong> Specific asset preset with dynamic SVG geometry.</li>
                    </ul>
                  </div>

                  <div class="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                    <div class="font-semibold text-amber-400 flex items-center gap-1 mb-1">
                      <span class="material-symbols-outlined text-sm">military_tech</span> Affiliation Themes
                    </div>
                    <ul class="space-y-1 text-[11px] text-slate-400">
                      <li><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span><strong class="text-red-300">Hostile:</strong> Threat alert & buffer.</li>
                      <li><span class="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"></span><strong class="text-blue-300">Friendly:</strong> Allied staging.</li>
                      <li><span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span><strong class="text-emerald-300">Neutral:</strong> Civil/municipal zone.</li>
                      <li><span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><strong class="text-amber-300">Unknown:</strong> Pending survey.</li>
                      <li><span class="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1"></span><strong class="text-purple-300">HAZMAT:</strong> Exclusion zone.</li>
                    </ul>
                  </div>

                  <div class="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                    <div class="font-semibold text-cyan-400 flex items-center gap-1 mb-1">
                      <span class="material-symbols-outlined text-sm">palette</span> Tactical Icon
                    </div>
                    <ul class="space-y-1 text-[11px] text-slate-400">
                      <li><strong class="text-slate-200">Icon Dropdown:</strong> Fallback Material symbol (<strong class="text-amber-400">★</strong> = matches L3).</li>
                      <li><strong class="text-slate-200">Color Palette:</strong> Tints pins, 3D shapes, and the vector SVG badge.</li>
                      <li><strong class="text-slate-200">Custom Asset:</strong> Drag & drop SVG/PNG image.</li>
                    </ul>
                  </div>

                  <div class="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                    <div class="font-semibold text-sky-400 flex items-center gap-1 mb-1">
                      <span class="material-symbols-outlined text-sm">ads_click</span> Map Hover Tooltip
                    </div>
                    <ul class="space-y-1 text-[11px] text-slate-400">
                      <li><strong class="text-slate-200">None:</strong> Silent hover. Click item to open full details.</li>
                      <li><strong class="text-slate-200">Bubble:</strong> Compact floating HUD pill with Name & Classification.</li>
                      <li><strong class="text-slate-200">Dialog:</strong> Rich tactical Intel card with SVG badge, position, and notes.</li>
                    </ul>
                  </div>

                </div>

                <div class="mt-2.5 p-2 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
                  <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-xs text-cyan-400">import_export</span>
                    <span><strong>Import / Export Taxonomy:</strong> Backup or distribute custom classifications via structured <strong class="text-cyan-400">.JSON</strong> or spreadsheet <strong class="text-emerald-400">.CSV</strong> tables. Use <strong>Merge</strong> to append without data loss or <strong>Replace</strong> to set a new mission profile.</span>
                  </div>
                </div>

                <div class="flex justify-end pt-1">
                  <button type="button" id="close-tactical-guide-btn" class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white text-[10px] transition cursor-pointer">
                    Dismiss Guide
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="item-input-name">Name *</label>
              <input id="item-input-name" type="text" class="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-sm" value="${escapeHtml(itemData.name)}" required />
            </div>

            <!-- 3-Tier Taxonomy Header & Import/Export Action -->
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-cyan-400">account_tree</span> 3-Tier Tactical Taxonomy
              </span>
              <button type="button" id="open-taxonomy-manager-btn" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold border border-slate-700 hover:border-cyan-500/50 transition flex items-center gap-1 cursor-pointer shadow-sm" title="Import, Export, Backup, or Restore operational taxonomy schemas">
                <span class="material-symbols-outlined text-xs">import_export</span> Import / Export Taxonomy
              </button>
            </div>

            <!-- Chained Category & Sub-Level Dropdowns -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-700/80">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm text-emerald-400">category</span> Category (L1)
                  </label>
                </div>
                <select id="item-category-select" class="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-400">
                  <!-- Populated dynamically -->
                </select>
                <!-- Inline custom category input -->
                <div id="custom-cat-input-container" class="hidden mt-2 flex gap-1">
                  <input id="custom-cat-input" type="text" placeholder="Enter new category name..." class="flex-1 px-2.5 py-1.5 bg-slate-950 border border-emerald-500/80 rounded-lg text-xs text-white focus:outline-none" />
                  <button type="button" id="confirm-custom-cat-btn" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-semibold">
                    Add
                  </button>
                  <button type="button" id="cancel-custom-cat-btn" class="px-1.5 py-1 bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs">
                    ✕
                  </button>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm text-sky-400">account_tree</span> Sub-Level (L2)
                  </label>
                </div>
                <select id="item-subcategory-select" class="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-400">
                  <!-- Populated dynamically based on category -->
                </select>
                <!-- Inline custom subcategory input -->
                <div id="custom-sub-input-container" class="hidden mt-2 flex gap-1">
                  <input id="custom-sub-input" type="text" placeholder="Enter new subcategory name..." class="flex-1 px-2.5 py-1.5 bg-slate-950 border border-sky-500/80 rounded-lg text-xs text-white focus:outline-none" />
                  <button type="button" id="confirm-custom-sub-btn" class="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-semibold">
                    Add
                  </button>
                  <button type="button" id="cancel-custom-sub-btn" class="px-1.5 py-1 bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs">
                    ✕
                  </button>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <span class="material-symbols-outlined text-sm text-amber-400">military_tech</span> Classification (L3)
                  </label>
                  <div class="flex items-center gap-1 bg-slate-900/80 px-1 py-0.5 rounded border border-cyan-500/30">
                    <span id="ai-suggest-spinner" class="hidden w-2.5 h-2.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
                    <span class="text-[9px] font-bold text-cyan-400 uppercase tracking-wide">AI SUGGEST</span>
                    <label class="relative inline-flex items-center cursor-pointer select-none">
                      <input id="ai-suggest-toggle" type="checkbox" class="sr-only peer" />
                      <div class="w-6 h-3 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>
                </div>
                <select id="item-level3-select" class="w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-400">
                  <!-- Populated dynamically based on category & subcategory -->
                </select>
                <!-- Inline custom level3 input -->
                <div id="custom-level3-input-container" class="hidden mt-2 flex gap-1">
                  <input id="custom-level3-input" type="text" placeholder="Enter custom classification..." class="flex-1 px-2.5 py-1.5 bg-slate-950 border border-amber-500/80 rounded-lg text-xs text-white focus:outline-none" />
                  <button type="button" id="confirm-custom-level3-btn" class="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-semibold">
                    Add
                  </button>
                  <button type="button" id="cancel-custom-level3-btn" class="px-1.5 py-1 bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs">
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <!-- DYNAMIC GEODETIC MEASUREMENT TELEMETRY PANEL -->
            <div id="inspector-geodetic-panel" class="p-3 bg-[#0b1329]/95 rounded-xl border border-cyan-500/40 text-xs font-mono space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-cyan-400 flex items-center gap-1.5 text-[11px] tracking-wide">
                  <span class="material-symbols-outlined text-sm">straighten</span>
                  GEODETIC MEASUREMENT TELEMETRY
                </span>
                <span id="inspector-geo-badge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/60 text-cyan-300 uppercase">
                  ${escapeHtml(liveMetrics.measurementType || itemData.type)}
                </span>
              </div>
              <div id="inspector-geo-content" class="grid grid-cols-2 gap-2 text-[11px]">
                <!-- Populated dynamically -->
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                <span id="inspector-geo-points">${parsedCoords.length} coordinates captured</span>
                <button type="button" id="sync-geodetic-desc-btn" class="text-cyan-400 hover:text-cyan-300 font-sans font-semibold flex items-center gap-1 hover:underline cursor-pointer" title="Auto-push these captured metrics into Description">
                  <span class="material-symbols-outlined text-xs">sync</span> Push to Description
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider" for="item-input-desc">Description</label>
                <!-- Rich formatting buttons from video -->
                <div class="flex items-center gap-1">
                  <button type="button" id="fmt-bold-btn" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs font-bold px-2" title="Bold">B</button>
                  <button type="button" id="fmt-italic-btn" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs italic px-2" title="Italic">I</button>
                  <button type="button" id="fmt-list-btn" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs px-2" title="Bulleted list">• List</button>
                </div>
              </div>
              <textarea id="item-input-desc" rows="4" class="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-sm leading-relaxed" placeholder="Enter intelligence brief, site survey notes, or tactical instructions...">${escapeHtml(itemData.description)}</textarea>
            </div>

            <!-- Icon & Color Selector & Custom Override -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Tactical Icon & Preview</label>
                <div class="flex items-center gap-2">
                  <div id="selected-icon-preview" class="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 flex-shrink-0" title="Live Tactical Icon & Color Theme Preview">
                    ${itemData.customIconUrl ? `<img src="${escapeHtml(itemData.customIconUrl)}" class="w-7 h-7 object-contain rounded" />` : `<span class="material-symbols-outlined text-2xl">${itemData.icon}</span>`}
                  </div>
                  <select id="item-icon-select" class="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400" title="Select fallback Material Symbols glyph. Items with ★ match your classification.">
                    ${PRESET_ICONS.map((ic) => `<option value="${ic.id}" ${ic.id === itemData.icon ? 'selected' : ''}>${ic.label}</option>`).join('')}
                  </select>
                </div>
              </div>

              <div class="sm:col-span-2">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-emerald-400">palette</span> Icon & Marker Color Theme
                  </label>
                  <div class="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                    <input type="color" id="inspector-color-picker" value="${itemData.color || '#3b82f6'}" class="w-5 h-5 rounded cursor-pointer border border-slate-600 bg-transparent p-0" title="Custom Hex Color Picker" />
                    <span class="w-3.5 h-3.5 rounded-full border border-slate-600 shadow-sm transition-colors" id="active-color-swatch-indicator" style="background-color: ${itemData.color};"></span>
                    <span id="active-color-hex-text" class="text-emerald-400 font-semibold">${itemData.color}</span>
                  </div>
                </div>

                <!-- Tactical Affiliation Themes Quick Bar -->
                <div class="mb-2 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div class="text-[10px] uppercase font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs text-amber-400">military_tech</span> Tactical Affiliation Themes (MIL-STD / STANAG)
                  </div>
                  <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-500/50 text-red-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#ef4444" title="Hostile Threat (#ef4444)">
                      <span class="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span> Hostile
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-blue-950/60 hover:bg-blue-900/80 border border-blue-500/50 text-blue-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#3b82f6" title="Friendly Allied Force (#3b82f6)">
                      <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span> Friendly
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#10b981" title="Neutral / Civilian Area (#10b981)">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span> Neutral
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/50 text-amber-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#f59e0b" title="Unknown / Suspect Contact (#f59e0b)">
                      <span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span> Unknown
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/50 text-purple-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#a855f7" title="HAZMAT / Exclusion Zone (#a855f7)">
                      <span class="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></span> HAZMAT
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-green-950/60 hover:bg-green-900/80 border border-green-400/50 text-green-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#22c55e" title="Night Vision Phosphor (#22c55e)">
                      <span class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span> NVG Green
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-orange-950/60 hover:bg-orange-900/80 border border-orange-500/50 text-orange-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-color="#f97316" title="FLIR Thermography Amber (#f97316)">
                      <span class="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></span> Thermal
                    </button>
                    <button type="button" class="tactical-theme-btn px-1.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-cyan-500/50 text-cyan-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer" data-theme-action="auto-domain" title="Reset to Category Domain Native Color">
                      <span class="material-symbols-outlined text-xs text-cyan-400">autorenew</span> Auto L1
                    </button>
                  </div>
                </div>

                <!-- Inline 16-Color Swatch Grid (zero body-appended popovers, zero leaked pointerdown listeners) -->
                <div id="inspector-color-swatches" class="grid grid-cols-8 sm:grid-cols-8 gap-1.5 p-2 bg-slate-900/60 rounded-xl border border-slate-700/80">
                  ${SWATCH_COLORS.map(
                    (c) => `
                    <button type="button" class="swatch-cell h-7 rounded-md border border-white/20 hover:scale-105 hover:border-white transition shadow cursor-pointer flex items-center justify-center ${c.toLowerCase() === (itemData.color || '').toLowerCase() ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900 scale-105 border-white' : ''}" style="background-color: ${c};" data-color="${c}" title="${c}" aria-label="Select color ${c}">
                      ${c.toLowerCase() === (itemData.color || '').toLowerCase() ? '<span class="material-symbols-outlined text-[13px] text-white drop-shadow">check</span>' : ''}
                    </button>
                  `
                  ).join('')}
                </div>
              </div>

              <div class="sm:col-span-2 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
                <label class="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Custom Icon Image Override (2D / 3D Canvas Badge)</label>
                
                <!-- Styled Drag & Drop Zone -->
                <div id="custom-icon-dropzone" class="border-2 border-dashed border-slate-700 hover:border-cyan-400/80 bg-slate-950/60 p-4 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition text-center select-none group">
                  <span class="material-symbols-outlined text-3xl text-slate-400 group-hover:text-cyan-400 transition animate-pulse">cloud_upload</span>
                  <span class="text-xs font-semibold text-slate-300">Drag & drop custom SVG/PNG icon or click to browse</span>
                  <span class="text-[10px] text-slate-500">Supported formats: SVG, PNG, JPG (Max 500KB)</span>
                </div>
                
                <div class="flex items-center gap-2 mt-1">
                  <input id="item-custom-icon-url" type="text" placeholder="Or enter direct image URL..." class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400" value="${escapeHtml(itemData.customIconUrl || '')}" />
                  
                  <button type="button" id="clear-custom-icon-btn" class="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${itemData.customIconUrl ? '' : 'hidden'}" title="Clear custom icon and restore default symbol">
                    <span class="material-symbols-outlined text-xs">delete</span> Clear Custom Asset
                  </button>
                  
                  <input type="file" id="custom-icon-file-input" accept="image/*" class="hidden" />
                </div>
              </div>

              <!-- MAP HOVER TOOLTIP BEHAVIOR -->
              <div class="sm:col-span-2 bg-slate-900/40 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-sky-400">ads_click</span> On Mouse Hover Map Display
                  </label>
                  <span class="text-[10px] text-slate-400 font-mono">Real-time 2D/3D Map Tooltip</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label class="hover-behavior-opt flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/70 border border-slate-700/60 hover:border-slate-500 cursor-pointer transition select-none">
                    <input type="radio" name="item-hover-behavior" value="none" ${itemData.hoverBehavior === 'none' ? 'checked' : ''} class="text-sky-500 focus:ring-0" />
                    <div>
                      <div class="text-xs font-semibold text-slate-200">None</div>
                      <div class="text-[10px] text-slate-400">Click to view only</div>
                    </div>
                  </label>
                  <label class="hover-behavior-opt flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/70 border border-slate-700/60 hover:border-slate-500 cursor-pointer transition select-none">
                    <input type="radio" name="item-hover-behavior" value="bubble" ${(itemData.hoverBehavior || 'bubble') === 'bubble' ? 'checked' : ''} class="text-sky-500 focus:ring-0" />
                    <div>
                      <div class="text-xs font-semibold text-slate-200">Bubble</div>
                      <div class="text-[10px] text-slate-400">Compact HUD pill</div>
                    </div>
                  </label>
                  <label class="hover-behavior-opt flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/70 border border-slate-700/60 hover:border-slate-500 cursor-pointer transition select-none">
                    <input type="radio" name="item-hover-behavior" value="dialog" ${itemData.hoverBehavior === 'dialog' ? 'checked' : ''} class="text-sky-500 focus:ring-0" />
                    <div>
                      <div class="text-xs font-semibold text-slate-200">Dialog</div>
                      <div class="text-[10px] text-slate-400">Rich Intel Card</div>
                    </div>
                  </label>
                </div>
              </div>

            </div>
          </div>

          <!-- TAB 2: COORDINATES -->
          <div id="tab-coordinates" class="item-tab-pane hidden space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="coord-lat">Latitude</label>
                <input id="coord-lat" type="number" step="0.000001" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm font-mono" value="${primaryLat}" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="coord-lng">Longitude</label>
                <input id="coord-lng" type="number" step="0.000001" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm font-mono" value="${primaryLng}" />
              </div>
            </div>

            <!-- Search Location & My Location from video -->
            <div class="space-y-2 pt-1">
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Search Location or Address</label>
              <div class="flex gap-2">
                <input id="coord-search-input" type="text" placeholder="e.g., Manila South Harbor, Rizal Park..." class="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400" />
                <button type="button" id="coord-search-btn" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition">
                  <span class="material-symbols-outlined text-base">search</span> Search
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <button type="button" id="my-location-btn" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition">
                <span class="material-symbols-outlined text-base text-emerald-400">my_location</span> My GPS Location
              </button>
              <span id="coord-status-msg" class="text-xs text-slate-400"></span>
            </div>

            <!-- Interactive 2D Display Map Preview & Tactical Tools -->
            <div class="mt-2 p-3 bg-slate-900/90 border border-slate-700/80 rounded-lg flex flex-col gap-2">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5 font-mono text-slate-300">
                  <span class="text-slate-400">Target Fix:</span>
                  <span id="coord-display" class="text-emerald-400 font-semibold">${primaryLat.toFixed(6)}, ${primaryLng.toFixed(6)}</span>
                </div>
                <div class="text-[11px] text-amber-300 font-mono flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">grid_4x4</span>
                  <span id="coord-mgrs-display" class="font-bold text-white">${formatMgrsSpaced(toMgrsString(primaryLat, primaryLng, 5))}</span>
                </div>
              </div>

              <!-- Real Interactive Leaflet Map Container -->
              <div class="relative w-full h-56 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shadow-inner">
                <div id="inspector-leaflet-preview" data-alias="inspector-leaflet-map" class="w-full h-full z-0"></div>

                <!-- On-Map Floating Toolbar -->
                <div class="absolute top-2 right-2 z-[400] flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 p-1 rounded-md backdrop-blur-md shadow-lg select-none">
                  <button type="button" id="map-zoom-in-btn" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition" title="Zoom In">+</button>
                  <button type="button" id="map-zoom-out-btn" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition" title="Zoom Out">-</button>
                  <div class="h-4 w-px bg-slate-700 mx-0.5"></div>
                  <button type="button" id="map-toggle-layer-btn" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono flex items-center gap-1 transition" title="Toggle Basemap (Satellite / Street)">
                    <span class="material-symbols-outlined text-xs">layers</span>
                    <span id="map-layer-label">Satellite</span>
                  </button>
                  <button type="button" id="map-recenter-btn" class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition" title="Fit to Item Extent">
                    <span class="material-symbols-outlined text-sm">filter_center_focus</span>
                  </button>
                </div>

                <!-- Google Street View Launcher Button on Map -->
                <div class="absolute bottom-2 left-2 z-[400]">
                  <button type="button" id="launch-street-view-btn" class="px-2.5 py-1 bg-amber-500/90 hover:bg-amber-400 text-slate-950 rounded-md font-semibold text-xs flex items-center gap-1.5 shadow-lg transition backdrop-blur-sm" title="Open Google Street View for this exact location">
                    <span class="material-symbols-outlined text-sm">streetview</span>
                    <span>Street View</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- All Vertices / Waypoints breakdown if multiple -->
            <div id="inspector-vertices-container" class="${parsedCoords.length > 1 ? '' : 'hidden'} border border-slate-700/80 rounded-lg p-3 bg-slate-900/60 space-y-2">
              <div class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Waypoint Coordinates (<span id="tab2-vertex-count">${parsedCoords.length}</span> Nodes)</span>
                <span class="text-[10px] text-slate-400 font-mono">LAT / LNG / ALT (MSL)</span>
              </div>

              <!-- Quick Tactical Actions for Vertices -->
              <div class="flex items-center gap-2">
                <button type="button" id="edit-on-globe-btn" class="flex-1 py-1.5 px-2 bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 rounded font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-sm" title="Interactive In-Canvas Draggable Vertex Handles directly on Cesium Globe">
                  <span class="material-symbols-outlined text-sm">near_me</span> Edit Vertices on Globe
                </button>
                <button type="button" id="copy-mgrs-table-btn-tab2" class="py-1.5 px-2.5 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-500/50 text-amber-300 rounded font-mono text-xs font-semibold flex items-center gap-1 transition" title="Copy full MGRS waypoint route table to clipboard">
                  <span class="material-symbols-outlined text-sm">content_copy</span> MGRS Table
                </button>
              </div>

              <!-- Bowtie warning banner in Coordinates tab -->
              <div id="tab2-bowtie-warning" class="hidden p-2 bg-rose-950/60 border border-rose-500/60 rounded text-rose-300 text-xs flex items-center gap-2">
                <span class="material-symbols-outlined text-rose-400 text-base shrink-0">warning</span>
                <div>
                  <strong>Self-Intersecting Polygon (Bowtie):</strong> Non-adjacent boundary edges cross each other. Click <em>Edit Vertices on Globe</em> to untangle.
                </div>
              </div>

              <div id="inspector-vertices-list" class="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                <!-- Populated dynamically -->
              </div>
            </div>
          </div>

          <!-- TAB 3: ATTACHMENTS (IMAGE URL + DRAG-AND-DROP FILE UPLOAD) -->
          <div id="tab-attachments" class="item-tab-pane hidden space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1" for="item-image-url">Image URL</label>
              <input id="item-image-url" type="url" placeholder="https://example.com/site-photo.jpg" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400" value="${escapeHtml(itemData.imageUrl)}" />
            </div>

            <!-- Direct File Upload / Drag & Drop -->
            <div id="drop-zone" class="border-2 border-dashed border-slate-700 hover:border-emerald-500/80 bg-slate-900/40 rounded-xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center">
              <input type="file" id="file-upload-input" accept="image/*" class="hidden" />
              <span class="material-symbols-outlined text-3xl text-emerald-400 mb-2">cloud_upload</span>
              <p class="text-sm font-semibold text-slate-200">Drag & drop site photo, or <span class="text-emerald-400 underline">browse</span></p>
              <p class="text-xs text-slate-400 mt-1">Supports PNG, JPG, WEBP, SVG (stored directly in record)</p>
            </div>

            <!-- Image Preview Box -->
            <div id="image-preview-container" class="${itemData.imageUrl ? '' : 'hidden'} border border-slate-700 rounded-xl p-3 bg-slate-900/80">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Attached Visual Intelligence</span>
                <button type="button" id="remove-image-btn" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                  <span class="material-symbols-outlined text-sm">delete</span> Remove
                </button>
              </div>
              <div class="max-h-48 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center bg-black">
                <img id="attached-image-preview" src="${escapeHtml(itemData.imageUrl)}" alt="Item attachment" class="max-h-48 object-contain" />
              </div>
            </div>
          </div>

          <!-- TAB 4: DETAILS -->
          <div id="tab-details" class="item-tab-pane hidden space-y-3">
            <div class="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-2 text-xs">
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Author</span>
                <span class="font-semibold text-white">${escapeHtml(itemData.author)}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Category (Level 1)</span>
                <span id="detail-category-badge" class="font-semibold text-emerald-400">${escapeHtml(itemData.category)}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Sub-Level (Level 2)</span>
                <span id="detail-subcategory-badge" class="font-semibold text-sky-400">${escapeHtml(itemData.subcategory)}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Classification (Level 3)</span>
                <span id="detail-level3-badge" class="font-semibold text-amber-400">${escapeHtml(itemData.level3 || 'General')}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Geometry Type</span>
                <span class="font-mono text-emerald-400 uppercase">${itemData.type}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Vertices / Coordinates Count</span>
                <span id="detail-vertex-count" class="font-mono text-white flex items-center gap-1.5">${parsedCoords.length} pts</span>
              </div>
              <div id="detail-bowtie-row" class="hidden flex justify-between py-1 border-b border-slate-800 bg-rose-950/40 -mx-4 px-4">
                <span class="text-rose-400 flex items-center gap-1 font-semibold"><span class="material-symbols-outlined text-sm">warning</span> Topology Check</span>
                <span class="text-rose-300 font-mono text-[11px] font-bold">Bowtie / Self-Intersecting</span>
              </div>
              <!-- 3D Altitude & Extrusion Row for Polygons -->
              <div class="flex items-center justify-between py-1 border-b border-slate-800 ${itemData.type === 'polygon' ? '' : 'hidden'}">
                <span class="text-slate-400">3D Extrusion Height</span>
                <div class="flex items-center gap-1.5 font-mono">
                  <input id="item-extruded-height" type="number" min="0" max="50000" step="50" class="w-24 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-right text-xs text-cyan-300 focus:outline-none focus:border-cyan-400" value="${itemData.extrudedHeight || 0}" placeholder="0 (clamped)" />
                  <span class="text-slate-400 text-xs">m</span>
                </div>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-800">
                <span class="text-slate-400">Created At</span>
                <span class="text-slate-300 font-mono">${new Date(itemData.createdAt).toLocaleString()}</span>
              </div>
              <!-- Geodetic Telemetry Rows -->
              <div id="detail-geodetic-rows" class="border-b border-slate-800 py-1 space-y-1">
                <!-- Dynamically populated -->
              </div>
              <div class="flex justify-between py-1">
                <span class="text-slate-400">Map Project ID</span>
                <span class="text-slate-300 font-mono text-[10px]">${itemData.mapId}</span>
              </div>
            </div>

            <!-- Tactical & GIS Exporters -->
            <div class="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-2">
              <span class="text-xs font-semibold text-slate-300 uppercase tracking-wider block">Tactical &amp; GIS Exporters</span>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" id="copy-mgrs-table-btn" class="px-2.5 py-1.5 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-500/50 text-amber-300 rounded font-mono text-[11px] font-semibold flex items-center gap-1 transition">
                  <span class="material-symbols-outlined text-sm">content_copy</span> Copy MGRS Target List
                </button>
                <button type="button" id="export-geojson-btn" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded font-mono text-[11px] flex items-center gap-1 transition">
                  <span class="material-symbols-outlined text-sm">download</span> GeoJSON
                </button>
                <button type="button" id="export-kml-btn" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded font-mono text-[11px] flex items-center gap-1 transition">
                  <span class="material-symbols-outlined text-sm">download</span> KML (Google Earth)
                </button>
              </div>
            <span id="export-toast-msg" class="text-[11px] text-emerald-400 font-mono block min-h-[16px]"></span>
          </div>
          </div>

          <!-- TAB 5: USER DATA -->
          <div id="tab-userdata" class="item-tab-pane hidden space-y-4 font-sans">
             <!-- Interactive Media & Data Viewport Area -->
             <div class="border border-slate-700/80 rounded-xl p-3.5 bg-slate-950/80 shadow-inner space-y-3.5">
               <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                 <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                   <span class="material-symbols-outlined text-sm">visibility</span>
                   Live Viewport Preview
                 </span>
                 <span id="viewport-status" class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">IDLE</span>
               </div>
               
               <!-- Dedicated Real-Time Feedback Toast -->
               <div id="userdata-toast" class="hidden text-[10px] font-mono text-center py-1.5 px-2.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 transition-all duration-300"></div>

               <!-- Inside Viewport: Text Render Area -->
               <div id="viewport-text-render" class="text-xs font-sans space-y-1 text-slate-200 bg-slate-900/60 p-3 rounded border border-slate-800/80 min-h-[48px] max-h-[140px] overflow-y-auto hidden">
                 <!-- Populated dynamically with HTML/Text -->
               </div>

               <!-- Inside Viewport: Video Embed Container -->
               <div id="viewport-video-container" class="rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video max-h-[180px] hidden relative">
                 <video id="viewport-video-player" controls class="w-full h-full object-cover"></video>
               </div>

               <!-- Inside Viewport: Audio Player Container -->
               <div id="viewport-audio-container" class="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 hidden space-y-1">
                 <div class="flex items-center gap-2">
                   <span class="material-symbols-outlined text-amber-400 text-base animate-pulse">waves</span>
                   <span class="text-[10px] text-slate-300 font-mono font-semibold truncate flex-1" id="audio-filename-label">Interactive Wave Audio Stream</span>
                 </div>
                 <div id="viewport-audio-player-wrapper" class="w-full">
                   <audio id="viewport-audio-player" controls class="w-full h-9"></audio>
                 </div>
               </div>

               <!-- Inside Viewport: Dynamically Called Fields Area -->
               <div id="viewport-called-fields" class="space-y-1.5 hidden">
                 <!-- Stylized dynamic cards go here -->
               </div>

               <!-- Empty viewport placeholder -->
               <div id="viewport-placeholder" class="text-center py-6 text-slate-500 text-xs">
                 <span class="material-symbols-outlined text-2xl block mb-1">dashboard_customize</span>
                 No content loaded in viewport yet. Use controls below to add.
               </div>
             </div>

             <!-- Ingestion Controls & Editors Accordion/Drawers -->
             <div class="space-y-3">
               <!-- Accordion 1: Text Editor -->
               <div class="border border-slate-700/60 bg-slate-900/40 rounded-xl overflow-hidden">
                 <button type="button" class="userdata-drawer-toggle w-full px-4 py-2.5 bg-slate-900/60 flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider" data-target="drawer-text">
                   <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-emerald-400 font-bold">edit_note</span> 1.) Text Editing Tools</span>
                   <span class="material-symbols-outlined text-base transform transition duration-200">expand_more</span>
                 </button>
                 <div id="drawer-text" class="userdata-drawer-pane p-3 space-y-2">
                   <div class="flex items-center justify-between">
                     <span class="text-[10px] text-slate-400">Write stylized operational details:</span>
                     <div class="flex items-center gap-1">
                       <button type="button" id="userdata-fmt-bold" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs font-bold px-2" title="Bold">B</button>
                       <button type="button" id="userdata-fmt-italic" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs italic px-2" title="Italic">I</button>
                       <button type="button" id="userdata-fmt-list" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs px-2" title="Bullet List">• List</button>
                       <button type="button" id="userdata-fmt-underline" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs underline px-2" title="Underline">U</button>
                     </div>
                   </div>
                   <textarea id="userdata-text-input" rows="3" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400 text-xs font-sans leading-relaxed" placeholder="Type here and formatted text will show in Viewport..."></textarea>
                 </div>
               </div>

               <!-- Accordion 2: Video Ingestion -->
               <div class="border border-slate-700/60 bg-slate-900/40 rounded-xl overflow-hidden">
                 <button type="button" class="userdata-drawer-toggle w-full px-4 py-2.5 bg-slate-900/60 flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider" data-target="drawer-video">
                   <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-sky-400 font-bold">movie</span> 2.) Video Ingestion Tools</span>
                   <span class="material-symbols-outlined text-base transform transition duration-200">expand_more</span>
                 </button>
                 <div id="drawer-video" class="userdata-drawer-pane hidden p-3 space-y-2">
                   <div class="flex gap-2">
                     <input id="userdata-video-url" type="url" placeholder="Paste direct MP4 or stream video URL..." class="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-400 text-xs font-sans" />
                     <button type="button" id="userdata-load-video-btn" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition shrink-0">
                       Load URL
                     </button>
                   </div>
                   <!-- High Quality Drone/Satellite/Tactical Sample Video Presets -->
                   <div class="space-y-1.5">
                     <span class="text-[9px] text-slate-400 block font-bold tracking-wider uppercase">HQ Tactical Presets:</span>
                     <div class="grid grid-cols-2 gap-1.5">
                       <button type="button" class="userdata-video-preset-btn text-left p-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 flex items-center gap-1.5 truncate" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4">
                         <span class="material-symbols-outlined text-sky-400 text-xs">videocam</span>
                         <span>Tactical Recon Unit</span>
                       </button>
                       <button type="button" class="userdata-video-preset-btn text-left p-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 flex items-center gap-1.5 truncate" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4">
                         <span class="material-symbols-outlined text-cyan-400 text-xs">satellite_alt</span>
                         <span>Geospatial Feed B</span>
                       </button>
                     </div>
                   </div>
                 </div>
               </div>

               <!-- Accordion 3: Audio Ingestion -->
               <div class="border border-slate-700/60 bg-slate-900/40 rounded-xl overflow-hidden">
                 <button type="button" class="userdata-drawer-toggle w-full px-4 py-2.5 bg-slate-900/60 flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider" data-target="drawer-audio">
                   <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-amber-400 font-bold">mic</span> 3.) Audio Ingestion Tools</span>
                   <span class="material-symbols-outlined text-base transform transition duration-200">expand_more</span>
                 </button>
                 <div id="drawer-audio" class="userdata-drawer-pane hidden p-3 space-y-2">
                   <div class="flex gap-2">
                     <input id="userdata-audio-url" type="url" placeholder="Paste MP3 stream or voice link..." class="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400 text-xs font-sans" />
                     <button type="button" id="userdata-load-audio-btn" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition shrink-0">
                       Load URL
                     </button>
                   </div>
                   <!-- High Quality Voice/Radio sample presets -->
                   <div class="space-y-1.5">
                     <span class="text-[9px] text-slate-400 block font-bold tracking-wider uppercase">Radio Presets:</span>
                     <div class="grid grid-cols-2 gap-1.5">
                       <button type="button" class="userdata-audio-preset-btn text-left p-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 flex items-center gap-1.5 truncate" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/subway.mp3">
                         <span class="material-symbols-outlined text-amber-400 text-xs">radio</span>
                         <span>Radio Comms Loop</span>
                       </button>
                       <button type="button" class="userdata-audio-preset-btn text-left p-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 flex items-center gap-1.5 truncate" data-url="https://images.earthcam.com/audio/manhattan.mp3">
                         <span class="material-symbols-outlined text-orange-400 text-xs">sensors</span>
                         <span>Seismic Sensor Audio</span>
                       </button>
                     </div>
                   </div>
                 </div>
               </div>

               <!-- Accordion 4: Dynamic In-App Calling & Parsing -->
               <div class="border border-slate-700/60 bg-slate-900/40 rounded-xl overflow-hidden">
                 <button type="button" class="userdata-drawer-toggle w-full px-4 py-2.5 bg-slate-900/60 flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider" data-target="drawer-calling">
                   <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-cyan-400 font-bold">account_tree</span> 5.) Dynamic calling &amp; parsing</span>
                   <span class="material-symbols-outlined text-base transform transition duration-200">expand_more</span>
                 </button>
                 <div id="drawer-calling" class="userdata-drawer-pane hidden p-3 space-y-3">
                   <div class="space-y-1">
                     <label class="block text-[9px] font-bold text-slate-400 uppercase">A.) Pull data from Current Item tabs:</label>
                     <div class="grid grid-cols-2 gap-1.5">
                       <button type="button" class="userdata-call-btn flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500 rounded text-[10px] text-cyan-300 transition cursor-pointer" data-source="local" data-field="coords">
                         <span class="material-symbols-outlined text-xs">explore</span> Coordinates
                       </button>
                       <button type="button" class="userdata-call-btn flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500 rounded text-[10px] text-cyan-300 transition cursor-pointer" data-source="local" data-field="telemetry">
                         <span class="material-symbols-outlined text-xs">straighten</span> Telemetry
                       </button>
                       <button type="button" class="userdata-call-btn flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500 rounded text-[10px] text-cyan-300 transition cursor-pointer" data-source="local" data-field="attachments">
                         <span class="material-symbols-outlined text-xs">attach_file</span> Attachments List
                       </button>
                       <button type="button" class="userdata-call-btn flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500 rounded text-[10px] text-cyan-300 transition cursor-pointer" data-source="local" data-field="details">
                         <span class="material-symbols-outlined text-xs">badge</span> Detail Badge
                       </button>
                     </div>
                   </div>

                   <div class="space-y-1 pt-1.5 border-t border-slate-800">
                     <label class="block text-[9px] font-bold text-slate-400 uppercase">B.) Reference &amp; call neighboring tactical items:</label>
                     <div class="flex gap-2">
                       <select id="userdata-neighbor-select" class="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400">
                         <option value="">No other items available</option>
                       </select>
                       <button type="button" id="userdata-call-neighbor-btn" class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer">
                         Call Item
                       </button>
                     </div>
                   </div>

                   <!-- Technical Usage Guide -->
                   <div class="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 leading-relaxed font-sans space-y-1">
                     <span class="font-bold text-cyan-400 uppercase tracking-wider block">🎓 Technical Guide: How to use calling feature</span>
                     <p>1. <strong>Local Calls:</strong> Links fields from the current item. If coordinates change or files are added, the called card in your viewport updates in real-time.</p>
                     <p>2. <strong>Neighbor Calls:</strong> Reference another entity in the current project to sync its coordinates, distance, and description directly into this item's custom data display.</p>
                   </div>
                 </div>
               </div>
             </div>
          </div>

        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 border-t border-slate-700/80 bg-slate-900/60 flex items-center justify-between">
          <div>
            ${!isNew ? `
              <button type="button" id="delete-item-btn" class="px-3 py-2 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
                <span class="material-symbols-outlined text-base">delete</span> Delete
              </button>
            ` : ''}
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="cancel-item-modal-btn" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition">
              Cancel
            </button>
            <button type="button" id="save-item-modal-btn" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition">
              <span class="material-symbols-outlined text-base">check</span> OK
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // --- TAB NAVIGATION WIRING ---
  const tabBtns = modalRoot.querySelectorAll('.item-tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => {
        b.classList.remove('active', 'border-emerald-400', 'text-white');
        b.classList.add('border-transparent', 'text-slate-400');
      });
      btn.classList.add('active', 'border-emerald-400', 'text-white');
      btn.classList.remove('border-transparent', 'text-slate-400');

      const targetTab = btn.getAttribute('data-tab');
      modalRoot.querySelectorAll('.item-tab-pane').forEach((pane) => pane.classList.add('hidden'));
      modalRoot.querySelector(`#tab-${targetTab}`)?.classList.remove('hidden');

      // Pause audio/video players if we navigate away from userdata tab
      if (targetTab !== 'userdata') {
        const vpVideo = modalRoot.querySelector('#viewport-video-player');
        const vpAudio = modalRoot.querySelector('#viewport-audio-player');
        if (vpVideo && !vpVideo.paused) vpVideo.pause();
        if (vpAudio && !vpAudio.paused) vpAudio.pause();
      }

      if (targetTab === 'coordinates') {
        setTimeout(() => {
          if (!leafletMap) {
            initInteractiveMap();
          } else {
            leafletMap.invalidateSize();
            fitMapToCoordinates();
          }
        }, 60);
      }
    });
  });

  // --- CHAINED CATEGORY, SUBCATEGORY & LEVEL 3 SELECTION ---
  const catSelect = modalRoot.querySelector('#item-category-select');
  const subcatSelect = modalRoot.querySelector('#item-subcategory-select');
  const level3Select = modalRoot.querySelector('#item-level3-select');
  const customCatContainer = modalRoot.querySelector('#custom-cat-input-container');
  const customCatInput = modalRoot.querySelector('#custom-cat-input');
  const customSubContainer = modalRoot.querySelector('#custom-sub-input-container');
  const customSubInput = modalRoot.querySelector('#custom-sub-input');
  const customL3Container = modalRoot.querySelector('#custom-level3-input-container');
  const customL3Input = modalRoot.querySelector('#custom-level3-input');
  
  const detailCatBadge = modalRoot.querySelector('#detail-category-badge');
  const detailSubBadge = modalRoot.querySelector('#detail-subcategory-badge');
  const detailLevel3Badge = modalRoot.querySelector('#detail-level3-badge');

  // --- ICON & RECOMMENDED ICON ELEMENTS ---
  const iconSelect = modalRoot.querySelector('#item-icon-select');
  const customIconInput = modalRoot.querySelector('#item-custom-icon-url');
  const customIconFileInput = modalRoot.querySelector('#custom-icon-file-input');
  const dropzone = modalRoot.querySelector('#custom-icon-dropzone');
  const clearCustomIconBtn = modalRoot.querySelector('#clear-custom-icon-btn');
  const iconPreview = modalRoot.querySelector('#selected-icon-preview');

  function updateIconPreview() {
    if (!iconPreview) return;
    const effectiveIcon = itemData.customIconUrl || getCustomIconForPreset(itemData.level3, itemData.category, itemData.color);
    if (effectiveIcon) {
      iconPreview.innerHTML = `<img src="${escapeHtml(effectiveIcon)}" class="w-7 h-7 object-contain rounded" />`;
      if (itemData._hasUploadedCustomIcon) {
        clearCustomIconBtn?.classList.remove('hidden');
      } else {
        clearCustomIconBtn?.classList.add('hidden');
      }
    } else {
      iconPreview.innerHTML = `<span class="material-symbols-outlined text-2xl">${itemData.icon}</span>`;
      clearCustomIconBtn?.classList.add('hidden');
    }
  }

  function updateRecommendedIcons() {
    if (!iconSelect) return;
    const recommended = getRecommendedIcons(itemData.subcategory, itemData.level3);
    const currentVal = itemData.icon;

    iconSelect.innerHTML = '';
    recommended.forEach((ic) => {
      const opt = document.createElement('option');
      opt.value = ic.id;
      const score = getRecommendedIconScore(ic.id, itemData.subcategory, itemData.level3);
      opt.textContent = ic.label + (score > 0 ? ' ★' : '');
      if (ic.id === currentVal) {
        opt.selected = true;
      }
      iconSelect.appendChild(opt);
    });
  }

  // --- AI SUGGEST ELEMS ---
  const aiSuggestToggle = modalRoot.querySelector('#ai-suggest-toggle');
  const aiSuggestSpinner = modalRoot.querySelector('#ai-suggest-spinner');
  let aiSuggestEnabled = localStorage.getItem('gev_ai_suggest_enabled') === 'true';

  if (aiSuggestToggle) {
    aiSuggestToggle.checked = aiSuggestEnabled;
    aiSuggestToggle.addEventListener('change', (e) => {
      aiSuggestEnabled = e.target.checked;
      localStorage.setItem('gev_ai_suggest_enabled', aiSuggestEnabled ? 'true' : 'false');
      if (aiSuggestEnabled) {
        triggerAiSuggest();
      } else {
        populateLevel3(itemData.category, itemData.subcategory, itemData.level3);
      }
    });
  }

  let taxonomy = getAvailableCategories();

  function populateCategories(selectedCatName) {
    if (!catSelect) return;
    catSelect.innerHTML = '';

    const l1Options = getLevel1Options();
    l1Options.forEach((lvl1) => {
      const opt = document.createElement('option');
      opt.value = lvl1.label;
      opt.textContent = lvl1.label;
      if (lvl1.label === selectedCatName || lvl1.key === selectedCatName) opt.selected = true;
      catSelect.appendChild(opt);
    });

    // Also include any user-created custom categories not already in Level 1 options
    const customCategories = getAvailableCategories().filter(
      (c) => !l1Options.some((l1) => l1.label.toLowerCase() === c.name.toLowerCase() || l1.key.toLowerCase() === (c.key || '').toLowerCase())
    );
    customCategories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.name;
      opt.textContent = cat.name;
      if (cat.name === selectedCatName) opt.selected = true;
      catSelect.appendChild(opt);
    });

    const addOpt = document.createElement('option');
    addOpt.value = '__ADD_NEW_CATEGORY__';
    addOpt.textContent = '+ Add New Category...';
    addOpt.className = 'text-emerald-400 font-semibold';
    catSelect.appendChild(addOpt);

    const activeCat = catSelect.value;
    populateSubcategories(activeCat, itemData.subcategory);
  }

  function populateSubcategories(parentCatName, selectedSubcatName) {
    if (!subcatSelect) return;
    subcatSelect.innerHTML = '';

    const l2Options = getLevel2Options(parentCatName);
    const subList = l2Options.length > 0 ? l2Options.map((o) => o.label) : [];

    // Also check custom subcategories from user storage
    const foundCat = getAvailableCategories().find(
      (c) => c.name.toLowerCase() === (parentCatName || '').toLowerCase() || (c.key && c.key.toLowerCase() === (parentCatName || '').toLowerCase())
    );
    if (foundCat && foundCat.subcategories) {
      foundCat.subcategories.forEach((sub) => {
        if (!subList.includes(sub)) {
          subList.push(sub);
        }
      });
    }
    if (subList.length === 0) {
      subList.push('General');
    }

    subList.forEach((sub) => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      if (sub === selectedSubcatName) opt.selected = true;
      subcatSelect.appendChild(opt);
    });

    // If current selected subcategory wasn't in the list, keep it as an option
    if (selectedSubcatName && !subList.includes(selectedSubcatName) && selectedSubcatName !== '__ADD_NEW_SUBCATEGORY__') {
      const opt = document.createElement('option');
      opt.value = selectedSubcatName;
      opt.textContent = selectedSubcatName;
      opt.selected = true;
      subcatSelect.insertBefore(opt, subcatSelect.firstChild);
    }

    const addOpt = document.createElement('option');
    addOpt.value = '__ADD_NEW_SUBCATEGORY__';
    addOpt.textContent = '+ Add New Sub-Level...';
    addOpt.className = 'text-sky-400 font-semibold';
    subcatSelect.appendChild(addOpt);

    itemData.subcategory = subcatSelect.value !== '__ADD_NEW_SUBCATEGORY__' ? subcatSelect.value : (subList[0] || 'General');
    if (detailSubBadge) detailSubBadge.textContent = itemData.subcategory;

    populateLevel3(parentCatName, itemData.subcategory, itemData.level3);
  }

  function populateLevel3(parentCatName, parentSubcatName, selectedLevel3Name) {
    if (aiSuggestEnabled) {
      triggerAiSuggest();
      return;
    }

    if (!level3Select) return;
    level3Select.innerHTML = '';

    const presetList = getLevel3Presets(parentCatName, parentSubcatName);
    let hasSelected = false;

    presetList.forEach((lvl3) => {
      const opt = document.createElement('option');
      opt.value = lvl3;
      opt.textContent = lvl3;
      if (selectedLevel3Name && lvl3 === selectedLevel3Name) {
        opt.selected = true;
        hasSelected = true;
      }
      level3Select.appendChild(opt);
    });

    // If current selected level3 wasn't in the presets, keep it
    if (selectedLevel3Name && !presetList.includes(selectedLevel3Name) && selectedLevel3Name !== '__ADD_NEW_LEVEL3__') {
      const opt = document.createElement('option');
      opt.value = selectedLevel3Name;
      opt.textContent = selectedLevel3Name;
      opt.selected = true;
      hasSelected = true;
      level3Select.insertBefore(opt, level3Select.firstChild);
    }

    const addOpt = document.createElement('option');
    addOpt.value = '__ADD_NEW_LEVEL3__';
    addOpt.textContent = '+ Add Custom Classification...';
    addOpt.className = 'text-amber-400 font-semibold';
    level3Select.appendChild(addOpt);

    // If no option was explicitly selected, default to the first valid preset option!
    if (!hasSelected && level3Select.options.length > 0) {
      for (const opt of level3Select.options) {
        if (opt.value && opt.value !== '__ADD_NEW_LEVEL3__') {
          opt.selected = true;
          hasSelected = true;
          break;
        }
      }
    }

    itemData.level3 = level3Select.value !== '__ADD_NEW_LEVEL3__' ? level3Select.value : (presetList[0] || '');
    if (detailLevel3Badge) detailLevel3Badge.textContent = itemData.level3 || 'General';

    // Update item tactical icon
    const presetIcon = getCustomIconForPreset(itemData.level3, itemData.category, itemData.color);
    if (presetIcon && !itemData._hasUploadedCustomIcon) {
      itemData.customIconUrl = presetIcon;
      if (customIconInput) customIconInput.value = presetIcon.startsWith('data:') ? '[Auto-Generated Tactical Icon]' : presetIcon;
      updateIconPreview();
    }

    updateRecommendedIcons();
  }

  async function triggerAiSuggest() {
    if (!level3Select) return;
    const cat = itemData.category;
    const sub = itemData.subcategory;
    const desc = modalRoot.querySelector('#item-input-desc')?.value || '';

    level3Select.disabled = true;
    if (aiSuggestSpinner) aiSuggestSpinner.classList.remove('hidden');

    try {
      const res = await fetch('/api/gemini/suggest-level3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level1: cat, level2: sub, description: desc }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const suggestions = await res.json();
      populateLevel3WithOptions(suggestions);
    } catch (err) {
      console.error('Operation failed gracefully:', err);
      showNonBlockingNotification('Unable to fetch AI suggestions. Using cached presets.', 'warning');
      const defaults = getLevel3Presets(cat, sub);
      populateLevel3WithOptions(defaults);
    } finally {
      level3Select.disabled = false;
      if (aiSuggestSpinner) aiSuggestSpinner.classList.add('hidden');
    }
  }

  function populateLevel3WithOptions(optionsList) {
    if (!level3Select) return;
    level3Select.innerHTML = '';

    const currentL3 = itemData.level3;
    let anySelected = false;

    optionsList.forEach((optVal) => {
      const opt = document.createElement('option');
      opt.value = optVal;
      opt.textContent = optVal;
      if (currentL3 && optVal === currentL3) {
        opt.selected = true;
        anySelected = true;
      }
      level3Select.appendChild(opt);
    });

    if (currentL3 && !optionsList.includes(currentL3) && currentL3 !== '__ADD_NEW_LEVEL3__') {
      const opt = document.createElement('option');
      opt.value = currentL3;
      opt.textContent = currentL3;
      opt.selected = true;
      anySelected = true;
      level3Select.insertBefore(opt, level3Select.firstChild);
    }

    if (!anySelected && optionsList.length > 0) {
      if (level3Select.firstChild) {
        level3Select.firstChild.selected = true;
        itemData.level3 = level3Select.firstChild.value;
        if (detailLevel3Badge) detailLevel3Badge.textContent = itemData.level3;
      }
    }

    const addOpt = document.createElement('option');
    addOpt.value = '__ADD_NEW_LEVEL3__';
    addOpt.textContent = '+ Add Custom Classification...';
    addOpt.className = 'text-amber-400 font-semibold';
    level3Select.appendChild(addOpt);

    updateRecommendedIcons();
  }

  function onCategoryChange(e) {
    const val = e.target.value;
    if (val === '__ADD_NEW_CATEGORY__') {
      customCatContainer?.classList.remove('hidden');
      customCatInput?.focus();
    } else {
      customCatContainer?.classList.add('hidden');
      itemData.category = val;
      itemData.subcategory = ''; // Reset subcategory so it adopts the new category's subcategories
      itemData.level3 = ''; // Reset L3 to default on category change
      if (detailCatBadge) detailCatBadge.textContent = val;
      // Auto-update color accent if available and item color is default
      const catColor = getCategoryColor(val);
      if (isNew && catColor) {
        itemData.color = catColor;
        itemData.fillColor = catColor;
        const colorBadge = modalRoot.querySelector('#active-color-badge');
        if (colorBadge) colorBadge.style.backgroundColor = catColor;
      }
      populateSubcategories(val, '');
    }
  }

  catSelect?.addEventListener('change', onCategoryChange);
  catSelect?.addEventListener('input', onCategoryChange);

  function onSubcategoryChange(e) {
    const val = e.target.value;
    if (val === '__ADD_NEW_SUBCATEGORY__') {
      customSubContainer?.classList.remove('hidden');
      customSubInput?.focus();
    } else {
      customSubContainer?.classList.add('hidden');
      itemData.subcategory = val;
      itemData.level3 = ''; // Reset L3 to default on subcategory change
      if (detailSubBadge) detailSubBadge.textContent = val;
      populateLevel3(itemData.category, val, '');
    }
  }

  subcatSelect?.addEventListener('change', onSubcategoryChange);
  subcatSelect?.addEventListener('input', onSubcategoryChange);

  function onLevel3Change(e) {
    const val = e.target.value;
    if (val === '__ADD_NEW_LEVEL3__') {
      customL3Container?.classList.remove('hidden');
      customL3Input?.focus();
    } else {
      customL3Container?.classList.add('hidden');
      itemData.level3 = val;
      if (detailLevel3Badge) detailLevel3Badge.textContent = val || 'General';
      const presetIcon = getCustomIconForPreset(val, itemData.category, itemData.color);
      if (presetIcon && !itemData._hasUploadedCustomIcon) {
        itemData.customIconUrl = presetIcon;
        if (customIconInput) customIconInput.value = presetIcon.startsWith('data:') ? '[Auto-Generated Tactical Icon]' : presetIcon;
        updateIconPreview();
      }
      updateRecommendedIcons();
    }
  }

  level3Select?.addEventListener('change', onLevel3Change);
  level3Select?.addEventListener('input', onLevel3Change);

  modalRoot.querySelector('#confirm-custom-cat-btn')?.addEventListener('click', () => {
    const newCat = customCatInput?.value?.trim();
    if (!newCat) return;
    registerCustomCategory(newCat, 'General');
    itemData.category = newCat;
    itemData.subcategory = 'General';
    itemData.level3 = '';
    if (detailCatBadge) detailCatBadge.textContent = newCat;
    customCatInput.value = '';
    customCatContainer?.classList.add('hidden');
    populateCategories(newCat);
  });

  modalRoot.querySelector('#cancel-custom-cat-btn')?.addEventListener('click', () => {
    customCatContainer?.classList.add('hidden');
    if (catSelect) catSelect.value = itemData.category;
  });

  modalRoot.querySelector('#confirm-custom-sub-btn')?.addEventListener('click', () => {
    const newSub = customSubInput?.value?.trim();
    if (!newSub) return;
    registerCustomCategory(itemData.category, newSub);
    itemData.subcategory = newSub;
    itemData.level3 = '';
    if (detailSubBadge) detailSubBadge.textContent = newSub;
    customSubInput.value = '';
    customSubContainer?.classList.add('hidden');
    populateSubcategories(itemData.category, newSub);
  });

  modalRoot.querySelector('#cancel-custom-sub-btn')?.addEventListener('click', () => {
    customSubContainer?.classList.add('hidden');
    if (subcatSelect) subcatSelect.value = itemData.subcategory;
  });

  modalRoot.querySelector('#confirm-custom-level3-btn')?.addEventListener('click', () => {
    const newL3 = customL3Input?.value?.trim();
    if (!newL3) return;
    registerCustomClassification(itemData.category, itemData.subcategory, newL3);
    itemData.level3 = newL3;
    if (detailLevel3Badge) detailLevel3Badge.textContent = newL3;
    customL3Input.value = '';
    customL3Container?.classList.add('hidden');
    const customGenIcon = getCustomIconForPreset(newL3, itemData.category, itemData.color);
    if (customGenIcon && !itemData._hasUploadedCustomIcon) {
      itemData.customIconUrl = customGenIcon;
      if (customIconInput) customIconInput.value = customGenIcon.startsWith('data:') ? '[Auto-Generated Tactical Icon]' : customGenIcon;
      updateIconPreview();
    }
    populateLevel3(itemData.category, itemData.subcategory, newL3);
  });

  modalRoot.querySelector('#cancel-custom-level3-btn')?.addEventListener('click', () => {
    customL3Container?.classList.add('hidden');
    if (level3Select) level3Select.value = itemData.level3;
  });

  // Initial population of categories, subcategories, and level 3 presets
  populateCategories(itemData.category);

  // Open Taxonomy Import/Export Manager
  modalRoot.querySelector('#open-taxonomy-manager-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openTaxonomyImportExportModal({
      onUpdated: () => {
        populateCategories(itemData.category);
        populateSubcategories(itemData.category, itemData.subcategory);
        populateLevel3(itemData.category, itemData.subcategory, itemData.level3);
      },
    });
  });

  // Global taxonomy updated listener
  const onTaxonomyUpdated = () => {
    populateCategories(itemData.category);
    populateSubcategories(itemData.category, itemData.subcategory);
    populateLevel3(itemData.category, itemData.subcategory, itemData.level3);
  };
  window.addEventListener('gev:taxonomy-updated', onTaxonomyUpdated);

  customIconInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!val) {
      itemData._hasUploadedCustomIcon = false;
      itemData.customIconUrl = null;
      const autoIcon = getCustomIconForPreset(itemData.level3, itemData.category);
      if (autoIcon) {
        itemData.customIconUrl = autoIcon;
      }
    } else {
      itemData._hasUploadedCustomIcon = val !== '[Auto-Generated Tactical Icon]';
      if (val !== '[Auto-Generated Tactical Icon]') {
        itemData.customIconUrl = val;
      }
    }
    updateIconPreview();
  });

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-cyan-400', 'bg-cyan-950/20');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        if (file.size > 512000) { // 500 KB limit
          openAlertModal({
            title: 'File Too Large',
            message: 'Custom icon files must be under 500 KB to optimize loading times.',
            alertType: 'amber',
          });
          return;
        }
        handleImageFile(file, (base64Url) => {
          itemData._hasUploadedCustomIcon = true;
          itemData.customIconUrl = base64Url;
          if (customIconInput) customIconInput.value = '[Uploaded Custom Icon]';
          updateIconPreview();
        });
      }
    });

    dropzone.addEventListener('click', () => {
      customIconFileInput?.click();
    });
  }

  customIconFileInput?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      if (file.size > 512000) { // 500 KB limit
        openAlertModal({
          title: 'File Too Large',
          message: 'Custom icon files must be under 500 KB to optimize loading times.',
          alertType: 'amber',
        });
        return;
      }
      handleImageFile(file, (base64Url) => {
        itemData._hasUploadedCustomIcon = true;
        itemData.customIconUrl = base64Url;
        if (customIconInput) customIconInput.value = '[Uploaded Custom Icon]';
        updateIconPreview();
      });
    }
  });

  clearCustomIconBtn?.addEventListener('click', () => {
    itemData._hasUploadedCustomIcon = false;
    itemData.customIconUrl = null;
    if (customIconInput) customIconInput.value = '';
    const autoIcon = getCustomIconForPreset(itemData.level3, itemData.category);
    if (autoIcon) {
      itemData.customIconUrl = autoIcon;
      if (customIconInput) customIconInput.value = autoIcon.startsWith('data:') ? '[Auto-Generated Tactical Icon]' : autoIcon;
    }
    updateIconPreview();
  });

  // --- RICH FORMATTING BUTTONS ---
  const descTextarea = modalRoot.querySelector('#item-input-desc');
  modalRoot.querySelector('#fmt-bold-btn')?.addEventListener('click', () => {
    wrapSelection(descTextarea, '**', '**');
  });
  modalRoot.querySelector('#fmt-italic-btn')?.addEventListener('click', () => {
    wrapSelection(descTextarea, '*', '*');
  });
  modalRoot.querySelector('#fmt-list-btn')?.addEventListener('click', () => {
    wrapSelection(descTextarea, '\n- ', '');
  });

  // --- ICON SELECTOR ---
  iconSelect?.addEventListener('change', (e) => {
    itemData.icon = e.target.value;
    updateIconPreview();
  });

  // --- INLINE 16-COLOR SWATCH GRID & TACTICAL THEME HANDLERS ---
  const updateActiveColor = (newColor) => {
    if (!newColor) return;
    itemData.color = newColor;
    itemData.fillColor = newColor;

    const indicator = modalRoot.querySelector('#active-color-swatch-indicator');
    if (indicator) indicator.style.backgroundColor = newColor;
    const hexText = modalRoot.querySelector('#active-color-hex-text');
    if (hexText) hexText.textContent = newColor;
    const colorPicker = modalRoot.querySelector('#inspector-color-picker');
    if (colorPicker && colorPicker.value.toLowerCase() !== newColor.toLowerCase()) {
      colorPicker.value = newColor;
    }

    modalRoot.querySelectorAll('#inspector-color-swatches .swatch-cell').forEach((btn) => {
      const isSelected = btn.getAttribute('data-color')?.toLowerCase() === newColor.toLowerCase();
      if (isSelected) {
        btn.classList.add('ring-2', 'ring-emerald-400', 'ring-offset-1', 'ring-offset-slate-900', 'scale-105', 'border-white');
        btn.innerHTML = '<span class="material-symbols-outlined text-[13px] text-white drop-shadow">check</span>';
      } else {
        btn.classList.remove('ring-2', 'ring-emerald-400', 'ring-offset-1', 'ring-offset-slate-900', 'scale-105', 'border-white');
        btn.innerHTML = '';
      }
    });

    // Re-render tactical vector badge in the new color theme!
    if (!itemData._hasUploadedCustomIcon) {
      const presetIcon = getCustomIconForPreset(itemData.level3, itemData.category, newColor);
      if (presetIcon) {
        itemData.customIconUrl = presetIcon;
        if (customIconInput) customIconInput.value = presetIcon.startsWith('data:') ? '[Auto-Generated Tactical Icon]' : presetIcon;
        updateIconPreview();
      }
    } else {
      updateIconPreview();
    }

    if (inspectorLeafletMap) {
      updateMapGeometry();
    }
  };

  modalRoot.querySelectorAll('#inspector-color-swatches .swatch-cell').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const col = btn.getAttribute('data-color');
      if (col) updateActiveColor(col);
    });
  });

  // Tactical Affiliation Theme buttons
  modalRoot.querySelectorAll('.tactical-theme-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-theme-action');
      if (action === 'auto-domain') {
        const domColor = getDomainColor(itemData.category) || '#3b82f6';
        updateActiveColor(domColor);
      } else {
        const themeColor = btn.getAttribute('data-theme-color');
        if (themeColor) updateActiveColor(themeColor);
      }
    });
  });

  // Custom Color Picker input
  const colorPickerElem = modalRoot.querySelector('#inspector-color-picker');
  colorPickerElem?.addEventListener('input', (e) => {
    const col = e.target.value;
    if (col) updateActiveColor(col);
  });

  // Inline User Guide toggle and dismiss
  const guideToggleBtn = modalRoot.querySelector('#toggle-tactical-guide-btn');
  const guidePanelElem = modalRoot.querySelector('#tactical-guide-panel');
  guideToggleBtn?.addEventListener('click', () => {
    const isHidden = guidePanelElem?.classList.contains('hidden');
    if (isHidden) {
      guidePanelElem?.classList.remove('hidden');
      guideToggleBtn.innerHTML = '<span class="material-symbols-outlined text-xs">close</span> Hide Guide';
    } else {
      guidePanelElem?.classList.add('hidden');
      guideToggleBtn.innerHTML = '<span class="material-symbols-outlined text-xs">help_outline</span> Instructions & Guide';
    }
  });

  modalRoot.querySelector('#close-tactical-guide-btn')?.addEventListener('click', () => {
    guidePanelElem?.classList.add('hidden');
    if (guideToggleBtn) guideToggleBtn.innerHTML = '<span class="material-symbols-outlined text-xs">help_outline</span> Instructions & Guide';
  });

  // Map Hover Behavior Radio selector change
  modalRoot.querySelectorAll('input[name="item-hover-behavior"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      itemData.hoverBehavior = e.target.value;
      if (inspectorLeafletMap) {
        updateMapGeometry();
      }
    });
  });

  // --- COORDINATES GEOCODING & MY LOCATION ---
  const latInput = modalRoot.querySelector('#coord-lat');
  const lngInput = modalRoot.querySelector('#coord-lng');
  const coordDisplay = modalRoot.querySelector('#coord-display');
  const statusMsg = modalRoot.querySelector('#coord-status-msg');

  function updateCoordsUI(lat, lng, skipMapRefresh = false) {
    const safeLat = Number(lat) || 0;
    const safeLng = Number(lng) || 0;
    latInput.value = safeLat.toFixed(6);
    lngInput.value = safeLng.toFixed(6);
    coordDisplay.textContent = `${safeLat.toFixed(6)}, ${safeLng.toFixed(6)}`;
    const mgrsDisplay = modalRoot.querySelector('#coord-mgrs-display');
    if (mgrsDisplay) {
      mgrsDisplay.textContent = formatMgrsSpaced(toMgrsString(safeLat, safeLng, 5));
    }
    if (parsedCoords.length > 0) {
      parsedCoords[0].lat = safeLat;
      parsedCoords[0].lng = safeLng;
    } else {
      parsedCoords = [{ lat: safeLat, lng: safeLng, alt: 0 }];
    }
    // Live update geodetic telemetry metrics!
    liveMetrics = extractGeodeticMetrics(parsedCoords, itemData.measurementType || itemData.type);
    renderGeodeticTelemetry();

    // Auto-update interactive 2D map geometry
    if (inspectorLeafletMap && !skipMapRefresh) {
      updateMapGeometry();
    }
  }

  // --- INTERACTIVE LEAFLET 2D DISPLAY MAP CONTROLLER ---
  let inspectorLeafletMap = null;
  let leafletMap = null;
  let satelliteLayer = null;
  let streetLayer = null;
  let isSatellite = true;
  let shapeLayer = null;
  let markerGroup = null;

  function initInteractiveMap() {
    const mapContainer = modalRoot.querySelector('#inspector-leaflet-preview') || modalRoot.querySelector('#inspector-leaflet-map');
    if (!mapContainer) return;

    // Explicit disposal of prior instance before re-initializing (prevents "Map container is already initialized")
    if (inspectorLeafletMap) {
      try {
        inspectorLeafletMap.off(); // Remove all event listeners
        inspectorLeafletMap.remove(); // Unmount and release DOM/memory references
      } catch (cleanErr) {
        console.warn('Leaflet preview map pre-cleanup note:', cleanErr);
      }
      inspectorLeafletMap = null;
      leafletMap = null;
    }

    try {
      inspectorLeafletMap = L.map(mapContainer, {
        zoomControl: false,
        attributionControl: false,
      });
      leafletMap = inspectorLeafletMap;

      satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      );
      streetLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19 }
      );

      // Default to Satellite basemap
      satelliteLayer.addTo(leafletMap);

      // Layer switcher button
      const toggleLayerBtn = modalRoot.querySelector('#map-toggle-layer-btn');
      const layerLabel = modalRoot.querySelector('#map-layer-label');
      toggleLayerBtn?.addEventListener('click', () => {
        isSatellite = !isSatellite;
        if (isSatellite) {
          leafletMap.removeLayer(streetLayer);
          satelliteLayer.addTo(leafletMap);
          if (layerLabel) layerLabel.textContent = 'Satellite';
        } else {
          leafletMap.removeLayer(satelliteLayer);
          streetLayer.addTo(leafletMap);
          if (layerLabel) layerLabel.textContent = 'Street';
        }
      });

      // Zoom in / out buttons
      modalRoot.querySelector('#map-zoom-in-btn')?.addEventListener('click', () => {
        leafletMap?.zoomIn();
      });
      modalRoot.querySelector('#map-zoom-out-btn')?.addEventListener('click', () => {
        leafletMap?.zoomOut();
      });

      // Recenter button
      modalRoot.querySelector('#map-recenter-btn')?.addEventListener('click', () => {
        fitMapToCoordinates();
      });

      // Google Street View launcher button
      modalRoot.querySelector('#launch-street-view-btn')?.addEventListener('click', () => {
        const pt = parsedCoords[0] || { lat: primaryLat, lng: primaryLng };
        openGoogleStreetViewModal(pt.lat, pt.lng, itemData.name);
      });

      updateMapGeometry();
    } catch (err) {
      console.warn('Leaflet interactive map initialization error:', err);
    }
  }

  function updateMapGeometry() {
    if (!leafletMap) return;

    if (shapeLayer) {
      leafletMap.removeLayer(shapeLayer);
      shapeLayer = null;
    }
    if (markerGroup) {
      leafletMap.removeLayer(markerGroup);
      markerGroup = null;
    }

    markerGroup = L.layerGroup().addTo(leafletMap);

    if (parsedCoords.length === 0) {
      leafletMap.setView([primaryLat, primaryLng], 13);
      return;
    }

    const latLngs = parsedCoords.map((c) => [c.lat, c.lng]);
    const color = itemData.color || '#3b82f6';
    const fillColor = itemData.fillColor || color;
    const fillOpacity = itemData.fillOpacity ?? 0.45;

    if (itemData.type === 'polygon' && latLngs.length >= 3) {
      shapeLayer = L.polygon(latLngs, {
        color: color,
        weight: 3,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
      }).addTo(leafletMap);
    } else if (itemData.type === 'polyline' && latLngs.length >= 2) {
      shapeLayer = L.polyline(latLngs, {
        color: color,
        weight: 3,
      }).addTo(leafletMap);
    }

    // Numbered vertex markers for every waypoint
    latLngs.forEach(([lat, lng], idx) => {
      const isPrimary = idx === 0;
      let icon;
      if (isPrimary && itemData.type === 'marker') {
        const domainColor = getDomainColor(itemData.category) || itemData.color || '#3b82f6';
        const iconUrl = itemData.customIconUrl || getCustomIconForPreset(itemData.level3, itemData.category);
        const iconHtml = iconUrl
          ? `<img src="${iconUrl}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 50%;" />`
          : `<span class="material-symbols-outlined" style="color: #ffffff; font-size: 16px;">${itemData.icon || 'pin_drop'}</span>`;

        icon = L.divIcon({
          className: 'custom-leaflet-tactical-icon',
          html: `
            <div style="
              background: #0f172a;
              border: 2px solid ${domainColor};
              border-radius: 9999px;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.85);
            ">${iconHtml}</div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
      } else {
        icon = createVertexDivIcon(idx + 1, isPrimary);
      }
      const m = L.marker([lat, lng], {
        icon,
        draggable: true,
      });
      if (itemData.type === 'marker') {
        const hoverMode = itemData.hoverBehavior || 'bubble';
        if (hoverMode !== 'none') {
          const hoverHtml = getTacticalHoverHtml(itemData, hoverMode);
          if (hoverHtml) {
            m.bindTooltip(hoverHtml, {
              direction: 'top',
              className: hoverMode === 'dialog' ? 'tactical-dialog-leaflet-tooltip' : 'tactical-bubble-leaflet-tooltip',
              opacity: 1,
              offset: [0, -10],
            });
          }
        }
      } else {
        m.bindTooltip(`Node #${idx + 1}<br>${lat.toFixed(5)}°, ${lng.toFixed(5)}° (Drag to relocate)`, { direction: 'top' });
      }
      m.addTo(markerGroup);

      const onMarkerMove = (evt) => {
        const newPos = evt.target.getLatLng();
        if (parsedCoords[idx]) {
          parsedCoords[idx].lat = newPos.lat;
          parsedCoords[idx].lng = newPos.lng;
        }
        if (idx === 0) {
          updateCoordsUI(newPos.lat, newPos.lng, true);
        } else {
          liveMetrics = extractGeodeticMetrics(parsedCoords, itemData.measurementType || itemData.type);
          renderGeodeticTelemetry();
        }
        if (shapeLayer) {
          shapeLayer.setLatLngs(parsedCoords.map((c) => [c.lat, c.lng]));
        }
      };

      m.on('drag', onMarkerMove);
      m.on('dragend', (evt) => {
        onMarkerMove(evt);
        if (inspectorLeafletMap) updateMapGeometry();
      });

      m.on('click', () => {
        leafletMap.panTo([lat, lng]);
      });
    });

    // Centroid MOVE handle for whole shape translation directly in 2D preview
    if (parsedCoords.length > 1) {
      let sumLat = 0, sumLng = 0;
      parsedCoords.forEach((c) => { sumLat += c.lat; sumLng += c.lng; });
      const centLat = sumLat / parsedCoords.length;
      const centLng = sumLng / parsedCoords.length;

      const centroidIcon = L.divIcon({
        className: 'custom-leaflet-centroid-icon',
        html: `
          <div style="
            background: #d97706;
            color: #ffffff;
            border: 2px solid #ffffff;
            border-radius: 9999px;
            padding: 2px 8px;
            font-family: sans-serif;
            font-weight: 700;
            font-size: 11px;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            gap: 2px;
          ">✥ MOVE</div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12],
      });

      let lastCentroidPos = { lat: centLat, lng: centLng };
      const centroidMarker = L.marker([centLat, centLng], {
        icon: centroidIcon,
        draggable: true,
      }).addTo(markerGroup);

      centroidMarker.bindTooltip("Drag centroid to move whole shape", { direction: 'top' });

      const onCentroidMove = (evt) => {
        const newPos = evt.target.getLatLng();
        const deltaLat = newPos.lat - lastCentroidPos.lat;
        const deltaLng = newPos.lng - lastCentroidPos.lng;
        lastCentroidPos = { lat: newPos.lat, lng: newPos.lng };

        parsedCoords.forEach((c) => {
          c.lat += deltaLat;
          c.lng += deltaLng;
        });

        const primaryL = parsedCoords[0]?.lat ?? 0;
        const primaryG = parsedCoords[0]?.lng ?? 0;
        updateCoordsUI(primaryL, primaryG, true);

        if (shapeLayer) {
          shapeLayer.setLatLngs(parsedCoords.map((c) => [c.lat, c.lng]));
        }
      };

      centroidMarker.on('drag', onCentroidMove);
      centroidMarker.on('dragend', (evt) => {
        onCentroidMove(evt);
        if (inspectorLeafletMap) updateMapGeometry();
      });
    }

    fitMapToCoordinates();
  }

  function fitMapToCoordinates() {
    if (!leafletMap || parsedCoords.length === 0) return;
    if (parsedCoords.length === 1) {
      leafletMap.setView([parsedCoords[0].lat, parsedCoords[0].lng], 14);
    } else if (shapeLayer) {
      try {
        leafletMap.fitBounds(shapeLayer.getBounds(), { padding: [24, 24], maxZoom: 16 });
      } catch (_e) {
        leafletMap.setView([parsedCoords[0].lat, parsedCoords[0].lng], 14);
      }
    } else {
      const bounds = L.latLngBounds(parsedCoords.map((c) => [c.lat, c.lng]));
      leafletMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }
  }

  // --- GEODETIC TELEMETRY & AUTO-UPDATE LOGIC ---
  function renderGeodeticTelemetry() {
    const geoContent = modalRoot.querySelector('#inspector-geo-content');
    const geoBadge = modalRoot.querySelector('#inspector-geo-badge');
    const geoPoints = modalRoot.querySelector('#inspector-geo-points');
    const verticesList = modalRoot.querySelector('#inspector-vertices-list');
    const verticesContainer = modalRoot.querySelector('#inspector-vertices-container');
    const detailGeoRows = modalRoot.querySelector('#detail-geodetic-rows');

    if (!geoContent) return;

    const mType = liveMetrics?.measurementType || itemData.type;
    if (geoBadge) geoBadge.textContent = mType.toUpperCase();
    if (geoPoints) geoPoints.textContent = `${parsedCoords.length} coordinates captured`;

    if (mType === 'bearing') {
      geoContent.innerHTML = `
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">True Forward Bearing</div>
          <div class="text-sm font-bold text-cyan-300 font-mono">${liveMetrics.forwardFormatted || `${liveMetrics.forwardBearingDeg}° ${liveMetrics.forwardCardinal}`}</div>
          <div class="text-[10px] text-slate-400">Reciprocal: <span class="text-amber-300">${liveMetrics.reciprocalFormatted || `${liveMetrics.backAzimuthDeg}°`}</span></div>
        </div>
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Geodesic Range</div>
          <div class="text-sm font-bold text-emerald-300 font-mono">${liveMetrics.rangeFormatted || `${liveMetrics.distanceMeters} m`}</div>
          <div class="text-[10px] text-slate-400">Quadrant: <span class="text-white">${liveMetrics.forwardCardinal || 'N'}</span></div>
        </div>
      `;
    } else if (mType === 'elevation') {
      geoContent.innerHTML = `
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Elevation Delta (Δh)</div>
          <div class="text-sm font-bold text-emerald-300 font-mono">${liveMetrics.deltaFormatted || `Δh ${liveMetrics.deltaM} m`}</div>
          <div class="text-[10px] text-slate-400">${liveMetrics.basePeakFormatted || `Base: ${liveMetrics.baseAltitudeM}m ➔ Peak: ${liveMetrics.peakAltitudeM}m`}</div>
        </div>
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Slope Grade &amp; Incline</div>
          <div class="text-sm font-bold text-cyan-300 font-mono">${liveMetrics.slopeFormatted || `${liveMetrics.slopePct}%`}</div>
          <div class="text-[10px] text-slate-400">Slant Range: <span class="text-white">${liveMetrics.slantDistKm >= 1 ? `${liveMetrics.slantDistKm} km` : `${liveMetrics.slantDistM} m`}</span></div>
        </div>
      `;
    } else if (mType === 'area') {
      geoContent.innerHTML = `
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Enclosed Surface Area</div>
          <div class="text-sm font-bold text-cyan-300 font-mono">${liveMetrics.areaFormatted || `${liveMetrics.areaHectares} ha`}</div>
          <div class="text-[10px] text-slate-400">${liveMetrics.areaAcres ? `${liveMetrics.areaAcres} acres` : ''}</div>
        </div>
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Total Perimeter</div>
          <div class="text-sm font-bold text-emerald-300 font-mono">${liveMetrics.perimeterFormatted || `${liveMetrics.perimeterMeters} m`}</div>
          <div class="text-[10px] text-slate-400">${liveMetrics.perimeterNm ? `${liveMetrics.perimeterNm} NM` : ''}</div>
        </div>
      `;
    } else {
      geoContent.innerHTML = `
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Total Geodesic Distance</div>
          <div class="text-sm font-bold text-amber-300 font-mono">${liveMetrics.distanceFormatted || `${liveMetrics.totalMeters || 0} m`}</div>
          <div class="text-[10px] text-slate-400">Nautical: <span class="text-white">${liveMetrics.totalNm || 0} NM</span></div>
        </div>
        <div class="p-2 bg-slate-900/80 rounded border border-slate-700/60">
          <div class="text-[9px] text-slate-400 uppercase font-sans">Waypoint Nodes</div>
          <div class="text-sm font-bold text-sky-300 font-mono">${liveMetrics.pointCount || parsedCoords.length} Nodes</div>
          <div class="text-[10px] text-slate-400">Clamped to Globe</div>
        </div>
      `;
    }

    if (verticesList && verticesContainer) {
      if (parsedCoords.length > 1) {
        verticesContainer.classList.remove('hidden');
        verticesList.innerHTML = parsedCoords.map((pt, idx) => `
          <div class="vertex-coord-row flex items-center justify-between p-1.5 rounded bg-slate-950/70 border border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900 cursor-pointer transition select-none" data-vertex-index="${idx}" title="Click to focus node on map">
            <span class="text-cyan-400 font-bold flex items-center gap-1.5">
              <span class="w-4 h-4 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/60 text-[9px] flex items-center justify-center font-mono">${idx + 1}</span>
              <span class="text-[10px] text-slate-400">Node</span>
            </span>
            <span class="text-slate-200 font-mono">${Number(pt.lat).toFixed(5)}°, ${Number(pt.lng).toFixed(5)}°</span>
            <span class="text-amber-300 font-mono text-[10px]">${formatMgrsSpaced(toMgrsString(pt.lat, pt.lng, 5))}</span>
            <span class="text-sky-300 font-mono text-[10px]">${Math.round(pt.alt || 0)} m</span>
          </div>
        `).join('');

        verticesList.querySelectorAll('.vertex-coord-row').forEach((rowEl) => {
          rowEl.addEventListener('click', () => {
            const idx = Number(rowEl.getAttribute('data-vertex-index'));
            const pt = parsedCoords[idx];
            if (pt && leafletMap) {
              leafletMap.flyTo([pt.lat, pt.lng], Math.max(14, leafletMap.getZoom()), { duration: 0.8 });
            }
          });
        });
      } else {
        verticesContainer.classList.add('hidden');
      }
    }

    if (detailGeoRows) {
      const firstPt = parsedCoords[0] || {};
      const mgrsVal = formatMgrsSpaced(toMgrsString(firstPt.lat, firstPt.lng, 5));
      detailGeoRows.innerHTML = `
        <div class="flex justify-between py-1 border-b border-slate-800">
          <span class="text-slate-400">Measurement Mode</span>
          <span class="font-mono text-cyan-300 uppercase">${mType}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-slate-800">
          <span class="text-slate-400">Military Grid Ref (MGRS)</span>
          <span class="font-mono text-amber-300 font-semibold">${mgrsVal}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-slate-800">
          <span class="text-slate-400">Geodetic Summary</span>
          <span class="text-white text-right max-w-[280px] truncate" title="${escapeHtml(liveMetrics?.summary || '')}">${escapeHtml(liveMetrics?.summary || 'N/A')}</span>
        </div>
      `;
    }

    // Dynamic reactive updates to vertex counters & topology warnings
    const tab2Count = modalRoot.querySelector('#tab2-vertex-count');
    if (tab2Count) tab2Count.textContent = `${parsedCoords.length}`;

    const vertexCountEl = modalRoot.querySelector('#detail-vertex-count');
    if (vertexCountEl) {
      if (liveMetrics?.isSelfIntersecting) {
        vertexCountEl.innerHTML = `${parsedCoords.length} pts <span class="text-rose-400 font-semibold text-[10px] bg-rose-950/70 px-1.5 py-0.5 rounded border border-rose-500/40">⚠️ Bowtie</span>`;
      } else {
        vertexCountEl.textContent = `${parsedCoords.length} pts`;
      }
    }

    const bowtieTab2 = modalRoot.querySelector('#tab2-bowtie-warning');
    if (bowtieTab2) {
      bowtieTab2.classList.toggle('hidden', !liveMetrics?.isSelfIntersecting);
    }

    const detailBowtie = modalRoot.querySelector('#detail-bowtie-row');
    if (detailBowtie) {
      detailBowtie.classList.toggle('hidden', !liveMetrics?.isSelfIntersecting);
    }
  }

  // Initial render of telemetry
  renderGeodeticTelemetry();

  // --- IN-CANVAS VERTEX EDITING ON CESIUM GLOBE ---
  const editOnGlobeBtn = modalRoot.querySelector('#edit-on-globe-btn');
  editOnGlobeBtn?.addEventListener('click', () => {
    const activeMgr = mapProjectManager || getMapProjectManager() || (typeof window !== 'undefined' ? window.__mapProjectManager : null);
    if (activeMgr && typeof activeMgr.startVertexEditSession === 'function') {
      const modalBackdrop = modalRoot.querySelector('#item-modal-backdrop');
      if (modalBackdrop) modalBackdrop.style.display = 'none';

      activeMgr.startVertexEditSession(
        {
          ...itemData,
          coordinates: JSON.stringify(parsedCoords),
        },
        (updatedItem, newCoords, cancelled) => {
          if (modalBackdrop) modalBackdrop.style.display = 'flex';
          if (!cancelled && newCoords && Array.isArray(newCoords)) {
            parsedCoords = newCoords;
            itemData.coordinates = JSON.stringify(newCoords);
            liveMetrics = extractGeodeticMetrics(parsedCoords, itemData.measurementType || itemData.type);
            renderGeodeticTelemetry();

            // Refresh locator displays in Tab 2
            const primaryL = parsedCoords[0]?.lat ?? 0;
            const primaryG = parsedCoords[0]?.lng ?? 0;
            const coordDisp = modalRoot.querySelector('#coord-display');
            if (coordDisp) coordDisp.textContent = `${primaryL.toFixed(6)}, ${primaryG.toFixed(6)}`;
            const mgrsDisp = modalRoot.querySelector('#coord-mgrs-display');
            if (mgrsDisp) mgrsDisp.textContent = formatMgrsSpaced(toMgrsString(primaryL, primaryG, 5));

            // Refresh interactive 2D map
            if (leafletMap) {
              leafletMap.invalidateSize();
              updateMapGeometry();
            }
          }
        }
      );
    } else {
      openAlertModal({
        title: 'Notice',
        message: 'Map Project Manager is not ready for in-canvas vertex editing.',
        alertType: 'amber',
      });
    }
  });

  // --- NATO MGRS TABLE CLIPBOARD COPY ---
  const handleCopyMgrsTable = () => {
    const text = generateMgrsTableText(itemData, parsedCoords, liveMetrics);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const toast = modalRoot.querySelector('#export-toast-msg');
        if (toast) {
          toast.textContent = `✓ Copied NATO MGRS Table (${parsedCoords.length} pts) to clipboard!`;
          setTimeout(() => { if (toast) toast.textContent = ''; }, 4000);
        }
      });
    } else {
      prompt('Copy NATO MGRS Table:', text);
    }
  };
  modalRoot.querySelector('#copy-mgrs-table-btn')?.addEventListener('click', handleCopyMgrsTable);
  modalRoot.querySelector('#copy-mgrs-table-btn-tab2')?.addEventListener('click', handleCopyMgrsTable);

  // --- 1-CLICK GIS EXPORTERS (GEOJSON & KML) ---
  modalRoot.querySelector('#export-geojson-btn')?.addEventListener('click', () => {
    const geojson = generateItemGeoJson(itemData, parsedCoords);
    const filename = `${(itemData.name || 'item').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.geojson`;
    downloadFile(filename, JSON.stringify(geojson, null, 2), 'application/geo+json');
    const toast = modalRoot.querySelector('#export-toast-msg');
    if (toast) {
      toast.textContent = `✓ Downloaded ${filename}`;
      setTimeout(() => { if (toast) toast.textContent = ''; }, 4000);
    }
  });

  modalRoot.querySelector('#export-kml-btn')?.addEventListener('click', () => {
    const kml = generateItemKml(itemData, parsedCoords);
    const filename = `${(itemData.name || 'item').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.kml`;
    downloadFile(filename, kml, 'application/vnd.google-earth.kml+xml');
    const toast = modalRoot.querySelector('#export-toast-msg');
    if (toast) {
      toast.textContent = `✓ Downloaded ${filename}`;
      setTimeout(() => { if (toast) toast.textContent = ''; }, 4000);
    }
  });

  // Push / Sync to Description button
  modalRoot.querySelector('#sync-geodetic-desc-btn')?.addEventListener('click', () => {
    const descTextarea = modalRoot.querySelector('#item-input-desc');
    if (descTextarea && liveMetrics) {
      descTextarea.value = generateGeodeticDescription(liveMetrics, descTextarea.value);
      itemData.description = descTextarea.value;
    }
  });

  latInput?.addEventListener('input', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) updateCoordsUI(lat, lng);
  });
  lngInput?.addEventListener('input', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) updateCoordsUI(lat, lng);
  });

  modalRoot.querySelector('#coord-search-btn')?.addEventListener('click', async () => {
    const searchBtn = modalRoot.querySelector('#coord-search-btn');
    const searchInput = modalRoot.querySelector('#coord-search-input');
    const query = searchInput?.value?.trim();
    if (!query) return;

    try {
      if (searchBtn) searchBtn.disabled = true;
      if (searchInput) searchInput.disabled = true;
      statusMsg.textContent = 'Searching location...';

      let found = false;
      try {
        const resp = await fetch(`/api/google/text-search?query=${encodeURIComponent(query)}`);
        if (resp.ok) {
          const data = await resp.json();
          const loc = data.results?.[0]?.geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            updateCoordsUI(loc.lat, loc.lng);
            statusMsg.textContent = `Found: ${data.results[0].formatted_address || query}`;
            found = true;
          }
        }
      } catch (err1) {
        console.warn('Google text search failed, trying fallback:', err1);
      }

      if (!found) {
        try {
          const resp2 = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`);
          if (resp2.ok) {
            const data2 = await resp2.json();
            const loc = data2.results?.[0]?.geometry?.location;
            if (loc) {
              updateCoordsUI(loc.lat, loc.lng);
              statusMsg.textContent = `Found: ${data2.results[0].formatted_address || query}`;
              found = true;
            }
          }
        } catch (err2) {
          console.warn('Geocode fallback failed:', err2);
        }
      }

      if (!found) {
        statusMsg.textContent = 'Location not found.';
        showNonBlockingNotification('Unable to resolve coordinates. Check query.', 'warning');
      }
    } catch (error) {
      console.error('Coordinate search operation failed gracefully:', error);
      showNonBlockingNotification('Unable to fetch remote geodata. Using cached fallback.', 'warning');
    } finally {
      if (searchBtn) searchBtn.disabled = false;
      if (searchInput) searchInput.disabled = false;
    }
  });

  modalRoot.querySelector('#my-location-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      statusMsg.textContent = 'Geolocation not supported in browser.';
      return;
    }
    statusMsg.textContent = 'Acquiring GPS fix...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCoordsUI(pos.coords.latitude, pos.coords.longitude);
        statusMsg.textContent = 'GPS location acquired.';
      },
      (err) => {
        statusMsg.textContent = `GPS error: ${err.message}`;
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });

  // --- ATTACHMENTS (IMAGE URL + DRAG-AND-DROP FILE UPLOAD) ---
  const imageUrlInput = modalRoot.querySelector('#item-image-url');
  const previewContainer = modalRoot.querySelector('#image-preview-container');
  const imagePreview = modalRoot.querySelector('#attached-image-preview');
  const dropZone = modalRoot.querySelector('#drop-zone');
  const fileInput = modalRoot.querySelector('#file-upload-input');

  function updateImage(url) {
    itemData.imageUrl = url;
    imageUrlInput.value = url.startsWith('data:') ? '[Uploaded File Attachment]' : url;
    if (url) {
      imagePreview.src = url;
      previewContainer.classList.remove('hidden');
    } else {
      previewContainer.classList.add('hidden');
    }
  }

  imageUrlInput?.addEventListener('input', (e) => {
    updateImage(e.target.value.trim());
  });

  modalRoot.querySelector('#remove-image-btn')?.addEventListener('click', () => {
    imageUrlInput.value = '';
    updateImage('');
  });

  dropZone?.addEventListener('click', () => fileInput.click());
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-emerald-400', 'bg-emerald-950/20');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-emerald-400', 'bg-emerald-950/20');
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-emerald-400', 'bg-emerald-950/20');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageFile(file, updateImage);
  });
  fileInput?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (file) handleImageFile(file, updateImage);
  });

  // --- TAB 5: USER DATA INTERACTIVE CONTROL SYSTEM ---
  // A. Drawer Accordion Toggle logic
  modalRoot.querySelectorAll('.userdata-drawer-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const pane = modalRoot.querySelector(`#${targetId}`);
      const arrow = btn.querySelector('.material-symbols-outlined:last-child');
      
      if (pane.classList.contains('hidden')) {
        pane.classList.remove('hidden');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      } else {
        pane.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
    });
  });

  // Simple in-modal feedback toast for User Data tab actions
  function showUserDataToast(msg, type = 'success') {
    const toast = modalRoot.querySelector('#userdata-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `block text-[10px] font-mono text-center py-1.5 px-2.5 rounded-lg border text-white transition-all duration-300 ${
      type === 'success' 
        ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/40' 
        : 'bg-slate-900/90 border-slate-700 text-slate-300'
    }`;
    toast.classList.remove('hidden');
    
    // Clear after 3.5 seconds
    if (window.__userdataToastTimeout) clearTimeout(window.__userdataToastTimeout);
    window.__userdataToastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3500);
  }

  // B. Viewport & Ingestion Element Refs
  const viewportPlaceholder = modalRoot.querySelector('#viewport-placeholder');
  const viewportStatus = modalRoot.querySelector('#viewport-status');
  const viewportTextRender = modalRoot.querySelector('#viewport-text-render');
  const viewportVideoContainer = modalRoot.querySelector('#viewport-video-container');
  const viewportAudioContainer = modalRoot.querySelector('#viewport-audio-container');
  const viewportCalledFields = modalRoot.querySelector('#viewport-called-fields');

  // Function to dynamically update the Viewport
  function updateUserDataViewport() {
    let hasContent = false;
    
    // Hide components by default
    viewportTextRender.classList.add('hidden');
    viewportVideoContainer.classList.add('hidden');
    viewportAudioContainer.classList.add('hidden');
    viewportCalledFields.classList.add('hidden');

    // 1. Text Editor Viewport Display
    if (userData.text?.trim()) {
      viewportTextRender.classList.remove('hidden');
      // Format simple markup (**bold**, *italic*, list items)
      let renderedHtml = escapeHtml(userData.text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
        .replace(/\n- (.*?)/g, '<br>• $1');
      viewportTextRender.innerHTML = renderedHtml;
      hasContent = true;
    }

    // 2. Video Player Viewport Display
    if (userData.videoUrl?.trim()) {
      viewportVideoContainer.classList.remove('hidden');
      const ytUrl = getYoutubeEmbedUrl(userData.videoUrl);
      if (ytUrl) {
        viewportVideoContainer.innerHTML = `<iframe id="viewport-video-iframe" src="${ytUrl}" class="w-full h-full rounded bg-black" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        viewportVideoContainer.innerHTML = `<video id="viewport-video-player" src="${escapeHtml(userData.videoUrl)}" controls class="w-full h-full object-cover"></video>`;
      }
      hasContent = true;
    } else {
      viewportVideoContainer.innerHTML = `<video id="viewport-video-player" controls class="w-full h-full object-cover"></video>`;
    }

    // 3. Audio Player Viewport Display
    if (userData.audioUrl?.trim()) {
      viewportAudioContainer.classList.remove('hidden');
      const audioLabel = modalRoot.querySelector('#audio-filename-label');
      const wrapper = modalRoot.querySelector('#viewport-audio-player-wrapper');
      const ytUrl = getYoutubeEmbedUrl(userData.audioUrl);
      
      if (audioLabel) {
        if (ytUrl) {
          audioLabel.textContent = 'YouTube Audio Feed';
        } else {
          audioLabel.textContent = userData.audioUrl.substring(userData.audioUrl.lastIndexOf('/') + 1) || 'Audio Feed Stream';
        }
      }

      if (wrapper) {
        if (ytUrl) {
          wrapper.innerHTML = `<iframe src="${ytUrl}" class="w-full h-24 rounded border border-slate-800 bg-black" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
          wrapper.innerHTML = `<audio id="viewport-audio-player" src="${escapeHtml(userData.audioUrl)}" controls class="w-full h-9"></audio>`;
        }
      }
      hasContent = true;
    } else {
      const wrapper = modalRoot.querySelector('#viewport-audio-player-wrapper');
      if (wrapper) {
        wrapper.innerHTML = `<audio id="viewport-audio-player" controls class="w-full h-9"></audio>`;
      }
    }

    // 4. Called In-App Portals Viewport Display
    if (userData.calls && userData.calls.length > 0) {
      viewportCalledFields.classList.remove('hidden');
      viewportCalledFields.innerHTML = userData.calls.map((call, idx) => {
        let contentHtml = '';
        if (call.source === 'local') {
          if (call.field === 'coords') {
            const coordsToDisplay = parsedCoords.length > 0 ? parsedCoords : [{ lat: primaryLat, lng: primaryLng }];
            contentHtml = `
              <div class="font-mono text-[10px] text-emerald-400 space-y-0.5 animate-fade-in">
                <div class="font-bold flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">explore</span> 
                  Current Coordinates:
                  ${parsedCoords.length === 0 ? '<span class="text-[8px] bg-amber-950 text-amber-400 px-1 rounded">DEFAULT CENTROID</span>' : ''}
                </div>
                <div class="bg-slate-950/60 p-1.5 rounded border border-slate-800 leading-relaxed font-mono">${coordsToDisplay.map((c, i) => {
                  const latVal = c && c.lat !== undefined ? Number(c.lat) : 0;
                  const lngVal = c && c.lng !== undefined ? Number(c.lng) : 0;
                  return `#${i+1}: ${latVal.toFixed(5)}°, ${lngVal.toFixed(5)}°`;
                }).join('<br>')}</div>
              </div>
            `;
          } else if (call.field === 'telemetry') {
            const metricsSummary = liveMetrics?.summary || `Point checkpoint at ${primaryLat.toFixed(5)}°, ${primaryLng.toFixed(5)}° WGS84 with MSL Altitude ${primaryAlt}m. Geodesic slant range is active.`;
            contentHtml = `
              <div class="font-mono text-[10px] text-cyan-300 space-y-0.5 animate-fade-in">
                <div class="font-bold flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">straighten</span> 
                  Current Geodetic Telemetry:
                  ${!liveMetrics?.summary ? '<span class="text-[8px] bg-cyan-950 text-cyan-400 px-1 rounded">AUTO-CALCULATED</span>' : ''}
                </div>
                <div class="bg-slate-950/60 p-1.5 rounded border border-slate-800 italic font-mono leading-normal">${escapeHtml(metricsSummary)}</div>
              </div>
            `;
          } else if (call.field === 'attachments') {
            const hasImage = !!itemData.imageUrl;
            contentHtml = `
              <div class="text-[10px] text-slate-300 space-y-1 animate-fade-in">
                <div class="font-semibold flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">attach_file</span> 
                  Visual Attachments:
                  ${!hasImage ? '<span class="text-[8px] bg-indigo-950 text-indigo-400 px-1 rounded">TACTICAL RADAR SCOPE</span>' : ''}
                </div>
                ${hasImage ? `
                  <div class="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <img src="${escapeHtml(itemData.imageUrl)}" class="w-8 h-8 rounded object-cover border border-slate-700" />
                    <a href="${escapeHtml(itemData.imageUrl)}" target="_blank" class="text-emerald-400 hover:text-emerald-300 underline truncate max-w-[160px]">${escapeHtml(itemData.imageUrl)}</a>
                  </div>
                ` : `
                  <div class="flex items-center gap-3 bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <div class="relative w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-center overflow-hidden shrink-0">
                      <div class="absolute inset-0 border-t border-emerald-500/80 rounded-full animate-spin"></div>
                      <span class="material-symbols-outlined text-emerald-400 text-xs animate-pulse">radar</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-[9px] text-emerald-400 font-bold tracking-wider">LIVE TARGET RADAR FEED</div>
                      <div class="text-[8px] text-slate-500 truncate font-mono">No external attachment URL. Displaying local grid sweep.</div>
                    </div>
                  </div>
                `}
              </div>
            `;
          } else if (call.field === 'details') {
            const cat = itemData.category || 'Tactical Entity';
            const subcat = itemData.subcategory || 'Unclassified Landmark';
            contentHtml = `
              <div class="text-[10px] text-slate-300 space-y-0.5 animate-fade-in">
                <div class="font-semibold flex items-center gap-1">
                  <span class="material-symbols-outlined text-xs">badge</span> 
                  Item Classification:
                </div>
                <div class="bg-slate-950/60 p-1.5 rounded border border-slate-800 flex flex-wrap gap-1">
                  <span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-semibold border border-emerald-900/40 font-mono text-[9px] flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    ${escapeHtml(cat)}
                  </span>
                  <span class="px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 font-semibold border border-sky-900/40 font-mono text-[9px]">
                    ${escapeHtml(subcat)}
                  </span>
                </div>
              </div>
            `;
          }
        } else if (call.source === 'neighbor') {
          const projectManager = mapProjectManager || getMapProjectManager() || (typeof window !== 'undefined' ? window.__mapProjectManager : null);
          const list = projectManager?.items || [];
          const otherItem = list.find(it => it.id === call.itemId);
          if (otherItem) {
            let neighborCoords = [];
            try {
              neighborCoords = typeof otherItem.coordinates === 'string' ? JSON.parse(otherItem.coordinates) : otherItem.coordinates;
            } catch (_e) {}
            
            const pt1 = parsedCoords[0] || { lat: primaryLat, lng: primaryLng };
            const pt2 = neighborCoords[0] || pt1;
            
            // Calculate real-time geodetic distance to neighbor in meters/km
            let distanceString = '0.00 km';
            if (typeof haversineDistanceMeters === 'function') {
              const meters = haversineDistanceMeters(pt1.lat, pt1.lng, pt2.lat, pt2.lng);
              distanceString = meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
            }
            
            contentHtml = `
              <div class="text-[10px] text-slate-300 space-y-1">
                <div class="flex items-center justify-between font-bold">
                  <span class="text-amber-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs">link</span>
                    Neighbor: ${escapeHtml(otherItem.name || 'Checkpoint')}
                  </span>
                  <span class="text-emerald-400 font-mono">${distanceString}</span>
                </div>
                <div class="bg-slate-950/60 p-1.5 rounded border border-slate-800 text-[9px] text-slate-400 leading-relaxed italic max-h-14 overflow-y-auto">
                  ${escapeHtml(otherItem.description || 'No description provided')}
                </div>
              </div>
            `;
          } else {
            contentHtml = `<div class="text-[10px] text-rose-400 flex items-center gap-1"><span class="material-symbols-outlined text-xs">error</span> Linked item is no longer on map.</div>`;
          }
        }

        return `
          <div class="p-2 bg-slate-900/90 border border-slate-800 rounded-lg relative group animate-fade-in">
            <button type="button" class="remove-call-btn absolute top-1 right-1 opacity-40 group-hover:opacity-100 text-rose-400 hover:text-rose-300 text-xs transition cursor-pointer" data-idx="${idx}" title="Remove dynamic called portal card">✕</button>
            <div class="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-mono">DYNAMIC CALLED FIELD</div>
            ${contentHtml}
          </div>
        `;
      }).join('');

      // Add click handlers to remove called fields
      viewportCalledFields.querySelectorAll('.remove-call-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(btn.getAttribute('data-idx'));
          userData.calls.splice(idx, 1);
          updateUserDataViewport();
        });
      });

      hasContent = true;
    }

    // Show/Hide placeholder based on if any viewport features are active
    if (hasContent) {
      viewportPlaceholder.classList.add('hidden');
      viewportStatus.textContent = 'ACTIVE';
      viewportStatus.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/60 text-emerald-400 font-bold';
    } else {
      viewportPlaceholder.classList.remove('hidden');
      viewportStatus.textContent = 'IDLE';
      viewportStatus.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400';
    }

    // Update call buttons active states in accordion dynamically
    modalRoot.querySelectorAll('.userdata-call-btn').forEach((btn) => {
      const field = btn.getAttribute('data-field');
      const isCalled = userData.calls.some(c => c.source === 'local' && c.field === field);
      const icon = btn.querySelector('.material-symbols-outlined');
      
      if (isCalled) {
        btn.classList.remove('bg-slate-950', 'text-cyan-300', 'border-slate-800', 'hover:border-cyan-500');
        btn.classList.add('bg-emerald-950/85', 'text-emerald-300', 'border-emerald-500/80', 'ring-1', 'ring-emerald-500/20');
        if (icon) {
          icon.textContent = 'check_circle';
          icon.className = 'material-symbols-outlined text-xs text-emerald-400 animate-pulse';
        }
      } else {
        btn.classList.add('bg-slate-950', 'text-cyan-300', 'border-slate-800', 'hover:border-cyan-500');
        btn.classList.remove('bg-emerald-950/85', 'text-emerald-300', 'border-emerald-500/80', 'ring-1', 'ring-emerald-500/20');
        if (icon) {
          if (field === 'coords') icon.textContent = 'explore';
          else if (field === 'telemetry') icon.textContent = 'straighten';
          else if (field === 'attachments') icon.textContent = 'attach_file';
          else if (field === 'details') icon.textContent = 'badge';
          icon.className = 'material-symbols-outlined text-xs';
        }
      }
    });
  }

  // C. Ingestion inputs event wiring
  // 1. Text editing
  const userDataTextInput = modalRoot.querySelector('#userdata-text-input');
  if (userDataTextInput) {
    userDataTextInput.value = userData.text || '';
    userDataTextInput.addEventListener('input', (e) => {
      userData.text = e.target.value;
      updateUserDataViewport();
    });

    // Formatting button click listeners
    modalRoot.querySelector('#userdata-fmt-bold')?.addEventListener('click', () => {
      wrapSelection(userDataTextInput, '**', '**');
      userData.text = userDataTextInput.value;
      updateUserDataViewport();
    });
    modalRoot.querySelector('#userdata-fmt-italic')?.addEventListener('click', () => {
      wrapSelection(userDataTextInput, '*', '*');
      userData.text = userDataTextInput.value;
      updateUserDataViewport();
    });
    modalRoot.querySelector('#userdata-fmt-list')?.addEventListener('click', () => {
      wrapSelection(userDataTextInput, '\n- ', '');
      userData.text = userDataTextInput.value;
      updateUserDataViewport();
    });
    modalRoot.querySelector('#userdata-fmt-underline')?.addEventListener('click', () => {
      wrapSelection(userDataTextInput, '<u>', '</u>');
      userData.text = userDataTextInput.value;
      updateUserDataViewport();
    });
  }

  // 2. Video Load Ingestion
  const userDataVideoUrlInput = modalRoot.querySelector('#userdata-video-url');
  if (userDataVideoUrlInput) {
    userDataVideoUrlInput.value = userData.videoUrl || '';
    
    modalRoot.querySelector('#userdata-load-video-btn')?.addEventListener('click', async () => {
      const loadBtn = modalRoot.querySelector('#userdata-load-video-btn');
      try {
        if (loadBtn) loadBtn.disabled = true;
        userData.videoUrl = userDataVideoUrlInput.value.trim();
        updateUserDataViewport();
      } catch (err) {
        console.error('Video URL embed operation failed gracefully:', err);
        showNonBlockingNotification('Unable to embed video stream.', 'warning');
      } finally {
        if (loadBtn) loadBtn.disabled = false;
      }
    });

    // Presets
    modalRoot.querySelectorAll('.userdata-video-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        userDataVideoUrlInput.value = url;
        userData.videoUrl = url;
        updateUserDataViewport();
      });
    });
  }

  // 3. Audio Load Ingestion
  const userDataAudioUrlInput = modalRoot.querySelector('#userdata-audio-url');
  if (userDataAudioUrlInput) {
    userDataAudioUrlInput.value = userData.audioUrl || '';

    modalRoot.querySelector('#userdata-load-audio-btn')?.addEventListener('click', async () => {
      const loadBtn = modalRoot.querySelector('#userdata-load-audio-btn');
      try {
        if (loadBtn) loadBtn.disabled = true;
        userData.audioUrl = userDataAudioUrlInput.value.trim();
        updateUserDataViewport();
      } catch (err) {
        console.error('Audio load operation failed gracefully:', err);
        showNonBlockingNotification('Unable to load audio track.', 'warning');
      } finally {
        if (loadBtn) loadBtn.disabled = false;
      }
    });

    // Presets
    modalRoot.querySelectorAll('.userdata-audio-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        userDataAudioUrlInput.value = url;
        userData.audioUrl = url;
        updateUserDataViewport();
      });
    });
  }

  // 4. In-App Portal Fields Calling (With Dynamic Active-State Toggle & Toasts)
  modalRoot.querySelectorAll('.userdata-call-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        btn.disabled = true;
        const field = btn.getAttribute('data-field');
        const idx = userData.calls.findIndex(c => c.source === 'local' && c.field === field);
        
        let label = 'Field';
        if (field === 'coords') label = 'Coordinates';
        else if (field === 'telemetry') label = 'Telemetry';
        else if (field === 'attachments') label = 'Attachments List';
        else if (field === 'details') label = 'Detail Badge';

        if (idx === -1) {
          userData.calls.push({ source: 'local', field });
          showUserDataToast(`✓ Linked ${label} to Viewport Preview!`, 'success');
        } else {
          userData.calls.splice(idx, 1);
          showUserDataToast(`✕ Unlinked ${label} from Viewport Preview.`, 'info');
        }
        updateUserDataViewport();
      } catch (err) {
        console.error('Portal field operation failed gracefully:', err);
        showNonBlockingNotification('Unable to resolve portal field.', 'warning');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // 5. Neighboring Map Items Targeting dropdown population
  const neighborSelect = modalRoot.querySelector('#userdata-neighbor-select');
  if (neighborSelect) {
    const projectManager = mapProjectManager || getMapProjectManager() || (typeof window !== 'undefined' ? window.__mapProjectManager : null);
    const list = projectManager?.items || [];
    
    // Filter out current active inspector item
    const otherItems = list.filter(it => it.id !== itemData.id);
    if (otherItems.length > 0) {
      neighborSelect.innerHTML = `<option value="">-- Select other active map item --</option>` + otherItems.map(it => `
        <option value="${it.id}">${escapeHtml(it.name || 'Checkpoint/Target')}</option>
      `).join('');
    } else {
      neighborSelect.innerHTML = `<option value="">No other map items available</option>`;
    }

    // Call neighbor trigger
    modalRoot.querySelector('#userdata-call-neighbor-btn')?.addEventListener('click', () => {
      try {
        const itemId = neighborSelect.value;
        if (!itemId) return;
        const alreadyCalled = userData.calls.some(c => c.source === 'neighbor' && c.itemId === itemId);
        if (!alreadyCalled) {
          userData.calls.push({ source: 'neighbor', itemId });
          updateUserDataViewport();
        }
      } catch (err) {
        console.error('Neighbor target call failed gracefully:', err);
        showNonBlockingNotification('Unable to call neighbor telemetry.', 'warning');
      }
    });
  }

  // Trigger initial viewport rendering matching database state
  updateUserDataViewport();

  // --- SEGMENTED SIZE CONTROL HANDLERS (Normal, Maximize, Close) ---
  const sizeNormalBtn = modalRoot.querySelector('#item-modal-size-normal-btn');
  const sizeMaxBtn = modalRoot.querySelector('#item-modal-size-max-btn');
  const modalDialog = modalRoot.querySelector('#item-modal-dialog');
  const backdropEl = modalRoot.querySelector('#item-modal-backdrop');

  function setModalSize(maximized) {
    if (maximized) {
      modalDialog.classList.remove('max-w-xl', 'max-h-[90vh]', 'rounded-xl');
      modalDialog.classList.add('w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none');
      backdropEl.classList.remove('p-4');
      
      sizeMaxBtn.classList.add('bg-emerald-600', 'text-white');
      sizeMaxBtn.classList.remove('text-slate-400', 'hover:text-white');
      sizeNormalBtn.classList.remove('bg-emerald-600', 'text-white');
      sizeNormalBtn.classList.add('text-slate-400', 'hover:text-white');
    } else {
      modalDialog.classList.remove('w-screen', 'h-screen', 'max-w-none', 'max-h-none', 'rounded-none');
      modalDialog.classList.add('max-w-xl', 'max-h-[90vh]', 'rounded-xl', 'w-full');
      backdropEl.classList.add('p-4');
      
      sizeNormalBtn.classList.add('bg-emerald-600', 'text-white');
      sizeNormalBtn.classList.remove('text-slate-400', 'hover:text-white');
      sizeMaxBtn.classList.remove('bg-emerald-600', 'text-white');
      sizeMaxBtn.classList.add('text-slate-400', 'hover:text-white');
    }
    if (inspectorLeafletMap) {
      setTimeout(() => {
        inspectorLeafletMap.invalidateSize();
        fitMapToCoordinates();
      }, 150);
    }
  }

  sizeNormalBtn?.addEventListener('click', () => setModalSize(false));
  sizeMaxBtn?.addEventListener('click', () => setModalSize(true));

  // --- SAVE & DELETE HANDLERS WITH EXPLICIT DISPOSAL ---
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const closeModal = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('gev:taxonomy-updated', onTaxonomyUpdated);
    if (inspectorLeafletMap) {
      try {
        inspectorLeafletMap.off(); // Remove all event listeners
        inspectorLeafletMap.remove(); // Unmount and release DOM/memory references
      } catch (_e) {
        console.warn('Leaflet map cleanup note:', _e);
      }
      inspectorLeafletMap = null;
      leafletMap = null;
    }
    const lingeringPopover = document.getElementById('quick-color-swatch-popover');
    if (lingeringPopover) lingeringPopover.remove();
    modalRoot.innerHTML = '';
  };

  modalRoot.querySelector('#close-inspector-modal-btn')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#close-item-modal-btn')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#cancel-item-modal-btn')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#item-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'item-modal-backdrop') {
      closeModal();
    }
  });

  modalRoot.querySelector('#delete-item-btn')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Delete Item',
      message: `Delete item "${itemData.name || 'this item'}"?`,
      details: 'This item will be permanently removed from the map project.',
      confirmText: 'Delete',
      confirmColor: 'rose',
      onConfirm: async () => {
        try {
          closeModal();
          if (onDelete) await onDelete(itemData.id);
        } catch (err) {
          console.error('Delete item operation failed gracefully:', err);
          showNonBlockingNotification('Unable to delete item from cloud store.', 'warning');
        }
      },
    });
  });

  modalRoot.querySelector('#save-item-modal-btn')?.addEventListener('click', async () => {
    const saveBtn = modalRoot.querySelector('#save-item-modal-btn');
    const nameInput = modalRoot.querySelector('#item-input-name');
    const finalName = nameInput?.value?.trim();
    if (!finalName) {
      if (nameInput) {
        nameInput.focus();
        nameInput.classList.add('ring-2', 'ring-rose-500');
        setTimeout(() => nameInput.classList.remove('ring-2', 'ring-rose-500'), 2500);
      }
      return;
    }

    try {
      if (saveBtn) saveBtn.disabled = true;
      itemData.name = finalName;

      // Refresh metrics for final coordinate array
      liveMetrics = extractGeodeticMetrics(parsedCoords, itemData.measurementType || itemData.type);

      let finalDesc = modalRoot.querySelector('#item-input-desc')?.value?.trim() || '';
      if (!finalDesc && liveMetrics && liveMetrics.summary) {
        finalDesc = generateGeodeticDescription(liveMetrics);
      }
      itemData.description = finalDesc;
      itemData.geodeticMetrics = liveMetrics;
      itemData.measurementType = liveMetrics?.measurementType || itemData.type;
      itemData.properties = {
        ...(itemData.properties || {}),
        ...(liveMetrics || {}),
      };

      if (catSelect && catSelect.value !== '__ADD_NEW_CATEGORY__') {
        itemData.category = catSelect.value;
      }
      if (subcatSelect && subcatSelect.value !== '__ADD_NEW_SUBCATEGORY__') {
        itemData.subcategory = subcatSelect.value;
      }
      const level3Select = modalRoot.querySelector('#item-level3-select');
      if (level3Select && level3Select.value !== '__ADD_NEW_LEVEL3__') {
        itemData.level3 = level3Select.value;
      }
      if (!itemData.customIconUrl && itemData.level3) {
        itemData.customIconUrl = getCustomIconForPreset(itemData.level3, itemData.category) || null;
      }
      const extHeightInput = modalRoot.querySelector('#item-extruded-height');
      if (extHeightInput) {
        itemData.extrudedHeight = Math.max(0, Number(extHeightInput.value) || 0);
      }
      const selectedHoverRadio = modalRoot.querySelector('input[name="item-hover-behavior"]:checked');
      if (selectedHoverRadio) {
        itemData.hoverBehavior = selectedHoverRadio.value;
      }
      itemData.coordinates = JSON.stringify(parsedCoords);
      itemData.userData = userData;

      closeModal();
      if (onSave) {
        await onSave(itemData);
      }
    } catch (err) {
      console.error('Save item operation failed gracefully:', err);
      showNonBlockingNotification('Unable to persist item to cloud. Stored in local cache.', 'warning');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

/**
 * Renders the floating 16-color swatch picker matching the video's Color Picker.
 */
export function openQuickColorPicker(anchorEl, currentColor, onSelect) {
  let existing = document.getElementById('quick-color-swatch-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'quick-color-swatch-popover';
  popover.className = 'fixed z-[100050] bg-[#0f172a] border border-slate-600 rounded-xl p-3 shadow-2xl animate-fade-in font-sans text-slate-100';
  popover.style.zIndex = '100050';
  popover.innerHTML = `
    <div class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
      <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-emerald-400">palette</span> Color Palette</span>
      <button id="close-swatch-pop" class="text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer" aria-label="Close palette">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
    <div class="grid grid-cols-4 gap-2 w-52">
      ${SWATCH_COLORS.map(
        (c) => `
        <button type="button" class="swatch-cell w-11 h-9 rounded-md border border-white/20 hover:scale-110 hover:border-white transition shadow cursor-pointer ${c.toLowerCase() === (currentColor || '').toLowerCase() ? 'ring-2 ring-emerald-400 scale-105' : ''}" style="background-color: ${c};" data-color="${c}" title="${c}"></button>
      `
      ).join('')}
    </div>
  `;

  document.body.appendChild(popover);

  // Position relative to anchor with boundary & collision awareness
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 236;
    const popoverHeight = 220;

    // Check if there is space below the anchor; if not, open above the anchor
    let top = rect.bottom + 8;
    if (top + popoverHeight > window.innerHeight - 16) {
      top = Math.max(16, rect.top - popoverHeight - 8);
    }

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - popoverWidth - 16);
    }

    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
  } else {
    popover.style.top = '50%';
    popover.style.left = '50%';
    popover.style.transform = 'translate(-50%, -50%)';
  }

  const cleanup = () => {
    document.removeEventListener('pointerdown', outsideClick);
    window.removeEventListener('keydown', onEsc);
    popover.remove();
  };

  const onEsc = (e) => {
    if (e.key === 'Escape') cleanup();
  };
  window.addEventListener('keydown', onEsc);

  const outsideClick = (e) => {
    if (!popover.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
      cleanup();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', outsideClick), 50);

  popover.querySelector('#close-swatch-pop')?.addEventListener('click', cleanup);

  popover.querySelectorAll('.swatch-cell').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const selected = btn.getAttribute('data-color');
      if (onSelect) onSelect(selected);
      cleanup();
    });
  });
}

/**
 * Handles converting a local image file into a Data URL.
 */
function handleImageFile(file, callback) {
  if (!file.type.startsWith('image/')) {
    openAlertModal({
      title: 'Invalid File',
      message: 'Please select an image file (PNG, JPG, SVG, WebP, etc.).',
      alertType: 'amber',
    });
    return;
  }
  const reader = new FileReader();
  reader.onload = (evt) => {
    callback(evt.target?.result || '');
  };
  reader.readAsDataURL(file);
}

/**
 * Wraps selected text in a textarea with prefixes and suffixes.
 */
function wrapSelection(textarea, prefix, suffix) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  const replacement = `${prefix}${selected || 'text'}${suffix}`;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Triggers a browser file download of formatted string data.
 */
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Generates RFC 7946 GeoJSON Feature representation of the item.
 */
function generateItemGeoJson(item, coords = []) {
  let geometry;
  if (item.type === 'marker') {
    const pt = coords[0] || { lng: 0, lat: 0, alt: 0 };
    geometry = { type: 'Point', coordinates: [pt.lng, pt.lat, pt.alt || 0] };
  } else if (item.type === 'polyline') {
    geometry = { type: 'LineString', coordinates: coords.map((c) => [c.lng, c.lat, c.alt || 0]) };
  } else {
    const ring = coords.map((c) => [c.lng, c.lat, c.alt || 0]);
    if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push([...ring[0]]);
    }
    geometry = { type: 'Polygon', coordinates: [ring] };
  }

  return {
    type: 'Feature',
    properties: {
      id: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      description: item.description,
      geometryType: item.type,
      extrudedHeight: item.extrudedHeight || 0,
      createdAt: item.createdAt,
      geodeticMetrics: item.geodeticMetrics || {},
    },
    geometry,
  };
}

/**
 * Generates OGC KML 2.2 Placemark XML representation of the item.
 */
function generateItemKml(item, coords = []) {
  const safeName = escapeHtml(item.name || 'Tactical Item');
  const safeDesc = escapeHtml(item.description || '');
  let kmlGeom = '';

  if (item.type === 'marker') {
    const pt = coords[0] || { lng: 0, lat: 0, alt: 0 };
    kmlGeom = `<Point><coordinates>${pt.lng},${pt.lat},${pt.alt || 0}</coordinates></Point>`;
  } else if (item.type === 'polyline') {
    const coordStr = coords.map((c) => `${c.lng},${c.lat},${c.alt || 0}`).join(' ');
    kmlGeom = `<LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>`;
  } else {
    const ring = coords.map((c) => `${c.lng},${c.lat},${c.alt || 0}`);
    if (ring.length > 0) ring.push(ring[0]);
    const ext = (Number(item.extrudedHeight) || 0) > 0 ? `<extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode>` : `<tessellate>1</tessellate>`;
    kmlGeom = `<Polygon>${ext}<outerBoundaryIs><LinearRing><coordinates>${ring.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
    <Placemark>
      <name>${safeName}</name>
      <description>${safeDesc}</description>
      ${kmlGeom}
    </Placemark>
  </Document>
</kml>`;
}

/**
 * Generates formatted NATO MGRS tactical waypoint text table for mission briefings and clipboard.
 */
function generateMgrsTableText(item, coords = [], liveMetrics = null) {
  const lines = [
    `=== TACTICAL TARGET / WAYPOINT LIST: ${(item.name || 'UNTITLED').toUpperCase()} ===`,
    `GEOMETRY: ${(item.type || 'POLYGON').toUpperCase()} | TOTAL VERTICES: ${coords.length} pts`,
    `CATEGORY: ${item.category || 'General'} > ${item.subcategory || 'General'}`,
    `TIMESTAMP: ${new Date().toISOString()}`,
    `----------------------------------------------------------------`,
  ];

  coords.forEach((c, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const mgrsStr = formatMgrsSpaced(toMgrsString(c.lat, c.lng, 5));
    lines.push(`WP ${num}: ${mgrsStr} | ${c.lat.toFixed(6)}°, ${c.lng.toFixed(6)}° | ${Math.round(c.alt || 0)}m MSL`);
  });

  lines.push(`----------------------------------------------------------------`);
  if (liveMetrics && liveMetrics.summary) {
    lines.push(`GEODETIC TELEMETRY: ${liveMetrics.summary}`);
  }
  if (liveMetrics?.isSelfIntersecting) {
    lines.push(`TOPOLOGY ALERT: Self-intersecting complex polygon (bowtie geometry).`);
  }

  return lines.join('\n');
}

/**
 * Creates custom crisp HTML divIcon for numbered vertex nodes on the 2D display map.
 */
function createVertexDivIcon(num, isPrimary = false) {
  return L.divIcon({
    className: 'custom-leaflet-vertex-icon',
    html: `
      <div style="
        background: ${isPrimary ? '#06b6d4' : '#0f172a'};
        color: ${isPrimary ? '#000000' : '#38bdf8'};
        border: 2px solid ${isPrimary ? '#ffffff' : '#06b6d4'};
        border-radius: 9999px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: monospace;
        font-weight: 700;
        font-size: 10px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.85);
      ">${num}</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/**
 * Opens Google Street View in a 360° interactive modal with direct external Google Maps link.
 */
export function openGoogleStreetViewModal(lat, lng, title = 'Tactical Target') {
  let modal = document.getElementById('gev-street-view-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'gev-street-view-modal';
  modal.className = 'fixed inset-0 z-[10020] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans';

  const safeLat = Number(lat) || 0;
  const safeLng = Number(lng) || 0;
  const streetViewDirectUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${safeLat},${safeLng}`;
  const embedUrl = `https://maps.google.com/maps?q=&layer=c&cbll=${safeLat},${safeLng}&cbp=11,0,0,0,0&output=svembed`;

  modal.innerHTML = `
    <div class="relative w-full max-w-4xl bg-[#1e293b] border border-amber-500/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[82vh] text-slate-100">
      <!-- Modal Header -->
      <div class="px-5 py-3.5 border-b border-slate-700 bg-slate-900/90 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-amber-400 text-2xl">streetview</span>
          <div>
            <h3 class="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              GOOGLE STREET VIEW 360°
              <span class="text-[10px] text-amber-300 font-normal px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40">PANORAMIC GROUND RECON</span>
            </h3>
            <p class="text-[11px] text-slate-300 font-mono">
              ${escapeHtml(title)} · ${safeLat.toFixed(6)}°, ${safeLng.toFixed(6)}° · ${formatMgrsSpaced(toMgrsString(safeLat, safeLng, 5))}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a href="${streetViewDirectUrl}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow transition">
            <span class="material-symbols-outlined text-sm">open_in_new</span> Full 360° in Google Maps
          </a>
          <button id="close-street-view-btn" class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" aria-label="Close Street View">
            <span class="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
      </div>

      <!-- Street View Embed Frame -->
      <div class="flex-1 w-full bg-black relative">
        <iframe
          src="${embedUrl}"
          class="w-full h-full border-0"
          allowfullscreen=""
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Google Street View"
        ></iframe>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-2.5 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between text-xs text-slate-400">
        <span class="flex items-center gap-1">
          <span class="material-symbols-outlined text-xs text-amber-400">info</span>
          If location has no ground road imagery (e.g. oceanic or remote terrain), click 'Full 360° in Google Maps' to inspect adjacent satellite photo spheres.
        </span>
        <a href="${streetViewDirectUrl}" target="_blank" rel="noopener noreferrer" class="text-amber-300 hover:underline font-mono text-[11px] flex items-center gap-1">
          Launch Street View in Google Maps ➔
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-street-view-btn')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const escListener = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', escListener);
      modal.remove();
    }
  };
  window.addEventListener('keydown', escListener);
}

/**
 * Non-blocking floating toast notification (auto-dismissing, zero thread lock).
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

