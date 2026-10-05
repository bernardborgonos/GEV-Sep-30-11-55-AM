/**
 * @module src/plugins/measurements/measurementsPlugin.js
 * @description Modular Measurements Plugin Placeholder for Tactical Map Tools.
 *
 * Measure: All inner operational tools deleted; cleanly maintained as a lightweight placeholder.
 */

import { BaseTacticalPlugin, PLUGIN_CATEGORIES, TACTICAL_ACTIONS } from '../baseTacticalPlugin.js';
import {
  haversineDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
  initialBearing,
} from '../../tools/geodesicMath.js';

export const MEASUREMENT_TYPES = Object.freeze({
  DISTANCE: 'distance',
  AREA: 'area',
  BEARING: 'bearing',
  ELEVATION: 'elevation',
});

export const MEASUREMENT_UNITS = Object.freeze({
  NAUTICAL: 'nm',
  METRIC: 'metric',
  IMPERIAL: 'imperial',
});

export class MeasurePlugin extends BaseTacticalPlugin {
  constructor() {
    super({
      id: 'measurements',
      name: 'Measurements',
      version: '2.0.0',
      category: PLUGIN_CATEGORIES.MEASUREMENT,
      icon: '📐',
      description: 'Tactical WGS84 Geodesic Distance and Real-time Polygon Area calculation suite.',
      capabilities: ['distance-measurement', 'area-calculation', 'bearing-azimuth', 'elevation-readout', 'unit-switching'],
      defaultConfig: {
        activeType: MEASUREMENT_TYPES.DISTANCE,
        unit: MEASUREMENT_UNITS.METRIC,
      },
    });

    this._measuredMetrics = {
      distanceMeters: 0,
      distanceKm: 0,
      distanceNm: 0,
      areaM2: 0,
      areaKm2: 0,
      areaHectares: 0,
      areaAcres: 0,
      areaNm2: 0,
      perimeterMeters: 0,
      perimeterKm: 0,
      bearingDeg: 0,
      elevationMeters: 0,
      pointCount: 0,
    };

    this._measurementHistory = [];
    this._activeMeasurementPoints = [];
    this._draftEntities = [];
    this._createdEntities = [];
    this._activePickingHandler = null;
    this._escapeKeyHandler = null;
    this._statusText = 'Ready: Select Distance or Area to start measuring';
  }

  armPickingSession({
    cursor = 'crosshair',
    onLeftClick = null,
    onMouseMove = null,
    onDoubleClick = null,
    onRightClick = null,
    onEscape = null,
  } = {}) {
    this.abortPickingSession();

    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);

