/**
 * @module src/plugins/drawing/drawingPlugin.js
 * @description Modular Drawing Plugin for Map Tools.
 * Fully integrates the tactical drawing suite into Map Tools -> Drawing:
 * 1. Line / Path (Polyline with ground clamping)
 * 2. Vector Arrow (Directional vector with bearing, distance, and arrowhead wings)
 * 3. POI Marker (Tactical pushpin point of interest)
 * 4. Waypoints (Multi-node mission route with sequential numbering and leg metrics)
 */

import { BaseTacticalPlugin, TACTICAL_ACTIONS, PLUGIN_CATEGORIES } from '../baseTacticalPlugin.js';
import { getSharedMapToolsEngine, FEATURE_TYPES, MAP_TOOLS_EVENTS } from '../../tools/mapToolsEngine.js';
import {
  TacticalCesiumDrawingSession,
  generateVectorArrowGeometry,
  generateWaypointsRoute,
} from './tacticalDrawingController.js';
import { generateRangeRingVertices } from '../../tools/geodesicMath.js';
import { loadOperatorPreset, saveOperatorPreset } from '../operatorPresetManager.js';
import { SHAPER_MODES, setShaperMode, getShaperMode } from '../../ui/shaperCadToolbar.js';
import { openRangeRingWorkbenchModal } from '../../ui/rangeRingWorkbenchModal.js';

export const DRAWING_MODES = Object.freeze({
  IDLE: 'idle',
  POLYLINE: 'polyline',
  ARROW: 'arrow',
  MARKER: 'marker',
  WAYPOINTS: 'waypoints',
  MEASURE: 'measure',
  CIRCLE: 'circle',
});

export const TACTICAL_DRAWING_COLORS = Object.freeze([
  { id: 'cyan', label: 'Cyan', hex: '#00e5ff' },
  { id: 'green', label: 'Recon Green', hex: '#10b981' },
  { id: 'amber', label: 'Warning Amber', hex: '#f59e0b' },
  { id: 'red', label: 'Hostile Red', hex: '#ef4444' },
  { id: 'purple', label: 'Violet', hex: '#a855f7' },
  { id: 'white', label: 'Grid White', hex: '#f8fafc' },
]);

export function getModeActionLabel(mode) {
  switch (mode) {
    case DRAWING_MODES.POLYLINE:
      return 'DRAW LINE / PATH';
    case DRAWING_MODES.ARROW:
      return 'DRAW VECTOR ARROW';
    case DRAWING_MODES.MARKER:
      return 'PLACE POI MARKER';
    case DRAWING_MODES.WAYPOINTS:
      return 'PLOT WAYPOINTS';
    case DRAWING_MODES.MEASURE:
      return 'MEASURE DISTANCE / BEARING';
    case DRAWING_MODES.CIRCLE:
      return 'DRAW RANGE RING';
    default:
      return 'ACTIVATE CANVAS DRAFT';
  }
}

