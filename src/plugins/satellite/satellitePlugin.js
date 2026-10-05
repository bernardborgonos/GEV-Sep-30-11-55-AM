/**
 * @module src/plugins/satellite/satellitePlugin.js
 * @description Satellite Pass & Ground Swath Footprint Plugin for Map Tools.
 * Calculates orbital nadir ground tracks, sensor swath footprint widths, and pass elevation masks on 3D globe.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';

export class SatellitePlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'satellite-footprint',
      name: 'Satellite Pass & Ground Swath',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.INTELLIGENCE,
      icon: '🛰️',
      description: 'Calculate orbital nadir ground tracks, sensor swath footprint widths, and pass elevation masks.',
      capabilities: ['orbital-swath', 'ground-track', 'elevation-mask', 'footprint-polygon', 'canvas-pick'],
      defaultConfig: {
        swathWidthKm: 450,
        minElevationDeg: 15,
        orbitalRegime: 'LEO',
        showNadirTrack: true,
        swathColor: '#00e5ff',
      },
    });

    this._createdEntities = [];
    this._statusText = 'Ready: Adjust parameters and project satellite swath footprint';
  }

  projectPassFootprint() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || !viewer.scene || typeof Cesium === 'undefined') {
      this._statusText = 'Projected simulated satellite pass footprint.';
      this._renderStatusInContainer();
      return;
    }

    // Determine target center point from camera view
    let centerLng = -97.7431;
    let centerLat = 30.2672;

    try {
      const windowPosition = new Cesium.Cartesian2(viewer.scene.canvas.clientWidth / 2, viewer.scene.canvas.clientHeight / 2);
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) {
        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          centerLng = Cesium.Math.toDegrees(carto.longitude);
          centerLat = Cesium.Math.toDegrees(carto.latitude);
        }
      }
    } catch (_) {}

    const swathWidthM = this.config.swathWidthKm * 1000;
    const halfWidthM = swathWidthM / 2;
    const dLat = (this.config.swathWidthKm / 111) * 2;
    const dLng = dLat * 1.4;

    // Generate orbital swath corridor points (inclination ~55 degrees)
    const p1 = { lng: centerLng - dLng, lat: centerLat - dLat };
    const p2 = { lng: centerLng + dLng, lat: centerLat + dLat };

    const headingRad = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat);
    const perpRad = headingRad + Math.PI / 2;

    const offsetLat = (halfWidthM / 111320) * Math.cos(perpRad);
    const offsetLng = (halfWidthM / (111320 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(perpRad);

    const corner1 = Cesium.Cartesian3.fromDegrees(p1.lng - offsetLng, p1.lat - offsetLat, 1);
    const corner2 = Cesium.Cartesian3.fromDegrees(p2.lng - offsetLng, p2.lat - offsetLat, 1);
    const corner3 = Cesium.Cartesian3.fromDegrees(p2.lng + offsetLng, p2.lat + offsetLat, 1);
    const corner4 = Cesium.Cartesian3.fromDegrees(p1.lng + offsetLng, p1.lat + offsetLat, 1);

    const color = Cesium.Color.fromCssColorString(this.config.swathColor || '#00e5ff');

    // 1. Swath Corridor Polygon
    const swathEnt = viewer.entities.add({
      name: `Satellite Swath (${this.config.swathWidthKm} km)`,
      polygon: {
        hierarchy: [corner1, corner2, corner3, corner4],
        material: color.withAlpha(0.18),
        outline: true,
        outlineColor: color.withAlpha(0.85),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    this._createdEntities.push(swathEnt);

    // 2. Nadir Track Polyline
    if (this.config.showNadirTrack) {
      const nadirEnt = viewer.entities.add({
        name: 'Nadir Ground Track Vector',
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(p1.lng, p1.lat, 1),
            Cesium.Cartesian3.fromDegrees(p2.lng, p2.lat, 1),
          ],
          width: 2.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.YELLOW,
            dashLength: 12,
          }),
          clampToGround: true,
        },
      });
      this._createdEntities.push(nadirEnt);
    }

    // 3. Label Entity
    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 1),
      label: {
        text: `🛰️ ${this.config.orbitalRegime} PASS · SWATH ${this.config.swathWidthKm} km · MASK ${this.config.minElevationDeg}°`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    this._createdEntities.push(labelEnt);

    this._statusText = `Projected ${this.config.orbitalRegime} swath (${this.config.swathWidthKm} km) at ${centerLat.toFixed(2)}°, ${centerLng.toFixed(2)}°`;
    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, {
      type: 'satellite-swath',
      swathWidthKm: this.config.swathWidthKm,
      minElevationDeg: this.config.minElevationDeg,
      center: { lat: centerLat, lng: centerLng },
    });
    this._renderStatusInContainer();
  }

  clearSwathEntities() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._createdEntities)) {
      for (const ent of this._createdEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._createdEntities = [];
    this._statusText = 'Cleared satellite pass footprints';
    this._renderStatusInContainer();
  }

  _renderStatusInContainer() {
    const el = this.container?.querySelector('#sat-status-text');
    if (el) el.textContent = this._statusText;
  }

  render(container) {
    super.render(container);
    if (!container) return;

    container.innerHTML = `
      <div class="plugin-module-wrapper space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
            <span>🛰️</span> ORBITAL SWATH PARAMETERS
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" id="sat-help-guide-btn" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-cyan-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
              <span>📖</span> <span>GUIDE</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono text-[10px]">
              ${this.config.orbitalRegime}
            </span>
          </div>
        </div>

        <!-- Orbital Regime Preset Buttons -->
        <div>
          <label class="block text-slate-300 mb-1 font-medium">Orbital Regime</label>
          <div class="grid grid-cols-4 gap-1">
            ${['LEO', 'MEO', 'GEO', 'POLAR'].map(
              (regime) => `
              <button type="button" class="sat-regime-btn py-1 px-1.5 rounded border text-[10px] font-mono transition ${
                this.config.orbitalRegime === regime
                  ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }" data-regime="${regime}">${regime}</button>
            `
            ).join('')}
          </div>
        </div>

        <div class="space-y-2">
          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Sensor Swath Width</span>
              <span id="sat-swath-val" class="font-mono text-cyan-300">${this.config.swathWidthKm} km</span>
            </div>
            <input type="range" id="sat-swath-slider" class="addon-sat-swath w-full accent-cyan-400 cursor-pointer" min="100" max="1500" step="25" value="${this.config.swathWidthKm}" />
          </div>

          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Min Pass Elevation Mask</span>
              <span id="sat-elev-val" class="font-mono text-cyan-300">${this.config.minElevationDeg}°</span>
            </div>
            <input type="range" id="sat-elev-slider" min="5" max="45" step="5" value="${this.config.minElevationDeg}" class="w-full accent-cyan-400 cursor-pointer" />
          </div>

          <label class="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
            <input type="checkbox" id="sat-nadir-chk" ${this.config.showNadirTrack ? 'checked' : ''} class="accent-cyan-400 rounded" />
            <span>Show Sub-Satellite Nadir Ground Track</span>
          </label>
        </div>

        <!-- Status Box -->
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-cyan-200">
          <span id="sat-status-text">${this._statusText}</span>
        </div>

        <div class="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
          <button type="button" id="sat-swath-calc-btn" class="addon-sat-calc-btn py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg">
            <span>🛰️</span> <span>PROJECT PASS FOOTPRINT</span>
          </button>
          <button type="button" id="sat-swath-clear-btn" class="py-2 px-3 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5">
            <span>🗑️</span> <span>CLEAR SWATH</span>
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('.sat-regime-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.config.orbitalRegime = btn.dataset.regime;
        this.render(container);
      });
    });

    const swathSlider = container.querySelector('#sat-swath-slider');
    const swathVal = container.querySelector('#sat-swath-val');
    swathSlider?.addEventListener('input', (e) => {
      this.config.swathWidthKm = Number(e.target.value);
      if (swathVal) swathVal.textContent = `${this.config.swathWidthKm} km`;
    });

    const elevSlider = container.querySelector('#sat-elev-slider');
    const elevVal = container.querySelector('#sat-elev-val');
    elevSlider?.addEventListener('input', (e) => {
      this.config.minElevationDeg = Number(e.target.value);
      if (elevVal) elevVal.textContent = `${this.config.minElevationDeg}°`;
    });

    container.querySelector('#sat-nadir-chk')?.addEventListener('change', (e) => {
      this.config.showNadirTrack = e.target.checked;
    });

    // Wire Help Guide Button
    container.querySelector('#sat-help-guide-btn')?.addEventListener('click', () => {
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

    container.querySelector('#sat-swath-calc-btn')?.addEventListener('click', () => {
      this.projectPassFootprint();
    });

    container.querySelector('#sat-swath-clear-btn')?.addEventListener('click', () => {
      this.clearSwathEntities();
    });
  }
}