    // 1. Cesium 3D Globe Support
    if (viewer && viewer.scene && viewer.scene.canvas && typeof Cesium !== 'undefined') {
      try {
        viewer.scene.canvas.style.cursor = cursor;
      } catch (_) {}

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      this._activePickingHandler = handler;

      const pickGlobePosition = (pixel) => {
        if (!viewer || !viewer.scene || !pixel) return null;
        try {
          const ray = viewer.camera.getPickRay(pixel);
          if (!ray) return null;
          const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
          if (!cartesian) return null;
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          return {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lng: Cesium.Math.toDegrees(carto.longitude),
            alt: carto.height || 0,
          };
        } catch (_) {
          return null;
        }
      };

      if (onLeftClick) {
        handler.setInputAction((click) => {
          if (!click?.position) return;
          const coord = pickGlobePosition(click.position);
          if (coord) onLeftClick(coord);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }

      if (onMouseMove) {
        handler.setInputAction((movement) => {
          if (!movement?.endPosition) return;
          const coord = pickGlobePosition(movement.endPosition);
          if (coord) onMouseMove(coord);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      }

      if (onDoubleClick) {
        handler.setInputAction((click) => {
          if (!click?.position) return;
          const coord = pickGlobePosition(click.position);
          if (coord) onDoubleClick(coord);
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      }

      if (onRightClick) {
        handler.setInputAction(() => {
          if (onRightClick) onRightClick();
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
      }

      this._escapeKeyHandler = (e) => {
        if (e.key === 'Escape') {
          if (onEscape) onEscape();
        }
      };
      window.addEventListener('keydown', this._escapeKeyHandler);

      return handler;
    }

    // 2. Leaflet 2D Map Fallback
    const leafletMap = typeof window !== 'undefined' ? (window.map || window._leafletMap) : null;
    if (leafletMap && typeof leafletMap.on === 'function') {
      const clickHandler = (e) => {
        if (onLeftClick && e.latlng) {
          onLeftClick({ lat: e.latlng.lat, lng: e.latlng.lng, alt: 0 });
        }
      };
      const moveHandler = (e) => {
        if (onMouseMove && e.latlng) {
          onMouseMove({ lat: e.latlng.lat, lng: e.latlng.lng, alt: 0 });
        }
      };
      const dblClickHandler = (e) => {
        if (onDoubleClick && e.latlng) {
          onDoubleClick({ lat: e.latlng.lat, lng: e.latlng.lng, alt: 0 });
        }
      };
      const contextMenuHandler = () => {
        if (onRightClick) onRightClick();
      };

      leafletMap.on('click', clickHandler);
      leafletMap.on('mousemove', moveHandler);
      leafletMap.on('dblclick', dblClickHandler);
      leafletMap.on('contextmenu', contextMenuHandler);

      this._activePickingHandler = {
        destroy: () => {
          leafletMap.off('click', clickHandler);
          leafletMap.off('mousemove', moveHandler);
          leafletMap.off('dblclick', dblClickHandler);
          leafletMap.off('contextmenu', contextMenuHandler);
        },
      };

      this._escapeKeyHandler = (e) => {
        if (e.key === 'Escape') {
          if (onEscape) onEscape();
        }
      };
      window.addEventListener('keydown', this._escapeKeyHandler);

      return this._activePickingHandler;
    }

    return null;
  }

  abortPickingSession() {
    if (this._activePickingHandler) {
      try {
        this._activePickingHandler.destroy?.();
      } catch (_) {}
      this._activePickingHandler = null;
    }

    if (this._escapeKeyHandler) {
      try {
        window.removeEventListener('keydown', this._escapeKeyHandler);
      } catch (_) {}
      this._escapeKeyHandler = null;
    }

    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (viewer?.scene?.canvas) {
      try {
        viewer.scene.canvas.style.cursor = 'default';
      } catch (_) {}
    }
  }

  addDraftEntity(entity) {
    if (!this._draftEntities) this._draftEntities = [];
    if (entity) this._draftEntities.push(entity);
  }

  clearDraftEntities() {
    if (this._draftEntities && Array.isArray(this._draftEntities)) {
      const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
      if (viewer && viewer.entities) {
        for (const ent of this._draftEntities) {
          try {
            viewer.entities.remove(ent);
          } catch (_) {}
        }
      }
      this._draftEntities = [];
    }
  }

  addCreatedEntity(entity) {
    if (!this._createdEntities) this._createdEntities = [];
    if (entity) this._createdEntities.push(entity);
  }

  clearAllCreatedEntities() {
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

  setMeasuredCoordinates(points = []) {
    this._measuredMetrics.pointCount = points.length;
    if (points.length >= 2) {
      const p1 = points[0];
      const p2 = points[1];
      const distM = haversineDistance(p1, p2, 'm');
      const distKm = distM / 1000;
      const distNm = distM / 1852;
      const brg = initialBearing(p1, p2);

      this._measuredMetrics.distanceMeters = distM;
      this._measuredMetrics.distanceKm = distKm;
      this._measuredMetrics.distanceNm = distNm;
      this._measuredMetrics.bearingDeg = brg;

      if (points.length >= 3) {
        const areaMetrics = calculatePolygonGeodesicArea(points);
        const perimMetrics = calculatePolygonPerimeter(points);
        this._measuredMetrics.areaM2 = areaMetrics.areaSquareMeters;
        this._measuredMetrics.areaKm2 = areaMetrics.areaSquareKm;
        this._measuredMetrics.areaHectares = areaMetrics.areaHectares;
        this._measuredMetrics.areaAcres = areaMetrics.areaSquareMeters * 0.000247105;
        this._measuredMetrics.areaNm2 = areaMetrics.areaSquareNm;
        this._measuredMetrics.perimeterMeters = perimMetrics.perimeterMeters;
        this._measuredMetrics.perimeterKm = perimMetrics.perimeterKm;
      }
    }
  }

  activate() {
    super.activate();
    this._statusText = `Measure tool active: ${this.config.activeType.toUpperCase()}`;
    this._renderStatus();
  }

  deactivate() {
    this.cancelActiveSession();
    super.deactivate();
  }

  cancelActiveSession() {
    this.abortPickingSession();
    this._activeMeasurementPoints = [];
    this.clearDraftEntities();
    this._statusText = 'Measurement standby';
    this._renderStatus();
  }

  clearAllMeasurements() {
    this.cancelActiveSession();
    this.clearAllCreatedEntities();
    this._measuredMetrics = {
      distanceMeters: 0,
      distanceKm: 0,
      distanceNm: 0,
      areaM2: 0,
      areaKm2: 0,
      areaHectares: 0,
      areaAcres: 0,
      areaNm2: 0,
      perimeterMeters: 0,
      perimeterKm: 0,
      bearingDeg: 0,
      elevationMeters: 0,
      pointCount: 0,
    };
    this._measurementHistory = [];
    this._updateReadoutCards();
    this._updateHistoryList();
    this._statusText = 'Cleared all measurements';
    this._renderStatus();
  }

  startInteractiveMeasurement(type) {
    this.cancelActiveSession();
    this.config.activeType = type;
    this._activeMeasurementPoints = [];
    this._updateActiveButtons();

    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);

    if (type === MEASUREMENT_TYPES.DISTANCE) {
      this._statusText = 'Click origin point to start distance line...';
      this._renderStatus();

      this.armPickingSession({
        cursor: 'crosshair',
        onLeftClick: (coord) => {
          this._activeMeasurementPoints.push(coord);
          this._createPointMarker(coord, `#00e5ff`, `P${this._activeMeasurementPoints.length}`);

          if (this._activeMeasurementPoints.length === 1) {
            this._statusText = 'Origin locked. Move mouse and click 2nd point to complete.';
            this._renderStatus();
          } else if (this._activeMeasurementPoints.length >= 2) {
            this._commitDistanceMeasurement();
          }
        },
        onMouseMove: (coord) => {
          if (this._activeMeasurementPoints.length === 1 && viewer && typeof Cesium !== 'undefined') {
            this._updateDistancePreview(this._activeMeasurementPoints[0], coord);
          }
        },
        onRightClick: () => {
          this.cancelActiveSession();
        },
        onEscape: () => {
          this.cancelActiveSession();
        },
      });
    } else if (type === MEASUREMENT_TYPES.AREA) {
      this._statusText = 'Click terrain to place polygon vertices. Double-click or click [CALCULATE AREA] to finish.';
      this._renderStatus();

      this.armPickingSession({
        cursor: 'crosshair',
        onLeftClick: (coord) => {
          this._activeMeasurementPoints.push(coord);
          this._createPointMarker(coord, `#10b981`, `V${this._activeMeasurementPoints.length}`);

          if (this._activeMeasurementPoints.length >= 3) {
            this._computeLivePolygonMetrics(this._activeMeasurementPoints);
            this._updateReadoutCards();
          }
          this._statusText = `Vertex ${this._activeMeasurementPoints.length} placed. Double-click to close area.`;
          this._renderStatus();
        },
        onMouseMove: (coord) => {
          if (this._activeMeasurementPoints.length >= 1 && viewer && typeof Cesium !== 'undefined') {
            this._updatePolygonPreview([...this._activeMeasurementPoints, coord]);
          }
        },
        onDoubleClick: () => {
          if (this._activeMeasurementPoints.length >= 3) {
            this._commitAreaMeasurement();
          }
        },
        onRightClick: () => {
          if (this._activeMeasurementPoints.length >= 3) {
            this._commitAreaMeasurement();
          } else {
            this.cancelActiveSession();
          }
        },
        onEscape: () => {
          this.cancelActiveSession();
        },
      });
    }
  }

  _createPointMarker(coord, colorHex, labelText) {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined') return;

    const marker = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(coord.lng, coord.lat, (coord.alt || 0) + 1),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString(colorHex),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: labelText,
        font: '10px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    this.addDraftEntity(marker);
  }

  _updateDistancePreview(p1, p2) {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined') return;

    this.clearDraftEntities();
    this._createPointMarker(p1, '#00e5ff', 'ORIGIN');

    const distM = haversineDistance(p1, p2, 'm');
    const distKm = distM / 1000;
    const distNm = distM / 1852;
    const brg = initialBearing(p1, p2);

    // Update live metrics card during mouse move
    this._measuredMetrics.distanceMeters = distM;
    this._measuredMetrics.distanceKm = distKm;
    this._measuredMetrics.distanceNm = distNm;
    this._measuredMetrics.bearingDeg = brg;
    this._measuredMetrics.pointCount = 2;
    this._updateReadoutCards();

    const lineEnt = viewer.entities.add({
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(p1.lng, p1.lat, 1),
          Cesium.Cartesian3.fromDegrees(p2.lng, p2.lat, 1),
        ],
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#00e5ff'),
          dashLength: 14,
        }),
        clampToGround: true,
      },
    });

    const midLng = (p1.lng + p2.lng) / 2;
    const midLat = (p1.lat + p2.lat) / 2;
    const labelEnt = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 1),
      label: {
        text: `${distM >= 1000 ? `${distKm.toFixed(2)} km` : `${Math.round(distM)} m`} · ${distNm.toFixed(2)} NM · ${Math.round(brg)}°`,
        font: '12px monospace',
        fillColor: Cesium.Color.fromCssColorString('#00e5ff'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    this.addDraftEntity(lineEnt);
    this.addDraftEntity(labelEnt);
  }

  _updatePolygonPreview(points) {
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    if (!viewer || typeof Cesium === 'undefined' || points.length < 2) return;

    this.clearDraftEntities();
    points.slice(0, points.length - 1).forEach((pt, idx) => {
      this._createPointMarker(pt, '#10b981', `V${idx + 1}`);
    });

    const positions = points.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
    const isClosed = points.length >= 3;

    if (isClosed) {
      const polygonEnt = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#10b981'),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      this.addDraftEntity(polygonEnt);
    } else {
      const lineEnt = viewer.entities.add({
        polyline: {
          positions,
          width: 2.5,
          material: Cesium.Color.fromCssColorString('#10b981'),
          clampToGround: true,
        },
      });
      this.addDraftEntity(lineEnt);
    }
  }

  _computeLivePolygonMetrics(points) {
    if (points.length < 3) return;
    const areaMetrics = calculatePolygonGeodesicArea(points);
    const perimMetrics = calculatePolygonPerimeter(points);

    this._measuredMetrics.areaM2 = areaMetrics.areaSquareMeters;
    this._measuredMetrics.areaKm2 = areaMetrics.areaSquareKm;
    this._measuredMetrics.areaHectares = areaMetrics.areaHectares;
    this._measuredMetrics.areaAcres = areaMetrics.areaSquareMeters * 0.000247105;
    this._measuredMetrics.areaNm2 = areaMetrics.areaSquareNm;
    this._measuredMetrics.perimeterMeters = perimMetrics.perimeterMeters;
    this._measuredMetrics.perimeterKm = perimMetrics.perimeterKm;
    this._measuredMetrics.pointCount = points.length;
  }

  _commitDistanceMeasurement() {
    const pts = [...this._activeMeasurementPoints];
    this.abortPickingSession();
    this.clearDraftEntities();

    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);
    const p1 = pts[0];
    const p2 = pts[1];

    const distM = haversineDistance(p1, p2, 'm');
    const distKm = distM / 1000;
    const distNm = distM / 1852;
    const brg = initialBearing(p1, p2);

    this._measuredMetrics.distanceMeters = distM;
    this._measuredMetrics.distanceKm = distKm;
    this._measuredMetrics.distanceNm = distNm;
    this._measuredMetrics.bearingDeg = brg;
    this._measuredMetrics.pointCount = 2;

    if (viewer && typeof Cesium !== 'undefined') {
      const positions = [
        Cesium.Cartesian3.fromDegrees(p1.lng, p1.lat, 1),
        Cesium.Cartesian3.fromDegrees(p2.lng, p2.lat, 1),
      ];

      const permLine = viewer.entities.add({
        name: `Distance: ${distKm.toFixed(2)} km`,
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#00e5ff'),
            dashLength: 14,
          }),
          clampToGround: true,
        },
      });

      const midLng = (p1.lng + p2.lng) / 2;
      const midLat = (p1.lat + p2.lat) / 2;
      const permLabel = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 1),
        label: {
          text: `📏 ${distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(distM)} m`} (${distNm.toFixed(2)} NM) · ${Math.round(brg)}°`,
          font: '11px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      this.addCreatedEntity(permLine);
      this.addCreatedEntity(permLabel);
    }

    const item = {
      id: `measure-dist-${Date.now()}`,
      type: 'distance',
      title: `Distance: ${distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(distM)} m`}`,
      detail: `${distNm.toFixed(2)} NM · HDG ${Math.round(brg)}°`,
      coordinates: pts,
    };
    this._measurementHistory.unshift(item);

