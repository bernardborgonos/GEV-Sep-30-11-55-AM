/**
 * TACTICAL MAP TOOLS WORKBENCH UI
 * Defense HUD CAD drafting controls, tactical inventory roster, inline property editor,
 * single-click camera alignment, and GeoJSON/KML sector controls.
 *
 * @module src/ui/tacticalWorkbenchUi.js
 */

import {
  MapToolsEngine,
  FEATURE_TYPES,
  getSharedMapToolsEngine,
  MAP_TOOLS_EVENTS,
} from '../tools/mapToolsEngine.js';
import {
  featureToGeoJson,
  featuresToGeoJsonCollection,
  featuresToKmlDocument,
  downloadBlob,
  parseImportedGeoJson,
  parseImportedKml,
  importTacticalLayerContent,
  verifyGeoJsonRoundTrip,
} from '../tools/tacticalGeoExport.js';
import {
  saveTacticalLayerToDrive,
  listTacticalLayersFromDrive,
  loadTacticalLayerFromDrive,
  deleteDriveFile,
} from '../data/googleDriveClient.js';
import {
  googleSignIn,
  googleSignOut,
  getAccessToken,
  getCurrentUser,
  subscribeAuth,
} from '../auth/googleDriveAuth.js';
import {
  haversineDistanceKm,
  haversineDistanceNm,
  calculatePathDistance,
  calculatePolygonMetrics,
} from '../tools/geodesicMath.js';
import {
  GeofenceBreachEngine,
  GEOFENCE_RULES,
  VIOLATION_TYPES,
  BREACH_EVENTS,
  getSharedGeofenceEngine,
  generateSpeechAlertText,
  speakVerbalBreachAlert,
} from '../tools/geofenceEngine.js';
import { setShaperMode, SHAPER_MODES } from './shaperCadToolbar.js';
import { openConfirmModal } from './confirmModal.js';

/**
 * Tactical color palette presets for military HUD styling.
 */
export const TACTICAL_COLORS = Object.freeze([
  { id: 'cyan', label: 'Tactical Cyan', hex: '#00e5ff' },
  { id: 'green', label: 'Recon Green', hex: '#10b981' },
  { id: 'amber', label: 'Warning Amber', hex: '#f59e0b' },
  { id: 'red', label: 'Hostile Red', hex: '#ef4444' },
  { id: 'purple', label: 'Orbital Violet', hex: '#a855f7' },
  { id: 'white', label: 'Grid White', hex: '#f8fafc' },
]);

/**
 * Formats an ISO date into a clean local defense timestamp.
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return `${d.toISOString().slice(11, 19)}Z`;
  } catch {
    return String(isoString);
  }
}

/**
 * Retrieves the current globe focal coordinates from Cesium viewer,
 * fallback to camera position or standard default.
 *
 * @param {Object|null} viewer - Cesium viewer instance
 * @returns {{lon: number, lat: number}}
 */
export function getGlobeCenterCoordinates(viewer) {
  if (viewer && viewer.scene && viewer.camera && typeof globalThis !== 'undefined' && globalThis.Cesium) {
    const Cesium = globalThis.Cesium;
    const canvas = viewer.scene.canvas;
    if (canvas && canvas.clientWidth && canvas.clientHeight) {
      const centerScreen = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      let cartesian = null;
      try {
        const ray = viewer.camera.getPickRay(centerScreen);
        if (ray && viewer.scene.globe) {
          cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        }
        if (!cartesian) {
          cartesian = viewer.camera.pickEllipsoid(centerScreen, viewer.scene.globe?.ellipsoid);
        }
      } catch (err) {
        // Degrade gracefully if raycast throws
      }

      if (cartesian) {
        try {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          if (Number.isFinite(lon) && Number.isFinite(lat)) {
            return {
              lon: Number(lon.toFixed(5)),
              lat: Number(lat.toFixed(5)),
            };
          }
        } catch {
          // fall through
        }
      }
    }

    // Fallback: use camera's cartographic position if pick failed
    if (viewer.camera.positionCartographic) {
      const c = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(c.longitude);
      const lat = Cesium.Math.toDegrees(c.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return {
          lon: Number(lon.toFixed(5)),
          lat: Number(lat.toFixed(5)),
        };
      }
    }
  }

  // Default coordinate: Manila tactical focal area
  return { lon: 120.9842, lat: 14.5995 };
}

/**
 * Fits the Cesium viewer viewport to encompass all active features in the engine.
 *
 * @param {Object|null} viewer
 * @param {MapToolsEngine} engine
 */
export function fitViewportToAllFeatures(viewer, engine) {
  const features = engine.getAllFeatures();
  if (!features || features.length === 0) {
    // If no features exist, fly to default globe view
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gev:toast', {
        detail: { text: 'No active tactical features to fit.' },
      }));
    }
    return;
  }

  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  let hasBounds = false;

  for (const feat of features) {
    const box = feat.computed?.boundingBox;
    if (box) {
      minLon = Math.min(minLon, box.minLon);
      maxLon = Math.max(maxLon, box.maxLon);
      minLat = Math.min(minLat, box.minLat);
      maxLat = Math.max(maxLat, box.maxLat);
      hasBounds = true;
    }
  }

  if (!hasBounds) return;

  // Add 15% safety margin padding
  const dLon = Math.max(0.05, (maxLon - minLon) * 0.15);
  const dLat = Math.max(0.05, (maxLat - minLat) * 0.15);

  const extent = {
    minLon: Math.max(-180, minLon - dLon),
    maxLon: Math.min(180, maxLon + dLon),
    minLat: Math.max(-85, minLat - dLat),
    maxLat: Math.min(85, maxLat + dLat),
  };

  engine.flyToExtent(extent);

  if (viewer && viewer.camera && typeof globalThis !== 'undefined' && globalThis.Cesium) {
    const Cesium = globalThis.Cesium;
    try {
      const rect = Cesium.Rectangle.fromDegrees(
        extent.minLon,
        extent.minLat,
        extent.maxLon,
        extent.maxLat,
      );
      viewer.camera.flyTo({
        destination: rect,
        duration: 1.8,
      });
    } catch (err) {
      console.warn('[TacticalWorkbench] Viewport flight warning:', err.message);
    }
  }
}

/**
 * TacticalWorkbenchUi Component
 * Renders and manages the tactical drafting workbench, inventory roster,
 * CAD controls, and export facilities.
 */
