/**
 * MAP TOOLS ENGINE (TACTICAL FEATURE MANAGER)
 * Autonomous, decoupled spatial calculation engine, CRED state machine,
 * and event bus coordinator.
 *
 * @module src/tools/mapToolsEngine.js
 */

import {
  EARTH_RADIUS_METERS,
  haversineDistance,
  haversineDistanceMeters,
  haversineDistanceKm,
  haversineDistanceNm,
  calculatePathDistance,
  calculatePolygonMetrics,
  generateConcentricRangeRings,
  generateRangeRingVertices,
  pointInPolygon,
  pointInCircle,
  calculateBoundingBox,
  calculateCentroid,
  normalizeCoordinate,
} from './geodesicMath.js';

/** Standard CustomEvent names for decoupled cross-module bus */
export const MAP_TOOLS_EVENTS = Object.freeze({
  CREATE: 'gev:maptools:create',
  UPDATE: 'gev:maptools:update',
  DELETE: 'gev:maptools:delete',
  FLY_EXTENT: 'gev:maptools:fly-extent',
  BREACH: 'gev:maptools:breach',
});

/** Supported tactical spatial feature types */
export const FEATURE_TYPES = Object.freeze({
  POINT: 'point',
  LINE: 'line',
  LINESTRING: 'linestring',
  POLYGON: 'polygon',
  CIRCLE: 'circle',
  RANGE_RING: 'range_ring',
});

/**
 * Deep clone a plain JavaScript object or array without circular references.
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item));
  }
  const copy = {};
  for (const [key, value] of Object.entries(obj)) {
    copy[key] = deepClone(value);
  }
  return copy;
}

/**
 * MapToolsEngine
 * High-performance autonomous plugin managing tactical spatial features,
 * versioned CRED state machine, and mathematical geodesic metrics.
 */
