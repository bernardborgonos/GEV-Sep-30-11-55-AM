/**
 * @module src/ui/floatingMeasurementModuleUi.js
 * @description Autonomous Floating Geodesic Measurement Module Dialog for Map Tools.
 * Detachable floating window with live metric readouts, multi-mode selector,
 * drag-and-drop viewport positioning, unit system toggling, and commit capabilities.
 */

import {
  calculatePathDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
  initialBearing,
  haversineDistanceMeters,
} from '../tools/geodesicMath.js';
import { toMgrsString, formatMgrsSpaced } from '../tools/mgrsHelper.js';

let _dialogEl = null;
let _viewerInstance = null;
let _activeMode = 'distance'; // 'distance' | 'area' | 'bearing' | 'elevation'
let _unitSystem = 'metric'; // 'metric' | 'nautical' | 'imperial'
let _isMinimized = false;
let _isDragging = false;
let _dragStart = { x: 0, y: 0 };
let _dialogPos = { top: 90, left: 340 };
let _measuredPoints = [];
let _historyItems = [];

/**
 * Initializes the floating measurement module.
 * @param {Cesium.Viewer} viewer
 */
export function initFloatingMeasurementModule(viewer) {
  _viewerInstance = viewer;

  // Expose global controller functions for Map Tools -> Measurements tab
  if (typeof window !== 'undefined') {
    window.__openMeasurementModule = openFloatingMeasurementModule;
    window.__closeMeasurementModule = closeFloatingMeasurementModule;
    window.__updateFloatingMeasurement = updateFloatingMeasurement;
  }

  ensureDialogElement();
}

/**
 * Opens or focuses the floating measurement module window.
 * @param {Object} [options]
 * @param {string} [options.mode] - 'distance' | 'area' | 'bearing' | 'elevation'
 */
export function openFloatingMeasurementModule(options = {}) {
  ensureDialogElement();
  if (!_dialogEl) return;

  if (options.mode) {
    _activeMode = options.mode;
  }

  _dialogEl.style.display = 'block';
  _dialogEl.style.top = `${_dialogPos.top}px`;
  _dialogEl.style.left = `${_dialogPos.left}px`;
  renderDialogContent();
}

/**
 * Closes and hides the floating measurement dialog.
 */
export function closeFloatingMeasurementModule() {
  if (_dialogEl) {
    _dialogEl.style.display = 'none';
  }
}

/**
 * Updates coordinates and metrics in the floating measurement module.
 * @param {Array<{lat: number, lng: number, alt?: number}>} points
 * @param {string} [mode]
 */
export function updateFloatingMeasurement(points = [], mode = _activeMode) {
  _measuredPoints = points || [];
  _activeMode = mode;
  if (_dialogEl && _dialogEl.style.display !== 'none') {
    renderDialogContent();
  }
}

/**
 * Ensures the DOM element for the floating dialog exists.
 */
function ensureDialogElement() {
  if (typeof document === 'undefined') return;

  let el = document.getElementById('floating-measurement-module-dialog');
  if (!el) {
    el = document.createElement('div');
    el.id = 'floating-measurement-module-dialog';
    el.className = 'fixed z-[9500] select-none font-sans shadow-2xl transition-shadow';
    el.style.display = 'none';
    el.style.top = `${_dialogPos.top}px`;
    el.style.left = `${_dialogPos.left}px`;
    el.style.width = '340px';
    document.body.appendChild(el);
    _dialogEl = el;

    setupDragEvents(el);
  } else {
    _dialogEl = el;
  }
}

/**
 * Sets up mouse drag handling on the header.
 * @param {HTMLElement} el
 */
