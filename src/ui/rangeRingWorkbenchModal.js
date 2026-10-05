/**
 * @module src/ui/rangeRingWorkbenchModal.js
 * @description Isolated Range Ring Workbench & Tactical Standoff Buffer Test Suite.
 * Provides a dedicated, standalone floating workbench dialog box to test, configure,
 * generate, inspect, and fly to Range Rings and Standoff Buffer zones on the 3D globe.
 */

import { generateRangeRingVertices, haversineDistance } from '../tools/geodesicMath.js';
import { getSharedMapToolsEngine, FEATURE_TYPES } from '../tools/mapToolsEngine.js';

let _activeModalInstance = null;
let _createdRings = [];

/**
 * Safely normalizes any coordinate representation into { lat, lng, alt }.
 * @param {Array<number>|Object} coord
 * @returns {{ lat: number, lng: number, alt: number }}
 */
export function parseCoord(coord) {
  if (!coord) return { lat: 0, lng: 0, alt: 0 };
  if (Array.isArray(coord)) {
    return {
      lng: Number(coord[0]) || 0,
      lat: Number(coord[1]) || 0,
      alt: Number(coord[2]) || 0,
    };
  }
  const lng = Number(coord.lng ?? coord.lon ?? coord.longitude ?? 0);
  const lat = Number(coord.lat ?? coord.latitude ?? 0);
  const alt = Number(coord.alt ?? coord.altitude ?? 0);
  return { lat, lng, alt };
}

/**
 * Gets camera look-at center coordinates on the 3D globe.
 * @param {Object} viewer - Cesium Viewer
 * @returns {{ lat: number, lng: number, alt: number }}
 */
export function getCameraCenterCoordinate(viewer) {
  const activeViewer = viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);
  const defaultCoords = { lat: 37.7749, lng: -122.4194, alt: 0 }; // San Francisco default

  if (!activeViewer || typeof Cesium === 'undefined') {
    return defaultCoords;
  }

  try {
    // 1. Try center pixel ray pick against 3D tiles or terrain
    const canvas = activeViewer.scene?.canvas;
    if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      const centerPixel = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);

      let cartesian = null;
      try {
        if (activeViewer.scene.pickPositionSupported) {
          cartesian = activeViewer.scene.pickPosition(centerPixel);
        }
      } catch (_e) {}

      if (!cartesian) {
        try {
          const ellipsoid = activeViewer.scene?.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
          cartesian = activeViewer.camera.pickEllipsoid(centerPixel, ellipsoid);
        } catch (_e) {}
      }

      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        if (carto && Number.isFinite(carto.latitude) && Number.isFinite(carto.longitude)) {
          return {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lng: Cesium.Math.toDegrees(carto.longitude),
            alt: carto.height || 0,
          };
        }
      }
    }

    // 2. Guaranteed fallback: camera position projected directly to WGS84
    if (activeViewer.camera && activeViewer.camera.position) {
      const cameraCarto = Cesium.Cartographic.fromCartesian(activeViewer.camera.position);
      if (cameraCarto && Number.isFinite(cameraCarto.latitude) && Number.isFinite(cameraCarto.longitude)) {
        return {
          lat: Cesium.Math.toDegrees(cameraCarto.latitude),
          lng: Cesium.Math.toDegrees(cameraCarto.longitude),
          alt: 0,
        };
      }
    }
  } catch (_e) {}

  return defaultCoords;
}

/**
 * Directly generates and renders a complete Range Ring on the 3D globe.
 * @param {Object} viewer - Cesium Viewer
 * @param {Object} params - { center, radiusMeters, color, strokeWidth, name }
 * @returns {Object} Ring descriptor
 */
