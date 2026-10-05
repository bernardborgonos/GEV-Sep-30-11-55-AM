/**
 * @module src/plugins/radar/radarPlugin.js
 * @description Radar & Line-of-Sight Sensor FOV Cone Plugin for Map Tools.
 * Generates 3D sensor field-of-view, radar horizon line-of-sight analysis, and terrain mask occlusion on 3D globe.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';

export class RadarPlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'sensor-los-cone',
      name: 'Radar & Line-of-Sight Cone',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.ANALYTICS,
      icon: '📡',
      description: '3D sensor field-of-view, radar horizon line-of-sight analysis, and terrain mask occlusion.',
      capabilities: ['sensor-cone', 'radar-horizon', 'terrain-mask', 'azimuth-fan', 'canvas-pick'],
      defaultConfig: {
        rangeKm: 80,
        azimuthSpanDeg: 90,
        sensorHeightM: 25,
        coneColor: '#f59e0b',
      },
    });

    this._createdEntities = [];
    this._statusText = 'Ready: Set parameters and click Cast 3D Radar Cone';
  }

  castRadarCone(originCoord = null) {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || !viewer.scene || typeof Cesium === 'undefined') {
      this._statusText = 'Cast simulated radar sensor cone.';
      this._renderStatusInContainer();
      return;
    }

    let centerLng = -97.7431;
    let centerLat = 30.2672;

    if (originCoord && typeof originCoord.lng === 'number') {
      centerLng = originCoord.lng;
      centerLat = originCoord.lat;
    } else {
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
    }

    const rangeMeters = this.config.rangeKm * 1000;
    const color = Cesium.Color.fromCssColorString(this.config.coneColor || '#f59e0b');

    // Generate radar sector polygon points
    const startBearing = 0;
    const endBearing = this.config.azimuthSpanDeg;
    const steps = 32;
    const sectorPoints = [{ lng: centerLng, lat: centerLat }];

    for (let i = 0; i <= steps; i++) {
      const bearing = startBearing + (endBearing - startBearing) * (i / steps);
      const rad = (bearing * Math.PI) / 180;
      const dLat = (rangeMeters / 111320) * Math.cos(rad);
      const dLng = (rangeMeters / (111320 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(rad);
      sectorPoints.push({ lng: centerLng + dLng, lat: centerLat + dLat });
    }

    const positions = sectorPoints.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));

    // 1. Radar Sector Fan Entity
    const coneEnt = viewer.entities.add({
      name: `Radar FOV Cone (${this.config.rangeKm} km · ${this.config.azimuthSpanDeg}°)`,
      polygon: {
        hierarchy: positions,
        material: color.withAlpha(0.22),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    this._createdEntities.push(coneEnt);

    // 2. Transmitter Tower Point & Label
    const towerEnt = viewer.entities.add({
      name: 'Radar Transmitter Site',
      position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 1),
      point: {
        pixelSize: 12,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: `📡 RADAR EMITTER · ${this.config.rangeKm} km · ${this.config.azimuthSpanDeg}° FOV · ${this.config.sensorHeightM}m AGL`,
        font: '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    this._createdEntities.push(towerEnt);

    this._statusText = `Deployed Radar Emitter (${this.config.rangeKm} km · ${this.config.azimuthSpanDeg}°) at ${centerLat.toFixed(2)}°, ${centerLng.toFixed(2)}°`;
    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, {
      type: 'radar-cone',
      rangeKm: this.config.rangeKm,
      azimuthSpanDeg: this.config.azimuthSpanDeg,
      sensorHeightM: this.config.sensorHeightM,
      origin: { lat: centerLat, lng: centerLng },
    });
    this._renderStatusInContainer();
  }

  clearRadarEntities() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._createdEntities)) {
      for (const ent of this._createdEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._createdEntities = [];
    this._statusText = 'Cleared radar sensors';
    this._renderStatusInContainer();
  }

  _renderStatusInContainer() {
    const el = this.container?.querySelector('#radar-status-text');
    if (el) el.textContent = this._statusText;
  }

  render(container) {
    super.render(container);
    if (!container) return;

    container.innerHTML = `
      <div class="plugin-module-wrapper space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
            <span>📡</span> RADAR & SENSOR PARAMETERS
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" id="radar-help-guide-btn" class="text-[10px] text-amber-400 hover:text-amber-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-amber-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
              <span>📖</span> <span>GUIDE</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 font-mono text-[10px]">
              HORIZON: ACTIVE
            </span>
          </div>
        </div>

        <div class="space-y-2">
          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Radar Coverage Range</span>
              <span id="radar-range-val" class="font-mono text-amber-300">${this.config.rangeKm} km</span>
            </div>
            <input type="range" id="radar-range-slider" class="addon-sensor-range w-full accent-amber-400 cursor-pointer" min="10" max="300" step="5" value="${this.config.rangeKm}" />
          </div>

          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Azimuth Sector Span</span>
              <span id="radar-span-val" class="font-mono text-amber-300">${this.config.azimuthSpanDeg}°</span>
            </div>
            <input type="range" id="radar-span-slider" min="15" max="360" step="15" value="${this.config.azimuthSpanDeg}" class="w-full accent-amber-400 cursor-pointer" />
          </div>

          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Antenna Mast Height</span>
              <span id="radar-height-val" class="font-mono text-amber-300">${this.config.sensorHeightM} m AGL</span>
            </div>
            <input type="range" id="radar-height-slider" min="5" max="150" step="5" value="${this.config.sensorHeightM}" class="w-full accent-amber-400 cursor-pointer" />
          </div>
        </div>

        <!-- Status Card -->
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-amber-200">
          <span id="radar-status-text">${this._statusText}</span>
        </div>

        <div class="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
          <button type="button" id="radar-place-emitter-btn" class="addon-sensor-cast-btn py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg">
            <span>📡</span> <span>CAST 3D RADAR CONE</span>
          </button>
          <button type="button" id="radar-clear-btn" class="py-2 px-3 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5">
            <span>🗑️</span> <span>CLEAR RADAR</span>
          </button>
        </div>
      </div>
    `;

    const rangeSlider = container.querySelector('#radar-range-slider');
    const rangeVal = container.querySelector('#radar-range-val');
    rangeSlider?.addEventListener('input', (e) => {
      this.config.rangeKm = Number(e.target.value);
      if (rangeVal) rangeVal.textContent = `${this.config.rangeKm} km`;
    });

    const spanSlider = container.querySelector('#radar-span-slider');
    const spanVal = container.querySelector('#radar-span-val');
    spanSlider?.addEventListener('input', (e) => {
      this.config.azimuthSpanDeg = Number(e.target.value);
      if (spanVal) spanVal.textContent = `${this.config.azimuthSpanDeg}°`;
    });

    const heightSlider = container.querySelector('#radar-height-slider');
    const heightVal = container.querySelector('#radar-height-val');
    heightSlider?.addEventListener('input', (e) => {
      this.config.sensorHeightM = Number(e.target.value);
      if (heightVal) heightVal.textContent = `${this.config.sensorHeightM} m AGL`;
    });

    // Wire Help Guide Button
    container.querySelector('#radar-help-guide-btn')?.addEventListener('click', () => {
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

    container.querySelector('#radar-place-emitter-btn')?.addEventListener('click', () => {
      this.castRadarCone();
    });

    container.querySelector('#radar-clear-btn')?.addEventListener('click', () => {
      this.clearRadarEntities();
    });
  }
}
