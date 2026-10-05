/**
 * @module src/ui/geodeticMeasurementHud.js
 * In-canvas floating HUD card for live Geodetic Measurement:
 * 1. Distance & Path
 * 2. Enclosed Polygon Area
 * 3. Compass Bearing & Back Azimuth
 * 4. Terrain Elevation Profile, Delta & Slope
 *
 * Directly implements the 2x2 measurement suite from Tactical Drafting Workbench.
 */

import {
  calculatePathDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
  initialBearing,
  haversineDistanceMeters,
} from '../tools/geodesicMath.js';
import { toMgrsString, formatMgrsSpaced } from '../tools/mgrsHelper.js';

let _hudElement = null;
let _onClearCallback = null;
let _onSaveCallback = null;
let _onCloseCallback = null;
let _currentType = 'polygon'; // 'polygon' | 'polyline' | 'bearing' | 'elevation'
let _lastCoords = [];
let _activeUnit = 'metric'; // 'metric' | 'nautical' | 'imperial'

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/**
 * Returns 16-wind cardinal direction for a given bearing in degrees.
 * @param {number} deg
 * @returns {string}
 */
export function getCompassCardinal(deg) {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 22.5) % 16;
  return CARDINALS[idx];
}

/**
 * Formats distance meters based on active unit system.
 */
