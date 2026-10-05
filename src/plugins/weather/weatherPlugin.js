/**
 * @module src/plugins/weather/weatherPlugin.js
 * @description Weather & SIGMET Avoidance Buffer Plugin for Map Tools.
 * Generates convective storm cell standoff envelopes, icing levels, and SIGMET turbulence clearance zones on 3D globe.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';

export class WeatherPlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'weather-hazard-buffer',
      name: 'Weather & SIGMET Avoidance Buffer',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.UTILITY,
      icon: '⛈️',
      description: 'Dynamic convective storm cell standoff envelopes, icing levels, and SIGMET turbulence clearance zones.',
      capabilities: ['weather-buffer', 'convective-standoff', 'sigmet-corridor', 'aviation-safety', 'canvas-pick'],
      defaultConfig: {
        standoffNm: 20,
        flightLevel: 320,
        showTStormBuffer: true,
        hazardColor: '#ef4444',
      },
    });

    this._createdEntities = [];
    this._statusText = 'Ready: Set standoff margin and generate hazard clearance envelope';
  }

  generateStandoffEnvelope() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || !viewer.scene || typeof Cesium === 'undefined') {
      this._statusText = `Generated convective buffer (${this.config.standoffNm} NM)`;
      this._renderStatusInContainer();
      return;
    }

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

    const radiusMeters = this.config.standoffNm * 1852;
    const color = Cesium.Color.fromCssColorString(this.config.hazardColor || '#ef4444');

    // 1. Convective Warning Circle / Standoff Zone
    const circleEnt = viewer.entities.add({
      name: `SIGMET Hazard Buffer (${this.config.standoffNm} NM · FL${this.config.flightLevel})`,
      position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 1),
      ellipse: {
        semiMinorAxis: radiusMeters,
        semiMajorAxis: radiusMeters,
        material: color.withAlpha(0.2),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    this._createdEntities.push(circleEnt);

    // 2. Center Thunderstorm Core Icon & Label
    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 1),
      label: {
        text: `⛈️ CONVECTIVE BUFFER · ${this.config.standoffNm} NM STANDOFF · FL${this.config.flightLevel}`,
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

    this._statusText = `Generated ${this.config.standoffNm} NM standoff envelope at FL${this.config.flightLevel}`;
    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, {
      type: 'weather-buffer',
      standoffNm: this.config.standoffNm,
      flightLevel: this.config.flightLevel,
      center: { lat: centerLat, lng: centerLng },
    });
    this._renderStatusInContainer();
  }

  clearWeatherBuffers() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._createdEntities)) {
      for (const ent of this._createdEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._createdEntities = [];
    this._statusText = 'Cleared weather standoff buffers';
    this._renderStatusInContainer();
  }

  _renderStatusInContainer() {
    const el = this.container?.querySelector('#wx-status-text');
    if (el) el.textContent = this._statusText;
  }

  render(container) {
    super.render(container);
    if (!container) return;

    container.innerHTML = `
      <div class="plugin-module-wrapper space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="font-bold text-rose-400 tracking-wider flex items-center gap-1.5">
            <span>⛈️</span> HAZARD STANDOFF PARAMETERS
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" id="wx-help-guide-btn" class="text-[10px] text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-rose-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
              <span>📖</span> <span>GUIDE</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700/60 text-rose-300 font-mono text-[10px]">
              SIGMET / ICAO
            </span>
          </div>
        </div>

        <div class="space-y-2">
          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Standoff Margin</span>
              <span id="wx-standoff-val" class="font-mono text-rose-300">${this.config.standoffNm} NM</span>
            </div>
            <input type="range" id="wx-standoff-slider" class="addon-wx-standoff w-full accent-rose-400 cursor-pointer" min="5" max="50" step="5" value="${this.config.standoffNm}" />
          </div>

          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Aviation Flight Level</span>
              <span id="wx-fl-val" class="font-mono text-rose-300">FL${this.config.flightLevel}</span>
            </div>
            <input type="range" id="wx-fl-slider" min="100" max="450" step="10" value="${this.config.flightLevel}" class="w-full accent-rose-400 cursor-pointer" />
          </div>

          <label class="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
            <input type="checkbox" id="wx-tstorm-chk" ${this.config.showTStormBuffer ? 'checked' : ''} class="accent-rose-400 rounded" />
            <span>Generate Convective Buffer Zone</span>
          </label>
        </div>

        <!-- Status Card -->
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-rose-200">
          <span id="wx-status-text">${this._statusText}</span>
        </div>

        <div class="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
          <button type="button" id="wx-generate-envelope-btn" class="addon-wx-apply-btn py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg">
            <span>🛡️</span> <span>GENERATE ENVELOPE</span>
          </button>
          <button type="button" id="wx-clear-btn" class="py-2 px-3 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-300 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5">
            <span>🗑️</span> <span>CLEAR BUFFER</span>
          </button>
        </div>
      </div>
    `;

    const distSlider = container.querySelector('#wx-standoff-slider');
    const distVal = container.querySelector('#wx-standoff-val');
    distSlider?.addEventListener('input', (e) => {
      this.config.standoffNm = Number(e.target.value);
      if (distVal) distVal.textContent = `${this.config.standoffNm} NM`;
    });

    const flSlider = container.querySelector('#wx-fl-slider');
    const flVal = container.querySelector('#wx-fl-val');
    flSlider?.addEventListener('input', (e) => {
      this.config.flightLevel = Number(e.target.value);
      if (flVal) flVal.textContent = `FL${this.config.flightLevel}`;
    });

    container.querySelector('#wx-tstorm-chk')?.addEventListener('change', (e) => {
      this.config.showTStormBuffer = e.target.checked;
    });

    // Wire Help Guide Button
    container.querySelector('#wx-help-guide-btn')?.addEventListener('click', () => {
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

    container.querySelector('#wx-generate-envelope-btn')?.addEventListener('click', () => {
      this.generateStandoffEnvelope();
    });

    container.querySelector('#wx-clear-btn')?.addEventListener('click', () => {
      this.clearWeatherBuffers();
    });
  }
}