function setupDragEvents(el) {
  el.addEventListener('mousedown', (e) => {
    const header = e.target.closest('#fmm-header');
    if (!header || e.target.closest('button')) return;

    _isDragging = true;
    _dragStart = {
      x: e.clientX - el.offsetLeft,
      y: e.clientY - el.offsetTop,
    };

    const handleMouseMove = (moveEvt) => {
      if (!_isDragging) return;
      const newLeft = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, moveEvt.clientX - _dragStart.x));
      const newTop = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, moveEvt.clientY - _dragStart.y));
      _dialogPos.left = newLeft;
      _dialogPos.top = newTop;
      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
    };

    const handleMouseUp = () => {
      _isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });
}

/**
 * Renders the internal markup of the floating dialog.
 */
function renderDialogContent() {
  if (!_dialogEl) return;

  // Calculate metrics
  let primaryDist = '0 m';
  let secondaryDist = '0.00 NM · HDG 0°';
  let primaryArea = '0.00 ha';
  let secondaryArea = '0.000 km² · 0.0 ac';
  let perimeterStr = '0 m';
  let vertexCount = _measuredPoints.length;
  let mgrsDisplay = 'Standby';

  if (_measuredPoints.length >= 2) {
    const p1 = _measuredPoints[0];
    const p2 = _measuredPoints[_measuredPoints.length - 1];
    const distMeters = calculatePathDistance(_measuredPoints);
    const brg = initialBearing(p1, p2);

    if (_unitSystem === 'nautical') {
      const nm = distMeters / 1852;
      primaryDist = `${nm.toFixed(2)} NM`;
      secondaryDist = `${Math.round(distMeters).toLocaleString()} m · HDG ${Math.round(brg)}°`;
    } else if (_unitSystem === 'imperial') {
      const feet = distMeters * 3.28084;
      primaryDist = feet >= 5280 ? `${(feet / 5280).toFixed(2)} mi` : `${Math.round(feet).toLocaleString()} ft`;
      secondaryDist = `${Math.round(distMeters).toLocaleString()} m · HDG ${Math.round(brg)}°`;
    } else {
      primaryDist = distMeters >= 1000 ? `${(distMeters / 1000).toFixed(2)} km` : `${Math.round(distMeters).toLocaleString()} m`;
      secondaryDist = `${(distMeters / 1852).toFixed(2)} NM · HDG ${Math.round(brg)}°`;
    }

    if (p2.lat != null && p2.lng != null) {
      mgrsDisplay = formatMgrsSpaced(toMgrsString(p2.lat, p2.lng, 4));
    }
  }

  if (_measuredPoints.length >= 3) {
    const areaMetrics = calculatePolygonGeodesicArea(_measuredPoints);
    const perim = calculatePolygonPerimeter(_measuredPoints);
    primaryArea = `${areaMetrics.areaHectares.toFixed(2)} ha`;
    secondaryArea = `${areaMetrics.areaSquareKm.toFixed(3)} km² · ${(areaMetrics.areaSquareMeters * 0.000247105).toFixed(1)} ac`;
    perimeterStr = perim.perimeterKm > 0 ? `${perim.perimeterKm.toFixed(2)} km` : `${Math.round(perim.perimeterMeters)} m`;
  }

  _dialogEl.innerHTML = `
    <div class="rounded-2xl border border-cyan-500/40 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden text-xs text-slate-200">
      <!-- Draggable Header -->
      <div id="fmm-header" class="flex items-center justify-between px-3 py-2.5 bg-slate-900/90 border-b border-slate-800 cursor-move">
        <div class="flex items-center gap-2">
          <span class="text-sm">📐</span>
          <div>
            <div class="font-mono font-bold text-[11px] tracking-wider text-cyan-300 uppercase">
              FLOATING GEODESIC MEASURE
            </div>
            <div class="text-[9px] font-mono text-slate-400">
              ${_activeMode.toUpperCase()} · WGS84 ELLIPSOID
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button type="button" id="fmm-minimize-btn" class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-[10px]">
            ${_isMinimized ? '□' : '−'}
          </button>
          <button type="button" id="fmm-close-btn" class="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition text-sm">
            ✕
          </button>
        </div>
      </div>

      <!-- Collapsible Body -->
      <div id="fmm-body" class="${_isMinimized ? 'hidden' : 'block'} p-3 space-y-3">
        <!-- Mode Tabs -->
        <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[10px]">
          <button type="button" class="fmm-mode-btn py-1 px-1.5 rounded transition ${_activeMode === 'distance' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}" data-mode="distance">
            📏 DISTANCE
          </button>
          <button type="button" class="fmm-mode-btn py-1 px-1.5 rounded transition ${_activeMode === 'area' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}" data-mode="area">
            📐 AREA
          </button>
          <button type="button" class="fmm-mode-btn py-1 px-1.5 rounded transition ${_activeMode === 'bearing' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}" data-mode="bearing">
            🧭 BEARING
          </button>
        </div>

        <!-- Live Readout Cards -->
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[9px] font-mono text-slate-400 uppercase">DISTANCE</div>
            <div class="text-base font-mono font-bold text-cyan-300 mt-0.5">${primaryDist}</div>
            <div class="text-[9px] font-mono text-slate-500 truncate">${secondaryDist}</div>
          </div>

          <div class="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[9px] font-mono text-slate-400 uppercase">SURFACE AREA</div>
            <div class="text-base font-mono font-bold text-emerald-300 mt-0.5">${primaryArea}</div>
            <div class="text-[9px] font-mono text-slate-500 truncate">${secondaryArea}</div>
          </div>
        </div>

        <!-- Secondary Info & MGRS -->
        <div class="p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1 font-mono text-[9.5px]">
          <div class="flex justify-between text-slate-400">
            <span>PERIMETER:</span>
            <span class="text-slate-200 font-semibold">${perimeterStr}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>VERTICES:</span>
            <span class="text-slate-200 font-semibold">${vertexCount} points</span>
          </div>
          <div class="flex justify-between text-slate-400 border-t border-slate-800/80 pt-1">
            <span>NATO MGRS:</span>
            <span class="text-cyan-300 font-semibold truncate max-w-[170px]">${mgrsDisplay}</span>
          </div>
        </div>

        <!-- Unit Selector -->
        <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] font-mono">
          <span class="text-slate-400">UNITS:</span>
          <div class="flex items-center gap-1">
            ${['metric', 'nautical', 'imperial'].map(
              (u) => `
              <button type="button" class="fmm-unit-btn px-2 py-0.5 rounded border transition ${
                _unitSystem === u
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }" data-unit="${u}">
                ${u.toUpperCase()}
              </button>
            `
            ).join('')}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="fmm-clear-btn" class="py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 text-rose-300 font-mono text-[11px] font-semibold transition">
            ✕ CLEAR
          </button>
          <button type="button" id="fmm-dock-btn" class="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-mono text-[11px] font-semibold transition">
            ↙ DOCK TO HUD
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  _dialogEl.querySelector('#fmm-close-btn')?.addEventListener('click', closeFloatingMeasurementModule);

  _dialogEl.querySelector('#fmm-minimize-btn')?.addEventListener('click', () => {
    _isMinimized = !_isMinimized;
    renderDialogContent();
  });

  _dialogEl.querySelectorAll('.fmm-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (mode) {
        _activeMode = mode;
        renderDialogContent();
      }
    });
  });

  _dialogEl.querySelectorAll('.fmm-unit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const unit = btn.getAttribute('data-unit');
      if (unit) {
        _unitSystem = unit;
        renderDialogContent();
      }
    });
  });

  _dialogEl.querySelector('#fmm-clear-btn')?.addEventListener('click', () => {
    _measuredPoints = [];
    renderDialogContent();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gev:measurement:clear'));
    }
  });

  _dialogEl.querySelector('#fmm-dock-btn')?.addEventListener('click', () => {
    closeFloatingMeasurementModule();
    // Dispatch event to re-focus measurements in map tools panel
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gev:maptools:select-tab', { detail: { pluginId: 'measurements' } }));
    }
  });
}
