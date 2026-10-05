/**
 * @file tacticalHoverTooltip.js
 * High-performance tactical hover tooltip controller for 2D Leaflet and 3D Cesium map views.
 * Supports three operational hover modes:
 * - 'none': Disabled (click only)
 * - 'bubble': Compact tactical HUD pill
 * - 'dialog': Rich tactical intel callout card
 */

import { getCustomIconForPreset, getDomainColor } from '../data/taxonomyData.js';

let tooltipEl = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats coordinates for tooltip display.
 * @param {Array|string} rawCoords
 * @returns {string} Formatted coordinate string
 */
export function formatItemCoordinates(rawCoords) {
  if (!rawCoords) return '';
  try {
    const coords = typeof rawCoords === 'string' ? JSON.parse(rawCoords) : rawCoords;
    if (Array.isArray(coords) && coords.length > 0) {
      const first = coords[0];
      if (typeof first.lat === 'number' && typeof first.lng === 'number') {
        const latStr = `${Math.abs(first.lat).toFixed(4)}° ${first.lat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${Math.abs(first.lng).toFixed(4)}° ${first.lng >= 0 ? 'E' : 'W'}`;
        if (coords.length > 1) {
          return `${latStr}, ${lngStr} (${coords.length} vertices)`;
        }
        return `${latStr}, ${lngStr}`;
      }
    }
  } catch (_e) {}
  return '';
}

/**
 * Generates the HTML string for the hover tooltip based on mode.
 * @param {Object} item - Map item data object
 * @param {'none'|'bubble'|'dialog'} [overrideMode=null] - Optional mode override
 * @returns {string|null} HTML markup or null if mode is 'none'
 */