export class DrawingPlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'drawing',
      name: 'Drawing Tools',
      version: '1.0.0',
      category: PLUGIN_CATEGORIES.DRAWING,
      icon: '✏️',
      description: 'Tactical vector lines, waypoints, arrow vectors, and POI marker placement.',
      capabilities: ['polyline', 'arrow', 'marker', 'waypoints', 'color-styling', 'cad-export'],
      defaultConfig: {
        activeMode: DRAWING_MODES.POLYLINE,
        selectedColor: '#00e5ff',
        strokeWidth: 3,
        currentLabel: 'Tactical Trace',
        prototypeVariant: 'option1', // 'option1' (Unified Expanded) or 'option2' (Contextual Flyout)
        flyoutCategory: null, // 'shape' | 'measure' | null
      },
    });

    this._engine = null;
    this._viewer = null;
    this._activeSession = null;
    this._createdEntities = [];
    this._statusText = 'Ready for drafting';
    this._prototypeVariant = 'option1';
    this._activeFlyout = null;
    this._boundUpdate = () => this._updateStats();

    // Hydrate preferences from operator preset manager if available
    try {
      const preset = loadOperatorPreset();
      if (preset?.drawing) {
        if (preset.drawing.selectedColor) this.config.selectedColor = preset.drawing.selectedColor;
        if (preset.drawing.strokeWidth) this.config.strokeWidth = preset.drawing.strokeWidth;
      }
    } catch (_e) {}
  }

  async install(context) {
    await super.install(context);
    this._viewer = context.viewer || (typeof window !== 'undefined' ? window.viewer : null);
    this._engine = context.engine || (this._viewer ? getSharedMapToolsEngine(this._viewer) : null);

    if (this._engine) {
      this._engine.on(MAP_TOOLS_EVENTS.CREATE, this._boundUpdate);
      this._engine.on(MAP_TOOLS_EVENTS.UPDATE, this._boundUpdate);
      this._engine.on(MAP_TOOLS_EVENTS.DELETE, this._boundUpdate);
    }
  }

  activate() {
    super.activate();
    this._statusText = `Drawing tool active: ${this.config.activeMode.toUpperCase()}`;
    this._renderStatus();
  }

  deactivate() {
    super.deactivate();
    this.cancelActiveDraft();
  }

  async uninstall() {
    this.cancelActiveDraft();
    if (this._engine) {
      this._engine.off(MAP_TOOLS_EVENTS.CREATE, this._boundUpdate);
      this._engine.off(MAP_TOOLS_EVENTS.UPDATE, this._boundUpdate);
      this._engine.off(MAP_TOOLS_EVENTS.DELETE, this._boundUpdate);
    }
    await super.uninstall();
  }

  /**
   * Sets the active drawing mode ('polyline' | 'arrow' | 'marker' | 'waypoints').
   * @param {string} mode
   */
  setMode(mode) {
    this.config.activeMode = mode;
    this.cancelActiveDraft();

    // Sync with global shaper toolbar & MapProjectManager
    if (typeof setShaperMode === 'function') {
      if (mode === DRAWING_MODES.POLYLINE || mode === DRAWING_MODES.ARROW) {
        setShaperMode(SHAPER_MODES.DRAW_POLYLINE, true);
      } else if (mode === DRAWING_MODES.MARKER) {
        setShaperMode(SHAPER_MODES.DRAW_MARKER, true);
      } else if (mode === DRAWING_MODES.WAYPOINTS) {
        setShaperMode(SHAPER_MODES.GROUND_OBSERVER, true);
      }
    }

    this._renderModeButtons();
    this._updateStartButton();

    const modeMetric = this.container?.querySelector('#drawing-active-mode-metric');
    if (modeMetric) modeMetric.textContent = mode.toUpperCase();

    const modeNames = {
      [DRAWING_MODES.POLYLINE]: 'Line / Path',
      [DRAWING_MODES.ARROW]: 'Vector Arrow',
      [DRAWING_MODES.MARKER]: 'POI Marker',
      [DRAWING_MODES.WAYPOINTS]: 'Waypoint Route',
    };
    const friendlyName = modeNames[mode] || mode.toUpperCase();
    this._statusText = `${friendlyName} Active — ready for drafting`;
    this._renderStatus();
  }

  /**
   * Cancels any in-progress drafting session.
   */
  cancelActiveDraft() {
    if (this._activeSession) {
      this._activeSession.cancel();
      this._activeSession = null;
    }
    this._statusText = 'Draft reset';
    this._renderStatus();
  }

  /**
   * Launches active interactive drafting session on the 3D globe.
   */
  startInteractiveDraft() {
    this.cancelActiveDraft();

    const mode = this.config.activeMode;
    const viewer = this._viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);
    if (viewer && !this._viewer) {
      this._viewer = viewer;
    }

    this._statusText = `Drafting active for ${mode.toUpperCase()}...`;
    this._renderStatus();

    if (!viewer || typeof Cesium === 'undefined') {
      // Non-browser or headless simulation: create feature directly
      this._simulateDraftCompletion(mode);
      return;
    }

    this._activeSession = new TacticalCesiumDrawingSession({
      viewer,
      mode,
      color: this.config.selectedColor,
      strokeWidth: this.config.strokeWidth,
      label: this.config.currentLabel,
      onUpdate: (data) => {
        if (data.status) {
          this._statusText = data.status;
          this._renderStatus();
        }
      },
      onComplete: (result) => {
        this._activeSession = null;
        this._handleDraftComplete(result);
      },
      onCancel: () => {
        this._activeSession = null;
        this._statusText = 'Draft cancelled';
        this._renderStatus();
      },
    });
  }

  _simulateDraftCompletion(mode) {
    const coords = [
      { lng: -122.4194, lat: 37.7749, alt: 10 },
      { lng: -122.3894, lat: 37.7849, alt: 15 },
    ];

    if (mode === DRAWING_MODES.MARKER) {
      this._handleDraftComplete({
        type: 'marker',
        name: 'Simulated POI Marker',
        coordinates: [coords[0]],
        color: this.config.selectedColor,
      });
    } else if (mode === DRAWING_MODES.ARROW) {
      const arrowData = generateVectorArrowGeometry(coords[0], coords[1]);
      this._handleDraftComplete({
        type: 'arrow',
        name: 'Simulated Vector Arrow',
        coordinates: coords,
        color: this.config.selectedColor,
        strokeWidth: this.config.strokeWidth,
        arrowData,
      });
    } else if (mode === DRAWING_MODES.WAYPOINTS) {
      const routeData = generateWaypointsRoute([coords[0], coords[1], { lng: -122.35, lat: 37.79 }]);
      this._handleDraftComplete({
        type: 'waypoints',
        name: 'Simulated Waypoint Route',
        coordinates: [coords[0], coords[1], { lng: -122.35, lat: 37.79 }],
        color: this.config.selectedColor,
        strokeWidth: this.config.strokeWidth,
        routeData,
      });
    } else if (mode === DRAWING_MODES.CIRCLE) {
      this._handleDraftComplete({
        type: 'circle',
        name: 'Simulated Range Ring',
        coordinates: coords,
        center: coords[0],
        radiusMeters: 5000,
        radiusKm: 5.0,
        radiusNm: 2.7,
        color: this.config.selectedColor,
      });
    } else if (mode === DRAWING_MODES.MEASURE) {
      this._handleDraftComplete({
        type: 'measure',
        name: 'Simulated Geodesic Ruler',
        coordinates: coords,
        color: this.config.selectedColor,
        distanceMeters: 3500,
        distanceKm: 3.5,
        distanceNm: 1.9,
        bearingDeg: 45,
      });
    } else {
      this._handleDraftComplete({
        type: 'polyline',
        name: 'Simulated Line',
        coordinates: coords,
        color: this.config.selectedColor,
        strokeWidth: this.config.strokeWidth,
      });
    }
  }

  _handleDraftComplete(result) {
    const color = result.color || this.config.selectedColor;
    const strokeWidth = result.strokeWidth || this.config.strokeWidth;
    const viewer = this._viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);
    if (viewer && !this._viewer) {
      this._viewer = viewer;
    }

    // 1. Commit to 3D Globe entities if Cesium is available
    if (this._viewer && typeof Cesium !== 'undefined') {
      const cesiumColor = Cesium.Color.fromCssColorString(color);

      if (result.type === 'marker') {
        const pt = result.coordinates[0];
        const ent = this._viewer.entities.add({
          name: result.name || 'Point of Interest',
          position: Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, pt.alt || 1),
          point: {
            pixelSize: 14,
            color: cesiumColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: result.name || 'POI Marker',
            font: '12px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this._createdEntities.push(ent);
      } else if (result.type === 'arrow' && result.arrowData) {
        const shaftPositions = result.arrowData.shaft.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
        const headPositions = result.arrowData.arrowhead.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));

        const shaftEnt = this._viewer.entities.add({
          name: `${result.name} (Shaft)`,
          polyline: {
            positions: shaftPositions,
            width: strokeWidth + 1,
            material: cesiumColor,
            clampToGround: true,
          },
        });
        const headEnt = this._viewer.entities.add({
          name: `${result.name} (Head)`,
          polyline: {
            positions: headPositions,
            width: strokeWidth + 2,
            material: cesiumColor,
            clampToGround: true,
          },
        });
        // Tactical label along vector
        const midLng = (result.arrowData.origin.lng + result.arrowData.target.lng) / 2;
        const midLat = (result.arrowData.origin.lat + result.arrowData.target.lat) / 2;
        const labelEnt = this._viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 1),
          label: {
            text: result.arrowData.label,
            font: '11px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this._createdEntities.push(shaftEnt, headEnt, labelEnt);
      } else if (result.type === 'measure') {
        const positions = result.coordinates.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
        const lineEnt = this._viewer.entities.add({
          name: result.name,
          polyline: {
            positions,
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#c084fc'),
              dashLength: 14,
            }),
            clampToGround: true,
          },
        });
        const midLng = (result.coordinates[0].lng + result.coordinates[1].lng) / 2;
        const midLat = (result.coordinates[0].lat + result.coordinates[1].lat) / 2;
        const labelEnt = this._viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 1),
          label: {
            text: `📏 ${result.distanceNm.toFixed(1)} NM (${result.distanceKm.toFixed(1)} km) · HDG ${Math.round(result.bearingDeg).toString().padStart(3, '0')}°`,
            font: '11px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this._createdEntities.push(lineEnt, labelEnt);
      } else if (result.type === 'circle' && result.center) {
        // Semi-transparent ellipse fill
        const circleEnt = this._viewer.entities.add({
          name: result.name,
          position: Cesium.Cartesian3.fromDegrees(result.center.lng, result.center.lat, 1),
          ellipse: {
            semiMinorAxis: result.radiusMeters,
            semiMajorAxis: result.radiusMeters,
            material: cesiumColor.withAlpha(0.25),
            outline: true,
            outlineColor: cesiumColor,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });

        // Crisp ground-clamped polyline perimeter ring
        const ringVerts = generateRangeRingVertices(result.center, result.radiusMeters, 64);
        const ringPositions = ringVerts.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 2));
        const ringPolyline = this._viewer.entities.add({
          name: `${result.name} (Perimeter)`,
          polyline: {
            positions: ringPositions,
            width: strokeWidth > 2 ? strokeWidth : 2.5,
            material: cesiumColor,
            clampToGround: true,
          },
        });

        // Center point pushpin dot
        const centerDot = this._viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(result.center.lng, result.center.lat, 2),
          point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE,
            outlineColor: cesiumColor,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        // Range ring label
        const labelEnt = this._viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(result.center.lng, result.center.lat, 2),
          label: {
            text: `⭕ ${result.name}`,
            font: '11px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this._createdEntities.push(circleEnt, ringPolyline, centerDot, labelEnt);

        // Fly camera to created Range Ring center
        try {
          if (this._viewer.camera) {
            const radiusM = Number(result.radiusMeters) || 5000;
            const alt = Math.max(1200, radiusM * 3.2);
            this._viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(result.center.lng, result.center.lat, alt),
              orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
              },
              duration: 1.5,
            });
          }
        } catch (_e) {}
      } else if (result.type === 'waypoints' && result.routeData) {
        const positions = result.coordinates.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 1));
        const routeEnt = this._viewer.entities.add({
          name: result.name,
          polyline: {
            positions,
            width: strokeWidth,
            material: new Cesium.PolylineOutlineMaterialProperty({
              color: cesiumColor,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
              outlineWidth: 1.5,
            }),
            clampToGround: true,
          },
        });
        this._createdEntities.push(routeEnt);

        // Add waypoint pin nodes
        result.routeData.waypoints.forEach((wp) => {
          const wpEnt = this._viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, wp.alt || 1),
            point: {
              pixelSize: 12,
              color: Cesium.Color.WHITE,
              outlineColor: cesiumColor,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${wp.id} (${(Number(wp.cumulativeDistanceKm) || 0).toFixed(1)} km)`,
              font: '10px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          this._createdEntities.push(wpEnt);
        });
      } else {
        // Standard Polyline
        const positions = result.coordinates.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 1));
        const lineEnt = this._viewer.entities.add({
          name: result.name || 'Line / Path',
          polyline: {
            positions,
            width: strokeWidth,
            material: cesiumColor,
            clampToGround: true,
          },
        });
        this._createdEntities.push(lineEnt);
      }
    }

    // 2. Commit to MapToolsEngine if present
    if (this._engine) {
      if (result.type === 'circle' && result.center) {
        this._engine.createFeature({
          type: FEATURE_TYPES.CIRCLE,
          name: result.name,
          coordinates: { center: [result.center.lng, result.center.lat, result.center.alt || 0], radiusMeters: result.radiusMeters },
          properties: {
            color,
            strokeWidth,
            drawingSubtype: 'circle',
            radiusMeters: result.radiusMeters,
            radiusKm: result.radiusKm,
            radiusNm: result.radiusNm,
          },
        });
      } else {
        const featureType = result.type === 'marker' ? FEATURE_TYPES.POINT : FEATURE_TYPES.LINE;
        const flatCoords = (result.coordinates || []).map((c) => [c.lng, c.lat, c.alt || 0]);
        this._engine.createFeature({
          type: featureType,
          name: result.name,
          coordinates: result.type === 'marker' ? flatCoords[0] : flatCoords,
          properties: {
            color,
            strokeWidth,
            drawingSubtype: result.type,
            arrowData: result.arrowData || null,
            routeData: result.routeData || null,
          },
        });
      }
    }

    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, {
      feature: result,
      name: result.name,
      type: result.type,
    });

    this._statusText = `Created ${result.name} (${result.type.toUpperCase()})`;
    this._renderStatus();
    this._updateStats();
  }

  render(container) {
    super.render(container);
    if (!container) return;

    const activeMode = this.config.activeMode || DRAWING_MODES.POLYLINE;
    const btnLabel = getModeActionLabel(activeMode);
    const currentShaperMode = getShaperMode?.() || SHAPER_MODES.SELECT_MODIFY;

    container.innerHTML = `
      <div class="plugin-module-wrapper drawing-plugin-root">
        <!-- 1. The Working Drawing Tools Toolbar -->
        <div class="working-drawing-tools-card mb-3 p-2 bg-slate-900/80 border border-slate-700/60 rounded-xl shadow-lg">
          <div class="flex items-center justify-between mb-2 px-1">
            <div class="text-[10px] font-mono tracking-widest text-emerald-400 font-semibold uppercase flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>WORKING DRAWING TOOLS</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" id="drawing-open-workbench-modal-btn" class="text-[10px] text-cyan-300 hover:text-white font-mono font-bold flex items-center gap-1 transition cursor-pointer px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 shadow" title="Open Isolated Range Ring & Standoff Buffer Test Suite Dialog">
                <span>⭕</span> <span>ISOLATED WORKBENCH</span>
              </button>
              <button type="button" id="drawing-help-guide-btn" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-cyan-500/30" title="View Step-by-Step Instructions & Shortcuts">
                <span>📖</span> <span>GUIDE</span>
              </button>
              <button type="button" id="drawing-toggle-float-btn" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-cyan-500/30" title="Toggle between embedded in panel and floating on 3D globe">
                <span class="material-symbols-outlined text-[12px]" id="drawing-float-icon">open_in_new</span>
                <span id="drawing-float-btn-label">FLOAT ON MAP</span>
              </button>
            </div>
          </div>

          <!-- UNIFIED EXPANDED WORKING TOOLS CAPSULE (All-in-One Tactical Suite) -->
          <div id="working-drawing-tools-capsule" class="shaper-bar-inner unified-expanded flex items-center justify-center p-1.5 bg-[#0b1329]/95 border border-slate-700/80 rounded-2xl shadow-xl backdrop-blur-md select-none overflow-x-auto" role="toolbar" aria-label="Working Drawing Tools Toolbar">
            <!-- Group 1: Navigation & Select -->
            <button type="button" class="shaper-tool-btn shaper-btn-teal ${currentShaperMode === SHAPER_MODES.PAN ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.PAN}" title="Pan / Free Orbit Navigation">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
                <path d="M12 2a1.5 1.5 0 0 0-1.5 1.5v6.5a.5.5 0 0 1-1 0V3.5a1.5 1.5 0 0 0-3 0v6.5a.5.5 0 0 1-1 0V5.5a1.5 1.5 0 0 0-3 0v8.5a7.5 7.5 0 0 0 15 0V7.5a1.5 1.5 0 0 0-3 0v2.5a.5.5 0 0 1-1 0V3.5A1.5 1.5 0 0 0 12 2z"/>
              </svg>
              <span class="sr-only">Pan</span>
            </button>

            <button type="button" class="shaper-tool-btn shaper-btn-amber ${currentShaperMode === SHAPER_MODES.SELECT_MODIFY ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.SELECT_MODIFY}" title="Select & Modify (Inspect properties & drag vertices)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
                <path d="M4 2.5l14 9.5-6.5 1.5 3.8 6.5-2.2 1.2-3.8-6.5L4 20V2.5z"/>
              </svg>
              <span class="sr-only">Select / Modify</span>
            </button>

            <div class="w-[1px] h-6 bg-slate-700/80 mx-0.5"></div>

            <!-- Group 2: Geometry & Shapes -->
            <button type="button" class="shaper-tool-btn shaper-btn-teal ${currentShaperMode === SHAPER_MODES.DRAW_POLYGON ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.DRAW_POLYGON}" title="Draft Polygon / Perimeter Zone (Enclosed Area)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="1.8">
                <polygon points="5,7 19,4 20,18 7,19" fill="currentColor" fill-opacity="0.25"/>
                <circle cx="5" cy="7" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="19" cy="4" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="20" cy="18" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="7" cy="19" r="2.2" fill="#fff" stroke="currentColor"/>
              </svg>
              <span class="sr-only">Polygon</span>
            </button>

            <button type="button" class="shaper-tool-btn shaper-btn-teal ${activeMode === DRAWING_MODES.POLYLINE && currentShaperMode === SHAPER_MODES.DRAW_POLYLINE ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.DRAW_POLYLINE}" title="Draft Polyline / Line / Path (Vector Path)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4,18 10,7 16,13 20,6"/>
                <circle cx="4" cy="18" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="10" cy="7" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="16" cy="13" r="2.2" fill="#fff" stroke="currentColor"/>
                <circle cx="20" cy="6" r="2.2" fill="#fff" stroke="currentColor"/>
              </svg>
              <span class="sr-only">Polyline</span>
            </button>

            <button type="button" class="shaper-tool-btn shaper-btn-teal ${activeMode === DRAWING_MODES.ARROW ? 'active' : ''}" data-shaper-tool="draw-arrow" title="Draft Vector Arrow (Directional Vector)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="19" x2="18" y2="6"/>
                <polyline points="10,5 19,5 19,14" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="5" cy="19" r="2.2" fill="#fff" stroke="currentColor"/>
              </svg>
              <span class="sr-only">Vector Arrow</span>
            </button>

            <!-- Circle / Standoff Ring Range -->
            <button type="button" class="shaper-tool-btn shaper-btn-teal ${activeMode === DRAWING_MODES.CIRCLE ? 'active' : ''}" data-shaper-tool="draw-circle" title="Draft Circle / Standoff Ring Range (Buffer Zone)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="1.9">
                <circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.2"/>
                <circle cx="12" cy="12" r="2" fill="#fff"/>
                <line x1="12" y1="12" x2="20" y2="12" stroke-dasharray="2 1"/>
              </svg>
              <span class="sr-only">Circle / Standoff Ring Range</span>
            </button>

            <div class="w-[1px] h-6 bg-slate-700/80 mx-0.5"></div>

            <!-- Group 3: Tactical Mark & Measure -->
            <button type="button" class="shaper-tool-btn shaper-btn-olive ${activeMode === DRAWING_MODES.MARKER && currentShaperMode === SHAPER_MODES.DRAW_MARKER ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.DRAW_MARKER}" title="Drop Point of Interest (Tactical Pushpin)">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
                <path d="M16 12V4h1V2H7v2h1v8l-3 3v2h6.5v6l1.5 1 1.5-1v-6H19v-2l-3-3z"/>
              </svg>
              <span class="sr-only">POI Marker</span>
            </button>

            <button type="button" class="shaper-tool-btn shaper-btn-olive ${activeMode === DRAWING_MODES.WAYPOINTS && currentShaperMode === SHAPER_MODES.GROUND_OBSERVER ? 'active' : ''}" data-shaper-tool="${SHAPER_MODES.GROUND_OBSERVER}" title="Ground Observer & Waypoints Route">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
                <circle cx="12" cy="5" r="2.8"/>
                <path d="M15 9H9c-1.1 0-2 .9-2 2v4h2v6h2v-6h2v6h2v-6h2v-4c0-1.1-.9-2-2-2z"/>
              </svg>
              <span class="sr-only">Ground Observer</span>
            </button>

            <!-- Measure Tape / Geodesic Ruler -->
            <button type="button" class="shaper-tool-btn shaper-btn-violet ${activeMode === DRAWING_MODES.MEASURE ? 'active' : ''}" data-shaper-tool="draw-measure" title="Measure: Geodesic Distance & Compass Heading">
              <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="21" x2="21" y2="3"/>
                <line x1="8" y1="16" x2="10" y2="18"/>
                <line x1="12" y1="12" x2="14" y2="14"/>
                <line x1="16" y1="8" x2="18" y2="10"/>
                <circle cx="3" cy="21" r="1.5" fill="#fff"/>
                <circle cx="21" cy="3" r="1.5" fill="#fff"/>
              </svg>
              <span class="sr-only">Measure Tape</span>
            </button>
          </div>
        </div>

        <!-- Color Palette & Stroke Width -->
        <div class="plugin-section-label mt-2">TACTICAL STYLING</div>
        <div class="plugin-style-row">
          <div class="plugin-color-swatches" role="radiogroup" aria-label="Stroke Color">
            ${TACTICAL_DRAWING_COLORS.map(
              (c) => `
              <button type="button" class="plugin-color-dot ${c.hex === this.config.selectedColor ? 'selected' : ''}" 
                data-hex="${c.hex}" title="${c.label}" style="background-color: ${c.hex};" aria-label="${c.label}">
              </button>
            `
            ).join('')}
          </div>
          <div class="plugin-stroke-control">
            <span class="plugin-mini-tag">WIDTH</span>
            <input type="range" class="plugin-slider" id="drawing-stroke-slider" min="1" max="10" value="${this.config.strokeWidth}" />
            <span id="drawing-stroke-val" class="plugin-slider-val">${this.config.strokeWidth}px</span>
          </div>
        </div>

        <!-- Interactive Action Bar -->
        <div class="plugin-action-group mt-3">
          <button type="button" id="drawing-start-btn" class="plugin-action-btn primary" title="Launch Interactive CAD Drafting on Globe">
            <span class="btn-icon">⚡</span> <span id="drawing-start-btn-label">${btnLabel}</span>
          </button>
          <button type="button" id="drawing-clear-btn" class="plugin-action-btn danger" title="Clear or cancel drafting">
            RESET
          </button>
        </div>

        <!-- Real-time Stats & Feed -->
        <div class="plugin-status-card mt-3">
          <div class="plugin-status-row">
            <span class="plugin-status-header">STATUS</span>
            <span id="drawing-status-readout" class="plugin-status-badge">${this._statusText}</span>
          </div>
          <div class="plugin-metric-grid mt-1">
            <div class="metric-item">
              <span class="metric-label">SAVED TRACES</span>
              <span id="drawing-count-metric" class="metric-value">0</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">ACTIVE MODE</span>
              <span id="drawing-active-mode-metric" class="metric-value font-mono">${activeMode.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
    this._updateStats();
  }

  _bindEvents() {
    if (!this.container) return;

    // Working Drawing Tools Capsule Button Handler
    const capsuleBtns = this.container.querySelectorAll('[data-shaper-tool]');
    capsuleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const shaperTool = btn.dataset.shaperTool;
        capsuleBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Sync with global shaper toolbar & MapProjectManager
        if (typeof setShaperMode === 'function') {
          setShaperMode(shaperTool, true);
        }

        if (shaperTool === SHAPER_MODES.PAN) {
          this.cancelActiveDraft();
          this._statusText = 'Pan / Orbit Mode Active';
          this._renderStatus();
        } else if (shaperTool === SHAPER_MODES.SELECT_MODIFY) {
          this.cancelActiveDraft();
          this._statusText = 'Select / Modify Mode Active';
          this._renderStatus();
        } else if (shaperTool === SHAPER_MODES.DRAW_POLYGON) {
          this.cancelActiveDraft();
          this._statusText = 'Polygon Drafting Active';
          this._renderStatus();
        } else if (shaperTool === SHAPER_MODES.DRAW_POLYLINE) {
          this.setMode(DRAWING_MODES.POLYLINE);
          this.startInteractiveDraft();
        } else if (shaperTool === 'draw-arrow') {
          this.setMode(DRAWING_MODES.ARROW);
          this.startInteractiveDraft();
        } else if (shaperTool === SHAPER_MODES.DRAW_MARKER) {
          this.setMode(DRAWING_MODES.MARKER);
          this.startInteractiveDraft();
        } else if (shaperTool === SHAPER_MODES.GROUND_OBSERVER) {
          this.setMode(DRAWING_MODES.WAYPOINTS);
          this.startInteractiveDraft();
        } else if (shaperTool === 'draw-measure' || shaperTool === 'measure-azimuth') {
          this.setMode(DRAWING_MODES.MEASURE);
          this.startInteractiveDraft();
        } else if (shaperTool === 'draw-circle') {
          this.setMode(DRAWING_MODES.CIRCLE);
          this.startInteractiveDraft();
        }
      });
    });

    // Float / Dock Toggle Button Handler
    const floatToggleBtn = this.container.querySelector('#drawing-toggle-float-btn');
    const floatIcon = this.container.querySelector('#drawing-float-icon');
    const floatLabel = this.container.querySelector('#drawing-float-btn-label');
    const floatingToolbar = typeof document !== 'undefined' ? document.getElementById('shaper-cad-toolbar') : null;

    // Sync initial label with whether floating toolbar has force-floating
    if (floatingToolbar?.classList.contains('force-floating')) {
      if (floatLabel) floatLabel.textContent = 'DOCK IN PANEL';
      if (floatIcon) floatIcon.textContent = 'vertical_align_bottom';
    }

    floatToggleBtn?.addEventListener('click', () => {
      const isFloating = floatingToolbar?.classList.toggle('force-floating');
      if (floatLabel) {
        floatLabel.textContent = isFloating ? 'DOCK IN PANEL' : 'FLOAT ON MAP';
      }
      if (floatIcon) {
        floatIcon.textContent = isFloating ? 'vertical_align_bottom' : 'open_in_new';
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('gev:toast', {
            detail: {
              text: isFloating ? 'Working Drawing Tools floating on 3D globe.' : 'Working Drawing Tools docked in Map Tools -> Drawing.',
            },
          })
        );
      }
    });

    // Open Isolated Range Ring Workbench Dialog
    const openWorkbenchModalBtn = this.container.querySelector('#drawing-open-workbench-modal-btn');
    openWorkbenchModalBtn?.addEventListener('click', () => {
      openRangeRingWorkbenchModal(this._viewer || (typeof window !== 'undefined' ? window.viewer : null));
    });

    // Inline Help Guide Button Handler
    const helpGuideBtn = this.container.querySelector('#drawing-help-guide-btn');
    helpGuideBtn?.addEventListener('click', () => {
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

    // Color Swatches
    const dots = this.container.querySelectorAll('.plugin-color-dot');
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        dots.forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
        this.config.selectedColor = dot.dataset.hex;
        try {
          saveOperatorPreset({ drawing: { selectedColor: this.config.selectedColor } });
        } catch (_e) {}
      });
    });

    // Stroke slider
    const slider = this.container.querySelector('#drawing-stroke-slider');
    const valText = this.container.querySelector('#drawing-stroke-val');
    slider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.config.strokeWidth = val;
      if (valText) valText.textContent = `${val}px`;
      try {
        saveOperatorPreset({ drawing: { strokeWidth: val } });
      } catch (_e) {}
    });

    // Launch Interactive CAD Drafting
    const startBtn = this.container.querySelector('#drawing-start-btn');
    startBtn?.addEventListener('click', () => {
      this.startInteractiveDraft();
    });

    // Reset
    const clearBtn = this.container.querySelector('#drawing-clear-btn');
    clearBtn?.addEventListener('click', () => {
      this.cancelActiveDraft();
      // Clear visual draft entities created during session
      if (this._viewer && this._createdEntities.length > 0) {
        for (const ent of this._createdEntities) {
          this._viewer.entities.remove(ent);
        }
        this._createdEntities = [];
      }
      this._statusText = 'Draft reset';
      this._renderStatus();
      this._updateStats();
    });
  }

  _updateStartButton() {
    if (!this.container) return;
    const labelEl = this.container.querySelector('#drawing-start-btn-label');
    if (labelEl) {
      labelEl.textContent = getModeActionLabel(this.config.activeMode);
    }
  }

  _renderStatus() {
    if (!this.container) return;
    const readout = this.container.querySelector('#drawing-status-readout');
    if (readout) readout.textContent = this._statusText;
  }

  _renderModeButtons() {
    if (!this.container) return;
    const modeBtns = this.container.querySelectorAll('.plugin-mode-btn');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.config.activeMode);
    });
  }

  _updateStats() {
    if (!this.container) return;
    const countEl = this.container.querySelector('#drawing-count-metric');
    if (countEl) {
      if (this._engine) {
        const all = this._engine.getAllFeatures();
        const lines = all.filter((f) => f.type === FEATURE_TYPES.LINE || f.type === FEATURE_TYPES.POINT);
        countEl.textContent = String(lines.length + this._createdEntities.length);
      } else {
        countEl.textContent = String(this._createdEntities.length);
      }
    }
  }
}