function formatDistance(meters, unit = _activeUnit) {
  if (!meters || meters <= 0) {
    return unit === 'imperial' ? '0 ft' : unit === 'nautical' ? '0.00 NM' : '0 m';
  }

  if (unit === 'nautical') {
    const nm = meters / 1852;
    return `${nm.toFixed(2)} NM (${Math.round(meters).toLocaleString()} m)`;
  }

  if (unit === 'imperial') {
    const feet = meters * 3.28084;
    if (feet >= 5280) {
      const miles = feet / 5280;
      return `${miles.toFixed(2)} mi (${Math.round(feet).toLocaleString()} ft)`;
    }
    return `${Math.round(feet).toLocaleString()} ft`;
  }

  // Default metric
  if (meters >= 10000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km (${Math.round(meters).toLocaleString()} m)`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}

/**
 * Formats altitude / elevation height.
 */
function formatElevation(meters, unit = _activeUnit) {
  if (meters === undefined || meters === null || isNaN(meters)) return '0 m';
  if (unit === 'imperial') {
    const feet = meters * 3.28084;
    return `${Math.round(feet).toLocaleString()} ft MSL`;
  }
  return `${Math.round(meters).toLocaleString()} m MSL`;
}

/**
 * Formats area into hectares, m², and acres/NM² based on active unit system.
 */
function formatArea(hectares, squareMeters, unit = _activeUnit) {
  if (!hectares || hectares <= 0) {
    return {
      primary: unit === 'imperial' ? '0.00 ac' : unit === 'nautical' ? '0.00 NM²' : '0.00 ha',
      secondary: '0 m²',
    };
  }

  if (unit === 'nautical') {
    const sqNm = squareMeters / (1852 * 1852);
    return {
      primary: `${sqNm.toFixed(3)} NM²`,
      secondary: `${hectares.toFixed(2)} ha (${Math.round(squareMeters).toLocaleString()} m²)`,
    };
  }

  if (unit === 'imperial') {
    const acres = hectares * 2.47105;
    const sqMiles = squareMeters / 2589988.11;
    return {
      primary: `${acres.toFixed(2)} acres`,
      secondary: `${sqMiles >= 0.1 ? `${sqMiles.toFixed(2)} sq mi` : `${Math.round(squareMeters * 10.7639).toLocaleString()} sq ft`}`,
    };
  }

  // Metric
  if (hectares >= 100) {
    const km2 = (hectares / 100).toFixed(2);
    return {
      primary: `${hectares.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`,
      secondary: `${km2} km² (${Math.round(squareMeters).toLocaleString()} m²)`,
    };
  }
  return {
    primary: `${hectares.toFixed(2)} ha`,
    secondary: `${Math.round(squareMeters).toLocaleString()} m²`,
  };
}

/**
 * Mounts or displays the Geodetic Measurement live HUD.
 */
export function showGeodeticMeasurementHud({
  type = 'polygon',
  onClear,
  onSave,
  onClose,
} = {}) {
  _currentType = type;
  _onClearCallback = onClear;
  _onSaveCallback = onSave;
  _onCloseCallback = onClose;
  _lastCoords = [];

  if (!_hudElement) {
    _hudElement = document.createElement('aside');
    _hudElement.id = 'geodetic-measurement-hud';
    _hudElement.className = 'fixed top-20 left-6 z-[9200] font-sans animate-fade-in select-none';
    document.body.appendChild(_hudElement);
  }

  _hudElement.style.display = 'block';
  renderHud();
}

/**
 * Updates live measurement numbers based on current coordinates array.
 */
export function updateGeodeticMeasurementCoords(coords = [], type = _currentType) {
  _lastCoords = coords || [];
  _currentType = type;
  if (_hudElement && _hudElement.style.display !== 'none') {
    renderHud();
  }
}

/**
 * Hides and closes the Geodetic Measurement HUD.
 */
export function hideGeodeticMeasurementHud() {
  if (_hudElement) {
    _hudElement.style.display = 'none';
  }
  _lastCoords = [];
}

/**
 * Sets active unit system ('metric' | 'nautical' | 'imperial').
 */
export function setGeodeticUnitSystem(unit) {
  if (unit === 'metric' || unit === 'nautical' || unit === 'imperial') {
    _activeUnit = unit;
    if (_hudElement && _hudElement.style.display !== 'none') {
      renderHud();
    }
  }
}

/**
 * Internal render function.
 */
function renderHud() {
  if (!_hudElement) return;

  const count = _lastCoords.length;
  const isPoly = _currentType === 'polygon' || _currentType === 'area';
  const isBearing = _currentType === 'bearing';
  const isElevation = _currentType === 'elevation';
  const isLine = !isPoly && !isBearing && !isElevation;

  let titleIcon = 'square_foot';
  let titleText = 'GEODETIC MEASUREMENT';
  let modeBadge = 'DISTANCE PATH';
  let primaryLabel = 'TOTAL DISTANCE';
  let primaryValue = '0 m';
  let secondaryLabel = 'PATH WAYPOINTS';
  let secondaryValue = 'Click on 3D globe to place first waypoint';
  let extraDetailHtml = '';

  if (isPoly) {
    titleIcon = 'architecture';
    modeBadge = '⬡ ENCLOSED POLYGON AREA';
    primaryLabel = 'ENCLOSED SURFACE AREA';
    secondaryLabel = 'TOTAL PERIMETER';

    if (count >= 3) {
      try {
        const areaMetrics = calculatePolygonGeodesicArea(_lastCoords);
        const perimMetrics = calculatePolygonPerimeter(_lastCoords);
        const formatted = formatArea(areaMetrics.areaHectares, areaMetrics.areaSquareMeters, _activeUnit);
        primaryValue = formatted.primary;
        secondaryValue = `${formatDistance(perimMetrics.perimeterMeters, _activeUnit)} • ${formatted.secondary}`;
      } catch (err) {
        console.warn('[GeodeticHUD] Area error:', err);
      }
    } else if (count === 2) {
      try {
        const dist = calculatePathDistance(_lastCoords);
        primaryValue = 'Drafting perimeter...';
        secondaryValue = `Distance: ${formatDistance(dist.totalMeters, _activeUnit)}`;
      } catch (_e) {}
    } else {
      primaryValue = '0.00 ha';
      secondaryValue = 'Click 3D globe to place first polygon vertex';
    }
  } else if (isBearing) {
    titleIcon = 'explore';
    modeBadge = '🧭 COMPASS BEARING & AZIMUTH';
    primaryLabel = 'TRUE FORWARD BEARING';
    secondaryLabel = 'BACK AZIMUTH & RANGE';

    if (count >= 2) {
      try {
        const p1 = _lastCoords[0];
        const p2 = _lastCoords[1];
        const fwd = initialBearing(p1, p2);
        const card = getCompassCardinal(fwd);
        const rev = (fwd + 180) % 360;
        const revCard = getCompassCardinal(rev);
        const distM = haversineDistanceMeters(p1, p2);

        primaryValue = `${fwd.toFixed(1).padStart(5, '0')}° ${card}`;
        secondaryValue = `Back Azimuth: ${rev.toFixed(1).padStart(5, '0')}° ${revCard} · Range: ${formatDistance(distM, _activeUnit)}`;

        const p1Mgrs = formatMgrsSpaced(toMgrsString(p1.lat, p1.lng, 4));
        const p2Mgrs = formatMgrsSpaced(toMgrsString(p2.lat, p2.lng, 4));

        extraDetailHtml = `
          <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-slate-950/70 p-2 rounded-lg border border-slate-800 text-slate-300">
            <div><span class="text-cyan-400 font-bold">AZIMUTH:</span> ${fwd.toFixed(2)}°</div>
            <div><span class="text-amber-400 font-bold">RECIPROCAL:</span> ${rev.toFixed(2)}°</div>
            <div><span class="text-emerald-400 font-bold">RANGE:</span> ${formatDistance(distM, _activeUnit)}</div>
            <div><span class="text-slate-400 font-bold">QUADRANT:</span> ${card}</div>
            <div class="col-span-2 pt-1 border-t border-slate-800/80 text-[9px] text-slate-400 flex flex-col gap-0.5">
              <div><span class="text-cyan-300 font-bold">ORIGIN MGRS:</span> <span class="text-white">${p1Mgrs}</span></div>
              <div><span class="text-amber-300 font-bold">TARGET MGRS:</span> <span class="text-white">${p2Mgrs}</span></div>
            </div>
          </div>
        `;
      } catch (err) {
        console.warn('[GeodeticHUD] Bearing error:', err);
      }
    } else if (count === 1) {
      primaryValue = 'Aiming vector...';
      secondaryValue = 'Move cursor or click target point B on globe';
    } else {
      primaryValue = '000.0° N';
      secondaryValue = 'Click Origin Point A on 3D globe';
    }
  } else if (isElevation) {
    titleIcon = 'terrain';
    modeBadge = '⛰️ ELEVATION & SLOPE PROFILE';
    primaryLabel = 'ELEVATION DIFFERENCE (Δh)';
    secondaryLabel = 'TRANSECT ALIGNMENT';

    if (count >= 2) {
      try {
        const p1 = _lastCoords[0];
        const p2 = _lastCoords[_lastCoords.length - 1];
        const alt1 = p1.alt || 0;
        const alt2 = p2.alt || 0;
        const deltaH = alt2 - alt1;
        const distMetrics = calculatePathDistance(_lastCoords);
        const horizDist = distMetrics.totalMeters;
        const slantDist = Math.sqrt(horizDist * horizDist + deltaH * deltaH);
        const slopePct = horizDist > 0 ? (deltaH / horizDist) * 100 : 0;
        const slopeDeg = horizDist > 0 ? (Math.atan(Math.abs(deltaH) / horizDist) * 180 / Math.PI) : 0;

        const gainSymbol = deltaH >= 0 ? '+' : '';
        const gainTag = deltaH >= 0 ? '▲ GAIN' : '▼ DESCENT';
        primaryValue = `Δh ${gainSymbol}${Math.round(deltaH)} m (${gainTag})`;
        secondaryValue = `Base: ${formatElevation(alt1, _activeUnit)} ➔ Peak: ${formatElevation(alt2, _activeUnit)}`;

        const p1Mgrs = formatMgrsSpaced(toMgrsString(p1.lat, p1.lng, 4));
        const p2Mgrs = formatMgrsSpaced(toMgrsString(p2.lat, p2.lng, 4));

        extraDetailHtml = `
          <div class="grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-slate-950/70 p-2 rounded-lg border border-slate-800 text-slate-300">
            <div><span class="text-emerald-400 font-bold">SLOPE:</span> ${slopePct >= 0 ? '+' : ''}${slopePct.toFixed(1)}% (${slopeDeg.toFixed(1)}°)</div>
            <div><span class="text-cyan-400 font-bold">HORIZ DIST:</span> ${formatDistance(horizDist, _activeUnit)}</div>
            <div><span class="text-amber-400 font-bold">SLANT RANGE:</span> ${formatDistance(slantDist, _activeUnit)}</div>
            <div><span class="text-purple-400 font-bold">POINTS:</span> ${count} transect nodes</div>
            <div class="col-span-2 pt-1 border-t border-slate-800/80 text-[9px] text-slate-400 flex flex-col gap-0.5">
              <div><span class="text-emerald-300 font-bold">BASE MGRS:</span> <span class="text-white">${p1Mgrs}</span></div>
              <div><span class="text-cyan-300 font-bold">SUMMIT MGRS:</span> <span class="text-white">${p2Mgrs}</span></div>
            </div>
          </div>
        `;
      } catch (err) {
        console.warn('[GeodeticHUD] Elevation error:', err);
      }
    } else if (count === 1) {
      const alt1 = _lastCoords[0].alt || 0;
      primaryValue = 'Base Elevation set';
      secondaryValue = `Base: ${formatElevation(alt1, _activeUnit)} · Click summit / end point`;
    } else {
      primaryValue = '0 m Δh';
      secondaryValue = 'Click start point on 3D terrain';
    }
  } else {
    // Distance / Polyline
    titleIcon = 'straighten';
    modeBadge = '📏 DISTANCE & PATH LENGTH';
    primaryLabel = 'TOTAL GEODESIC DISTANCE';
    secondaryLabel = 'PATH WAYPOINTS';

    if (count >= 2) {
      try {
        const distMetrics = calculatePathDistance(_lastCoords);
        primaryValue = formatDistance(distMetrics.totalMeters, _activeUnit);
        secondaryValue = `${count} points · ${distMetrics.totalKm.toFixed(2)} km (${distMetrics.totalNm.toFixed(2)} NM)`;

        const lastPt = _lastCoords[_lastCoords.length - 1];
        const lastMgrs = formatMgrsSpaced(toMgrsString(lastPt.lat, lastPt.lng, 4));
        extraDetailHtml = `
          <div class="text-[10px] font-mono bg-slate-950/70 p-2 rounded-lg border border-slate-800 text-slate-300 flex items-center justify-between">
            <span class="text-amber-400 font-bold">HEAD MGRS:</span>
            <span class="text-white">${lastMgrs}</span>
          </div>
        `;
      } catch (err) {
        console.warn('[GeodeticHUD] Distance error:', err);
      }
    } else {
      primaryValue = '0 m';
      secondaryValue = 'Click on 3D globe to place first waypoint';
    }
  }

  const minPointsRequired = isPoly ? 3 : 2;
  const canSave = count >= minPointsRequired;

  _hudElement.innerHTML = `
    <div class="bg-[#0b1329]/95 border border-cyan-500/50 rounded-2xl shadow-2xl backdrop-blur-md p-4 min-w-[310px] max-w-[360px] text-slate-100 flex flex-col gap-2.5">
      <!-- Title Bar -->
      <div class="flex items-center justify-between border-b border-slate-700/80 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <div>
            <div class="text-[9px] font-bold tracking-widest text-cyan-400 uppercase font-mono">${titleText}</div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>${modeBadge}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-cyan-300 font-semibold">
            ${count} ${count === 1 ? 'pt' : 'pts'}
          </span>
          <button id="geo-hud-close-btn" class="w-6 h-6 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer" title="Close Measurement HUD">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      <!-- Unit Selector Pills -->
      <div class="flex items-center justify-between px-1 text-[10px] font-mono text-slate-400">
        <span>UNITS:</span>
        <div class="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded border border-slate-800">
          <button type="button" class="geo-unit-btn px-1.5 py-0.5 rounded text-[9px] font-bold ${_activeUnit === 'metric' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-white'}" data-unit="metric">METRIC</button>
          <button type="button" class="geo-unit-btn px-1.5 py-0.5 rounded text-[9px] font-bold ${_activeUnit === 'nautical' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-white'}" data-unit="nautical">NM</button>
          <button type="button" class="geo-unit-btn px-1.5 py-0.5 rounded text-[9px] font-bold ${_activeUnit === 'imperial' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-white'}" data-unit="imperial">IMPERIAL</button>
        </div>
      </div>

      <!-- Main Metric Readout Box -->
      <div class="bg-slate-900/80 border border-cyan-900/60 rounded-xl p-3 flex flex-col gap-1 text-center">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">${primaryLabel}</span>
        <div class="text-xl sm:text-2xl font-black text-cyan-300 tracking-tight font-mono">
          ${primaryValue}
        </div>
        <div class="text-[11px] text-slate-300 font-mono mt-0.5 truncate" title="${secondaryValue}">
          ${secondaryValue}
        </div>
      </div>

      <!-- Extra Detail Panel if available (e.g. slope, back azimuth, range) -->
      ${extraDetailHtml}

      <!-- Instruction / Hint -->
      <div class="text-[10px] text-slate-400 flex items-center gap-1.5 bg-slate-800/50 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
        <span class="material-symbols-outlined text-xs text-amber-400">info</span>
        <span>${count < minPointsRequired ? 'Click 3D globe to place vertices' : 'Double-click globe or click Save to finish'}</span>
      </div>

      <!-- Action Buttons -->
      <div class="grid grid-cols-2 gap-2 pt-0.5 text-xs">
        <button id="geo-hud-clear-btn" type="button" class="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-700 rounded-lg font-semibold flex items-center justify-center gap-1 transition cursor-pointer" title="Clear points and restart measurement">
          <span class="material-symbols-outlined text-sm">restart_alt</span> Clear
        </button>
        <button id="geo-hud-save-btn" type="button" class="py-1.5 px-2 ${canSave ? 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-lg shadow-cyan-900/50' : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'} font-semibold rounded-lg flex items-center justify-center gap-1 transition" ${canSave ? '' : 'disabled'} title="Save measurement to Active Map">
          <span class="material-symbols-outlined text-sm">bookmark_add</span> Save as POI
        </button>
      </div>
    </div>
  `;

  // Bind Actions
  _hudElement.querySelectorAll('.geo-unit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = btn.dataset.unit;
      if (u) setGeodeticUnitSystem(u);
    });
  });

  _hudElement.querySelector('#geo-hud-close-btn')?.addEventListener('click', () => {
    hideGeodeticMeasurementHud();
    if (_onCloseCallback) _onCloseCallback();
  });

  _hudElement.querySelector('#geo-hud-clear-btn')?.addEventListener('click', () => {
    if (_onClearCallback) _onClearCallback();
  });

  _hudElement.querySelector('#geo-hud-save-btn')?.addEventListener('click', () => {
    if (_lastCoords.length >= minPointsRequired) {
      if (_onSaveCallback) _onSaveCallback(_lastCoords, _currentType);
    }
  });
}
