/**
 * @module src/plugins/shape/shapePlugin.js
 * @description Modular Tactical Shape & Perimeter Plugin for Map Tools.
 * Provides interactive polygon perimeters, standoff circles, and monitored geofence zones.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';
import {
  haversineDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
} from '../../tools/geodesicMath.js';
import { FEATURE_TYPES, getSharedMapToolsEngine } from '../../tools/mapToolsEngine.js';
import { getSharedGeofenceEngine } from '../../tools/geofenceEngine.js';

export const SHAPE_TYPES = Object.freeze({
  POLYGON: 'polygon',
  RANGE_RING: 'range_ring',
  GEOFENCE: 'geofence',
});

export const TACTICAL_SHAPE_COLORS = Object.freeze([
  { id: 'cyan', label: 'Air Defense Cyan', hex: '#00e5ff' },
  { id: 'green', label: 'Friendly Green', hex: '#10b981' },
  { id: 'amber', label: 'Restricted Amber', hex: '#f59e0b' },
  { id: 'red', label: 'Exclusion Red', hex: '#ef4444' },
  { id: 'purple', label: 'Sensor Violet', hex: '#a855f7' },
]);

export class ShapePlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'shape',
      name: 'Shape & Perimeter',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.SHAPE,
      icon: '⬡',
      description: 'Enclosed perimeter zones, range rings, tactical polygons, and alert-monitored geofences.',
      capabilities: ['range-rings', 'circles', 'polygons', 'geofence-breach-watchdog', 'canvas-pick'],
      defaultConfig: {
        activeType: SHAPE_TYPES.POLYGON,
        radiusKm: 25,
        fillOpacity: 25,
        color: '#00e5ff',
        breachAlertEnabled: true,
      },
    });

    this._activePoints = [];
    this._draftEntities = [];
    this._createdEntities = [];
    this._isDrafting = false;
    this._statusText = 'Ready: Select shape type and click Start Drafting';
  }

  activate() {
    super.activate();
    this._statusText = `Shape tool active: ${this.config.activeType.toUpperCase()}`;
  }

  deactivate() {
    super.deactivate();
    this.cancelActiveDraft();
  }

  /**
   * Starts an interactive drafting session on the 3D globe.
   */
  startInteractiveDraft() {
    this.cancelActiveDraft();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);

    this._isDrafting = true;
    this._activePoints = [];
    this._statusText = `Drafting ${this.config.activeType.toUpperCase()}: Click on terrain to place vertices`;

    if (!viewer || !viewer.scene || typeof Cesium === 'undefined') {
      this._simulateDraftCompletion();
      return;
    }

    const type = this.config.activeType;

    this.armPickingSession({
      cursor: 'crosshair',
      onLeftClick: (coord) => {
        this._activePoints.push(coord);

        if (type === SHAPE_TYPES.RANGE_RING) {
          if (this._activePoints.length === 1) {
            this._statusText = 'Center locked. Move cursor to expand radius, click to commit.';
          } else if (this._activePoints.length >= 2) {
            const p1 = this._activePoints[0];
            const p2 = this._activePoints[1];
            const radiusM = haversineDistance([p1.lng, p1.lat], [p2.lng, p2.lat], 'm');
            this._commitCircleShape(p1, radiusM);
            this.abortPickingSession();
            this._isDrafting = false;
          }
        } else {
          // Polygon or Geofence
          this._statusText = `Added vertex ${this._activePoints.length}. Double-click or click Commit to finish.`;
          this._updateDraftPreview();
        }
        this._renderStatusInContainer();
      },
      onMouseMove: (coord) => {
        if (!this._isDrafting || this._activePoints.length === 0) return;

        if (type === SHAPE_TYPES.RANGE_RING) {
          const p1 = this._activePoints[0];
          const radiusM = haversineDistance([p1.lng, p1.lat], [coord.lng, coord.lat], 'm');
          this._updateCirclePreview(p1, radiusM);
        } else {
          this._updateDraftPreview(coord);
        }
      },
      onDoubleClick: () => {
        if (this._activePoints.length >= 3) {
          this._commitPolygonShape(this._activePoints);
          this.abortPickingSession();
          this._isDrafting = false;
        }
      },
      onRightClick: () => {
        this.cancelActiveDraft();
      },
      onEscape: () => {
        this.cancelActiveDraft();
      },
    });

    this._renderStatusInContainer();
  }

  cancelActiveDraft() {
    this._isDrafting = false;
    this._activePoints = [];
    this.clearDraftEntities();
    this.abortPickingSession();
    this._statusText = 'Draft cancelled';
    this._renderStatusInContainer();
  }

  clearDraftEntities() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._draftEntities)) {
      for (const ent of this._draftEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._draftEntities = [];
  }

  clearAllShapes() {
    this.cancelActiveDraft();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._createdEntities)) {
      for (const ent of this._createdEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._createdEntities = [];
    this._statusText = 'Cleared all shapes';
    this._renderStatusInContainer();
  }

  _updateCirclePreview(center, radiusMeters) {
    this.clearDraftEntities();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined') return;

    const alpha = (this.config.fillOpacity || 25) / 100;
    const color = Cesium.Color.fromCssColorString(this.config.color || '#00e5ff');

    const circleEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 1),
      ellipse: {
        semiMinorAxis: radiusMeters,
        semiMajorAxis: radiusMeters,
        material: color.withAlpha(alpha),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 1),
      label: {
        text: `⭕ RADIUS: ${(radiusMeters / 1000).toFixed(1)} km (${(radiusMeters / 1852).toFixed(1)} NM)`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    this._draftEntities.push(circleEnt, labelEnt);
  }

  _commitCircleShape(center, radiusMeters) {
    this.clearDraftEntities();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined') return;

    const alpha = (this.config.fillOpacity || 25) / 100;
    const color = Cesium.Color.fromCssColorString(this.config.color || '#00e5ff');
    const radiusKm = radiusMeters / 1000;
    const radiusNm = radiusMeters / 1852;
    const name = `Range Ring (${radiusKm.toFixed(1)} km / ${radiusNm.toFixed(1)} NM)`;

    const circleEnt = viewer.entities.add({
      name,
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 1),
      ellipse: {
        semiMinorAxis: radiusMeters,
        semiMajorAxis: radiusMeters,
        material: color.withAlpha(alpha),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 1),
      label: {
        text: `⭕ ${name}`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    this._createdEntities.push(circleEnt, labelEnt);

    // Commit to map tools engine
    const engine = this._engine || getSharedMapToolsEngine(viewer);
    if (engine) {
      engine.createFeature({
        type: FEATURE_TYPES.CIRCLE,
        name,
        coordinates: { center: [center.lng, center.lat, 0], radiusMeters },
        properties: {
          color: this.config.color,
          radiusMeters,
          radiusKm,
          radiusNm,
          shapeSubtype: 'range_ring',
        },
      });
    }

    this._statusText = `Created ${name}`;
    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, { type: 'circle', name, radiusMeters, center });
    this._renderStatusInContainer();
  }

  _updateDraftPreview(currentMouse = null) {
    this.clearDraftEntities();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined') return;

    const allPts = currentMouse ? [...this._activePoints, currentMouse] : this._activePoints;
    if (allPts.length < 2) return;

    const positions = allPts.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
    const color = Cesium.Color.fromCssColorString(this.config.color || '#00e5ff');

    const lineEnt = viewer.entities.add({
      polyline: {
        positions,
        width: 2,
        material: color,
        clampToGround: true,
      },
    });
    this._draftEntities.push(lineEnt);
  }

  _commitPolygonShape(points) {
    this.clearDraftEntities();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined' || points.length < 3) return;

    const alpha = (this.config.fillOpacity || 25) / 100;
    const color = Cesium.Color.fromCssColorString(this.config.color || '#00e5ff');
    const flatPoints = points.map((p) => [p.lng, p.lat]);
    const areaM2 = calculatePolygonGeodesicArea(flatPoints);
    const perimM = calculatePolygonPerimeter(flatPoints);
    const areaKm2 = areaM2 / 1e6;
    const name = this.config.activeType === SHAPE_TYPES.GEOFENCE
      ? `Geofence Zone (${areaKm2.toFixed(1)} km²)`
      : `Tactical Polygon (${areaKm2.toFixed(1)} km²)`;

    const positions = points.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));

    const polyEnt = viewer.entities.add({
      name,
      polygon: {
        hierarchy: positions,
        material: color.withAlpha(alpha),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    const centerLng = points.reduce((acc, p) => acc + p.lng, 0) / points.length;
    const centerLat = points.reduce((acc, p) => acc + p.lat, 0) / points.length;

    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 1),
      label: {
        text: `⬡ ${name} · ${areaKm2.toFixed(1)} km²`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    this._createdEntities.push(polyEnt, labelEnt);

    // Commit to MapToolsEngine
    const engine = this._engine || getSharedMapToolsEngine(viewer);
    if (engine) {
      engine.createFeature({
        type: FEATURE_TYPES.POLYGON,
        name,
        coordinates: flatPoints,
        properties: {
          color: this.config.color,
          areaSquareKm: areaKm2,
          perimeterMeters: perimM,
          shapeSubtype: this.config.activeType,
          breachAlertEnabled: this.config.breachAlertEnabled,
        },
      });
    }

    // Register with GeofenceEngine if geofence type
    if (this.config.activeType === SHAPE_TYPES.GEOFENCE) {
      const geofenceEngine = getSharedGeofenceEngine({ mapToolsEngine: engine });
      if (geofenceEngine) {
        geofenceEngine.addFence({
          id: `fence-${Date.now()}`,
          name,
          type: 'polygon',
          coordinates: flatPoints,
          severity: 'HIGH',
        });
      }
    }

    this._statusText = `Created ${name} (${areaKm2.toFixed(2)} km²)`;
    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, { type: 'polygon', name, areaKm2, perimeterMeters: perimM });
    this._renderStatusInContainer();
  }

  _simulateDraftCompletion() {
    this._statusText = `Simulated ${this.config.activeType.toUpperCase()} created`;
    this._renderStatusInContainer();
  }

  _renderStatusInContainer() {
    const statusEl = this.container?.querySelector('#shape-status-text');
    if (statusEl) statusEl.textContent = this._statusText;
  }

  render(container) {
    super.render(container);
    if (!container) return;

    container.innerHTML = `
      <div class="plugin-module-wrapper shape-plugin-root space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <div>
            <span class="text-[9px] font-mono text-emerald-400 font-semibold uppercase tracking-wider block">SHAPE & PERIMETER MODULE</span>
            <span class="font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
              <span>⬡</span> PERIMETER & GEOFENCE SUITE
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" id="shape-help-guide-btn" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-cyan-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
              <span>📖</span> <span>GUIDE</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono text-[10px]">
              ${this.config.activeType.toUpperCase()}
            </span>
          </div>
        </div>

        <!-- Shape Mode Selection -->
        <div>
          <label class="block text-slate-300 mb-1.5 font-medium">Perimeter Shape Mode</label>
          <div class="grid grid-cols-3 gap-1.5">
            <button type="button" class="shape-type-btn py-1.5 px-2 rounded border font-mono text-[11px] transition flex items-center justify-center gap-1 ${
              this.config.activeType === SHAPE_TYPES.POLYGON
                ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }" data-shape-type="${SHAPE_TYPES.POLYGON}">
              <span>⬡</span> <span>Polygon</span>
            </button>
            <button type="button" class="shape-type-btn py-1.5 px-2 rounded border font-mono text-[11px] transition flex items-center justify-center gap-1 ${
              this.config.activeType === SHAPE_TYPES.RANGE_RING
                ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }" data-shape-type="${SHAPE_TYPES.RANGE_RING}">
              <span>⭕</span> <span>Range Ring</span>
            </button>
            <button type="button" class="shape-type-btn py-1.5 px-2 rounded border font-mono text-[11px] transition flex items-center justify-center gap-1 ${
              this.config.activeType === SHAPE_TYPES.GEOFENCE
                ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }" data-shape-type="${SHAPE_TYPES.GEOFENCE}">
              <span>🛡️</span> <span>Geofence</span>
            </button>
          </div>
        </div>

        <!-- Color Palette -->
        <div>
          <label class="block text-slate-300 mb-1 font-medium">Threat / Zone Color</label>
          <div class="flex items-center gap-2">
            ${TACTICAL_SHAPE_COLORS.map(
              (c) => `
              <button type="button" class="shape-color-dot w-6 h-6 rounded-full border-2 transition ${
                this.config.color === c.hex ? 'border-white scale-110 shadow-lg' : 'border-slate-700 hover:scale-105'
              }" style="background-color: ${c.hex};" data-hex="${c.hex}" title="${c.label}"></button>
            `
            ).join('')}
          </div>
        </div>

        <!-- Fill Opacity Slider -->
        <div>
          <div class="flex justify-between text-slate-300 mb-1">
            <span>Fill Translucency</span>
            <span id="shape-opacity-val" class="font-mono text-cyan-300">${this.config.fillOpacity}%</span>
          </div>
          <input type="range" id="shape-opacity-slider" min="10" max="90" step="5" value="${this.config.fillOpacity}" class="w-full accent-cyan-400 cursor-pointer" />
        </div>

        <!-- Geofence Breach Watchdog Toggle -->
        <label class="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
          <input type="checkbox" id="shape-breach-chk" ${this.config.breachAlertEnabled ? 'checked' : ''} class="accent-cyan-400 rounded" />
          <span>Enable Real-Time Asset Breach Watchdog</span>
        </label>

        <!-- Status Card -->
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-cyan-200">
          <span id="shape-status-text">${this._statusText}</span>
        </div>

        <!-- Action Buttons -->
        <div class="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
          <button type="button" id="shape-start-draft-btn" class="py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg">
            <span>🎯</span> <span>START DRAFTING</span>
          </button>
          <button type="button" id="shape-clear-btn" class="py-2 px-3 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5">
            <span>🗑️</span> <span>CLEAR ALL</span>
          </button>
        </div>
      </div>
    `;

    // Wire Shape Type Buttons
    container.querySelectorAll('.shape-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.config.activeType = btn.dataset.shapeType;
        this.render(container);
      });
    });

    // Wire Color Dots
    container.querySelectorAll('.shape-color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        this.config.color = dot.dataset.hex;
        this.render(container);
      });
    });

    // Wire Opacity Slider
    const opSlider = container.querySelector('#shape-opacity-slider');
    const opVal = container.querySelector('#shape-opacity-val');
    opSlider?.addEventListener('input', (e) => {
      this.config.fillOpacity = Number(e.target.value);
      if (opVal) opVal.textContent = `${this.config.fillOpacity}%`;
    });

    // Wire Breach Watchdog Checkbox
    container.querySelector('#shape-breach-chk')?.addEventListener('change', (e) => {
      this.config.breachAlertEnabled = e.target.checked;
    });

    // Wire Help Guide Button
    container.querySelector('#shape-help-guide-btn')?.addEventListener('click', () => {
      const helpBtnFloating = document.getElementById('floating-btn-help');
      const helpDrawer = document.getElementById('floating-tool-help-drawer');
      if (helpDrawer && helpBtnFloating) {
        if (helpDrawer.hidden) {
          helpBtnFloating.click();
        } else {
          helpDrawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    // Wire Start Draft & Clear Buttons
    container.querySelector('#shape-start-draft-btn')?.addEventListener('click', () => {
      this.startInteractiveDraft();
    });

    container.querySelector('#shape-clear-btn')?.addEventListener('click', () => {
      this.clearAllShapes();
    });
  }
}