export class TacticalWorkbenchUi {
  /**
   * @param {HTMLElement} hostElement - DOM element where workbench is mounted
   * @param {Object} [options={}]
   * @param {MapToolsEngine} [options.engine]
   * @param {Object} [options.viewer=null]
   * @param {Function} [options.onFeatureCreated]
   * @param {Function} [options.onFeatureDeleted]
   * @param {Function} [options.showToast]
   */
  constructor(hostElement, options = {}) {
    this.host = hostElement;
    this.viewer = options.viewer || null;
    this.engine = options.engine || getSharedMapToolsEngine(this.viewer);
    this.showToast = options.showToast || ((msg) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gev:toast', { detail: { text: msg } }));
      }
    });

    // Drafting state
    this.draftType = FEATURE_TYPES.POINT; // 'point', 'range_ring', 'polygon', 'line', 'geofence'
    this.selectedColor = '#00e5ff';
    this.editingFeatureId = null;
    this.searchFilter = '';
    this.typeFilter = 'all';

    // Waypoints state for Distances & Areas
    this.multiPoints = [
      { lon: 120.9842, lat: 14.5995 },
      { lon: 121.0500, lat: 14.6500 },
    ];

    // Geofence breach detection & live telemetry evaluation engine
    this.dataManager = options.dataManager || (typeof window !== 'undefined' ? window.__godsEyeView?.dataManager : null);
    this.geofenceEngine = options.geofenceEngine || getSharedGeofenceEngine({ mapToolsEngine: this.engine });
    this._isSimulating = false;

    // Start background live telemetry surveillance if dataManager exists
    if (this.dataManager && typeof this.geofenceEngine.startAutomatedTelemetryMonitor === 'function') {
      this.geofenceEngine.startAutomatedTelemetryMonitor({
        dataManager: this.dataManager,
        intervalMs: 2000,
        onScan: (res) => {
          const stats = this.host?.querySelector?.('#tw-feed-stats');
          if (stats && !this._isSimulating) {
            stats.textContent = `Telemetry: ${res.scannedCount} contacts scanned in ${res.durationMs.toFixed(1)}ms (${res.activeBreachesCount} active breaches)`;
          }
        },
      });
    }

    this._boundEngineEvents = false;
    this.render();
    this._bindEngineListeners();
  }

  /**
   * Sets or updates the Cesium viewer reference.
   * @param {Object|null} viewer
   */
  setViewer(viewer) {
    this.viewer = viewer;
    if (this.engine) this.engine.setViewer(viewer);
  }

  /**
   * Binds to engine custom events to refresh roster automatically.
   * @private
   */
  _bindEngineListeners() {
    if (this._boundEngineEvents) return;
    this._boundEngineEvents = true;

    const handleRefresh = () => {
      this.renderRoster();
      this.updateCounters();
    };

    this.engine.on(MAP_TOOLS_EVENTS.CREATE, handleRefresh);
    this.engine.on(MAP_TOOLS_EVENTS.UPDATE, handleRefresh);
    this.engine.on(MAP_TOOLS_EVENTS.DELETE, handleRefresh);

    const handleBreachEvent = () => {
      this.renderBreachFeed();
      this.updateCounters();
    };

    if (this.geofenceEngine) {
      this.geofenceEngine.addEventListener('breach-triggered', handleBreachEvent);
      this.geofenceEngine.addEventListener('breach-cleared', handleBreachEvent);
      this.geofenceEngine.addEventListener('breach-updated', handleBreachEvent);
    }

    this._bindWindowTelemetryEvents();
  }

  /**
   * Updates count badges across top-bar, modal tabs, and drawer chips.
   */
  updateCounters() {
    const count = this.engine.getAllFeatures().length;
    const breachCount = this.geofenceEngine ? this.geofenceEngine.getActiveBreachCount() : 0;

    if (typeof document !== 'undefined') {
      // Modal Tab Badge
      const tabBadge = document.getElementById('url-intel-maptools-tab-badge');
      if (tabBadge) {
        if (breachCount > 0) {
          tabBadge.textContent = `⚠️ ${breachCount}`;
          tabBadge.classList.add('breach-badge-alert');
        } else {
          tabBadge.textContent = String(count);
          tabBadge.classList.remove('breach-badge-alert');
        }
      }

      // Layer Drawer Badge
      const drawerBadge = document.getElementById('map-tools-drawer-badge');
      if (drawerBadge) {
        if (breachCount > 0) {
          drawerBadge.textContent = `⚠️ ${breachCount} BREACHES`;
          drawerBadge.classList.add('breach-badge-alert');
        } else {
          drawerBadge.textContent = `${count} ACTIVE`;
          drawerBadge.classList.remove('breach-badge-alert');
        }
      }

      // Data Layers Submodule Badge (legacy)
      const submoduleBadge = document.getElementById('mapping-tools-submodule-badge');
      if (submoduleBadge) {
        if (breachCount > 0) {
          submoduleBadge.textContent = `⚠️ ${breachCount} BREACHES`;
          submoduleBadge.classList.add('breach-badge-alert');
        } else {
          submoduleBadge.textContent = `${count} ACTIVE`;
          submoduleBadge.classList.remove('breach-badge-alert');
        }
      }

      // Floating Service Dialog Badge
      const floatingBadge = document.getElementById('tactical-floating-badge');
      if (floatingBadge) {
        if (breachCount > 0) {
          floatingBadge.textContent = `⚠️ ${breachCount} BREACHES`;
          floatingBadge.classList.add('breach-badge-alert');
        } else {
          floatingBadge.textContent = `${count} ACTIVE`;
          floatingBadge.classList.remove('breach-badge-alert');
        }
      }

      // Top Bar Launcher Button
      const topBarBtn = document.getElementById('tactical-map-tools-btn');
      if (topBarBtn) {
        if (breachCount > 0) {
          topBarBtn.classList.add('breach-alarm-active');
          topBarBtn.title = `⚠️ ${breachCount} Active Geofence Breach Alarms!`;
        } else {
          topBarBtn.classList.remove('breach-alarm-active');
          topBarBtn.title = 'Tactical Map Tools & Geofence CAD';
        }
      }
    }

    // Workbench Header Count
    const rosterCount = this.host?.querySelector?.('#tw-roster-count');
    if (rosterCount) rosterCount.textContent = `(${count})`;

    // Workbench Breach Counter Badge
    const breachBadge = this.host?.querySelector?.('#tw-breach-counter-badge');
    const breachDot = this.host?.querySelector?.('#tw-breach-live-dot');
    const breachStatusText = this.host?.querySelector?.('#tw-breach-status-text');
    if (breachBadge) {
      if (breachCount > 0) {
        breachBadge.textContent = `${breachCount} ACTIVE ${breachCount === 1 ? 'BREACH' : 'BREACHES'}`;
        breachBadge.className = 'tw-breach-counter-badge alarming';
        if (breachDot) breachDot.className = 'tw-breach-live-dot alarming';
        if (breachStatusText) breachStatusText.textContent = 'BREACH ALARM ACTIVE';
      } else {
        breachBadge.textContent = '0 BREACHES';
        breachBadge.className = 'tw-breach-counter-badge secure';
        if (breachDot) breachDot.className = 'tw-breach-live-dot secure';
        if (breachStatusText) breachStatusText.textContent = 'SURVEILLANCE ACTIVE';
      }
    }
  }

  /**
   * Main render method for the workbench.
   */
  render() {
    if (!this.host) return;

    this.host.innerHTML = `
      <style id="tw-drive-sync-styles">
        .tw-btn-accent {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(56, 189, 248, 0.15)) !important;
          border-color: #38bdf8 !important;
          color: #e0f2fe !important;
        }
        .tw-btn-accent:hover {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.45), rgba(56, 189, 248, 0.35)) !important;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
        }
        .tw-drive-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(4, 8, 16, 0.82);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .tw-drive-modal-card {
          background: linear-gradient(135deg, #0b1329fa, #070d1efa);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 8px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
          width: 100%;
          max-width: 780px;
          color: #f1f5f9;
          font-family: var(--font-mono, monospace);
          overflow: hidden;
          animation: tw-modal-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes tw-modal-scale-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .tw-drive-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: rgba(15, 23, 42, 0.9);
          border-bottom: 1px solid rgba(56, 189, 248, 0.25);
        }
        .tw-drive-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tw-drive-icon {
          font-size: 1.5rem;
        }
        .tw-drive-heading {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #38bdf8;
        }
        .tw-drive-subhead {
          margin: 2px 0 0 0;
          font-size: 0.65rem;
          color: #94a3b8;
        }
        .tw-btn-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }
        .tw-btn-close:hover {
          color: #f1f5f9;
          background: rgba(239, 68, 68, 0.2);
        }
        .tw-drive-modal-body {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 72vh;
          overflow-y: auto;
        }
        .tw-drive-auth-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 6px;
        }
        .tw-drive-auth-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.72rem;
          color: #cbd5e1;
        }
        .tw-drive-auth-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #64748b;
        }
        .tw-drive-auth-status-dot.connected {
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }
        .tw-drive-section {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(56, 189, 248, 0.15);
          border-radius: 6px;
          padding: 12px 14px;
        }
        .tw-drive-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          font-size: 0.72rem;
          font-weight: 700;
          color: #e2e8f0;
        }
        .tw-drive-section-title h5 {
          margin: 0;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .tw-drive-folder-badge {
          margin-left: auto;
          font-size: 0.6rem;
          padding: 2px 6px;
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 4px;
          color: #38bdf8;
        }
        .tw-drive-save-grid {
          display: grid;
          grid-template-columns: 2fr 1.5fr auto;
          gap: 10px;
          align-items: flex-end;
        }
        .tw-drive-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tw-drive-field label {
          font-size: 0.62rem;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .tw-drive-layers-table-container {
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid rgba(56, 189, 248, 0.15);
          border-radius: 4px;
        }
        .tw-drive-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.68rem;
        }
        .tw-drive-table th {
          background: rgba(15, 23, 42, 0.9);
          padding: 6px 10px;
          text-align: left;
          color: #94a3b8;
          font-weight: 700;
          font-size: 0.62rem;
          letter-spacing: 0.04em;
          border-bottom: 1px solid rgba(56, 189, 248, 0.2);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .tw-drive-table td {
          padding: 6px 10px;
          border-bottom: 1px solid rgba(56, 189, 248, 0.08);
          color: #cbd5e1;
        }
        .tw-drive-table tr:hover td {
          background: rgba(56, 189, 248, 0.06);
        }
        .tw-drive-format-tag {
          font-size: 0.58rem;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 3px;
          text-transform: uppercase;
        }
        .tw-format-geojson {
          background: rgba(16, 185, 129, 0.2);
          border: 1px solid #10b981;
          color: #6ee7b7;
        }
        .tw-format-kml {
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid #f59e0b;
          color: #fde68a;
        }
        .tw-empty-cell {
          text-align: center;
          padding: 18px 10px;
          color: #64748b;
          font-style: italic;
        }
      </style>
      <div class="tactical-workbench-container" id="tactical-workbench-root">
        <!-- GLOBAL SECTOR CONTROLS BAR -->
        <div class="tw-sector-controls-bar">
          <div class="tw-sector-title-group">
            <span class="tw-badge-icon">🛠️</span>
            <div>
              <h3 class="tw-sector-heading">TACTICAL WORKBENCH &amp; CAD</h3>
              <p class="tw-sector-sub">Geodesic Drafting · Concentric Rings · Polygons · Geofence Velocity Monitoring</p>
            </div>
          </div>
          <div class="tw-sector-actions">
            <button type="button" class="tw-btn tw-btn-primary" id="tw-btn-fit-viewport" title="Fit camera to all active features">
              <span>🎯 Fit Viewport</span>
            </button>
            <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-export-geojson" title="Export all features as RFC 7946 GeoJSON">
              <span>📤 Export GeoJSON</span>
            </button>
            <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-export-kml" title="Export all features as OGC KML">
              <span>🗺️ Export KML</span>
            </button>
            <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-import-trigger" title="Import external GeoJSON or KML feature file">
              <span>📥 Import File</span>
            </button>
            <input type="file" id="tw-file-import-input" accept=".geojson,.json,.kml" style="display: none;" />
            <button type="button" class="tw-btn tw-btn-accent" id="tw-btn-drive-sync" title="Google Drive Cloud GIS Layer Pipeline">
              <span>☁️ Drive Cloud Sync</span>
            </button>
            <button type="button" class="tw-btn tw-btn-danger" id="tw-btn-clear-all" title="Purge all unlocked features from sector">
              <span>🗑️ Clear All</span>
            </button>
          </div>
        </div>

        <!-- GOOGLE DRIVE CLOUD GIS LAYER PIPELINE MODAL -->
        <div class="tw-drive-modal-backdrop" id="tw-drive-modal" style="display: none;">
          <div class="tw-drive-modal-card">
            <div class="tw-drive-modal-header">
              <div class="tw-drive-header-title">
                <span class="tw-drive-icon">☁️</span>
                <div>
                  <h4 class="tw-drive-heading">GOOGLE DRIVE CLOUD GIS PIPELINE</h4>
                  <p class="tw-drive-subhead">Direct Tactical Layer Cloud Sync · Dedicated GodsEyeView/Layers Storage</p>
                </div>
              </div>
              <button type="button" class="tw-btn-close" id="tw-btn-drive-modal-close" title="Close Cloud Sync">&times;</button>
            </div>

            <div class="tw-drive-modal-body">
              <!-- Auth Banner -->
              <div class="tw-drive-auth-strip" id="tw-drive-auth-strip">
                <div class="tw-drive-auth-info">
                  <span class="tw-drive-auth-status-dot" id="tw-drive-auth-dot"></span>
                  <span id="tw-drive-auth-status-text">Checking Google Drive Connection...</span>
                </div>
                <div class="tw-drive-auth-action">
                  <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-drive-auth-toggle">
                    <span id="tw-drive-auth-btn-text">Sign In with Google</span>
                  </button>
                </div>
              </div>

              <!-- Save Layer to Cloud Section -->
              <div class="tw-drive-section">
                <div class="tw-drive-section-title">
                  <h5>💾 SAVE ACTIVE TACTICAL SECTOR TO GOOGLE DRIVE</h5>
                  <span class="tw-drive-folder-badge">GodsEyeView/Layers</span>
                </div>
                <div class="tw-drive-save-grid">
                  <div class="tw-drive-field">
                    <label for="tw-drive-layer-name">Layer Filename</label>
                    <input type="text" id="tw-drive-layer-name" class="tw-input" value="tactical_sector_${Date.now()}.geojson" />
                  </div>
                  <div class="tw-drive-field">
                    <label for="tw-drive-layer-format">Format</label>
                    <select id="tw-drive-layer-format" class="tw-select">
                      <option value="geojson">GeoJSON (.geojson) - Standard RFC 7946</option>
                      <option value="kml">Google Earth KML (.kml) - OGC 2.2 Placemarks</option>
                    </select>
                  </div>
                  <div class="tw-drive-action-wrap">
                    <button type="button" class="tw-btn tw-btn-primary" id="tw-btn-drive-save-submit">
                      <span>☁️ Upload to Drive</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Cloud Tactical Layers Browser -->
              <div class="tw-drive-section">
                <div class="tw-drive-section-title">
                  <h5>📂 STORED TACTICAL LAYERS (Google Drive: GodsEyeView/Layers)</h5>
                  <button type="button" class="tw-btn tw-btn-mini" id="tw-btn-drive-refresh-layers" title="Refresh files from Google Drive">
                    <span>🔄 Refresh</span>
                  </button>
                </div>
                <div class="tw-drive-layers-table-container">
                  <table class="tw-drive-table" id="tw-drive-table">
                    <thead>
                      <tr>
                        <th>Layer Name</th>
                        <th>Format</th>
                        <th>Modified</th>
                        <th>Size</th>
                        <th style="text-align: right;">Action</th>
                      </tr>
                    </thead>
                    <tbody id="tw-drive-layers-tbody">
                      <tr>
                        <td colspan="5" class="tw-empty-cell">Click "Refresh" or connect Google Drive to view cloud layers.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- REAL-TIME TELEMETRY GEOFENCE BREACH HUD & SURVEILLANCE FEED -->
        <section class="tw-breach-hud-panel" id="tw-breach-hud-panel" aria-label="Real-Time Telemetry Geofence Scanner">
          <div class="tw-breach-hud-header">
            <div class="tw-breach-hud-status">
              <span class="tw-breach-badge-icon" id="tw-breach-hud-icon">🛡️</span>
              <div>
                <div class="tw-breach-status-title">
                  <span class="tw-breach-live-dot secure" id="tw-breach-live-dot"></span>
                  <span class="tw-breach-status-text" id="tw-breach-status-text">SURVEILLANCE ACTIVE</span>
                  <span class="tw-breach-counter-badge secure" id="tw-breach-counter-badge">0 BREACHES</span>
                </div>
                <p class="tw-breach-hud-desc">
                  Continuous Telemetry Monitoring · Ingress/Egress Alarms · Speed Ceiling Violation Detection
                </p>
              </div>
            </div>
            <div class="tw-breach-hud-actions">
              <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-voice-alerts-toggle" title="Toggle verbal voice alerts for high-priority breaches">
                <span id="tw-voice-alerts-icon">🔊</span>
                <span id="tw-voice-alerts-text">Voice Alerts: ON</span>
              </button>
              <button type="button" class="tw-btn tw-btn-secondary active" id="tw-btn-live-telemetry-toggle" title="Toggle automated continuous scanning of live vessels and aircraft">
                <span id="tw-telemetry-toggle-icon">🛰️</span>
                <span id="tw-telemetry-toggle-text">Live Scan: Active</span>
              </button>
              <button type="button" class="tw-btn tw-btn-primary" id="tw-btn-simulation-toggle" title="Run moving patrol track to test real-time boundary breach triggering and clearing">
                <span class="tw-btn-pulse">⚡</span>
                <span id="tw-sim-btn-text">Test Simulated Patrol</span>
              </button>
              <button type="button" class="tw-btn tw-btn-secondary" id="tw-btn-clear-feed" title="Clear resolved alarms from notification feed">
                <span>🗑️ Clear Resolved</span>
              </button>
            </div>
          </div>

          <!-- Dynamic Breach Notification Feed -->
          <div class="tw-breach-feed-wrap">
            <div class="tw-breach-feed-subhead">
              <div class="tw-breach-feed-meta">
                <span class="tw-panel-tag">LIVE FEED</span>
                <span class="tw-feed-title">REAL-TIME BREACH NOTIFICATIONS</span>
              </div>
              <span class="tw-feed-stats" id="tw-feed-stats">Telemetry: Standby · 0 contacts scanned</span>
            </div>
            <div class="tw-breach-feed-list" id="tw-breach-feed-list" role="feed" aria-live="polite">
              <!-- Populated by renderBreachFeed() -->
            </div>
          </div>
        </section>

        <!-- MAIN 2-COLUMN SPLIT: DRAFTING WORKBENCH & ROSTER INVENTORY -->
        <div class="tw-main-grid">
          <!-- LEFT: INTERACTIVE DRAFTING WORKBENCH (CREATE) -->
          <section class="tw-panel tw-draft-panel" aria-labelledby="tw-draft-heading">
            <div class="tw-panel-header">
              <span class="tw-panel-tag">CREATE</span>
              <h4 id="tw-draft-heading">DRAFTING WORKBENCH</h4>
            </div>

            <!-- 1. MEASURE & GEODESIC MEASUREMENT (2x2 Grid Matching User Reference Image) -->
            <div class="tw-measure-quick-bar" style="margin-bottom: 0.85rem; padding: 0.65rem; background: rgba(14, 20, 36, 0.85); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 0.65rem; display: flex; flex-direction: column; gap: 0.5rem;">
              <div style="font-size: 0.65rem; font-weight: 700; color: #00e5ff; letter-spacing: 0.06em; font-family: monospace; display: flex; align-items: center; justify-content: space-between;">
                <span>1. MEASURE &amp; GEODESIC MEASUREMENT</span>
                <span id="tw-measure-active-indicator" style="display: none; font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 9999px; background: rgba(0, 229, 255, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">LIVE ON GLOBE</span>
              </div>
              <div class="tw-measure-2x2-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <button type="button" id="tw-measure-dist-btn" class="tw-measure-btn" data-measure-type="distance" style="padding: 0.55rem 0.65rem; font-weight: 600; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; background: #161922; color: #e2e8f0; border: 1px solid #334155; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease;" title="Measure geodesic distance along line or path">
                  <span style="font-size: 1rem; line-height: 1;">📏</span>
                  <span>Distance</span>
                </button>
                <button type="button" id="tw-measure-area-btn" class="tw-measure-btn active" data-measure-type="area" style="padding: 0.55rem 0.65rem; font-weight: 600; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; background: #1a2234; color: #ffffff; border: 1.5px solid #00e5ff; box-shadow: 0 0 10px rgba(0, 229, 255, 0.4); border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease;" title="Measure enclosed geodesic polygon area">
                  <span style="font-size: 1rem; line-height: 1;">📐</span>
                  <span>Area</span>
                </button>
                <button type="button" id="tw-measure-bearing-btn" class="tw-measure-btn" data-measure-type="bearing" style="padding: 0.55rem 0.65rem; font-weight: 600; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; background: #161922; color: #e2e8f0; border: 1px solid #334155; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease;" title="Calculate true compass bearing, heading, and back azimuth">
                  <span style="font-size: 1rem; line-height: 1;">🧭</span>
                  <span>Bearing</span>
                </button>
                <button type="button" id="tw-measure-elev-btn" class="tw-measure-btn" data-measure-type="elevation" style="padding: 0.55rem 0.65rem; font-weight: 600; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; background: #161922; color: #e2e8f0; border: 1px solid #334155; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease;" title="Inspect terrain elevation profile, altitude delta, and slope grade">
                  <span style="font-size: 1rem; line-height: 1;">⛰️</span>
                  <span>Elevation</span>
                </button>
              </div>
            </div>

            <!-- TYPE SELECTOR PILLS -->
            <div class="tw-type-selector" role="radiogroup" aria-label="Tactical Feature Type">
              <button type="button" class="tw-type-pill active" data-type="point" id="tw-type-btn-point" role="radio" aria-checked="true">
                <span class="tw-type-icon">📌</span>
                <span>Pin</span>
              </button>
              <button type="button" class="tw-type-pill" data-type="range_ring" id="tw-type-btn-range_ring" role="radio" aria-checked="false">
                <span class="tw-type-icon">🎯</span>
                <span>Range Rings</span>
              </button>
              <button type="button" class="tw-type-pill" data-type="polygon" id="tw-type-btn-polygon" role="radio" aria-checked="false">
                <span class="tw-type-icon">⬡</span>
                <span>Area</span>
              </button>
              <button type="button" class="tw-type-pill" data-type="line" id="tw-type-btn-line" role="radio" aria-checked="false">
                <span class="tw-type-icon">📏</span>
                <span>Distance</span>
              </button>
              <button type="button" class="tw-type-pill" data-type="geofence" id="tw-type-btn-geofence" role="radio" aria-checked="false">
                <span class="tw-type-icon">🛡️</span>
                <span>Geofence</span>
              </button>
            </div>

            <!-- DRAFTING FORM -->
            <form id="tw-draft-form" class="tw-draft-form" onsubmit="return false;">
              <!-- Feature Name -->
              <div class="tw-form-row">
                <label for="tw-input-name" class="tw-label">Feature Name</label>
                <input type="text" id="tw-input-name" class="tw-input" placeholder="e.g. Bravo Checkpoint / Sector Zulu" autocomplete="off" spellcheck="false" required />
              </div>

              <!-- Single Coordinate / Center Coordinates -->
              <div id="tw-coords-single-group" class="tw-coords-group">
                <div class="tw-coords-header">
                  <span class="tw-label">Focal Coordinates [Lon, Lat]</span>
                  <div class="tw-coords-actions" style="display: flex; gap: 6px;">
                    <button type="button" class="tw-btn-mini" id="tw-btn-pick-globe" title="Click directly on 3D globe to pick coordinate">
                      <span>📍 Pick on Globe</span>
                    </button>
                    <button type="button" class="tw-btn-mini" id="tw-btn-grab-center" title="Capture current globe focal coordinates">
                      <span>🎯 Center</span>
                    </button>
                  </div>
                </div>
                <div class="tw-coords-row">
                  <div class="tw-input-col">
                    <span class="tw-input-prefix">LON</span>
                    <input type="number" id="tw-input-lon" class="tw-input" step="0.0001" min="-180" max="180" value="120.9842" required />
                  </div>
                  <div class="tw-input-col">
                    <span class="tw-input-prefix">LAT</span>
                    <input type="number" id="tw-input-lat" class="tw-input" step="0.0001" min="-90" max="90" value="14.5995" required />
                  </div>
                </div>
              </div>

              <!-- Multi-Point Coordinates (for Distance routes and Polygon areas) -->
              <div id="tw-coords-multi-group" class="tw-coords-group" style="display: none;">
                <div class="tw-coords-header">
                  <span class="tw-label" id="tw-multi-label">Waypoints [Lon, Lat]</span>
                  <div class="tw-multi-actions" style="display: flex; gap: 6px;">
                    <button type="button" class="tw-btn-mini" id="tw-btn-pick-multi-globe" title="Click directly on 3D globe to place waypoint">
                      <span>📍 Pick on Globe</span>
                    </button>
                    <button type="button" class="tw-btn-mini" id="tw-btn-add-point" title="Add another waypoint">
                      <span>➕ Add Point</span>
                    </button>
                    <button type="button" class="tw-btn-mini" id="tw-btn-grab-point" title="Append current globe center as waypoint">
                      <span>🎯 Center</span>
                    </button>
                  </div>
                </div>
                <div id="tw-multi-points-list" class="tw-multi-points-list"></div>
                <!-- Dynamic calculation readout -->
                <div class="tw-dynamic-metric-chip" id="tw-dynamic-metric-chip">
                  <span id="tw-dynamic-metric-label">TOTAL DISTANCE:</span>
                  <strong id="tw-dynamic-metric-value">0.00 km (0.00 NM)</strong>
                </div>
              </div>

              <!-- DYNAMIC PARAMETER CONTROLS -->
              <!-- Range Ring Parameters -->
              <div id="tw-param-range-ring" class="tw-param-group" style="display: none;">
                <div class="tw-form-row">
                  <div class="tw-label-row">
                    <label for="tw-input-radius" class="tw-label">Radius (km)</label>
                    <span class="tw-slider-readout" id="tw-radius-readout">25.0 km (13.5 NM)</span>
                  </div>
                  <input type="range" id="tw-slider-radius" class="tw-slider" min="1" max="250" step="1" value="25" />
                  <div class="tw-input-col mt-1">
                    <input type="number" id="tw-input-radius-m" class="tw-input" min="100" max="1000000" step="500" value="25000" placeholder="Radius in meters" />
                  </div>
                </div>
                <div class="tw-form-row">
                  <label for="tw-input-ring-preset" class="tw-label">Concentric Rings</label>
                  <select id="tw-input-ring-preset" class="tw-select">
                    <option value="single">Single Ring (1x)</option>
                    <option value="dual">Dual Ring (10 km, 25 km)</option>
                    <option value="triple" selected>Tactical Triple (10 km, 25 km, 50 km)</option>
                    <option value="quad">Deep Sector (15 km, 30 km, 60 km, 100 km)</option>
                  </select>
                </div>
              </div>

              <!-- Geofence Parameters (Speed Ceiling & Alerts) -->
              <div id="tw-param-geofence" class="tw-param-group" style="display: none;">
                <div class="tw-form-row">
                  <label for="tw-input-geofence-radius" class="tw-label">Geofence Radius (meters)</label>
                  <input type="number" id="tw-input-geofence-radius" class="tw-input" min="500" max="500000" step="500" value="5000" />
                </div>
                <div class="tw-form-row">
                  <div class="tw-label-row">
                    <label for="tw-input-speed-ceiling" class="tw-label">Speed Ceiling (kts)</label>
                    <span class="tw-help-tag">Tactical Speed Limit</span>
                  </div>
                  <input type="number" id="tw-input-speed-ceiling" class="tw-input" min="0" max="2500" step="10" value="250" placeholder="e.g. 250 kts" />
                </div>
                <div class="tw-checkbox-row">
                  <input type="checkbox" id="tw-input-geofence-alert" checked />
                  <label for="tw-input-geofence-alert" class="tw-check-label">Trigger audio/visual breach alert on contact entry</label>
                </div>
              </div>

              <!-- Tactical Color Selection -->
              <div class="tw-form-row">
                <label class="tw-label">Tactical Color Preset</label>
                <div class="tw-color-pills" id="tw-color-pills">
                  ${TACTICAL_COLORS.map((c) => `
                    <button type="button" class="tw-color-chip ${c.hex === '#00e5ff' ? 'active' : ''}" data-color="${c.hex}" title="${c.label}" style="--chip-color: ${c.hex};">
                      <span class="tw-color-swatch"></span>
                      <span>${c.label.split(' ')[0]}</span>
                    </button>
                  `).join('')}
                </div>
                <div class="tw-custom-color-row">
                  <input type="color" id="tw-input-custom-color" value="#00e5ff" class="tw-color-picker" title="Custom color picker" />
                  <span class="tw-custom-color-hex" id="tw-color-hex-label">#00E5FF</span>
                </div>
              </div>

              <!-- Tactical Briefing Notes -->
              <div class="tw-form-row">
                <label for="tw-input-notes" class="tw-label">Tactical Notes &amp; Briefing</label>
                <textarea id="tw-input-notes" class="tw-textarea" rows="2" placeholder="ROE directives, radio channel, surveillance objectives..."></textarea>
              </div>

              <!-- ACTION: CREATE FEATURE -->
              <div class="tw-form-submit-row">
                <button type="button" class="tw-btn-submit" id="tw-btn-create-feature">
                  <span class="tw-btn-pulse">⚡</span>
                  <span>CREATE TACTICAL FEATURE</span>
                </button>
              </div>
            </form>
          </section>

          <!-- RIGHT: TACTICAL INVENTORY ROSTER (READ, EDIT, DELETE) -->
          <section class="tw-panel tw-roster-panel" aria-labelledby="tw-roster-heading">
            <div class="tw-panel-header tw-roster-header">
              <div class="tw-roster-title-wrap">
                <span class="tw-panel-tag">INVENTORY</span>
                <h4 id="tw-roster-heading">ACTIVE FEATURES <span id="tw-roster-count">(0)</span></h4>
              </div>
              <div class="tw-roster-filter-row">
                <input type="text" id="tw-search-input" class="tw-search-box" placeholder="Filter features by name or ID..." autocomplete="off" />
                <select id="tw-type-filter" class="tw-select-mini">
                  <option value="all">All Types</option>
                  <option value="point">Pins</option>
                  <option value="range_ring">Range Rings</option>
                  <option value="polygon">Areas</option>
                  <option value="line">Distances</option>
                  <option value="geofence">Geofences</option>
                </select>
              </div>
            </div>

            <!-- SCROLLABLE CARDS CONTAINER -->
            <div class="tw-cards-scroll-container" id="tw-cards-container" role="feed" aria-busy="false">
              <!-- Rendered via renderRoster() -->
            </div>
          </section>
        </div>
      </div>
    `;

    this._bindFormEvents();
    this.renderMultiPoints();
    this.renderRoster();
    this.renderBreachFeed();
    this.updateCounters();
  }

  /**
   * Binds form controls, type selector pills, color chips, and top sector actions.
   * @private
   */
  _bindFormEvents() {
    const root = this.host;
    if (!root) return;

    // Breach HUD Actions
    const btnVoiceAlerts = root.querySelector('#tw-btn-voice-alerts-toggle');
    if (btnVoiceAlerts && this.geofenceEngine) {
      btnVoiceAlerts.addEventListener('click', () => {
        this.geofenceEngine.voiceAlertsEnabled = !this.geofenceEngine.voiceAlertsEnabled;
        const icon = root.querySelector('#tw-voice-alerts-icon');
        const text = root.querySelector('#tw-voice-alerts-text');
        if (this.geofenceEngine.voiceAlertsEnabled) {
          if (icon) icon.textContent = '🔊';
          if (text) text.textContent = 'Voice Alerts: ON';
          btnVoiceAlerts.classList.remove('muted');
          this.showToast('🔊 Tactical voice breach alerts enabled');
        } else {
          if (icon) icon.textContent = '🔇';
          if (text) text.textContent = 'Voice Alerts: MUTED';
          btnVoiceAlerts.classList.add('muted');
          this.showToast('🔇 Tactical voice breach alerts muted');
        }
      });
    }

    const btnLiveTelemetry = root.querySelector('#tw-btn-live-telemetry-toggle');
    if (btnLiveTelemetry && this.geofenceEngine) {
      btnLiveTelemetry.addEventListener('click', () => {
        const isRunning = this.geofenceEngine.isAutomatedTelemetryMonitorRunning();
        const icon = root.querySelector('#tw-telemetry-toggle-icon');
        const text = root.querySelector('#tw-telemetry-toggle-text');
        if (isRunning) {
          this.geofenceEngine.stopAutomatedTelemetryMonitor();
          if (icon) icon.textContent = '⏸️';
          if (text) text.textContent = 'Live Scan: PAUSED';
          btnLiveTelemetry.classList.remove('active');
          this.showToast('⏸️ Live telemetry automated scan paused');
        } else {
          this.geofenceEngine.startAutomatedTelemetryMonitor({
            dataManager: this.dataManager,
            intervalMs: 2000,
            onScan: (res) => {
              const stats = this.host?.querySelector?.('#tw-feed-stats');
              if (stats && !this._isSimulating) {
                stats.textContent = `Telemetry: ${res.scannedCount} contacts scanned in ${res.durationMs.toFixed(1)}ms (${res.activeBreachesCount} active breaches)`;
              }
            },
          });
          if (icon) icon.textContent = '🛰️';
          if (text) text.textContent = 'Live Scan: Active';
          btnLiveTelemetry.classList.add('active');
          this.showToast('🛰️ Live telemetry automated scanning activated');
        }
      });
    }

    const btnSimToggle = root.querySelector('#tw-btn-simulation-toggle');
    if (btnSimToggle) {
      btnSimToggle.addEventListener('click', () => this.toggleSimulation());
    }

    const btnClearFeed = root.querySelector('#tw-btn-clear-feed');
    if (btnClearFeed) {
      btnClearFeed.addEventListener('click', () => {
        if (this.geofenceEngine) {
          const cleared = this.geofenceEngine.clearResolvedHistory();
          this.renderBreachFeed();
          this.updateCounters();
          this.showToast(`🗑️ Cleared ${cleared} resolved breach records`);
        }
      });
    }

    // 1. MEASURE & GEODESIC MEASUREMENT BUTTONS (2x2 Grid)
    const measureBtns = root.querySelectorAll('.tw-measure-btn');
    const setMeasureActive = (activeType) => {
      measureBtns.forEach((btn) => {
        const isCurrent = btn.dataset.measureType === activeType;
        if (isCurrent) {
          btn.style.background = '#1a2234';
          btn.style.color = '#ffffff';
          btn.style.border = '1.5px solid #00e5ff';
          btn.style.boxShadow = '0 0 10px rgba(0, 229, 255, 0.4)';
        } else {
          btn.style.background = '#161922';
          btn.style.color = '#e2e8f0';
          btn.style.border = '1px solid #334155';
          btn.style.boxShadow = 'none';
        }
      });
      const indicator = root.querySelector('#tw-measure-active-indicator');
      if (indicator) {
        indicator.style.display = 'inline-block';
        indicator.textContent = `LIVE: ${activeType.toUpperCase()}`;
      }
    };

    const btnMeasureDist = root.querySelector('#tw-measure-dist-btn');
    if (btnMeasureDist) {
      btnMeasureDist.addEventListener('click', () => {
        setMeasureActive('distance');
        setShaperMode(SHAPER_MODES.DRAW_POLYLINE, true);
        this.showToast('📏 Click on 3D globe to measure geodetic distance path');
      });
    }

    const btnMeasureArea = root.querySelector('#tw-measure-area-btn');
    if (btnMeasureArea) {
      btnMeasureArea.addEventListener('click', () => {
        setMeasureActive('area');
        setShaperMode(SHAPER_MODES.DRAW_POLYGON, true);
        this.showToast('📐 Click on 3D globe to measure enclosed geodetic area');
      });
    }

    const btnMeasureBearing = root.querySelector('#tw-measure-bearing-btn');
    if (btnMeasureBearing) {
      btnMeasureBearing.addEventListener('click', () => {
        setMeasureActive('bearing');
        window.dispatchEvent(new CustomEvent('gev:start-drafting', { detail: { type: 'bearing' } }));
        this.showToast('🧭 Click Origin Point A, then Target Point B to measure Compass Bearing & Azimuth');
      });
    }

    const btnMeasureElev = root.querySelector('#tw-measure-elev-btn');
    if (btnMeasureElev) {
      btnMeasureElev.addEventListener('click', () => {
        setMeasureActive('elevation');
        window.dispatchEvent(new CustomEvent('gev:start-drafting', { detail: { type: 'elevation' } }));
        this.showToast('⛰️ Click points on 3D terrain to measure Elevation Profile, Gain & Slope');
      });
    }

    // Type Selector Pills
    const typePills = root.querySelectorAll('.tw-type-pill');
    typePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        typePills.forEach((p) => {
          p.classList.remove('active');
          p.setAttribute('aria-checked', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-checked', 'true');
        this.draftType = pill.dataset.type;
        this._updateFormForDraftType();

        // Sync with floating quick toolbar chips if present
        if (typeof document !== 'undefined') {
          const quickChips = document.querySelectorAll('#floating-quick-toolbar .submodule-tool-chip');
          quickChips.forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.draftType === this.draftType);
          });
        }
      });
    });

    // Color Preset Chips
    const colorChips = root.querySelectorAll('.tw-color-chip');
    const colorPicker = root.querySelector('#tw-input-custom-color');
    const colorHexLabel = root.querySelector('#tw-color-hex-label');

    colorChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        colorChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedColor = chip.dataset.color;
        if (colorPicker) colorPicker.value = this.selectedColor;
        if (colorHexLabel) colorHexLabel.textContent = this.selectedColor.toUpperCase();
      });
    });

    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        this.selectedColor = e.target.value;
        colorChips.forEach((c) => c.classList.remove('active'));
        if (colorHexLabel) colorHexLabel.textContent = this.selectedColor.toUpperCase();
      });
    }

    // Pick Globe for Single Coordinate
    const btnPickGlobe = root.querySelector('#tw-btn-pick-globe');
    if (btnPickGlobe) {
      btnPickGlobe.addEventListener('click', () => {
        const isPicking = btnPickGlobe.classList.contains('active');
        if (isPicking) {
          this.stopGlobePicking();
          this.showToast('📍 Globe coordinate picking cancelled');
        } else {
          btnPickGlobe.classList.add('active');
          this.showToast('📍 Click anywhere on the 3D globe to place coordinate');
          this.startGlobePicking((coords) => {
            const inputLon = root.querySelector('#tw-input-lon');
            const inputLat = root.querySelector('#tw-input-lat');
            if (inputLon) inputLon.value = coords.lon;
            if (inputLat) inputLat.value = coords.lat;
            this.showToast(`📍 Set focal coordinate: [${coords.lon}, ${coords.lat}]`);
          });
        }
      });
    }

    // Grab Globe Center Button
    const btnGrabCenter = root.querySelector('#tw-btn-grab-center');
    if (btnGrabCenter) {
      btnGrabCenter.addEventListener('click', () => {
        const coords = getGlobeCenterCoordinates(this.viewer);
        const inputLon = root.querySelector('#tw-input-lon');
        const inputLat = root.querySelector('#tw-input-lat');
        if (inputLon) inputLon.value = coords.lon;
        if (inputLat) inputLat.value = coords.lat;
        this.showToast(`🎯 Globe Center grabbed: [${coords.lon}, ${coords.lat}]`);
      });
    }

    // Pick Globe for Multi-Points (Distance / Area)
    const btnPickMultiGlobe = root.querySelector('#tw-btn-pick-multi-globe');
    if (btnPickMultiGlobe) {
      btnPickMultiGlobe.addEventListener('click', () => {
        const isPicking = btnPickMultiGlobe.classList.contains('active');
        if (isPicking) {
          this.stopGlobePicking();
          this.showToast('📍 Waypoint picking stopped');
        } else {
          btnPickMultiGlobe.classList.add('active');
          this.showToast('📍 Click on 3D globe to place waypoints (click button again to finish)');
          this.startGlobePicking((coords) => {
            this.multiPoints.push(coords);
            this.renderMultiPoints();
            this.showToast(`📍 Added waypoint #${this.multiPoints.length}: [${coords.lon}, ${coords.lat}]`);
          }, { continuous: true });
        }
      });
    }

    // Radius Slider & Inputs
    const radiusSlider = root.querySelector('#tw-slider-radius');
    const radiusInputM = root.querySelector('#tw-input-radius-m');
    const radiusReadout = root.querySelector('#tw-radius-readout');

    if (radiusSlider && radiusInputM && radiusReadout) {
      radiusSlider.addEventListener('input', () => {
        const km = Number(radiusSlider.value);
        radiusInputM.value = km * 1000;
        const nm = km / 1.852;
        radiusReadout.textContent = `${km.toFixed(1)} km (${nm.toFixed(1)} NM)`;
      });

      radiusInputM.addEventListener('input', () => {
        const m = Number(radiusInputM.value) || 1000;
        const km = m / 1000;
        radiusSlider.value = Math.min(250, km);
        const nm = km / 1.852;
        radiusReadout.textContent = `${km.toFixed(1)} km (${nm.toFixed(1)} NM)`;
      });
    }

    // Multi-Point Actions (Distance and Area)
    const btnAddPoint = root.querySelector('#tw-btn-add-point');
    if (btnAddPoint) {
      btnAddPoint.addEventListener('click', () => {
        const last = this.multiPoints[this.multiPoints.length - 1] || { lon: 120.9842, lat: 14.5995 };
        this.multiPoints.push({
          lon: Number((last.lon + 0.05).toFixed(4)),
          lat: Number((last.lat + 0.05).toFixed(4)),
        });
        this.renderMultiPoints();
      });
    }

    const btnGrabPoint = root.querySelector('#tw-btn-grab-point');
    if (btnGrabPoint) {
      btnGrabPoint.addEventListener('click', () => {
        const coords = getGlobeCenterCoordinates(this.viewer);
        this.multiPoints.push(coords);
        this.renderMultiPoints();
        this.showToast(`🎯 Point added from globe center: [${coords.lon}, ${coords.lat}]`);
      });
    }

    // Create Feature Submission
    const btnCreate = root.querySelector('#tw-btn-create-feature');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => this.handleCreateFeature());
    }

    // Top Sector Action: Fit Viewport
    const btnFit = root.querySelector('#tw-btn-fit-viewport');
    if (btnFit) {
      btnFit.addEventListener('click', () => {
        fitViewportToAllFeatures(this.viewer, this.engine);
        this.showToast('🎯 Viewport aligned to active tactical features');
      });
    }

    // Top Sector Action: Export GeoJSON
    const btnExportGeoJson = root.querySelector('#tw-btn-export-geojson');
    if (btnExportGeoJson) {
      btnExportGeoJson.addEventListener('click', () => {
        const features = this.engine.getAllFeatures();
        if (features.length === 0) {
          this.showToast('⚠️ No tactical features to export.');
          return;
        }
        const collection = featuresToGeoJsonCollection(features);
        const jsonStr = JSON.stringify(collection, null, 2);
        const filename = `tactical_sector_${Date.now()}.geojson`;
        downloadBlob(jsonStr, filename, 'application/geo+json');
        this.showToast(`📤 Exported ${features.length} features to ${filename}`);
      });
    }

    // Top Sector Action: Export KML
    const btnExportKml = root.querySelector('#tw-btn-export-kml');
    if (btnExportKml) {
      btnExportKml.addEventListener('click', () => {
        const features = this.engine.getAllFeatures();
        if (features.length === 0) {
          this.showToast('⚠️ No tactical features to export.');
          return;
        }
        const kmlStr = featuresToKmlDocument(features, {
          title: "God's Eye View Tactical Export",
          description: `Active tactical features exported at ${new Date().toISOString()}`,
        });
        const filename = `tactical_sector_${Date.now()}.kml`;
        downloadBlob(kmlStr, filename, 'application/vnd.google-earth.kml+xml');
        this.showToast(`🗺️ Exported ${features.length} features to ${filename}`);
      });
    }

    // Top Sector Action: Import Trigger
    const fileImportTrigger = root.querySelector('#tw-btn-import-trigger');
    const fileImportInput = root.querySelector('#tw-file-import-input');
    if (fileImportTrigger && fileImportInput) {
      fileImportTrigger.addEventListener('click', () => fileImportInput.click());
      fileImportInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const content = evt.target.result;
            const parsed = importTacticalLayerContent(content, file.name);
            if (parsed.length === 0) {
              this.showToast('⚠️ No valid tactical features found in file.');
              return;
            }
            let count = 0;
            for (const item of parsed) {
              try {
                this.engine.createFeature(item);
                count += 1;
              } catch (err) {
                console.warn('[TacticalWorkbench] Error creating imported feature:', err.message);
              }
            }
            this.showToast(`📥 Successfully imported ${count} tactical features from ${file.name}.`);
            this.renderRoster();
            this.updateCounters();
            fitViewportToAllFeatures(this.viewer, this.engine);
          } catch (err) {
            this.showToast(`❌ Import error: ${err.message}`);
          }
        };
        reader.readAsText(file);
        fileImportInput.value = '';
      });
    }

    // Google Drive Cloud GIS Layer Pipeline Modal & Synchronization
    this._initDriveSync(root);

    // Top Sector Action: Clear All
    const btnClearAll = root.querySelector('#tw-btn-clear-all');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        const total = this.engine.getAllFeatures().length;
        if (total === 0) {
          this.showToast('Sector is already clear.');
          return;
        }
        openConfirmModal({
          title: 'Purge Tactical Features',
          message: `Purge all unlocked tactical features in this sector (${total} total)?`,
          details: 'Locked features will be retained. Unlocked features will be removed from the sector.',
          confirmText: 'Purge Features',
          confirmColor: 'rose',
          onConfirm: () => {
            const result = this.engine.clearAll({ force: false });
            this.renderRoster();
            this.updateCounters();
            this.showToast(`🗑️ Purged ${result.deletedCount} features. (${result.remainingCount} locked retained)`);
          },
        });
      });
    }

    // Search & Filter controls
    const searchInput = root.querySelector('#tw-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchFilter = e.target.value.trim().toLowerCase();
        this.renderRoster();
      });
    }

    const typeFilter = root.querySelector('#tw-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.typeFilter = e.target.value;
        this.renderRoster();
      });
    }
  }

  /**
   * Adapts the drafting form UI elements depending on the selected feature type.
   * @private
   */
  _updateFormForDraftType() {
    const root = this.host;
    if (!root) return;

    const singleCoordsGroup = root.querySelector('#tw-coords-single-group');
    const multiCoordsGroup = root.querySelector('#tw-coords-multi-group');
    const paramRangeRing = root.querySelector('#tw-param-range-ring');
    const paramGeofence = root.querySelector('#tw-param-geofence');
    const multiLabel = root.querySelector('#tw-multi-label');
    const nameInput = root.querySelector('#tw-input-name');

    const type = this.draftType;
    const isMulti = type === FEATURE_TYPES.LINE || type === FEATURE_TYPES.POLYGON;

    if (singleCoordsGroup) singleCoordsGroup.style.display = isMulti ? 'none' : 'block';
    if (multiCoordsGroup) multiCoordsGroup.style.display = isMulti ? 'block' : 'none';
    if (paramRangeRing) paramRangeRing.style.display = type === FEATURE_TYPES.RANGE_RING ? 'block' : 'none';
    if (paramGeofence) paramGeofence.style.display = type === 'geofence' ? 'block' : 'none';

    if (multiLabel) {
      multiLabel.textContent = type === FEATURE_TYPES.POLYGON
        ? 'Polygon Vertices [Lon, Lat]'
        : 'Waypoints Route [Lon, Lat]';
    }

    if (nameInput && !nameInput.value.trim()) {
      switch (type) {
        case FEATURE_TYPES.POINT: nameInput.placeholder = 'e.g. Alpha Checkpoint'; break;
        case FEATURE_TYPES.RANGE_RING: nameInput.placeholder = 'e.g. Subic Bay Coastal Radar'; break;
        case FEATURE_TYPES.POLYGON: nameInput.placeholder = 'e.g. Sector Zulu Restricted Airspace'; break;
        case FEATURE_TYPES.LINE: nameInput.placeholder = 'e.g. Transit Corridor 04'; break;
        case 'geofence': nameInput.placeholder = 'e.g. Manila Port Perimeter Geofence'; break;
      }
    }

    this.renderMultiPoints();
  }

  /**
   * Renders the interactive multi-points editor for routes/polygons.
   */
  renderMultiPoints() {
    const list = this.host.querySelector('#tw-multi-points-list');
    const readoutLabel = this.host.querySelector('#tw-dynamic-metric-label');
    const readoutValue = this.host.querySelector('#tw-dynamic-metric-value');
    if (!list) return;

    list.innerHTML = this.multiPoints.map((pt, idx) => `
      <div class="tw-multi-point-row" data-index="${idx}">
        <span class="tw-point-badge">#${idx + 1}</span>
        <div class="tw-point-input-col">
          <span class="tw-point-tag">LON</span>
          <input type="number" class="tw-multi-lon tw-input-mini" step="0.0001" value="${pt.lon}" data-index="${idx}" />
        </div>
        <div class="tw-point-input-col">
          <span class="tw-point-tag">LAT</span>
          <input type="number" class="tw-multi-lat tw-input-mini" step="0.0001" value="${pt.lat}" data-index="${idx}" />
        </div>
        <button type="button" class="tw-btn-mini tw-btn-point-del" data-index="${idx}" title="Remove waypoint" ${this.multiPoints.length <= 2 ? 'disabled' : ''}>
          <span>✕</span>
        </button>
      </div>
    `).join('');

    // Bind change handlers
    list.querySelectorAll('.tw-multi-lon').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.multiPoints[idx].lon = Number(e.target.value);
        this.updateDynamicMetrics();
      });
    });

    list.querySelectorAll('.tw-multi-lat').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.multiPoints[idx].lat = Number(e.target.value);
        this.updateDynamicMetrics();
      });
    });

    list.querySelectorAll('.tw-btn-point-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index, 10);
        if (this.multiPoints.length > 2) {
          this.multiPoints.splice(idx, 1);
          this.renderMultiPoints();
        }
      });
    });

    this.updateDynamicMetrics();
  }

  /**
   * Updates live distance or area calculation readouts for drafting state.
   */
  updateDynamicMetrics() {
    const readoutLabel = this.host.querySelector('#tw-dynamic-metric-label');
    const readoutValue = this.host.querySelector('#tw-dynamic-metric-value');
    if (!readoutLabel || !readoutValue) return;

    const coords = this.multiPoints.map((p) => [p.lon, p.lat]);

    if (this.draftType === FEATURE_TYPES.LINE) {
      readoutLabel.textContent = 'TOTAL DISTANCE:';
      const pathMetrics = calculatePathDistance(coords);
      const km = Number(pathMetrics?.totalDistanceKm) || 0;
      const nm = Number(pathMetrics?.totalDistanceNm) || 0;
      readoutValue.textContent = `${km.toFixed(2)} km (${nm.toFixed(2)} NM)`;
    } else if (this.draftType === FEATURE_TYPES.POLYGON) {
      readoutLabel.textContent = 'TOTAL AREA & PERIMETER:';
      const polyMetrics = calculatePolygonMetrics(coords);
      const area = Number(polyMetrics?.areaSquareKm) || 0;
      const perim = Number(polyMetrics?.perimeterKm) || 0;
      readoutValue.textContent = `${area.toFixed(2)} km² · Perim: ${perim.toFixed(2)} km`;
    }
  }

  /**
   * Handles creating a new tactical feature from drafting workbench inputs.
   */
  handleCreateFeature() {
    const root = this.host;
    const nameInput = root.querySelector('#tw-input-name');
    const rawName = nameInput?.value.trim();
    const type = this.draftType === 'geofence' ? FEATURE_TYPES.CIRCLE : this.draftType;
    const notesInput = root.querySelector('#tw-input-notes');
    const notes = notesInput?.value.trim() || '';

    const name = rawName || `${type.toUpperCase()} ${Date.now().toString().slice(-4)}`;

    let coordinates = null;
    const properties = {
      notes,
      color: this.selectedColor,
    };

    if (this.draftType === 'geofence') {
      const lon = Number(root.querySelector('#tw-input-lon')?.value) || 120.9842;
      const lat = Number(root.querySelector('#tw-input-lat')?.value) || 14.5995;
      const radiusM = Number(root.querySelector('#tw-input-geofence-radius')?.value) || 5000;
      const speedCeilingKts = Number(root.querySelector('#tw-input-speed-ceiling')?.value) || 250;
      const alertOnBreach = Boolean(root.querySelector('#tw-input-geofence-alert')?.checked);

      coordinates = [lon, lat];
      properties.isGeofence = true;
      properties.radiusMeters = radiusM;
      properties.speedCeilingKts = speedCeilingKts;
      properties.alertOnBreach = alertOnBreach;
    } else if (type === FEATURE_TYPES.POINT) {
      const lon = Number(root.querySelector('#tw-input-lon')?.value) || 120.9842;
      const lat = Number(root.querySelector('#tw-input-lat')?.value) || 14.5995;
      coordinates = [lon, lat];
    } else if (type === FEATURE_TYPES.RANGE_RING) {
      const lon = Number(root.querySelector('#tw-input-lon')?.value) || 120.9842;
      const lat = Number(root.querySelector('#tw-input-lat')?.value) || 14.5995;
      const preset = root.querySelector('#tw-input-ring-preset')?.value || 'triple';
      const baseRadiusM = Number(root.querySelector('#tw-input-radius-m')?.value) || 25000;

      let radii = [baseRadiusM];
      if (preset === 'dual') {
        radii = [baseRadiusM * 0.4, baseRadiusM];
      } else if (preset === 'triple') {
        radii = [baseRadiusM * 0.4, baseRadiusM, baseRadiusM * 2.0];
      } else if (preset === 'quad') {
        radii = [baseRadiusM * 0.5, baseRadiusM, baseRadiusM * 2.0, baseRadiusM * 3.5];
      }

      coordinates = [lon, lat];
      properties.radii = radii;
      properties.radiusMeters = radii[radii.length - 1];
    } else if (type === FEATURE_TYPES.LINE || type === FEATURE_TYPES.POLYGON) {
      coordinates = this.multiPoints.map((p) => [p.lon, p.lat]);
    }

    try {
      const created = this.engine.createFeature({
        name,
        type,
        coordinates,
        properties,
        style: {
          color: this.selectedColor,
        },
      });

      this.showToast(`⚡ Created tactical feature "${created.name}"`);
      if (nameInput) nameInput.value = '';
      if (notesInput) notesInput.value = '';

      this.renderRoster();
      this.updateCounters();

      // Automatically focus camera on newly created feature
      try {
        this.engine.flyToFeature(created.id);
      } catch (err) {
        // Safe degrade
      }
    } catch (err) {
      this.showToast(`❌ Creation error: ${err.message}`);
    }
  }

  /**
   * Renders the inventory roster cards based on active engine features and filters.
   */
  renderRoster() {
    const container = this.host.querySelector('#tw-cards-container');
    if (!container) return;

    let features = this.engine.getAllFeatures();

    // Apply Type Filter
    if (this.typeFilter !== 'all') {
      if (this.typeFilter === 'geofence') {
        features = features.filter((f) => f.properties?.isGeofence);
      } else {
        features = features.filter((f) => f.type === this.typeFilter && !f.properties?.isGeofence);
      }
    }

    // Apply Search Filter
    if (this.searchFilter) {
      features = features.filter((f) =>
        f.name.toLowerCase().includes(this.searchFilter) ||
        f.id.toLowerCase().includes(this.searchFilter) ||
        (f.properties?.notes && f.properties.notes.toLowerCase().includes(this.searchFilter))
      );
    }

    this.updateCounters();

    if (features.length === 0) {
      container.innerHTML = `
        <div class="tw-empty-roster">
          <span class="tw-empty-icon">📡</span>
          <strong class="tw-empty-title">NO ACTIVE TACTICAL FEATURES</strong>
          <p class="tw-empty-desc">
            Use the drafting workbench on the left to deploy tactical pins, concentric range rings, geofences, and CAD routes.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = features.map((feature) => this._renderFeatureCard(feature)).join('');
    this._bindCardActions(container);
  }

  /**
   * Generates HTML markup for a single tactical feature card.
   * @private
   * @param {Object} feature
   * @returns {string}
   */
  _renderFeatureCard(feature) {
    const { id, name, type, locked, updatedAt, properties = {}, style = {}, computed = {} } = feature;
    const isGeofence = Boolean(properties.isGeofence);
    const color = style.color || properties.color || '#00e5ff';
    const isEditing = this.editingFeatureId === id;

    let typeBadgeLabel = type.toUpperCase();
    if (isGeofence) typeBadgeLabel = 'GEOFENCE';
    else if (type === FEATURE_TYPES.RANGE_RING) typeBadgeLabel = 'RANGE RING';

    let metricsHtml = '';

    if (isGeofence) {
      const radiusKm = ((computed.radiusMeters || properties.radiusMeters || 1000) / 1000).toFixed(1);
      const speedCeiling = properties.speedCeilingKts ? `${properties.speedCeilingKts} kts` : 'None';
      metricsHtml = `
        <div class="tw-metric-item"><span>RADIUS:</span><strong>${radiusKm} km</strong></div>
        <div class="tw-metric-item"><span>SPEED CEILING:</span><strong>&lt; ${speedCeiling}</strong></div>
        <div class="tw-metric-item"><span>STATUS:</span><strong class="text-emerald-400">ENFORCED</strong></div>
      `;
    } else if (type === FEATURE_TYPES.POINT) {
      const lon = (feature.coordinates?.[0] ?? 0).toFixed(4);
      const lat = (feature.coordinates?.[1] ?? 0).toFixed(4);
      metricsHtml = `
        <div class="tw-metric-item"><span>COORDINATES:</span><strong>[${lon}°, ${lat}°]</strong></div>
      `;
    } else if (type === FEATURE_TYPES.RANGE_RING) {
      const maxKm = ((computed.maxRadiusMeters || 1000) / 1000).toFixed(1);
      const ringsCount = computed.rings?.length || 1;
      metricsHtml = `
        <div class="tw-metric-item"><span>MAX RADIUS:</span><strong>${maxKm} km</strong></div>
        <div class="tw-metric-item"><span>RINGS:</span><strong>${ringsCount} CONCENTRIC</strong></div>
      `;
    } else if (type === FEATURE_TYPES.LINE) {
      const km = (computed.totalDistanceKm || 0).toFixed(2);
      const nm = (computed.totalDistanceNm || 0).toFixed(2);
      const waypoints = Array.isArray(feature.coordinates) ? feature.coordinates.length : 0;
      metricsHtml = `
        <div class="tw-metric-item"><span>DISTANCE:</span><strong>${km} km (${nm} NM)</strong></div>
        <div class="tw-metric-item"><span>WAYPOINTS:</span><strong>${waypoints} PTS</strong></div>
      `;
    } else if (type === FEATURE_TYPES.POLYGON) {
      const area = (computed.areaSquareKm || 0).toFixed(2);
      const perim = (computed.perimeterKm || 0).toFixed(2);
      metricsHtml = `
        <div class="tw-metric-item"><span>AREA:</span><strong>${area} km²</strong></div>
        <div class="tw-metric-item"><span>PERIMETER:</span><strong>${perim} km</strong></div>
      `;
    }

    const notes = properties.notes ? `<div class="tw-card-notes">“${escapeHtml(properties.notes)}”</div>` : '';

    return `
      <article class="tw-card ${locked ? 'tw-card-locked' : ''} ${isEditing ? 'tw-card-editing' : ''}" id="tw-card-${id}" data-id="${id}">
        <div class="tw-card-header">
          <div class="tw-card-title-row">
            <span class="tw-card-badge" style="--badge-color: ${color};">${typeBadgeLabel}</span>
            <strong class="tw-card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
            ${locked ? '<span class="tw-card-locked-tag">🔒 LOCKED</span>' : ''}
          </div>
          <span class="tw-card-time" title="Last modified">${formatTimestamp(updatedAt)}</span>
        </div>

        <div class="tw-card-metrics">
          ${metricsHtml}
        </div>

        ${properties.imageUrl ? `
          <div class="tw-card-img-preview" style="margin-bottom: 8px; border-radius: 4px; overflow: hidden; max-height: 80px; border: 1px solid rgba(56, 189, 248, 0.3);">
            <img src="${properties.imageUrl}" alt="Tactical Attachment" style="width: 100%; height: 80px; object-fit: cover;" />
          </div>
        ` : ''}

        ${notes}

        <!-- INLINE PROPERTY EDITOR (EXPANDED WHEN EDITING) -->
        ${isEditing ? this._renderInlineEditor(feature) : ''}

        <!-- CARD ACTION BUTTONS -->
        <div class="tw-card-actions">
          <button type="button" class="tw-card-btn tw-action-inspect" data-action="inspect" data-id="${id}" title="Open 4-Tab Feature Inspector (Attachments, Rich Notes, Color Palette)">
            <span>🔍 Inspector</span>
          </button>
          <button type="button" class="tw-card-btn tw-action-focus" data-action="focus" data-id="${id}" title="Re-orient camera directly onto feature">
            <span>🎯 Focus</span>
          </button>
          <button type="button" class="tw-card-btn tw-action-lock ${locked ? 'tw-btn-locked-active' : ''}" data-action="lock" data-id="${id}" title="${locked ? 'Unlock feature' : 'Lock feature against edits/deletion'}">
            <span>${locked ? '🔓 Unlock' : '🔒 Lock'}</span>
          </button>
          <button type="button" class="tw-card-btn tw-action-edit" data-action="edit" data-id="${id}" title="Quick-edit properties" ${locked ? 'disabled' : ''}>
            <span>✏️ Edit</span>
          </button>
          <button type="button" class="tw-card-btn tw-action-export" data-action="export" data-id="${id}" title="Download single-feature GeoJSON blob">
            <span>📤 GeoJSON</span>
          </button>
          <button type="button" class="tw-card-btn tw-action-delete" data-action="delete" data-id="${id}" title="Safe state purge" ${locked ? 'disabled' : ''}>
            <span>🗑️ Delete</span>
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Renders the inline property editor inside a card.
   * @private
   * @param {Object} feature
   * @returns {string}
   */
  _renderInlineEditor(feature) {
    const { id, name, properties = {}, style = {} } = feature;
    const color = style.color || properties.color || '#00e5ff';
    const notes = properties.notes || '';
    const speedCeiling = properties.speedCeilingKts ?? '';

    return `
      <div class="tw-inline-editor" id="tw-editor-${id}">
        <div class="tw-inline-header">
          <span>✏️ INLINE PROPERTY EDITOR</span>
        </div>
        <div class="tw-inline-row">
          <label class="tw-inline-label">Name</label>
          <input type="text" class="tw-inline-input" id="tw-edit-name-${id}" value="${escapeHtml(name)}" />
        </div>
        <div class="tw-inline-row">
          <label class="tw-inline-label">Color</label>
          <input type="color" class="tw-inline-color" id="tw-edit-color-${id}" value="${color}" />
        </div>
        ${feature.properties?.isGeofence ? `
          <div class="tw-inline-row">
            <label class="tw-inline-label">Speed Ceiling (kts)</label>
            <input type="number" class="tw-inline-input" id="tw-edit-speed-${id}" value="${speedCeiling}" />
          </div>
        ` : ''}
        <div class="tw-inline-row">
          <label class="tw-inline-label">Notes</label>
          <textarea class="tw-inline-textarea" id="tw-edit-notes-${id}" rows="2">${escapeHtml(notes)}</textarea>
        </div>
        <div class="tw-inline-actions">
          <button type="button" class="tw-btn-mini tw-btn-primary" data-action="save-edit" data-id="${id}">
            <span>💾 Save</span>
          </button>
          <button type="button" class="tw-btn-mini tw-btn-secondary" data-action="cancel-edit" data-id="${id}">
            <span>✖ Cancel</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Binds click events on card action buttons.
   * @private
   * @param {HTMLElement} container
   */
  _bindCardActions(container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      switch (action) {
        case 'inspect': {
          const feat = this.engine.getFeature(id);
          if (!feat) return;

          let modalCoords = [];
          if (Array.isArray(feat.coordinates)) {
            if (typeof feat.coordinates[0] === 'number') {
              modalCoords = [{ lat: feat.coordinates[1], lng: feat.coordinates[0], alt: 0 }];
            } else if (Array.isArray(feat.coordinates[0])) {
              modalCoords = feat.coordinates.map((pt) => ({ lat: pt[1], lng: pt[0], alt: pt[2] || 0 }));
            }
          }

          const { openItemInspectorModal } = await import('./itemInspectorModal.js');
          openItemInspectorModal({
            item: {
              id: feat.id,
              name: feat.name,
              type: feat.type === FEATURE_TYPES.POINT ? 'marker' : feat.type === FEATURE_TYPES.LINE ? 'polyline' : 'polygon',
              description: feat.properties?.notes || '',
              color: feat.style?.color || feat.properties?.color || '#00e5ff',
              fillColor: feat.style?.color || feat.properties?.color || '#00e5ff',
              imageUrl: feat.properties?.imageUrl || '',
              coordinates: JSON.stringify(modalCoords),
              author: 'admin',
              createdAt: feat.createdAt || new Date().toISOString(),
            },
            mapId: 'tactical_workbench',
            onSave: (updated) => {
              this.engine.updateFeature(id, {
                name: updated.name,
                style: { color: updated.color },
                properties: {
                  ...feat.properties,
                  notes: updated.description,
                  imageUrl: updated.imageUrl,
                  color: updated.color,
                },
              }, { force: true });
              this.showToast(`💾 Saved inspected metadata for "${updated.name}"`);
              this.renderRoster();
            },
            onDelete: () => {
              this.engine.deleteFeature(id, { force: true });
              this.showToast(`🗑️ Deleted "${feat.name}"`);
              this.renderRoster();
              this.updateCounters();
            },
            onFlyTo: () => {
              this.engine.flyToFeature(id);
            },
          });
          break;
        }

        case 'focus': {
          try {
            this.engine.flyToFeature(id);
            this.showToast(`🎯 Camera focused on feature`);
          } catch (err) {
            this.showToast(`⚠️ Focus error: ${err.message}`);
          }
          break;
        }

        case 'lock': {
          const feat = this.engine.getFeature(id);
          if (!feat) return;
          const nextLock = !feat.locked;
          this.engine.lockFeature(id, nextLock);
          this.showToast(nextLock ? `🔒 Feature "${feat.name}" locked.` : `🔓 Feature "${feat.name}" unlocked.`);
          this.renderRoster();
          break;
        }

        case 'edit': {
          this.editingFeatureId = this.editingFeatureId === id ? null : id;
          this.renderRoster();
          break;
        }

        case 'save-edit': {
          const nameInput = container.querySelector(`#tw-edit-name-${id}`);
          const colorInput = container.querySelector(`#tw-edit-color-${id}`);
          const speedInput = container.querySelector(`#tw-edit-speed-${id}`);
          const notesInput = container.querySelector(`#tw-edit-notes-${id}`);

          const patch = {
            name: nameInput?.value.trim() || undefined,
            style: { color: colorInput?.value },
            properties: {
              color: colorInput?.value,
              notes: notesInput?.value.trim() || '',
            },
          };

          if (speedInput && speedInput.value !== '') {
            patch.properties.speedCeilingKts = Number(speedInput.value);
          }

          try {
            this.engine.updateFeature(id, patch, { force: true });
            this.showToast(`💾 Saved changes for feature`);
            this.editingFeatureId = null;
            this.renderRoster();
          } catch (err) {
            this.showToast(`❌ Update failed: ${err.message}`);
          }
          break;
        }

        case 'cancel-edit': {
          this.editingFeatureId = null;
          this.renderRoster();
          break;
        }

        case 'export': {
          const feat = this.engine.getFeature(id);
          if (!feat) return;
          const geojson = featureToGeoJson(feat);
          const filename = `${feat.name.replace(/\s+/g, '_')}_${feat.id.slice(-6)}.geojson`;
          downloadBlob(JSON.stringify(geojson, null, 2), filename, 'application/geo+json');
          this.showToast(`📤 Exported "${feat.name}" to ${filename}`);
          break;
        }

        case 'delete': {
          const feat = this.engine.getFeature(id);
          const featName = feat ? feat.name : id;
          if (feat && feat.locked) {
            this.showToast(`🔒 Cannot delete locked feature "${featName}". Unlock first.`);
            return;
          }
          openConfirmModal({
            title: 'Delete Tactical Feature',
            message: `Delete tactical feature "${featName}"?`,
            details: 'This feature will be permanently removed from the active sector.',
            confirmText: 'Delete',
            confirmColor: 'rose',
            onConfirm: () => {
              this.engine.deleteFeature(id, { force: true });
              this.showToast(`🗑️ Deleted "${featName}"`);
              this.renderRoster();
              this.updateCounters();
            },
          });
          break;
        }

        default:
          break;
      }
    });
  }

  /**
   * Binds global telemetry packet/batch events and breach alarm events.
   * @private
   */
  _bindWindowTelemetryEvents() {
    if (typeof window === 'undefined') return;

    this._telemetryBatchHandler = (event) => {
      if (event.detail?.units && this.geofenceEngine) {
        const res = this.geofenceEngine.scanTelemetryBatch(event.detail.units);
        const stats = this.host?.querySelector?.('#tw-feed-stats');
        if (stats && !this._isSimulating) {
          stats.textContent = `Scanned ${res.scannedCount} contacts in ${res.durationMs.toFixed(1)}ms (${res.activeBreachesCount} active breaches)`;
        }
      }
    };

    this._telemetryPacketHandler = (event) => {
      if (event.detail?.packet && this.geofenceEngine) {
        this.geofenceEngine.evaluateTelemetryPacket(event.detail.packet);
      }
    };

    window.addEventListener('gev:telemetry-batch', this._telemetryBatchHandler);
    window.addEventListener('gev:telemetry-packet', this._telemetryPacketHandler);
  }

  /**
   * Toggles the live test simulation patrol track.
   */
  toggleSimulation() {
    if (this._isSimulating) {
      if (this.geofenceEngine) {
        this.geofenceEngine.stopSimulation();
      }
      this._isSimulating = false;
      const simBtn = this.host?.querySelector?.('#tw-btn-simulation-toggle');
      const simText = this.host?.querySelector?.('#tw-sim-btn-text');
      if (simBtn) simBtn.classList.remove('active-sim');
      if (simText) simText.textContent = 'Test Simulated Patrol';
      this.showToast('⏹️ Patrol track simulation stopped');
    } else {
      if (!this.geofenceEngine) return;
      this._isSimulating = true;
      const simBtn = this.host?.querySelector?.('#tw-btn-simulation-toggle');
      const simText = this.host?.querySelector?.('#tw-sim-btn-text');
      if (simBtn) simBtn.classList.add('active-sim');
      if (simText) simText.textContent = '⏹️ Stop Simulation';

      this.geofenceEngine.startSimulation({
        intervalMs: 800,
        onStep: ({ step, packet, violations, activeCount, note }) => {
          const stats = this.host?.querySelector?.('#tw-feed-stats');
          if (stats) {
            stats.textContent = `Simulation Step ${step + 1}: ${note} (${activeCount} active)`;
          }
        },
      });
      this.showToast('⚡ Patrol track simulation running - Monitoring boundary crossing lifecycle');
    }
  }

  /**
   * Flies camera to specific geographic coordinates.
   * @param {[number, number]} coordinates - [lon, lat]
   * @param {number} [rangeMeters=3000]
   */
  flyToCoordinates(coordinates, rangeMeters = 3000) {
    if (!coordinates || !this.viewer) return;
    const [lon, lat] = coordinates;
    try {
      const Cesium = globalThis.Cesium;
      if (Cesium && this.viewer.camera) {
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(Number(lon), Number(lat), rangeMeters),
          duration: 1.5,
        });
        this.showToast(`🎯 Centered camera on [${Number(lon).toFixed(4)}, ${Number(lat).toFixed(4)}]`);
      }
    } catch (err) {
      console.warn('[TacticalWorkbenchUi] flyToCoordinates failed:', err.message);
    }
  }

  /**
   * Renders the real-time Geofence breach feed.
   */
  renderBreachFeed() {
    const feedContainer = this.host?.querySelector?.('#tw-breach-feed-list');
    if (!feedContainer || !this.geofenceEngine) return;

    const history = this.geofenceEngine.getBreachHistory(30);

    if (history.length === 0) {
      feedContainer.innerHTML = `
        <div class="tw-feed-empty-state">
          <span class="tw-feed-empty-icon">🛡️</span>
          <p>All monitored sectors secure. No active boundary or speed violations detected.</p>
        </div>
      `;
      return;
    }

    feedContainer.innerHTML = history.map((b) => {
      const isIngress = b.violationType === VIOLATION_TYPES.INGRESS;
      const isEgress = b.violationType === VIOLATION_TYPES.EGRESS;
      const isSpeed = b.violationType === VIOLATION_TYPES.SPEED_CEILING;

      let badgeClass = 'tw-tag-ingress';
      let badgeLabel = '⚠️ INGRESS BREACH';
      if (isEgress) {
        badgeClass = 'tw-tag-egress';
        badgeLabel = '🚨 EGRESS VIOLATION';
      } else if (isSpeed) {
        badgeClass = 'tw-tag-speed';
        badgeLabel = '⚡ SPEED CEILING';
      }

      const timeStr = new Date(b.firstDetectedAt).toLocaleTimeString();
      const durationSec = Math.max(1, Math.round((Date.now() - b.firstDetectedAt) / 1000));
      const statusBadge = b.active
        ? `<span class="tw-feed-status-badge active">● ACTIVE (${durationSec}s)</span>`
        : `<span class="tw-feed-status-badge resolved">✓ RESOLVED</span>`;

      return `
        <div class="tw-breach-card ${b.active ? 'active' : 'resolved'}" data-breach-id="${b.id}">
          <div class="tw-breach-card-top">
            <div class="tw-breach-card-title-row">
              <span class="tw-breach-tag ${badgeClass}">${badgeLabel}</span>
              <strong class="tw-breach-unit-name">${escapeHtml(b.unitName || b.unitId)}</strong>
              <span class="tw-breach-unit-id">[${escapeHtml(b.unitId)}]</span>
            </div>
            <div class="tw-breach-card-time-row">
              ${statusBadge}
              <span class="tw-breach-time">${timeStr}</span>
            </div>
          </div>
          <div class="tw-breach-card-body">
            <div class="tw-breach-desc">${escapeHtml(b.reason || '')}</div>
            <div class="tw-breach-metrics">
              <span><strong>Zone:</strong> ${escapeHtml(b.geofenceName || '')}</span>
              <span><strong>Speed:</strong> ${Number.isFinite(b.speedKnots) ? b.speedKnots.toFixed(1) : (Number(b.speedKnots) || 0).toFixed(1)} kts ${b.speedLimitKnots > 0 ? `(Ceiling: ${b.speedLimitKnots} kts)` : ''}</span>
              <span><strong>Coords:</strong> [${Number.isFinite(b.coordinates?.[0]) ? b.coordinates[0].toFixed(4) : '--'}, ${Number.isFinite(b.coordinates?.[1]) ? b.coordinates[1].toFixed(4) : '--'}]</span>
            </div>
          </div>
          <div class="tw-breach-card-actions">
            <button type="button" class="tw-btn-mini tw-btn-focus-unit" data-coords="${b.coordinates[0]},${b.coordinates[1]}" title="Fly camera to violating unit">
              <span>🎯 Focus Unit</span>
            </button>
            <button type="button" class="tw-btn-mini tw-btn-focus-zone" data-zone-id="${b.geofenceId}" title="Fly camera to violated perimeter">
              <span>🛡️ Focus Zone</span>
            </button>
            ${b.active ? `
              <button type="button" class="tw-btn-mini tw-btn-ack" data-breach-id="${b.id}" title="Acknowledge alarm">
                <span>✅ Ack</span>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Wire action buttons
    feedContainer.querySelectorAll('.tw-btn-focus-unit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const coordsStr = e.currentTarget.getAttribute('data-coords');
        if (coordsStr) {
          const [lon, lat] = coordsStr.split(',').map(Number);
          this.flyToCoordinates([lon, lat], 2500);
        }
      });
    });

    feedContainer.querySelectorAll('.tw-btn-focus-zone').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const zoneId = e.currentTarget.getAttribute('data-zone-id');
        if (zoneId) {
          try {
            this.engine.flyToFeature(zoneId);
          } catch (err) {
            this.showToast(`Zone not found: ${err.message}`);
          }
        }
      });
    });

    feedContainer.querySelectorAll('.tw-btn-ack').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const breachId = e.currentTarget.getAttribute('data-breach-id');
        if (breachId) {
          this.geofenceEngine.acknowledgeBreach(breachId);
          this.renderBreachFeed();
          this.updateCounters();
          this.showToast('✅ Alarm acknowledged');
        }
      });
    });
  }

  /**
   * Initializes Google Drive Cloud GIS Pipeline modal, auth observers, and layer sync.
   * @param {HTMLElement} root
   */
  _initDriveSync(root) {
    const modalBackdrop = root.querySelector('#tw-drive-modal');
    const btnOpen = root.querySelector('#tw-btn-drive-sync');
    const btnClose = root.querySelector('#tw-btn-drive-modal-close');
    const authDot = root.querySelector('#tw-drive-auth-dot');
    const authStatusText = root.querySelector('#tw-drive-auth-status-text');
    const authToggleBtn = root.querySelector('#tw-btn-drive-auth-toggle');
    const authToggleText = root.querySelector('#tw-drive-auth-btn-text');
    const saveNameInput = root.querySelector('#tw-drive-layer-name');
    const saveFormatSelect = root.querySelector('#tw-drive-layer-format');
    const btnSaveSubmit = root.querySelector('#tw-btn-drive-save-submit');
    const btnRefreshLayers = root.querySelector('#tw-btn-drive-refresh-layers');
    const layersTbody = root.querySelector('#tw-drive-layers-tbody');

    const updateAuthUI = (user, token) => {
      const isConnected = Boolean(token);
      if (authDot) {
        authDot.classList.toggle('connected', isConnected);
      }
      if (authStatusText) {
        if (isConnected) {
          authStatusText.textContent = `Connected as ${user?.email || user?.displayName || 'Authorized Operator'} (Drive Scope Active)`;
          authStatusText.style.color = '#34d399';
        } else {
          authStatusText.textContent = 'Google Drive Disconnected. Sign in to access GodsEyeView/Layers cloud folder.';
          authStatusText.style.color = '#94a3b8';
        }
      }
      if (authToggleText) {
        authToggleText.textContent = isConnected ? 'Sign Out / Disconnect' : 'Sign In with Google';
      }
    };

    // Initial auth status check
    const currentToken = typeof getAccessToken === 'function' ? getAccessToken() : null;
    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    updateAuthUI(currentUser, currentToken);

    // Subscribe to auth state changes
    if (typeof subscribeAuth === 'function') {
      this._authUnsubscribe = subscribeAuth(({ user, token }) => {
        updateAuthUI(user, token);
        if (token && modalBackdrop && modalBackdrop.style.display !== 'none') {
          loadLayers();
        }
      });
    }

    const openModal = () => {
      if (modalBackdrop) {
        modalBackdrop.style.display = 'flex';
        if (saveNameInput) {
          const ext = saveFormatSelect?.value || 'geojson';
          saveNameInput.value = `tactical_sector_${Date.now()}.${ext}`;
        }
        loadLayers();
      }
    };

    const closeModal = () => {
      if (modalBackdrop) {
        modalBackdrop.style.display = 'none';
      }
    };

    if (btnOpen) {
      btnOpen.addEventListener('click', openModal);
    }
    if (btnClose) {
      btnClose.addEventListener('click', closeModal);
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }

    // Toggle auth sign-in / sign-out
    if (authToggleBtn) {
      authToggleBtn.addEventListener('click', async () => {
        const token = getAccessToken();
        if (token) {
          try {
            authToggleBtn.disabled = true;
            await googleSignOut();
            this.showToast('ℹ️ Disconnected from Google Drive');
            if (layersTbody) {
              layersTbody.innerHTML = `<tr><td colspan="5" class="tw-empty-cell">Google Drive disconnected. Sign in to view cloud layers.</td></tr>`;
            }
          } catch (err) {
            this.showToast(`Auth error: ${err.message}`);
          } finally {
            authToggleBtn.disabled = false;
          }
        } else {
          try {
            authToggleBtn.disabled = true;
            if (authToggleText) authToggleText.textContent = 'Connecting...';
            this.showToast('🔑 Opening Google sign-in popup...');
            await googleSignIn();
            this.showToast('✅ Google Drive connected successfully');
            loadLayers();
          } catch (err) {
            this.showToast(`Sign-in cancelled or failed: ${err.message}`);
          } finally {
            authToggleBtn.disabled = false;
          }
        }
      });
    }

    // Load and render cloud layers from GodsEyeView/Layers
    const loadLayers = async () => {
      if (!layersTbody) return;
      const token = getAccessToken();
      if (!token) {
        layersTbody.innerHTML = `<tr><td colspan="5" class="tw-empty-cell">Sign in with Google to load tactical layers from GodsEyeView/Layers.</td></tr>`;
        return;
      }

      layersTbody.innerHTML = `<tr><td colspan="5" class="tw-empty-cell">🔄 Querying Google Drive GodsEyeView/Layers folder...</td></tr>`;

      try {
        const files = await listTacticalLayersFromDrive();
        if (!files || files.length === 0) {
          layersTbody.innerHTML = `<tr><td colspan="5" class="tw-empty-cell">No tactical layers found in GodsEyeView/Layers. Save your current sector to create one!</td></tr>`;
          return;
        }

        layersTbody.innerHTML = files.map((file) => {
          const isKml = file.format === 'kml';
          const badgeClass = isKml ? 'tw-format-kml' : 'tw-format-geojson';
          const badgeLabel = (file.format || 'GIS').toUpperCase();
          const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—';
          const sizeKb = file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '—';

          return `
            <tr data-file-id="${file.id}">
              <td>
                <strong style="color: #f1f5f9;">${escapeHtml(file.name)}</strong>
              </td>
              <td>
                <span class="tw-drive-format-tag ${badgeClass}">${badgeLabel}</span>
              </td>
              <td>${modified}</td>
              <td>${sizeKb}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button type="button" class="tw-card-btn tw-drive-btn-ingest" data-file-id="${file.id}" data-file-name="${escapeHtml(file.name)}" title="Ingest layer directly onto 3D globe">
                  <span>📥 Ingest</span>
                </button>
                <button type="button" class="tw-card-btn tw-action-delete tw-drive-btn-delete" data-file-id="${file.id}" data-file-name="${escapeHtml(file.name)}" title="Permanently delete from Google Drive">
                  <span>🗑️</span>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Wire Ingest buttons
        layersTbody.querySelectorAll('.tw-drive-btn-ingest').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const fileId = e.currentTarget.getAttribute('data-file-id');
            const fileName = e.currentTarget.getAttribute('data-file-name') || 'layer';
            try {
              btn.disabled = true;
              this.showToast(`⏳ Downloading "${fileName}" from Google Drive...`);
              const layer = await loadTacticalLayerFromDrive(fileId, { name: fileName });

              if (!layer.features || layer.features.length === 0) {
                this.showToast(`⚠️ No tactical features found in ${fileName}`);
                return;
              }

              let count = 0;
              for (const f of layer.features) {
                try {
                  this.engine.createFeature(f);
                  count += 1;
                } catch (err) {
                  console.warn('[TacticalWorkbench] Error creating imported feature:', err.message);
                }
              }

              this.showToast(`✅ Ingested ${count} tactical features from Google Drive: ${fileName}`);
              this.renderRoster();
              this.updateCounters();
              fitViewportToAllFeatures(this.viewer, this.engine);
              closeModal();
            } catch (err) {
              this.showToast(`❌ Failed to ingest cloud layer: ${err.message}`);
            } finally {
              btn.disabled = false;
            }
          });
        });

        // Wire Delete buttons with explicit user confirmation per workspace integration security guidelines
        layersTbody.querySelectorAll('.tw-drive-btn-delete').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const fileId = e.currentTarget.getAttribute('data-file-id');
            const fileName = e.currentTarget.getAttribute('data-file-name') || 'file';
            openConfirmModal({
              title: 'Delete Cloud Layer',
              message: `Permanently delete "${fileName}" from Google Drive folder GodsEyeView/Layers?`,
              details: 'This destructive action cannot be undone.',
              confirmText: 'Delete Layer',
              confirmColor: 'rose',
              onConfirm: async () => {
                try {
                  btn.disabled = true;
                  this.showToast(`🗑️ Deleting "${fileName}" from Google Drive...`);
                  await deleteDriveFile(fileId);
                  this.showToast(`✓ "${fileName}" deleted from Google Drive`);
                  await loadLayers();
                } catch (err) {
                  this.showToast(`❌ Deletion failed: ${err.message}`);
                  btn.disabled = false;
                }
              },
            });
          });
        });
      } catch (err) {
        layersTbody.innerHTML = `<tr><td colspan="5" class="tw-empty-cell" style="color: #ef4444;">Error reading Google Drive: ${escapeHtml(err.message)}</td></tr>`;
      }
    };

    if (btnRefreshLayers) {
      btnRefreshLayers.addEventListener('click', loadLayers);
    }

    // Auto update filename extension when format select changes
    if (saveFormatSelect && saveNameInput) {
      saveFormatSelect.addEventListener('change', () => {
        const fmt = saveFormatSelect.value;
        const cur = saveNameInput.value.replace(/\.(geojson|kml|json)$/i, '');
        saveNameInput.value = `${cur}.${fmt}`;
      });
    }

    // Save active sector to Google Drive
    if (btnSaveSubmit) {
      btnSaveSubmit.addEventListener('click', async () => {
        const features = this.engine.getAllFeatures();
        if (features.length === 0) {
          this.showToast('⚠️ No active tactical features in sector to save.');
          return;
        }

        const token = getAccessToken();
        if (!token) {
          this.showToast('⚠️ Google Drive not connected. Please sign in first.');
          return;
        }

        const format = saveFormatSelect?.value || 'geojson';
        let rawName = saveNameInput?.value?.trim() || `tactical_sector_${Date.now()}`;
        if (!rawName.toLowerCase().endsWith(`.${format}`)) {
          rawName = `${rawName.replace(/\.[^/.]+$/, '')}.${format}`;
        }

        try {
          btnSaveSubmit.disabled = true;
          this.showToast(`☁️ Uploading ${features.length} features to Google Drive (${format.toUpperCase()})...`);

          const result = await saveTacticalLayerToDrive({
            name: rawName,
            features,
            format,
            category: 'LAYERS',
          });

          this.showToast(`✅ Saved to Google Drive: GodsEyeView/Layers/${result.name}`);
          await loadLayers();
        } catch (err) {
          this.showToast(`❌ Cloud upload failed: ${err.message}`);
        } finally {
          btnSaveSubmit.disabled = false;
        }
      });
    }
  }

  /**
   * Starts interactive 3D globe picking to place coordinates or waypoints.
   * @param {Function} callback - Receives { lon, lat }
   * @param {Object} [options={}]
   * @param {boolean} [options.continuous=false]
   */
  startGlobePicking(callback, { continuous = false } = {}) {
    this.stopGlobePicking();
    if (!this.viewer || typeof globalThis.Cesium === 'undefined') {
      const coords = getGlobeCenterCoordinates(this.viewer);
      callback(coords);
      return;
    }
    const Cesium = globalThis.Cesium;
    const canvas = this.viewer.scene?.canvas || this.viewer.canvas;
    if (!canvas) {
      const coords = getGlobeCenterCoordinates(this.viewer);
      callback(coords);
      return;
    }

    try {
      this._globePickHandler = new Cesium.ScreenSpaceEventHandler(canvas);
      this._globePickHandler.setInputAction((movement) => {
        let cartesian = null;
        try {
          const ray = this.viewer.camera?.getPickRay ? this.viewer.camera.getPickRay(movement.position) : null;
          if (ray && this.viewer.scene?.globe) {
            cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
          }
          if (!cartesian && this.viewer.camera?.pickEllipsoid) {
            cartesian = this.viewer.camera.pickEllipsoid(movement.position, this.viewer.scene?.globe?.ellipsoid);
          }
        } catch (_err) {}

        if (cartesian) {
          try {
            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(5));
            const lat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(5));
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
              callback({ lon, lat });
              if (!continuous) {
                this.stopGlobePicking();
              }
            }
          } catch (_err) {}
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch (err) {
      console.warn('[TacticalWorkbenchUi] startGlobePicking failed:', err.message);
    }
  }

  /**
   * Stops active interactive globe picking and cleans up handlers.
   */
  stopGlobePicking() {
    if (this._globePickHandler && typeof this._globePickHandler.destroy === 'function') {
      try {
        this._globePickHandler.destroy();
      } catch (_err) {}
      this._globePickHandler = null;
    }
    const singleBtn = this.host?.querySelector?.('#tw-btn-pick-globe');
    const multiBtn = this.host?.querySelector?.('#tw-btn-pick-multi-globe');
    if (singleBtn) singleBtn.classList.remove('active');
    if (multiBtn) multiBtn.classList.remove('active');
  }

  /**
   * Cleans up listeners, simulation loops, and dom bindings.
   */
  destroy() {
    this.stopGlobePicking();
    if (this._authUnsubscribe) {
      this._authUnsubscribe();
      this._authUnsubscribe = null;
    }
    if (this.geofenceEngine) {
      this.geofenceEngine.stopSimulation();
      this.geofenceEngine.stopAutomatedTelemetryMonitor();
      this._isSimulating = false;
    }
    if (this._telemetryBatchHandler && typeof window !== 'undefined') {
      window.removeEventListener('gev:telemetry-batch', this._telemetryBatchHandler);
    }
    if (this._telemetryPacketHandler && typeof window !== 'undefined') {
      window.removeEventListener('gev:telemetry-packet', this._telemetryPacketHandler);
    }
  }
}

/**
 * Escapes HTML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