    this._statusText = `Distance locked: ${distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(distM)} m`}`;
    this._renderStatus();
    this._updateReadoutCards();
    this._updateHistoryList();

    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, item);
  }

  _commitAreaMeasurement() {
    const pts = [...this._activeMeasurementPoints];
    this.abortPickingSession();
    this.clearDraftEntities();

    if (pts.length < 3) return;

    this._computeLivePolygonMetrics(pts);
    const viewer = this._viewer || (typeof window !== 'undefined' ? window.viewer : null);

    if (viewer && typeof Cesium !== 'undefined') {
      const positions = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
      const permPoly = viewer.entities.add({
        name: `Area: ${this._measuredMetrics.areaKm2.toFixed(3)} km²`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#10b981'),
          outlineWidth: 2.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      // Centroid label
      let cLng = 0;
      let cLat = 0;
      pts.forEach((p) => {
        cLng += p.lng;
        cLat += p.lat;
      });
      cLng /= pts.length;
      cLat /= pts.length;

      const permLabel = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(cLng, cLat, 1),
        label: {
          text: `📐 ${this._measuredMetrics.areaHectares.toFixed(2)} ha (${this._measuredMetrics.areaKm2.toFixed(3)} km²)`,
          font: '11px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      this.addCreatedEntity(permPoly);
      this.addCreatedEntity(permLabel);
    }

    const item = {
      id: `measure-area-${Date.now()}`,
      type: 'area',
      title: `Area: ${this._measuredMetrics.areaHectares.toFixed(2)} ha`,
      detail: `${this._measuredMetrics.areaKm2.toFixed(3)} km² · Perimeter: ${this._measuredMetrics.perimeterKm.toFixed(2)} km`,
      coordinates: pts,
    };
    this._measurementHistory.unshift(item);

    this._statusText = `Area locked: ${this._measuredMetrics.areaHectares.toFixed(2)} ha`;
    this._renderStatus();
    this._updateReadoutCards();
    this._updateHistoryList();

    this.dispatchFeatureEvent(TACTICAL_ACTIONS.CREATE, item);
  }

  _updateActiveButtons() {
    if (!this.container) return;
    const distBtn = this.container.querySelector('#measure-distance-tool-btn');
    const areaBtn = this.container.querySelector('#measure-area-tool-btn');
    const isDist = this.config.activeType === MEASUREMENT_TYPES.DISTANCE;
    const isArea = this.config.activeType === MEASUREMENT_TYPES.AREA;

    if (distBtn) distBtn.classList.toggle('active', isDist);
    if (areaBtn) areaBtn.classList.toggle('active', isArea);
  }

  _renderStatus() {
    if (!this.container) return;
    const el = this.container.querySelector('#measure-status-readout');
    if (el) el.textContent = this._statusText;
  }

  _updateReadoutCards() {
    if (!this.container) return;
    const m = this._measuredMetrics;

    // Distance metrics
    const distVal = this.container.querySelector('#measure-readout-distance');
    if (distVal) {
      if (m.distanceMeters >= 1000) {
        distVal.textContent = `${m.distanceKm.toFixed(2)} km`;
      } else if (m.distanceMeters > 0) {
        distVal.textContent = `${Math.round(m.distanceMeters)} m`;
      } else {
        distVal.textContent = '0 m';
      }
    }

    const distSub = this.container.querySelector('#measure-readout-distance-sub');
    if (distSub) {
      distSub.textContent = `${m.distanceNm.toFixed(2)} NM · HDG ${Math.round(m.bearingDeg)}°`;
    }

    // Area metrics
    const areaVal = this.container.querySelector('#measure-readout-area');
    if (areaVal) {
      if (m.areaHectares > 0) {
        areaVal.textContent = `${m.areaHectares.toFixed(2)} ha`;
      } else {
        areaVal.textContent = '0.00 ha';
      }
    }

    const areaSub = this.container.querySelector('#measure-readout-area-sub');
    if (areaSub) {
      areaSub.textContent = `${m.areaKm2.toFixed(3)} km² · ${m.areaAcres.toFixed(1)} acres`;
    }

    // Perimeter / Segment Count
    const perimVal = this.container.querySelector('#measure-readout-perimeter');
    if (perimVal) {
      perimVal.textContent = m.perimeterKm > 0 ? `${m.perimeterKm.toFixed(2)} km` : `${Math.round(m.perimeterMeters)} m`;
    }

    const ptsVal = this.container.querySelector('#measure-readout-points');
    if (ptsVal) {
      ptsVal.textContent = m.pointCount.toString();
    }
  }

  _updateHistoryList() {
    if (!this.container) return;
    const historyContainer = this.container.querySelector('#measure-history-items');
    if (!historyContainer) return;

    if (this._measurementHistory.length === 0) {
      historyContainer.innerHTML = `
        <div class="text-[11px] text-slate-500 font-mono py-2 text-center">
          No active measurements. Draft above to log traces.
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = this._measurementHistory
      .map(
        (item) => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-left">
          <div class="flex flex-col">
            <span class="text-[11px] font-mono font-semibold ${item.type === 'area' ? 'text-emerald-400' : 'text-cyan-400'}">
              ${item.title}
            </span>
            <span class="text-[10px] text-slate-400 font-mono">${item.detail}</span>
          </div>
          <span class="text-[9px] font-mono px-1.5 py-0.5 rounded ${item.type === 'area' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' : 'bg-cyan-950 text-cyan-300 border border-cyan-700/40'}">
            ${item.type.toUpperCase()}
          </span>
        </div>
      `
      )
      .join('');
  }

  render(container) {
    super.render(container);
    if (!container) return;

    const isDist = this.config.activeType === MEASUREMENT_TYPES.DISTANCE;
    const isArea = this.config.activeType === MEASUREMENT_TYPES.AREA;

    container.innerHTML = `
      <div class="plugin-module-wrapper measurements-plugin-root space-y-2.5">
        <!-- Sub-Tool Capsule Header -->
        <div class="subtool-capsule">
          <div class="subtool-capsule-header flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span class="subtool-capsule-title font-mono font-bold text-xs tracking-wider text-emerald-300">
                GEODESIC MEASUREMENTS
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" id="measure-help-guide-btn" class="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition cursor-pointer px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 border border-cyan-500/30" title="View Step-by-Step Instructions &amp; Shortcuts">
                <span>📖</span> <span>GUIDE</span>
              </button>
              <span class="subtool-capsule-badge text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                WGS-84 ACTIVE
              </span>
            </div>
          </div>
        </div>

        <!-- Popout Floating Module Outside Map Tools Button -->
        <button type="button" id="measure-launch-floating-btn" class="w-full py-1.5 px-2.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] font-semibold flex items-center justify-center gap-1.5 transition shadow-sm" title="Detach into floating draggable module anywhere on viewport">
          <span>↗</span> <span>FLOAT MODULE IN VIEWPORT</span>
        </button>

        <!-- Working Measure Tools Selector Capsule -->
        <div class="p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-lg">
          <div class="text-[9.5px] font-mono text-slate-400 font-bold uppercase tracking-wider mb-1.5">
            MEASUREMENT MODE:
          </div>
          <div class="grid grid-cols-2 gap-2" role="group" aria-label="Measurement Tool Modes">
            <!-- 1. Measure Distance Button -->
            <button type="button" id="measure-distance-tool-btn" class="measure-mode-btn ${isDist ? 'active' : ''} flex items-center justify-center gap-2 p-2 rounded-lg bg-slate-800 border border-cyan-500/40 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-semibold transition" title="Measure Point-to-Point Geodesic Distance">
              <span class="text-sm">📏</span>
              <span>Measure Distance</span>
            </button>

            <!-- 2. Measure Area Button -->
            <button type="button" id="measure-area-tool-btn" class="measure-mode-btn ${isArea ? 'active' : ''} flex items-center justify-center gap-2 p-2 rounded-lg bg-slate-800 border border-emerald-500/40 hover:bg-slate-700 text-emerald-300 font-mono text-xs font-semibold transition" title="Measure Geodesic Polygon Area & Perimeter">
              <span class="text-sm">📐</span>
              <span>Measure Area</span>
            </button>
          </div>
        </div>

        <!-- Live Metrics Readout Card -->
        <div class="p-3 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-xl space-y-2">
          <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span class="text-[10px] font-mono text-slate-400 tracking-wider uppercase font-semibold">GEODESIC READOUT</span>
            <span id="measure-status-readout" class="text-[9.5px] font-mono text-emerald-400 truncate max-w-[170px]">
              ${this._statusText}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <!-- Distance Metric Card -->
            <div class="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <div class="text-[9px] font-mono text-slate-400 uppercase">DISTANCE</div>
              <div id="measure-readout-distance" class="text-base font-mono font-bold text-cyan-300 mt-0.5">
                0 m
              </div>
              <div id="measure-readout-distance-sub" class="text-[9px] font-mono text-slate-500 truncate">
                0.00 NM · HDG 0°
              </div>
            </div>

            <!-- Area Metric Card -->
            <div class="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <div class="text-[9px] font-mono text-slate-400 uppercase">SURFACE AREA</div>
              <div id="measure-readout-area" class="text-base font-mono font-bold text-emerald-300 mt-0.5">
                0.00 ha
              </div>
              <div id="measure-readout-area-sub" class="text-[9px] font-mono text-slate-500 truncate">
                0.000 km² · 0.0 ac
              </div>
            </div>
          </div>

          <!-- Secondary Details -->
          <div class="grid grid-cols-2 gap-2 pt-1 text-[10px] font-mono text-slate-400">
            <div class="flex justify-between p-1.5 rounded bg-slate-950/50 border border-slate-800/60">
              <span>PERIMETER:</span>
              <strong id="measure-readout-perimeter" class="text-slate-200">0 m</strong>
            </div>
            <div class="flex justify-between p-1.5 rounded bg-slate-950/50 border border-slate-800/60">
              <span>VERTICES:</span>
              <strong id="measure-readout-points" class="text-slate-200">0</strong>
            </div>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="measure-complete-btn" class="py-2 px-3 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/60 text-emerald-200 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition">
            <span>✓</span> <span>COMMIT</span>
          </button>
          <button type="button" id="measure-clear-btn" class="py-2 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/50 text-rose-300 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition">
            <span>✕</span> <span>CLEAR ALL</span>
          </button>
        </div>

        <!-- Measurement History Feed -->
        <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[9.5px] font-mono text-slate-400 font-bold uppercase tracking-wider">
              MEASUREMENT LOG
            </span>
            <span class="text-[9px] font-mono text-slate-500">RECENT</span>
          </div>
          <div id="measure-history-items" class="space-y-1 max-h-36 overflow-y-auto pr-1"></div>
        </div>
      </div>
    `;

    this._bindEvents();
    this._updateReadoutCards();
    this._updateHistoryList();
  }

  _bindEvents() {
    if (!this.container) return;

    const launchFloatingBtn = this.container.querySelector('#measure-launch-floating-btn');
    if (launchFloatingBtn) {
      launchFloatingBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined' && typeof window.__openMeasurementModule === 'function') {
          window.__openMeasurementModule({ mode: this.config.activeType });
        }
      });
    }

    const helpGuideBtn = this.container.querySelector('#measure-help-guide-btn');
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

    const distBtn = this.container.querySelector('#measure-distance-tool-btn');
    if (distBtn) {
      distBtn.addEventListener('click', () => {
        this.startInteractiveMeasurement(MEASUREMENT_TYPES.DISTANCE);
      });
    }

    const areaBtn = this.container.querySelector('#measure-area-tool-btn');
    if (areaBtn) {
      areaBtn.addEventListener('click', () => {
        this.startInteractiveMeasurement(MEASUREMENT_TYPES.AREA);
      });
    }

    const completeBtn = this.container.querySelector('#measure-complete-btn');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => {
        if (this.config.activeType === MEASUREMENT_TYPES.AREA && this._activeMeasurementPoints.length >= 3) {
          this._commitAreaMeasurement();
        } else if (this.config.activeType === MEASUREMENT_TYPES.DISTANCE && this._activeMeasurementPoints.length >= 2) {
          this._commitDistanceMeasurement();
        } else {
          this.cancelActiveSession();
        }
      });
    }

    const clearBtn = this.container.querySelector('#measure-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearAllMeasurements();
      });
    }
  }
}

// Backwards compatibility export
export const MeasurementsPlugin = MeasurePlugin;