export class MapToolsEngine {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.viewer=null] - Optional 3D visualization viewer (e.g. Cesium)
   * @param {boolean} [options.syncWindowEvents=true] - Whether to bridge with window CustomEvents
   */
  constructor(options = {}) {
    this.viewer = options.viewer || null;
    this.syncWindowEvents = options.syncWindowEvents ?? (typeof window !== 'undefined');
    this.features = new Map();
    this.eventTarget = new EventTarget();
    this._isInternalDispatch = false;
    this._windowHandler = null;

    if (this.syncWindowEvents && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._bindWindowEvents();
    }
  }

  /**
   * Sets or replaces the 3D visualization viewer.
   * @param {Object|null} viewer
   */
  setViewer(viewer) {
    this.viewer = viewer;
  }

  /**
   * Binds global window listeners to synchronize external events into this engine.
   * @private
   */
  _bindWindowEvents() {
    this._windowHandler = (event) => {
      // Avoid echo loops from events dispatched by this engine
      if (event.detail && event.detail.__fromMapToolsEngine) {
        return;
      }
      // Re-dispatch on internal target if received from external window
      this.eventTarget.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }));
    };

    const target = typeof window !== 'undefined' ? window : null;
    if (target) {
      Object.values(MAP_TOOLS_EVENTS).forEach((eventName) => {
        target.addEventListener(eventName, this._windowHandler);
      });
    }
  }

  /**
   * Unbinds global window event listeners.
   */
  destroy() {
    const target = typeof window !== 'undefined' ? window : null;
    if (target && this._windowHandler) {
      Object.values(MAP_TOOLS_EVENTS).forEach((eventName) => {
        target.removeEventListener(eventName, this._windowHandler);
      });
      this._windowHandler = null;
    }
    this.features.clear();
  }

  /**
   * Subscribes a listener to engine events.
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    this.eventTarget.addEventListener(eventName, callback);
  }

  /**
   * Alias for on() to match EventTarget interface.
   * @param {string} eventName
   * @param {Function} callback
   */
  addEventListener(eventName, callback) {
    this.on(eventName, callback);
  }

  /**
   * Unsubscribes a listener from engine events.
   * @param {string} eventName
   * @param {Function} callback
   */
  off(eventName, callback) {
    this.eventTarget.removeEventListener(eventName, callback);
  }

  /**
   * Alias for off() to match EventTarget interface.
   * @param {string} eventName
   * @param {Function} callback
   */
  removeEventListener(eventName, callback) {
    this.off(eventName, callback);
  }

  /**
   * Dispatches a custom event to internal listeners and the global window bus.
   *
   * @param {string} eventName
   * @param {Object} [detail={}]
   */
  dispatchEvent(eventName, detail = {}) {
    const eventDetail = { ...detail, __fromMapToolsEngine: true };
    const event = new CustomEvent(eventName, { detail: eventDetail });

    // 1. Dispatch internally
    this.eventTarget.dispatchEvent(event);

    // 2. Dispatch on window if available
    if (this.syncWindowEvents && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent(eventName, {
          detail: eventDetail,
          bubbles: true,
          cancelable: true,
        }));
      } catch (err) {
        // Safe degrade in headless or restricted sandbox
        console.warn(`[MapToolsEngine] Window dispatch warning for ${eventName}:`, err.message);
      }
    }
  }

  /**
   * Computes dependent geometry and geodesic metrics based on feature type and coordinates.
   *
   * @private
   * @param {string} type
   * @param {*} coordinates
   * @param {Object} properties
   * @returns {Object} Computed geometry and geodesic metrics
   */
  _computeFeatureGeometry(type, coordinates, properties = {}) {
    const normType = String(type).toLowerCase();

    switch (normType) {
      case FEATURE_TYPES.POINT: {
        const point = normalizeCoordinate(coordinates);
        return {
          type: FEATURE_TYPES.POINT,
          coordinates: point,
          boundingBox: calculateBoundingBox([point]),
          centroid: [point[0], point[1]],
        };
      }

      case FEATURE_TYPES.LINE:
      case FEATURE_TYPES.LINESTRING: {
        const pathMetrics = calculatePathDistance(coordinates);
        return {
          type: FEATURE_TYPES.LINE,
          ...pathMetrics,
        };
      }

      case FEATURE_TYPES.POLYGON: {
        const polyMetrics = calculatePolygonMetrics(coordinates);
        return {
          type: FEATURE_TYPES.POLYGON,
          ...polyMetrics,
        };
      }

      case FEATURE_TYPES.CIRCLE: {
        const center = normalizeCoordinate(
          coordinates?.center || coordinates?.coordinates || coordinates,
        );
        const radiusMeters = Number(
          properties?.radiusMeters ?? coordinates?.radiusMeters ?? 1000,
        );
        const vertices = generateRangeRingVertices(center, radiusMeters, 64);
        const boundingBox = calculateBoundingBox(vertices);
        const theta = radiusMeters / EARTH_RADIUS_METERS;
        const capAreaM2 = 2 * Math.PI * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS * (1 - Math.cos(theta));
        const circumMeters = 2 * Math.PI * EARTH_RADIUS_METERS * Math.sin(theta);

        return {
          type: FEATURE_TYPES.CIRCLE,
          center,
          radiusMeters,
          radiusKm: radiusMeters / 1000,
          radiusNm: radiusMeters / 1852,
          circumferenceMeters: circumMeters,
          areaSquareMeters: capAreaM2,
          areaSquareKm: capAreaM2 / 1e6,
          areaSquareNm: capAreaM2 / (1852 * 1852),
          boundingBox,
          polygonVertices: vertices,
        };
      }

      case FEATURE_TYPES.RANGE_RING: {
        const center = normalizeCoordinate(
          coordinates?.center || coordinates?.coordinates || coordinates,
        );
        const radii = properties?.radii ?? coordinates?.radii ?? [10000, 20000, 30000];
        const rings = generateConcentricRangeRings(center, radii, 64);
        const allVertices = rings.flatMap((r) => r.vertices);
        const boundingBox = calculateBoundingBox(allVertices);
        const maxRadiusMeters = rings.length > 0 ? rings[rings.length - 1].radiusMeters : 0;

        return {
          type: FEATURE_TYPES.RANGE_RING,
          center,
          rings,
          maxRadiusMeters,
          boundingBox,
        };
      }

      default: {
        return {
          type: normType,
          rawCoordinates: coordinates,
          boundingBox: calculateBoundingBox([]),
        };
      }
    }
  }

  // =========================================================================
  // CRED STATE MACHINE & VERSIONING
  // =========================================================================

  /**
   * Creates a new tactical spatial feature.
   * Auto-assigns ID, initial version 1, timestamps, and calculates dependent geometry.
   * Dispatches 'gev:maptools:create'.
   *
   * @param {Object} featureInput
   * @param {string} [featureInput.id] - Optional custom ID
   * @param {string} featureInput.type - Feature type ('point', 'line', 'polygon', 'circle', 'range_ring')
   * @param {string} [featureInput.name] - Human-readable label
   * @param {*} featureInput.coordinates - Geographic coordinate(s)
   * @param {Object} [featureInput.properties={}] - Tactical properties & styling
   * @param {boolean} [featureInput.locked=false] - Initial lock status
   * @returns {Object} Cloned immutable representation of the created feature
   */
  createFeature(featureInput) {
    if (!featureInput || typeof featureInput !== 'object') {
      throw new TypeError('Invalid featureInput: expected an object');
    }

    const type = String(featureInput.type || FEATURE_TYPES.POINT).toLowerCase();
    const id = String(
      featureInput.id || `feat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );

    if (this.features.has(id)) {
      throw new Error(`Feature with id "${id}" already exists`);
    }

    const now = new Date().toISOString();
    const properties = deepClone(featureInput.properties || {});
    const style = deepClone(featureInput.style || featureInput.properties?.style || {});
    const coordinates = deepClone(featureInput.coordinates);
    const computed = this._computeFeatureGeometry(type, coordinates, properties);

    const feature = {
      id,
      name: featureInput.name || `Feature ${id.slice(-6)}`,
      type,
      coordinates,
      version: 1,
      locked: Boolean(featureInput.locked),
      createdAt: now,
      updatedAt: now,
      properties,
      style,
      computed,
    };

    this.features.set(id, feature);
    this._syncCesiumEntity(feature);

    const snapshot = deepClone(feature);
    this.dispatchEvent(MAP_TOOLS_EVENTS.CREATE, { feature: snapshot });

    return snapshot;
  }

  /**
   * Retrieves a cloned snapshot of a feature by ID.
   *
   * @param {string} id
   * @returns {Object|null} Cloned feature or null if not found
   */
  getFeature(id) {
    const feature = this.features.get(id);
    return feature ? deepClone(feature) : null;
  }

  /**
   * Retrieves all features in the engine, optionally filtered.
   *
   * @param {Function|Object} [filter] - Optional filter function or key-value criteria
   * @returns {Array<Object>} Cloned features
   */
  getAllFeatures(filter) {
    const list = Array.from(this.features.values());

    if (typeof filter === 'function') {
      return list.filter(filter).map(deepClone);
    }

    if (filter && typeof filter === 'object') {
      return list
        .filter((feat) => Object.entries(filter).every(([k, v]) => feat[k] === v))
        .map(deepClone);
    }

    return list.map(deepClone);
  }

  /**
   * Updates an existing feature.
   * Enforces lock protection, increments version, recalculates dependent geometry,
   * updates timestamp, and dispatches 'gev:maptools:update'.
   *
   * @param {string} id - Feature ID to update
   * @param {Object} patch - Fields to update (name, coordinates, properties, locked)
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false] - If true, bypasses locked status check
   * @returns {Object} Cloned representation of updated feature
   */
  updateFeature(id, patch, options = {}) {
    const existing = this.features.get(id);
    if (!existing) {
      throw new Error(`Feature "${id}" not found`);
    }

    if (existing.locked && !options.force && patch.locked !== false) {
      throw new Error(`Cannot update locked feature "${id}". Unlock first or pass { force: true }.`);
    }

    const previousVersion = existing.version;
    const newVersion = previousVersion + 1;
    const updatedAt = new Date().toISOString();

    const nextType = patch.type ? String(patch.type).toLowerCase() : existing.type;
    const nextCoordinates = patch.coordinates !== undefined ? deepClone(patch.coordinates) : existing.coordinates;
    const nextProperties = patch.properties !== undefined
      ? { ...existing.properties, ...deepClone(patch.properties) }
      : existing.properties;
    const nextStyle = patch.style !== undefined
      ? deepClone(patch.style)
      : (patch.properties?.style ? deepClone(patch.properties.style) : existing.style || {});
    const nextName = patch.name !== undefined ? patch.name : existing.name;
    const nextLocked = patch.locked !== undefined ? Boolean(patch.locked) : existing.locked;

    // Recalculate dependent geometry
    const computed = this._computeFeatureGeometry(nextType, nextCoordinates, nextProperties);

    const updatedFeature = {
      ...existing,
      name: nextName,
      type: nextType,
      coordinates: nextCoordinates,
      version: newVersion,
      locked: nextLocked,
      updatedAt,
      properties: nextProperties,
      style: nextStyle,
      computed,
    };

    this.features.set(id, updatedFeature);
    this._syncCesiumEntity(updatedFeature);

    const snapshot = deepClone(updatedFeature);
    this.dispatchEvent(MAP_TOOLS_EVENTS.UPDATE, {
      feature: snapshot,
      previousVersion,
      changes: patch,
    });

    return snapshot;
  }

  /**
   * Sets or toggles the lock state on a feature.
   * Locked features cannot be updated or deleted without explicit force override.
   *
   * @param {string} id - Feature ID
   * @param {boolean} [locked=true] - Target lock state
   * @returns {Object} Updated feature snapshot
   */
  lockFeature(id, locked = true) {
    return this.updateFeature(id, { locked: Boolean(locked) }, { force: true });
  }

  /**
   * Deletes a feature by ID.
   * Rejects if locked unless { force: true } is provided.
   * Dispatches 'gev:maptools:delete'.
   *
   * @param {string} id - Feature ID
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false]
   * @returns {boolean} True if successfully deleted
   */
  deleteFeature(id, options = {}) {
    const existing = this.features.get(id);
    if (!existing) {
      return false;
    }

    if (existing.locked && !options.force) {
      throw new Error(`Cannot delete locked feature "${id}". Unlock first or pass { force: true }.`);
    }

    this.features.delete(id);
    this._removeCesiumEntity(id);

    const snapshot = deepClone(existing);
    this.dispatchEvent(MAP_TOOLS_EVENTS.DELETE, {
      featureId: id,
      feature: snapshot,
    });

    return true;
  }

  /**
   * Clears all features from the engine.
   * By default, preserves locked features unless { force: true } is supplied.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false]
   * @returns {{deletedCount: number, remainingCount: number}}
   */
  clearAll(options = {}) {
    const force = Boolean(options.force);
    let deletedCount = 0;

    for (const [id, feature] of Array.from(this.features.entries())) {
      if (!feature.locked || force) {
        this.features.delete(id);
        this._removeCesiumEntity(id);
        deletedCount += 1;
        this.dispatchEvent(MAP_TOOLS_EVENTS.DELETE, {
          featureId: id,
          feature: deepClone(feature),
        });
      }
    }

    return {
      deletedCount,
      remainingCount: this.features.size,
    };
  }

  // =========================================================================
  // SPATIAL QUERIES & CAMERA SYNCHRONIZATION
  // =========================================================================

  /**
   * Tests whether a geographic coordinate falls inside a specific feature.
   * Supports polygon, circle, and range_ring features.
   *
   * @param {Array<number>|Object} point - [lon, lat]
   * @param {string} featureId - ID of polygon/circle/range_ring feature
   * @returns {{inside: boolean, distanceMeters?: number, featureType: string}}
   */
  pointInFeature(point, featureId) {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature "${featureId}" not found`);
    }

    const normPt = normalizeCoordinate(point);

    if (feature.type === FEATURE_TYPES.POLYGON) {
      const isInside = pointInPolygon(normPt, feature.coordinates);
      return { inside: isInside, featureType: FEATURE_TYPES.POLYGON };
    }

    if (feature.type === FEATURE_TYPES.CIRCLE) {
      const center = feature.computed.center;
      const radiusM = feature.computed.radiusMeters;
      const res = pointInCircle(normPt, center, radiusM);
      return {
        inside: res.inside,
        distanceMeters: res.distanceMeters,
        radiusMeters: radiusM,
        featureType: FEATURE_TYPES.CIRCLE,
      };
    }

    if (feature.type === FEATURE_TYPES.RANGE_RING) {
      const center = feature.computed.center;
      const maxRadiusM = feature.computed.maxRadiusMeters;
      const res = pointInCircle(normPt, center, maxRadiusM);
      return {
        inside: res.inside,
        distanceMeters: res.distanceMeters,
        radiusMeters: maxRadiusM,
        featureType: FEATURE_TYPES.RANGE_RING,
      };
    }

    return { inside: false, featureType: feature.type };
  }

  /**
   * Dispatches 'gev:maptools:fly-extent' to coordinate camera view with Cesium or globe viewer.
   *
   * @param {Object} extent - { minLon, minLat, maxLon, maxLat }
   * @param {string} [featureId] - Optional associated feature ID
   */
  flyToExtent(extent, featureId = null) {
    const activeViewer = this.viewer || (typeof window !== 'undefined' ? (window.viewer || window.cesiumViewer || window.__gevViewer) : null);
    if (activeViewer && !this.viewer) {
      this.viewer = activeViewer;
    }

    const feature = featureId ? this.getFeature(featureId) : null;
    this.dispatchEvent(MAP_TOOLS_EVENTS.FLY_EXTENT, {
      extent,
      featureId,
      feature,
    });

    // If viewer camera is directly accessible, perform graceful flight
    if (activeViewer && activeViewer.camera && typeof activeViewer.camera.flyTo === 'function') {
      try {
        const Cesium = globalThis.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
        if (Cesium) {
          // 1. Direct focal flight for CIRCLE, RANGE_RING, and POINT features
          if (feature) {
            if ((feature.type === FEATURE_TYPES.CIRCLE || feature.type === FEATURE_TYPES.RANGE_RING) && feature.computed?.center) {
              const center = feature.computed.center;
              const lon = Number(center[0]);
              const lat = Number(center[1]);
              const radiusM = Number(feature.computed.radiusMeters || feature.computed.maxRadiusMeters || feature.properties?.radiusMeters) || 5000;
              const alt = Math.max(1200, radiusM * 3.2);

              activeViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
                orientation: {
                  heading: Cesium.Math.toRadians(0),
                  pitch: Cesium.Math.toRadians(-45),
                  roll: 0,
                },
                duration: 1.5,
              });
              return;
            }

            if (feature.type === FEATURE_TYPES.POINT) {
              const pt = feature.computed?.coordinates || feature.coordinates;
              const lon = Array.isArray(pt) ? pt[0] : (pt.lng ?? pt.lon ?? 0);
              const lat = Array.isArray(pt) ? pt[1] : (pt.lat ?? 0);

              activeViewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2500),
                orientation: {
                  heading: Cesium.Math.toRadians(0),
                  pitch: Cesium.Math.toRadians(-45),
                  roll: 0,
                },
                duration: 1.5,
              });
              return;
            }
          }

          // 2. Standard Bounding Box Extent flight for Line / Polygon
          if (Cesium.Rectangle && extent) {
            const minMargin = 0.005; // ~500m safety padding
            const minLon = Math.min(extent.minLon, extent.maxLon);
            const maxLon = Math.max(extent.minLon, extent.maxLon);
            const minLat = Math.min(extent.minLat, extent.maxLat);
            const maxLat = Math.max(extent.minLat, extent.maxLat);

            const paddedMinLon = minLon === maxLon ? minLon - minMargin : minLon;
            const paddedMaxLon = minLon === maxLon ? maxLon + minMargin : maxLon;
            const paddedMinLat = minLat === maxLat ? minLat - minMargin : minLat;
            const paddedMaxLat = minLat === maxLat ? maxLat + minMargin : maxLat;

            const rect = Cesium.Rectangle.fromDegrees(
              paddedMinLon,
              paddedMinLat,
              paddedMaxLon,
              paddedMaxLat,
            );
            activeViewer.camera.flyTo({
              destination: rect,
              duration: 1.5,
            });
          }
        }
      } catch (err) {
        console.warn('[MapToolsEngine] Direct viewer flyTo failed, event dispatched:', err.message);
      }
    }
  }

  /**
   * Flies camera to the bounding box of a specific feature.
   *
   * @param {string} featureId
   */
  flyToFeature(featureId) {
    const feature = this.features.get(featureId);
    if (!feature) {
      throw new Error(`Feature "${featureId}" not found`);
    }

    const extent = feature.computed?.boundingBox;
    if (!extent) {
      throw new Error(`Feature "${featureId}" has no computed bounding box`);
    }

    this.flyToExtent(extent, featureId);
  }

  /**
   * Sets breach alarm visual highlighting on a tactical feature.
   * Dynamically highlights the breached entity with warning colors (e.g. #ef4444)
   * or restores original styling upon breach clearance.
   *
   * @param {string} featureId
   * @param {boolean} isBreached
   * @param {'critical'|'warning'} [severity='critical']
   */
  setFeatureBreachHighlight(featureId, isBreached, severity = 'critical') {
    const feature = this.features.get(featureId);
    if (!feature) return;

    if (isBreached) {
      if (!feature._originalColor) {
        feature._originalColor = feature.style?.color || feature.properties?.color || '#00e5ff';
      }
      const breachColor = severity === 'critical' ? '#ef4444' : '#f59e0b';
      feature.style = { ...feature.style, color: breachColor, isBreached: true };
      feature.properties = { ...feature.properties, isBreached: true, breachSeverity: severity };
    } else {
      if (feature._originalColor) {
        feature.style = { ...feature.style, color: feature._originalColor, isBreached: false };
        feature.properties = { ...feature.properties, isBreached: false, breachSeverity: null };
      }
    }

    this._syncCesiumEntity(feature);

    this.dispatchEvent(MAP_TOOLS_EVENTS.UPDATE, {
      feature: deepClone(feature),
      changes: { isBreached, severity },
    });
  }

  /**
   * Creates or updates the Cesium entity representing this tactical feature.
   * @private
   */
  _syncCesiumEntity(feature) {
    if (!this.viewer || !this.viewer.entities || typeof globalThis.Cesium === 'undefined') {
      return;
    }
    const Cesium = globalThis.Cesium;
    const entityId = `tactical-feature-${feature.id}`;
    this._removeCesiumEntity(feature.id);

    try {
      const colorHex = feature.style?.color || feature.properties?.color || '#00e5ff';
      const isBreached = Boolean(feature.style?.isBreached || feature.properties?.isBreached);
      const activeColorHex = isBreached ? '#ef4444' : colorHex;
      const cesiumColor = Cesium.Color ? Cesium.Color.fromCssColorString(activeColorHex) : null;
      if (!cesiumColor) return;

      const type = String(feature.type).toLowerCase();

      if (type === 'point') {
        const coord = Array.isArray(feature.coordinates) ? feature.coordinates : [0, 0];
        this.viewer.entities.add({
          id: entityId,
          name: feature.name,
          position: Cesium.Cartesian3.fromDegrees(Number(coord[0]), Number(coord[1]), Number(coord[2] || 0)),
          point: {
            pixelSize: isBreached ? 14 : 10,
            color: cesiumColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: feature.name,
            font: '12px monospace',
            fillColor: cesiumColor,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            showBackground: true,
            backgroundColor: new Cesium.Color(0.05, 0.08, 0.12, 0.75),
          },
        });
      } else if (type === 'polygon' || type === 'geofence') {
        const coords = Array.isArray(feature.coordinates) ? feature.coordinates : [];
        if (coords.length >= 3) {
          const flat = [];
          for (const pt of coords) {
            flat.push(Number(pt[0]), Number(pt[1]));
          }
          this.viewer.entities.add({
            id: entityId,
            name: feature.name,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
              material: cesiumColor.withAlpha(isBreached ? 0.45 : 0.25),
              outline: true,
              outlineColor: cesiumColor,
              outlineWidth: isBreached ? 4 : 2,
            },
          });
        }
      } else if (type === 'circle') {
        const center = feature.center || (Array.isArray(feature.coordinates) && feature.coordinates.length === 2 ? feature.coordinates : [0, 0]);
        const radius = Number(feature.radiusMeters || feature.properties?.radiusMeters || 5000);
        this.viewer.entities.add({
          id: entityId,
          name: feature.name,
          position: Cesium.Cartesian3.fromDegrees(Number(center[0]), Number(center[1])),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: cesiumColor.withAlpha(isBreached ? 0.45 : 0.2),
            outline: true,
            outlineColor: cesiumColor,
            outlineWidth: isBreached ? 4 : 2,
          },
        });
      } else if (type === 'range_ring') {
        const center = feature.computed?.center || (Array.isArray(feature.coordinates) && feature.coordinates.length === 2 ? feature.coordinates : [0, 0]);
        const rings = feature.computed?.rings || [];
        this.viewer.entities.add({
          id: `${entityId}-center`,
          name: `${feature.name} (Center)`,
          position: Cesium.Cartesian3.fromDegrees(Number(center[0]), Number(center[1])),
          point: {
            pixelSize: isBreached ? 12 : 8,
            color: cesiumColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: feature.name,
            font: '12px monospace',
            fillColor: cesiumColor,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            showBackground: true,
            backgroundColor: new Cesium.Color(0.05, 0.08, 0.12, 0.75),
          },
        });
        rings.forEach((ring, idx) => {
          this.viewer.entities.add({
            id: `${entityId}-ring-${idx}`,
            name: `${feature.name} Ring ${idx + 1} (${ring.radiusKm.toFixed(1)} km)`,
            position: Cesium.Cartesian3.fromDegrees(Number(center[0]), Number(center[1])),
            ellipse: {
              semiMajorAxis: ring.radiusMeters,
              semiMinorAxis: ring.radiusMeters,
              material: cesiumColor.withAlpha(isBreached ? 0.25 : (0.04 + idx * 0.03)),
              outline: true,
              outlineColor: cesiumColor,
              outlineWidth: isBreached ? 3 : 2,
            },
          });
        });
      } else if (type === 'line' || type === 'linestring' || type === 'corridor') {
        const coords = Array.isArray(feature.coordinates) ? feature.coordinates : [];
        if (coords.length >= 2) {
          const flat = [];
          for (const pt of coords) {
            flat.push(Number(pt[0]), Number(pt[1]));
          }
          this.viewer.entities.add({
            id: entityId,
            name: feature.name,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(flat),
              width: isBreached ? 6 : (type === 'corridor' ? 4 : 3),
              material: cesiumColor,
              clampToGround: true,
            },
          });
        }
      }
    } catch (err) {
      console.warn('[MapToolsEngine] Cesium entity sync failed:', err.message);
    }
  }

  /**
   * Removes the Cesium entity representing this tactical feature.
   * @private
   */
  _removeCesiumEntity(featureId) {
    if (!this.viewer || !this.viewer.entities || typeof this.viewer.entities.removeById !== 'function') {
      return;
    }
    try {
      this.viewer.entities.removeById(`tactical-feature-${featureId}`);
      this.viewer.entities.removeById(`tactical-feature-${featureId}-center`);
      for (let i = 0; i < 16; i++) {
        this.viewer.entities.removeById(`tactical-feature-${featureId}-ring-${i}`);
      }
    } catch {
      // Ignored
    }
  }
}

// =========================================================================
// GLOBAL HEADLESS SINGLETON ACCESSOR
// =========================================================================

let sharedMapToolsEngineInstance = null;

/**
 * Retrieves the global headless MapToolsEngine singleton.
 * Can be instantiated and operated with or without UI rendering or viewer.
 *
 * @param {Object} [viewer=null] - Optional 3D globe viewer to attach
 * @returns {MapToolsEngine}
 */
export function getSharedMapToolsEngine(viewer = null) {
  if (!sharedMapToolsEngineInstance) {
    sharedMapToolsEngineInstance = new MapToolsEngine({ viewer });
  } else if (viewer && !sharedMapToolsEngineInstance.viewer) {
    sharedMapToolsEngineInstance.setViewer(viewer);
  }
  return sharedMapToolsEngineInstance;
}

/**
 * Resets the shared MapToolsEngine singleton instance.
 * Useful for test isolation and clean teardown.
 */
export function resetSharedMapToolsEngine() {
  if (sharedMapToolsEngineInstance) {
    sharedMapToolsEngineInstance.destroy();
    sharedMapToolsEngineInstance = null;
  }
}