export function drawRangeRingOnGlobe(viewer, { center, radiusMeters, color = '#00e5ff', strokeWidth = 3, name = '' }) {
  const normCenter = parseCoord(center);
  const radiusKm = radiusMeters / 1000;
  const radiusNm = radiusMeters / 1852;
  const labelName = name || `Range Ring (${radiusKm.toFixed(1)} km / ${radiusNm.toFixed(1)} NM)`;

  const activeViewer = viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);

  const ringData = {
    id: `ring-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: labelName,
    center: normCenter,
    radiusMeters,
    radiusKm,
    radiusNm,
    color,
    strokeWidth,
    entities: [],
  };

  if (activeViewer && typeof Cesium !== 'undefined' && normCenter) {
    const cesiumColor = Cesium.Color.fromCssColorString(color);

    // 1. Semi-transparent Ellipse Fill
    const fillEntity = activeViewer.entities.add({
      name: labelName,
      position: Cesium.Cartesian3.fromDegrees(normCenter.lng, normCenter.lat, 1),
      ellipse: {
        semiMinorAxis: radiusMeters,
        semiMajorAxis: radiusMeters,
        material: cesiumColor.withAlpha(0.25),
        outline: true,
        outlineColor: cesiumColor,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // 2. Crisp Ground-Clamped Polyline Perimeter Ring
    const ringVerts = generateRangeRingVertices(normCenter, radiusMeters, 64);
    const ringPositions = ringVerts.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 2));
    const polylineEntity = activeViewer.entities.add({
      name: `${labelName} (Perimeter)`,
      polyline: {
        positions: ringPositions,
        width: strokeWidth > 2 ? strokeWidth : 3,
        material: cesiumColor,
        clampToGround: true,
      },
    });

    // 3. Center Pushpin Point & Label (with disableDepthTestDistance to prevent 3D Tile occlusion)
    const centerEntity = activeViewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(normCenter.lng, normCenter.lat, 2),
      point: {
        pixelSize: 10,
        color: Cesium.Color.WHITE,
        outlineColor: cesiumColor,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `⭕ ${labelName}`,
        font: '12px Inter, monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    ringData.entities = [fillEntity, polylineEntity, centerEntity];

    // Fly camera directly to created Range Ring center coordinates so user sees it instantly
    try {
      if (activeViewer.camera) {
        const alt = Math.max(1200, radiusMeters * 3.2);
        activeViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(normCenter.lng, normCenter.lat, alt),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
          duration: 1.5,
        });
      }
    } catch (_e) {}
  }

  // Register in MapToolsEngine
  try {
    const engine = getSharedMapToolsEngine(activeViewer);
    if (engine) {
      engine.createFeature({
        type: FEATURE_TYPES.CIRCLE,
        name: labelName,
        coordinates: { center: [normCenter.lng, normCenter.lat, normCenter.alt || 0], radiusMeters },
        properties: {
          color,
          strokeWidth,
          drawingSubtype: 'circle',
          radiusMeters,
          radiusKm,
          radiusNm,
        },
      });
    }
  } catch (_e) {}

  _createdRings.push(ringData);
  return ringData;
}

/**
 * Opens or toggles the Isolated Range Ring Workbench dialog.
 * @param {Object} viewer - Cesium Viewer
 */
export function openRangeRingWorkbenchModal(viewer) {
  const activeViewer = viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);

  if (_activeModalInstance) {
    _activeModalInstance.remove();
    _activeModalInstance = null;
  }

  let selectedRadiusKm = 5;
  let selectedColor = '#00e5ff';
  let strokeWidth = 3;
  let currentCenter = getCameraCenterCoordinate(activeViewer);

  const container = document.createElement('div');
  container.id = 'isolated-range-ring-modal';
  container.className = 'fixed top-16 left-20 z-[10000] w-[460px] bg-slate-950/95 border border-cyan-500/70 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.2)] text-slate-100 font-sans backdrop-blur-md overflow-hidden select-none animate-fade-in';

  const getAllRings = () => {
    const ringsMap = new Map();

    // 1. Local rings created directly in this workbench
    for (const r of _createdRings) {
      const normCenter = parseCoord(r.center);
      ringsMap.set(r.id, {
        ...r,
        center: normCenter,
      });
    }

    // 2. MapToolsEngine features (interactive drawing / CAD roster)
    try {
      const engine = getSharedMapToolsEngine(activeViewer);
      if (engine) {
        const engineFeatures = engine.getAllFeatures();
        for (const feat of engineFeatures) {
          if (feat.type === FEATURE_TYPES.CIRCLE || feat.type === FEATURE_TYPES.RANGE_RING) {
            const center = parseCoord(feat.computed?.center || feat.coordinates?.center || feat.coordinates);
            const radiusMeters = Number(feat.computed?.radiusMeters || feat.properties?.radiusMeters || 5000);
            const radiusKm = radiusMeters / 1000;
            const radiusNm = radiusMeters / 1852;
            const color = feat.style?.color || feat.properties?.color || '#00e5ff';
            const ringId = feat.id;

            if (!ringsMap.has(ringId)) {
              ringsMap.set(ringId, {
                id: ringId,
                name: feat.name,
                center,
                radiusMeters,
                radiusKm,
                radiusNm,
                color,
                strokeWidth: feat.properties?.strokeWidth || 3,
                entities: [],
                engineFeatureId: feat.id,
              });
            }
          }
        }
      }
    } catch (_e) {}

    return Array.from(ringsMap.values());
  };

  const updateModalContent = () => {
    const activeRings = getAllRings();

    container.innerHTML = `
      <!-- Draggable Title Bar -->
      <div id="range-ring-titlebar" class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between cursor-move">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <h2 class="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase flex items-center gap-1.5">
            <span>⭕ ISOLATED RANGE RING WORKBENCH</span>
          </h2>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-cyan-300">TEST SUITE</span>
          <button type="button" id="range-ring-close-btn" class="text-slate-400 hover:text-white p-1 transition cursor-pointer" title="Close Window">
            ✕
          </button>
        </div>
      </div>

      <!-- Dialog Body -->
      <div class="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <!-- 1. Center Fix Controls -->
        <div class="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-mono text-cyan-400 font-bold uppercase text-[11px]">1. CENTER COORDINATE FIX</span>
            <button type="button" id="btn-lock-camera-center" class="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-mono rounded transition flex items-center gap-1 cursor-pointer">
              <span>📍</span> <span>LOCK CAMERA LOOK-AT</span>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <label class="text-[10px] text-slate-400 block mb-0.5">LATITUDE (°N)</label>
              <input type="number" step="0.0001" id="ring-lat-input" value="${currentCenter.lat.toFixed(4)}" class="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-400" />
            </div>
            <div>
              <label class="text-[10px] text-slate-400 block mb-0.5">LONGITUDE (°E)</label>
              <input type="number" step="0.0001" id="ring-lng-input" value="${currentCenter.lng.toFixed(4)}" class="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-400" />
            </div>
          </div>
        </div>

        <!-- 2. Radius Controls & Presets -->
        <div class="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-mono text-cyan-400 font-bold uppercase text-[11px]">2. STANDOFF RADIUS</span>
            <span class="text-xs font-mono font-bold text-cyan-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-700">
              ${selectedRadiusKm} KM (${(selectedRadiusKm / 1.852).toFixed(1)} NM)
            </span>
          </div>

          <!-- Quick Presets -->
          <div class="grid grid-cols-5 gap-1.5 font-mono text-[10px]">
            <button type="button" class="preset-radius-btn px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-center transition cursor-pointer ${selectedRadiusKm === 1 ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : ''}" data-radius="1">1 KM</button>
            <button type="button" class="preset-radius-btn px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-center transition cursor-pointer ${selectedRadiusKm === 5 ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : ''}" data-radius="5">5 KM</button>
            <button type="button" class="preset-radius-btn px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-center transition cursor-pointer ${selectedRadiusKm === 10 ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : ''}" data-radius="10">10 KM</button>
            <button type="button" class="preset-radius-btn px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-center transition cursor-pointer ${selectedRadiusKm === 25 ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : ''}" data-radius="25">25 KM</button>
            <button type="button" class="preset-radius-btn px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-center transition cursor-pointer ${selectedRadiusKm === 50 ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : ''}" data-radius="50">50 KM</button>
          </div>

          <!-- Slider -->
          <div>
            <input type="range" id="ring-radius-slider" min="0.5" max="100" step="0.5" value="${selectedRadiusKm}" class="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
            <div class="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
              <span>0.5 KM (500m)</span>
              <span>50 KM</span>
              <span>100 KM</span>
            </div>
          </div>
        </div>

        <!-- 3. Tactical Styling -->
        <div class="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
          <span class="font-mono text-cyan-400 font-bold uppercase text-[11px] block">3. TACTICAL STYLING</span>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              ${['#00e5ff', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#f8fafc'].map((colorHex) => `
                <button type="button" class="ring-color-dot w-5 h-5 rounded-full border border-slate-600 transition cursor-pointer ${selectedColor === colorHex ? 'ring-2 ring-white scale-110' : ''}" data-color="${colorHex}" style="background-color: ${colorHex};"></button>
              `).join('')}
            </div>
            <div class="flex items-center gap-2 font-mono text-xs">
              <span class="text-[10px] text-slate-400">WIDTH:</span>
              <input type="range" id="ring-stroke-slider" min="1" max="8" value="${strokeWidth}" class="w-16 h-1 bg-slate-800 rounded accent-cyan-400" />
              <span id="ring-stroke-label" class="text-cyan-300 font-bold">${strokeWidth}px</span>
            </div>
          </div>
        </div>

        <!-- 4. Action Execution Bar -->
        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="btn-draw-now" class="py-2.5 px-3 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
            <span>🎯</span> <span>GENERATE ON GLOBE</span>
          </button>
          <button type="button" id="btn-interactive-draft" class="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-cyan-500/50 text-cyan-300 font-mono text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer">
            <span>⚡</span> <span>INTERACTIVE DRAFT</span>
          </button>
        </div>

        <!-- 5. Created Rings History Feed -->
        <div class="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
          <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-slate-400 uppercase">ACTIVE TRACES (${activeRings.length})</span>
            <div class="flex items-center gap-2">
              ${activeRings.length > 0 ? `
                <button type="button" id="btn-extent-all-rings" class="text-sky-400 hover:text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950/80 border border-sky-700/60 transition cursor-pointer flex items-center gap-1" title="Fit camera to encompass all active Range Rings">
                  <span>🎯</span> <span>EXTENT</span>
                </button>
              ` : ''}
              <button type="button" id="btn-clear-all-rings" class="text-rose-400 hover:text-rose-300 text-[11px] underline transition cursor-pointer">CLEAR ALL</button>
            </div>
          </div>
          ${activeRings.length === 0 ? `
            <p class="text-[11px] font-mono text-slate-500 italic py-1">No Range Rings generated yet. Click "GENERATE ON GLOBE" to create one.</p>
          ` : `
            <div class="space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono">
              ${activeRings.map((r) => `
                <div class="flex items-center justify-between p-1.5 rounded bg-slate-950 border border-slate-800">
                  <div class="flex items-center gap-1.5 min-w-0 pr-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${r.color};"></span>
                    <span class="text-slate-200 font-bold truncate" title="${r.name}">${r.name}</span>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <button type="button" class="fly-to-ring-btn text-cyan-400 hover:text-cyan-300 transition cursor-pointer" data-id="${r.id}" title="Fly Camera to Ring">🔍 FLY TO</button>
                    <button type="button" class="delete-ring-btn text-rose-400 hover:text-rose-300 transition cursor-pointer" data-id="${r.id}" title="Delete Ring">🗑️</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    // Close button
    container.querySelector('#range-ring-close-btn')?.addEventListener('click', () => {
      container.remove();
      _activeModalInstance = null;
    });

    // Lat/Lng Inputs
    const latInput = container.querySelector('#ring-lat-input');
    const lngInput = container.querySelector('#ring-lng-input');

    latInput?.addEventListener('change', () => {
      currentCenter.lat = parseFloat(latInput.value) || currentCenter.lat;
    });
    lngInput?.addEventListener('change', () => {
      currentCenter.lng = parseFloat(lngInput.value) || currentCenter.lng;
    });

    // Lock camera center
    container.querySelector('#btn-lock-camera-center')?.addEventListener('click', () => {
      currentCenter = getCameraCenterCoordinate(activeViewer);
      if (latInput) latInput.value = currentCenter.lat.toFixed(4);
      if (lngInput) lngInput.value = currentCenter.lng.toFixed(4);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gev:toast', {
            detail: { text: `Locked camera center: ${currentCenter.lat.toFixed(4)}°N, ${currentCenter.lng.toFixed(4)}°E` },
          })
        );
      }
    });

    // Preset Radius Buttons
    container.querySelectorAll('.preset-radius-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRadiusKm = parseFloat(btn.dataset.radius) || 5;
        updateModalContent();
      });
    });

    // Slider
    const radiusSlider = container.querySelector('#ring-radius-slider');
    radiusSlider?.addEventListener('input', (e) => {
      selectedRadiusKm = parseFloat(e.target.value) || 5;
      const radiusLabel = container.querySelector('.font-bold.text-cyan-300');
      if (radiusLabel) {
        radiusLabel.textContent = `${selectedRadiusKm} KM (${(selectedRadiusKm / 1.852).toFixed(1)} NM)`;
      }
    });

    // Color swatches
    container.querySelectorAll('.ring-color-dot').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        updateModalContent();
      });
    });

    // Stroke width slider
    const strokeSlider = container.querySelector('#ring-stroke-slider');
    const strokeLabel = container.querySelector('#ring-stroke-label');
    strokeSlider?.addEventListener('input', (e) => {
      strokeWidth = parseInt(e.target.value, 10) || 3;
      if (strokeLabel) strokeLabel.textContent = `${strokeWidth}px`;
    });

    // GENERATE ON GLOBE button
    container.querySelector('#btn-draw-now')?.addEventListener('click', () => {
      const radiusMeters = selectedRadiusKm * 1000;
      drawRangeRingOnGlobe(activeViewer, {
        center: currentCenter,
        radiusMeters,
        color: selectedColor,
        strokeWidth,
        name: `Range Ring (${selectedRadiusKm} km / ${(selectedRadiusKm / 1.852).toFixed(1)} NM)`,
      });
      updateModalContent();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gev:toast', {
            detail: { text: `Generated ${selectedRadiusKm} km Range Ring on 3D globe!` },
          })
        );
      }
    });

    // INTERACTIVE DRAFT button
    container.querySelector('#btn-interactive-draft')?.addEventListener('click', () => {
      if (typeof window !== 'undefined' && window.__mapToolsPluginRegistry) {
        const drawing = window.__mapToolsPluginRegistry.getPlugin('drawing');
        if (drawing) {
          drawing.setMode('circle');
          drawing.startInteractiveDraft();
          container.remove();
          _activeModalInstance = null;
          return;
        }
      }
    });

    // Extent across ALL active Range Rings
    container.querySelector('#btn-extent-all-rings')?.addEventListener('click', () => {
      const viewer = activeViewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);
      const activeRings = getAllRings();
      if (viewer && activeRings.length > 0 && typeof Cesium !== 'undefined') {
        const allCartesians = [];
        for (const ring of activeRings) {
          if (ring.center && ring.radiusMeters) {
            const center = parseCoord(ring.center);
            const radiusM = Number(ring.radiusMeters) || 5000;
            const ringVerts = generateRangeRingVertices(center, radiusM, 16);
            ringVerts.forEach(([lon, lat]) => {
              allCartesians.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
            });
            allCartesians.push(Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 0));
          }
        }

        if (allCartesians.length > 0) {
          const bSphere = Cesium.BoundingSphere.fromPoints(allCartesians);
          try {
            if (viewer.camera && typeof viewer.camera.flyToBoundingSphere === 'function') {
              viewer.camera.flyToBoundingSphere(bSphere, {
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(1500, bSphere.radius * 2.4)),
                duration: 1.8,
              });
            } else if (viewer.camera) {
              const cartoCenter = Cesium.Cartographic.fromCartesian(bSphere.center);
              const alt = Math.max(2500, bSphere.radius * 3.0);
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  Cesium.Math.toDegrees(cartoCenter.longitude),
                  Cesium.Math.toDegrees(cartoCenter.latitude),
                  alt
                ),
                duration: 1.8,
              });
            }
          } catch (_err) {
            // Safe degrade
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:toast', {
                detail: { text: `Framing extent across all ${activeRings.length} active Range Rings` },
              })
            );
          }
        }
      }
    });

    // Clear All
    container.querySelector('#btn-clear-all-rings')?.addEventListener('click', () => {
      if (activeViewer && _createdRings.length > 0) {
        _createdRings.forEach((r) => {
          if (r.entities) {
            r.entities.forEach((ent) => activeViewer.entities.remove(ent));
          }
        });
      }
      _createdRings = [];

      try {
        const engine = getSharedMapToolsEngine(activeViewer);
        if (engine) {
          const features = engine.getAllFeatures();
          for (const f of features) {
            if (f.type === FEATURE_TYPES.CIRCLE || f.type === FEATURE_TYPES.RANGE_RING) {
              engine.deleteFeature(f.id, { force: true });
            }
          }
        }
      } catch (_e) {}

      updateModalContent();
    });

    // Individual Fly To & Delete
    container.querySelectorAll('.fly-to-ring-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ringId = btn.dataset.id;
        const activeRings = getAllRings();
        const targetRing = activeRings.find((r) => r.id === ringId);
        const viewer = activeViewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);

        if (targetRing && viewer && targetRing.center && typeof Cesium !== 'undefined') {
          const center = parseCoord(targetRing.center);
          const radiusM = Number(targetRing.radiusMeters) || 5000;

          // Compute 3D Bounding Sphere for this ring's perimeter
          const ringVerts = generateRangeRingVertices(center, radiusM, 32);
          const ringCartesians = ringVerts.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0));
          ringCartesians.push(Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 0));

          const bSphere = Cesium.BoundingSphere.fromPoints(ringCartesians);

          try {
            if (viewer.camera && typeof viewer.camera.flyToBoundingSphere === 'function') {
              viewer.camera.flyToBoundingSphere(bSphere, {
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), Math.max(1200, bSphere.radius * 2.4)),
                duration: 1.5,
              });
            } else if (viewer.camera) {
              const alt = Math.max(1200, radiusM * 3.2);
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, alt),
                orientation: {
                  heading: Cesium.Math.toRadians(0),
                  pitch: Cesium.Math.toRadians(-45),
                  roll: 0,
                },
                duration: 1.5,
              });
            }
          } catch (_err) {
            if (viewer.camera) {
              const alt = Math.max(1200, radiusM * 3.2);
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, alt),
                duration: 1.5,
              });
            }
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:toast', {
                detail: { text: `Flying camera to Range Ring: ${targetRing.name} [${center.lat.toFixed(4)}°N, ${center.lng.toFixed(4)}°E]` },
              })
            );
          }
        }
      });
    });

    container.querySelectorAll('.delete-ring-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ringId = btn.dataset.id;
        const idx = _createdRings.findIndex((r) => r.id === ringId);
        if (idx !== -1) {
          const [removed] = _createdRings.splice(idx, 1);
          if (activeViewer && removed.entities) {
            removed.entities.forEach((ent) => activeViewer.entities.remove(ent));
          }
        }

        try {
          const engine = getSharedMapToolsEngine(activeViewer);
          if (engine && engine.hasFeature(ringId)) {
            engine.deleteFeature(ringId, { force: true });
          }
        } catch (_e) {}

        updateModalContent();
      });
    });

    // Draggable Window Setup
    const titlebar = container.querySelector('#range-ring-titlebar');
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    titlebar?.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.style.left = `${Math.max(10, initialLeft + dx)}px`;
      container.style.top = `${Math.max(10, initialTop + dy)}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  };

  updateModalContent();
  document.body.appendChild(container);
  _activeModalInstance = container;

  return container;
}

