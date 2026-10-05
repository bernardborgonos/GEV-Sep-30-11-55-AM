/**
 * @module src/plugins/mgrs/mgrsPlugin.js
 * @description MGRS & Tactical Coordinate Grid Plugin for Map Tools.
 * Generates Military Grid Reference System (MGRS), UTM grid lines, and precision coordinate readouts on 3D globe.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';
import { toMgrsString, formatMgrsSpaced } from '../../tools/mgrsHelper.js';

export class MgrsPlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'mgrs-tactical-grid',
      name: 'MGRS & Tactical Coordinate Grid',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.INTELLIGENCE,
      icon: '🌐',
      description: 'Military Grid Reference System 100km square identifiers, 10km grid lines, and precision UTM coordinates.',
      capabilities: ['mgrs-grid', 'utm-projection', 'grid-labels', 'coordinate-conversion', 'canvas-pick'],
      defaultConfig: {
        activeDensity: '10km',
        opacity: 50,
        showLabels: true,
        overlayActive: false,
      },
    });

    this._createdEntities = [];
    this._statusText = 'Ready: Select density and toggle grid overlay or copy cursor MGRS';
  }

  toggleGridOverlay() {
    if (this.config.overlayActive) {
      this.clearGrid();
      this.config.overlayActive = false;
      this._statusText = 'MGRS Grid overlay disabled';
    } else {
      this.drawTacticalGrid();
      this.config.overlayActive = true;
      this._statusText = `MGRS Grid active (${this.config.activeDensity} resolution)`;
    }
    this._renderStatusInContainer();
    this.render(this.container);
  }

  drawTacticalGrid() {
    this.clearGrid();
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || !viewer.scene || typeof Cesium === 'undefined') {
      this._statusText = `MGRS Grid active (${this.config.activeDensity})`;
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

    // Density steps in degrees
    const stepDeg = this.config.activeDensity === '100km' ? 1.0 : this.config.activeDensity === '10km' ? 0.1 : 0.02;
    const spanDeg = stepDeg * 6;
    const alpha = (this.config.opacity || 50) / 100;
    const gridColor = Cesium.Color.fromCssColorString('#10b981').withAlpha(alpha);

    const minLat = Math.floor((centerLat - spanDeg) / stepDeg) * stepDeg;
    const maxLat = Math.ceil((centerLat + spanDeg) / stepDeg) * stepDeg;
    const minLng = Math.floor((centerLng - spanDeg) / stepDeg) * stepDeg;
    const maxLng = Math.ceil((centerLng + spanDeg) / stepDeg) * stepDeg;

    // Draw Longitude Lines (North-South)
    for (let lng = minLng; lng <= maxLng; lng += stepDeg) {
      const line = viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(lng, minLat, 1),
            Cesium.Cartesian3.fromDegrees(lng, maxLat, 1),
          ],
          width: 1.5,
          material: gridColor,
          clampToGround: true,
        },
      });
      this._createdEntities.push(line);
    }

    // Draw Latitude Lines (East-West)
    for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
      const line = viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(minLng, lat, 1),
            Cesium.Cartesian3.fromDegrees(maxLng, lat, 1),
          ],
          width: 1.5,
          material: gridColor,
          clampToGround: true,
        },
      });
      this._createdEntities.push(line);

      // Add MGRS Coordinate Grid Labels if enabled
      if (this.config.showLabels) {
        for (let lng = minLng; lng <= maxLng; lng += stepDeg * 2) {
          try {
            const rawMgrs = toMgrsString(lng, lat, 2);
            const spacedMgrs = formatMgrsSpaced(rawMgrs);
            const labelEnt = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
              label: {
                text: spacedMgrs,
                font: '10px monospace',
                fillColor: Cesium.Color.fromCssColorString('#34d399'),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(4, -4),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            });
            this._createdEntities.push(labelEnt);
          } catch (_) {}
        }
      }
    }
  }

  clearGrid() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer && viewer.entities && Array.isArray(this._createdEntities)) {
      for (const ent of this._createdEntities) {
        try {
          viewer.entities.remove(ent);
        } catch (_) {}
      }
    }
    this._createdEntities = [];
  }

  copyCenterMgrs() {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    let centerLng = -97.7431;
    let centerLat = 30.2672;

    if (viewer?.scene?.canvas) {
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

    try {
      const raw = toMgrsString(centerLng, centerLat, 5);
      const formatted = formatMgrsSpaced(raw);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(formatted);
      }
      this._statusText = `Copied MGRS: ${formatted}`;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gev:toast', { detail: { text: `MGRS Copied: ${formatted}` } }));
      }
    } catch (_) {
      this._statusText = `MGRS: ${centerLat.toFixed(4)}°, ${centerLng.toFixed(4)}°`;
    }
    this._renderStatusInContainer();
  }

  _renderStatusInContainer() {
    const el = this.container?.querySelector('#mgrs-status-text');
    if (el) el.textContent = this._statusText;
  }

  render(container) {
    super.render(container);
    if (!container) return;

    container.innerHTML = `
      <div class="plugin-module-wrapper space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
            <span>🌐</span> MGRS TACTICAL GRID CONTROLS
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" id="mgrs-help-guide-btn" class="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-emerald-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
              <span>📖</span> <span>GUIDE</span>
            </button>
            <span class="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-mono text-[10px]">
              WGS84 / UTM
            </span>
          </div>
        </div>

        <div class="space-y-2">
          <div>
            <label class="block text-slate-300 mb-1 font-medium">Grid Resolution Density</label>
            <div class="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
              ${['100km', '10km', '1km'].map(
                (d) => `
                <button type="button" class="mgrs-density-btn py-1.5 px-2 rounded border transition ${
                  this.config.activeDensity === d
                    ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }" data-density="${d}">${d}</button>
              `
              ).join('')}
            </div>
          </div>

          <div>
            <div class="flex justify-between text-slate-300 mb-1">
              <span>Grid Opacity</span>
              <span id="mgrs-opacity-val" class="font-mono text-emerald-300">${this.config.opacity}%</span>
            </div>
            <input type="range" id="mgrs-opacity-slider" min="10" max="100" step="5" value="${this.config.opacity}" class="w-full accent-emerald-400 cursor-pointer" />
          </div>

          <label class="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
            <input type="checkbox" id="mgrs-labels-chk" ${this.config.showLabels ? 'checked' : ''} class="accent-emerald-400 rounded" />
            <span>Display 100k Square ID Labels</span>
          </label>
        </div>

        <!-- Status Card -->
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-emerald-200">
          <span id="mgrs-status-text">${this._statusText}</span>
        </div>

        <div class="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2">
          <button type="button" id="mgrs-toggle-overlay-btn" class="addon-mgrs-toggle-btn py-2 px-3 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5 shadow-lg ${
            this.config.overlayActive
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }">
            <span class="material-symbols-outlined text-xs">${this.config.overlayActive ? 'grid_off' : 'grid_on'}</span>
            <span>${this.config.overlayActive ? 'HIDE GRID OVERLAY' : 'TOGGLE GRID OVERLAY'}</span>
          </button>
          <button type="button" id="mgrs-copy-btn" class="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded font-medium text-[11px] transition flex items-center justify-center gap-1.5">
            <span>📋</span> <span>COPY MGRS</span>
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('.mgrs-density-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.config.activeDensity = btn.getAttribute('data-density');
        if (this.config.overlayActive) {
          this.drawTacticalGrid();
        }
        this.render(container);
      });
    });

    const opSlider = container.querySelector('#mgrs-opacity-slider');
    const opVal = container.querySelector('#mgrs-opacity-val');
    opSlider?.addEventListener('input', (e) => {
      this.config.opacity = Number(e.target.value);
      if (opVal) opVal.textContent = `${this.config.opacity}%`;
      if (this.config.overlayActive) {
        this.drawTacticalGrid();
      }
    });

    container.querySelector('#mgrs-labels-chk')?.addEventListener('change', (e) => {
      this.config.showLabels = e.target.checked;
      if (this.config.overlayActive) {
        this.drawTacticalGrid();
      }
    });

    // Wire Help Guide Button
    container.querySelector('#mgrs-help-guide-btn')?.addEventListener('click', () => {
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

    container.querySelector('#mgrs-toggle-overlay-btn')?.addEventListener('click', () => {
      this.toggleGridOverlay();
    });

    container.querySelector('#mgrs-copy-btn')?.addEventListener('click', () => {
      this.copyCenterMgrs();
    });
  }
}