export function getTacticalHoverHtml(item, overrideMode = null) {
  if (!item) return null;
  const mode = overrideMode || item.hoverBehavior || 'bubble';
  if (mode === 'none') return null;

  const itemColor = item.color || getDomainColor(item.category) || '#3b82f6';
  const iconUrl = item.customIconUrl || getCustomIconForPreset(item.level3, item.category, itemColor);
  const coordText = formatItemCoordinates(item.coordinates);
  const name = escapeHtml(item.name || 'Tactical Asset');
  const level3 = escapeHtml(item.level3 || item.subcategory || 'General Asset');
  const category = escapeHtml(item.category || 'Tactical');
  const subcategory = escapeHtml(item.subcategory || '');

  // 1. COMPACT BUBBLE MODE
  if (mode === 'bubble') {
    return `
      <div class="tactical-bubble-inner flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-950/90 border border-slate-700/80 shadow-2xl backdrop-blur-md font-sans text-xs select-none" style="border-left: 3px solid ${itemColor};">
        <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-900 border border-slate-700 overflow-hidden shadow-inner">
          ${
            iconUrl
              ? `<img src="${escapeHtml(iconUrl)}" class="w-5 h-5 object-contain" alt="" />`
              : `<span class="material-symbols-outlined text-sm" style="color: ${itemColor};">${item.icon || 'pin_drop'}</span>`
          }
        </div>
        <div class="flex flex-col min-w-0 pr-1">
          <div class="font-bold text-slate-100 text-xs truncate max-w-[190px] leading-tight">${name}</div>
          <div class="text-[10px] text-slate-400 truncate flex items-center gap-1.5 leading-tight">
            <span class="text-cyan-400 font-medium">${level3}</span>
            ${coordText ? `<span class="text-slate-500 font-mono text-[9px]">• ${coordText}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // 2. EXPANDED DIALOG MODE
  const description = item.description ? escapeHtml(item.description.slice(0, 110) + (item.description.length > 110 ? '...' : '')) : '';
  const itemTypeLabel = item.type === 'polyline' ? 'Route / Vector' : item.type === 'polygon' ? 'Zone / Area' : 'Point of Interest';

  return `
    <div class="tactical-dialog-inner w-72 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl backdrop-blur-lg font-sans text-xs select-none overflow-hidden" style="border-top: 3px solid ${itemColor};">
      <!-- Header -->
      <div class="p-2.5 bg-slate-900/80 border-b border-slate-800/80 flex items-start gap-2.5">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-950 border border-slate-700/80 p-1 shadow-md">
          ${
            iconUrl
              ? `<img src="${escapeHtml(iconUrl)}" class="w-8 h-8 object-contain" alt="" />`
              : `<span class="material-symbols-outlined text-xl" style="color: ${itemColor};">${item.icon || 'pin_drop'}</span>`
          }
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">${itemTypeLabel}</span>
            <span class="text-[9px] text-cyan-400 font-semibold truncate">${category}</span>
          </div>
          <div class="font-bold text-slate-100 text-sm truncate leading-tight">${name}</div>
        </div>
      </div>

      <!-- Body Intel -->
      <div class="p-2.5 space-y-1.5 text-[11px]">
        <div class="flex items-center justify-between text-slate-400">
          <span class="text-slate-500 uppercase tracking-wider text-[9px] font-semibold">Classification:</span>
          <span class="font-semibold text-emerald-400 truncate max-w-[160px]">${level3}</span>
        </div>
        ${
          subcategory && subcategory !== level3
            ? `
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-slate-500 uppercase tracking-wider text-[9px] font-semibold">Sub-Level:</span>
            <span class="text-slate-300 truncate max-w-[160px]">${subcategory}</span>
          </div>
        `
            : ''
        }
        ${
          coordText
            ? `
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-slate-500 uppercase tracking-wider text-[9px] font-semibold">Position:</span>
            <span class="font-mono text-slate-300 text-[10px]">${coordText}</span>
          </div>
        `
            : ''
        }
        ${
          description
            ? `
          <div class="pt-1 border-t border-slate-800/80 text-slate-400 text-[10px] leading-relaxed line-clamp-2">
            ${description}
          </div>
        `
            : ''
        }
      </div>

      <!-- Footer action hint -->
      <div class="px-2.5 py-1 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs text-sky-400">ads_click</span> Left-Click to Inspect</span>
        <span class="font-mono text-[9px] text-slate-400" style="color: ${itemColor};">${itemColor}</span>
      </div>
    </div>
  `;
}

/**
 * Displays the tactical hover tooltip near given screen coordinates.
 * @param {Object} options
 * @param {number} options.x - Screen X coordinate
 * @param {number} options.y - Screen Y coordinate
 * @param {Object} options.item - Item data object
 * @param {'none'|'bubble'|'dialog'} [options.mode] - Optional mode override
 */
export function showTacticalHoverTooltip({ x, y, item, mode }) {
  if (!item) {
    hideTacticalHoverTooltip();
    return;
  }

  const effectiveMode = mode || item.hoverBehavior || 'bubble';
  if (effectiveMode === 'none') {
    hideTacticalHoverTooltip();
    return;
  }

  const html = getTacticalHoverHtml(item, effectiveMode);
  if (!html) {
    hideTacticalHoverTooltip();
    return;
  }

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'gev-tactical-hover-tooltip';
    tooltipEl.className = 'fixed pointer-events-none z-[100060] transition-opacity duration-150 ease-out drop-shadow-2xl';
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  tooltipEl.style.opacity = '1';

  // Position calculation with viewport boundary clamp
  const offset = 14;
  let posX = x + offset;
  let posY = y + offset;

  const rect = tooltipEl.getBoundingClientRect();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  if (posX + rect.width > screenWidth - 12) {
    posX = x - rect.width - offset;
  }
  if (posY + rect.height > screenHeight - 12) {
    posY = y - rect.height - offset;
  }

  tooltipEl.style.left = `${Math.max(12, posX)}px`;
  tooltipEl.style.top = `${Math.max(12, posY)}px`;
}

/**
 * Hides the tactical hover tooltip.
 */
export function hideTacticalHoverTooltip() {
  if (tooltipEl) {
    tooltipEl.style.opacity = '0';
    tooltipEl.style.display = 'none';
  }
}
