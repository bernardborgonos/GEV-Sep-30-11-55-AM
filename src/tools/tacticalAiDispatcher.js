/**
 * TACTICAL AI DISPATCHER & VOICE CONTROL FACADE
 * Maps natural language tool calls, voice microphone invocations, and multimodal AI inputs
 * to the autonomous MapToolsEngine with verbal response synthesis.
 *
 * @module src/tools/tacticalAiDispatcher.js
 */

import {
  METERS_PER_KM,
  METERS_PER_NM,
  haversineDistance,
  haversineDistanceKm,
  calculatePathDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
  destinationPoint,
  generateRangeRingVertices,
  normalizeCoordinate,
} from './geodesicMath.js';

import {
  MapToolsEngine,
  getSharedMapToolsEngine,
  FEATURE_TYPES,
  MAP_TOOLS_EVENTS,
} from './mapToolsEngine.js';
import { getSharedGeofenceEngine } from './geofenceEngine.js';

/** Supported tactical actions */
export const TACTICAL_ACTIONS = Object.freeze({
  CREATE_WAYPOINT: 'create_waypoint',
  CREATE_RANGE_RING: 'create_range_ring',
  CREATE_GEOFENCE: 'create_geofence',
  MEASURE_DISTANCE: 'measure_distance',
  FLY_EXTENT: 'fly_extent',
  CLEAR_ALL: 'clear_all',
  QUERY_BREACHES: 'query_breaches',
});

/**
 * OpenAI Realtime / Chat Completions compatible tool definition schema
 */
export const CONTROL_TACTICAL_MAP_TOOLS_SCHEMA = Object.freeze({
  type: 'function',
  name: 'control_tactical_map_tools',
  description:
    'Control tactical map features including waypoints, geodesic range rings, geofences, distance measurements, camera extents, and spatial breach detection.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'create_waypoint',
          'create_range_ring',
          'create_geofence',
          'measure_distance',
          'fly_extent',
          'clear_all',
          'query_breaches',
        ],
        description: 'Tactical action to execute.',
      },
      name: {
        type: 'string',
        description:
          'Name, callsign, or label for the tactical feature (e.g., "Alpha Outpost", "Sector 7 Exclusion Zone").',
      },
      coordinates: {
        description:
          'WGS-84 coordinates. For waypoints/range rings: [longitude, latitude]. For geofences/measurements: array of points [[lon, lat], ...]. If omitted, falls back to current camera view center.',
        oneOf: [
          {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 3,
            description: '[longitude, latitude, optional altitude]',
          },
          {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
            description: 'Array of [longitude, latitude] coordinate pairs.',
          },
        ],
      },
      latitude: {
        type: 'number',
        description: 'Explicit latitude in decimal degrees if not passed in coordinates array.',
      },
      longitude: {
        type: 'number',
        description: 'Explicit longitude in decimal degrees if not passed in coordinates array.',
      },
      radii: {
        description:
          'Concentric range ring radii in kilometers, meters, or nautical miles. Accepts an array of numbers (e.g. [10, 25, 50]), comma-separated string ("10km, 25km, 50nm"), or single radius number.',
        oneOf: [
          { type: 'number' },
          { type: 'string' },
          { type: 'array', items: { type: 'number' } },
        ],
      },
      radius: {
        type: 'number',
        description: 'Single radius value (e.g. 20 for 20km).',
      },
      radiusMeters: {
        type: 'number',
        description: 'Explicit radius in meters.',
      },
      unit: {
        type: 'string',
        enum: ['km', 'm', 'nm'],
        description: 'Distance/radius unit: "km" (kilometers), "m" (meters), or "nm" (nautical miles). Defaults to km for values under 500, or m.',
      },
      waypoints: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        description: 'Ordered sequence of [longitude, latitude] waypoints for multi-point distance measurement.',
      },
      featureId: {
        type: 'string',
        description: 'Target feature ID to fly to, query, or check breaches against.',
      },
      targetCoordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[longitude, latitude] coordinate of a target contact to evaluate for geofence breaches.',
      },
      classification: {
        type: 'string',
        enum: ['friendly', 'restricted', 'hostile', 'neutral', 'caution', 'observation'],
        description: 'Tactical security classification for geofences or waypoints.',
      },
      style: {
        type: 'object',
        properties: {
          color: { type: 'string' },
          strokeColor: { type: 'string' },
          fillColor: { type: 'string' },
          fillOpacity: { type: 'number' },
          strokeWidth: { type: 'number' },
        },
        description: 'Optional visual styling overrides.',
      },
      lock: {
        type: 'boolean',
        description: 'Whether to lock the feature against accidental deletion.',
      },
      force: {
        type: 'boolean',
        description: 'When true with clear_all, deletes even locked features.',
      },
    },
    required: ['action'],
  },
});

/**
 * Gemini SDK compatible FunctionDeclaration
 */
export const CONTROL_TACTICAL_MAP_TOOLS_GEMINI_DECLARATION = Object.freeze({
  name: CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.name,
  description: CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.description,
  parameters: CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.parameters,
});

/**
 * Resolves camera view center coordinates [longitude, latitude] from a Cesium viewer or fallback context.
 *
 * @param {Object|null} viewer - Cesium Viewer instance
 * @param {Function|null} [customResolver=null]
 * @returns {[number, number]} [longitude, latitude]
 */
export function resolveCameraCenter(viewer = null, customResolver = null) {
  if (typeof customResolver === 'function') {
    try {
      const custom = customResolver();
      if (Array.isArray(custom) && custom.length >= 2 && Number.isFinite(custom[0]) && Number.isFinite(custom[1])) {
        return [custom[0], custom[1]];
      }
    } catch {
      // Fall through to viewer inspection
    }
  }

  if (!viewer) {
    return [0, 0];
  }

  try {
    const Cesium = globalThis.Cesium;

    // 1. Ray-cast center of canvas onto ellipsoid or 3D globe surface
    if (viewer.scene && viewer.scene.canvas) {
      const canvas = viewer.scene.canvas;
      const width = canvas.clientWidth || canvas.width || 0;
      const height = canvas.clientHeight || canvas.height || 0;

      if (width > 0 && height > 0 && Cesium) {
        const centerWindowPos = new Cesium.Cartesian2(width / 2, height / 2);
        let pickedCartesian = null;

        if (viewer.scene.pickPositionSupported && typeof viewer.scene.pickPosition === 'function') {
          try {
            pickedCartesian = viewer.scene.pickPosition(centerWindowPos);
          } catch {
            pickedCartesian = null;
          }
        }

        if (!pickedCartesian && viewer.camera && typeof viewer.camera.pickEllipsoid === 'function') {
          try {
            pickedCartesian = viewer.camera.pickEllipsoid(centerWindowPos, Cesium.Ellipsoid.WGS84);
          } catch {
            pickedCartesian = null;
          }
        }

        if (pickedCartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(pickedCartesian);
          if (cartographic) {
            const lon = Cesium.Math.toDegrees(cartographic.longitude);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
              return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
            }
          }
        }
      }
    }

    // 2. Camera position Cartographic fallback
    if (viewer.camera && viewer.camera.positionCartographic && Cesium) {
      const carto = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
      }
    }
  } catch {
    // Graceful fallback
  }

  return [0, 0];
}

/**
 * Extracts and normalizes single point coordinates from tool arguments,
 * falling back to camera view center if coordinates are absent or ambiguous.
 *
 * @param {Object} args - Tool arguments
 * @param {Object} context - Execution context { viewer, engine, getViewCenter }
 * @returns {{ coordinates: [number, number], usedFallback: boolean }}
 */
export function resolveSinglePointCoordinates(args = {}, context = {}) {
  // Check explicit longitude and latitude fields first
  if (
    Number.isFinite(args.longitude) &&
    Number.isFinite(args.latitude)
  ) {
    return {
      coordinates: [args.longitude, args.latitude],
      usedFallback: false,
    };
  }

  // Check coordinates array or object
  if (args.coordinates) {
    if (Array.isArray(args.coordinates)) {
      if (args.coordinates.length >= 2 && typeof args.coordinates[0] === 'number') {
        return {
          coordinates: [args.coordinates[0], args.coordinates[1]],
          usedFallback: false,
        };
      }
      if (Array.isArray(args.coordinates[0]) && args.coordinates[0].length >= 2) {
        return {
          coordinates: [args.coordinates[0][0], args.coordinates[0][1]],
          usedFallback: false,
        };
      }
    } else if (typeof args.coordinates === 'object') {
      const lon = args.coordinates.longitude ?? args.coordinates.lon ?? args.coordinates.lng;
      const lat = args.coordinates.latitude ?? args.coordinates.lat;
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return {
          coordinates: [lon, lat],
          usedFallback: false,
        };
      }
    }
  }

  // Fallback to camera view center
  const center = resolveCameraCenter(context.viewer || context.engine?.viewer, context.getViewCenter);
  return {
    coordinates: center,
    usedFallback: true,
  };
}

/**
 * Parses user or model radius inputs (e.g. 25, "25km", "50nm", [10, 25, 50])
 * into an array of meter values.
 *
 * @param {Object} args
 * @returns {Array<number>} Radii in meters
 */
export function parseRadiiInMeters(args = {}) {
  const parseSingle = (val, defaultUnit = 'km') => {
    if (typeof val === 'number') {
      if (args.unit === 'm' || val > 1000) return Math.round(val);
      if (args.unit === 'nm') return Math.round(val * METERS_PER_NM);
      return Math.round(val * METERS_PER_KM);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim().toLowerCase();
      if (trimmed.endsWith('nm')) {
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? Math.round(n * METERS_PER_NM) : null;
      }
      if (trimmed.endsWith('km')) {
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? Math.round(n * METERS_PER_KM) : null;
      }
      if (trimmed.endsWith('m')) {
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? Math.round(n) : null;
      }
      const n = parseFloat(trimmed);
      if (!Number.isFinite(n)) return null;
      if (args.unit === 'nm') return Math.round(n * METERS_PER_NM);
      if (args.unit === 'm' || n > 1000) return Math.round(n);
      return Math.round(n * METERS_PER_KM);
    }
    return null;
  };

  // 1. Explicit radiusMeters
  if (Number.isFinite(args.radiusMeters) && args.radiusMeters > 0) {
    return [Math.round(args.radiusMeters)];
  }

  // 2. Single radius field
  if (args.radius !== undefined && args.radius !== null) {
    const m = parseSingle(args.radius);
    if (m && m > 0) return [m];
  }

  // 3. radii array or string
  if (Array.isArray(args.radii) && args.radii.length > 0) {
    const list = args.radii
      .map((item) => parseSingle(item))
      .filter((m) => Number.isFinite(m) && m > 0);
    if (list.length > 0) return list;
  } else if (typeof args.radii === 'string') {
    const parts = args.radii.split(',').map((s) => s.trim());
    const list = parts
      .map((item) => parseSingle(item))
      .filter((m) => Number.isFinite(m) && m > 0);
    if (list.length > 0) return list;
  } else if (typeof args.radii === 'number') {
    const m = parseSingle(args.radii);
    if (m && m > 0) return [m];
  }

  // Default tactical standard: 25 km
  return [25000];
}

/**
 * Formats coordinates for clean speech output (e.g. "14.60 North, 120.98 East")
 *
 * @param {[number, number]} coords - [longitude, latitude]
 * @returns {string}
 */
export function formatCoordinatesForSpeech(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 'selected coordinates';
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 'selected coordinates';

  const latCard = lat >= 0 ? 'North' : 'South';
  const lonCard = lon >= 0 ? 'East' : 'West';
  return `${Math.abs(lat).toFixed(2)}° ${latCard}, ${Math.abs(lon).toFixed(2)}° ${lonCard}`;
}

/**
 * Formats radius list for verbal output (e.g. "10, 25, and 50 kilometer")
 *
 * @param {Array<number>} radiiMeters
 * @returns {string}
 */
export function formatRadiiForSpeech(radiiMeters) {
  if (!Array.isArray(radiiMeters) || radiiMeters.length === 0) return '25 kilometer';
  const kmVals = radiiMeters.map((m) => (m >= 1000 ? `${m / 1000}` : `${m} meter`));
  if (kmVals.length === 1) return `${kmVals[0]} kilometer`;
  if (kmVals.length === 2) return `${kmVals[0]} and ${kmVals[1]} kilometer`;
  return `${kmVals.slice(0, -1).join(', ')}, and ${kmVals[kmVals.length - 1]} kilometer`;
}

// =========================================================================
// ACTION DISPATCHER & VOICE HANDLERS
// =========================================================================

/**
 * Dispatches a tactical command from AI tool-calling to MapToolsEngine with verbal synthesis.
 *
 * @param {Object} args - Tool arguments matching CONTROL_TACTICAL_MAP_TOOLS_SCHEMA
 * @param {Object} [context={}] - Execution environment
 * @param {MapToolsEngine} [context.engine] - MapToolsEngine instance
 * @param {Object} [context.viewer] - Cesium viewer instance
 * @param {Object} [context.dataManager] - Active DataLayerManager
 * @param {Function} [context.getViewCenter] - Custom camera center accessor
 * @returns {Promise<Object>} Formatted result payload with speech text
 */
export async function dispatchTacticalAiCommand(args = {}, context = {}) {
  const engine = context.engine || getSharedMapToolsEngine(context.viewer);
  const action = String(args.action || '').trim().toLowerCase();

  switch (action) {
    // -----------------------------------------------------------------------
    // ACTION 1: CREATE WAYPOINT
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.CREATE_WAYPOINT: {
      const { coordinates, usedFallback } = resolveSinglePointCoordinates(args, context);
      const name = String(args.name || 'Tactical Waypoint').trim();
      const locked = Boolean(args.lock);

      const feature = engine.createFeature({
        name,
        type: FEATURE_TYPES.POINT,
        coordinates,
        properties: {
          classification: args.classification || 'friendly',
          category: 'waypoint',
          source: 'voice_ai_dispatcher',
          usedCameraCenter: usedFallback,
        },
        style: args.style || {
          color: args.classification === 'hostile' ? '#ff3b30' : '#00f0ff',
          size: 10,
        },
      });

      if (locked) {
        engine.lockFeature(feature.id, true);
      }

      const locSpoken = usedFallback
        ? `at current camera center (${formatCoordinatesForSpeech(coordinates)})`
        : `at ${formatCoordinatesForSpeech(coordinates)}`;

      const speech = `Placed tactical waypoint ${name} ${locSpoken}.`;

      return {
        ok: true,
        action,
        speech,
        feature: locked ? engine.getFeature(feature.id) : feature,
        usedCameraFallback: usedFallback,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 2: CREATE RANGE RING
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.CREATE_RANGE_RING: {
      const { coordinates, usedFallback } = resolveSinglePointCoordinates(args, context);
      const name = String(args.name || 'Range Ring').trim();
      const radiiMeters = parseRadiiInMeters(args);
      const locked = Boolean(args.lock);

      const feature = engine.createFeature({
        name,
        type: FEATURE_TYPES.RANGE_RING,
        coordinates,
        properties: {
          radii: radiiMeters,
          classification: args.classification || 'observation',
          source: 'voice_ai_dispatcher',
          usedCameraCenter: usedFallback,
        },
        style: args.style || {
          strokeColor: '#00f0ff',
          strokeWidth: 2,
        },
      });

      if (locked) {
        engine.lockFeature(feature.id, true);
      }

      const radiiDesc = formatRadiiForSpeech(radiiMeters);
      const locDesc = usedFallback ? 'around camera center' : `at ${formatCoordinatesForSpeech(coordinates)}`;
      const countDesc = radiiMeters.length > 1 ? `${radiiMeters.length} concentric` : '';
      const speech = `Placed ${countDesc} ${radiiDesc} range rings around ${name} ${locDesc}.`.replace(/\s+/g, ' ');

      return {
        ok: true,
        action,
        speech,
        feature: locked ? engine.getFeature(feature.id) : feature,
        radiiMeters,
        usedCameraFallback: usedFallback,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 3: CREATE GEOFENCE
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.CREATE_GEOFENCE: {
      const name = String(args.name || 'Tactical Geofence').trim();
      const locked = Boolean(args.lock);
      let ringCoords = [];
      let usedFallback = false;

      // Check if multi-point polygon coordinates were passed
      if (Array.isArray(args.coordinates) && args.coordinates.length >= 3) {
        ringCoords = args.coordinates.map((pt) => [Number(pt[0]), Number(pt[1])]);
      } else {
        // Generate regular geofence boundary around camera center or single point
        const { coordinates: centerPt, usedFallback: fb } = resolveSinglePointCoordinates(args, context);
        usedFallback = fb;
        const radiusM = parseRadiiInMeters(args)[0] || 15000;
        // Generate an 8-sided regular polygon geofence
        const ring = generateRangeRingVertices(centerPt, radiusM, 8);
        ringCoords = ring;
      }

      // Close ring if needed
      const first = ringCoords[0];
      const last = ringCoords[ringCoords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ringCoords.push([first[0], first[1]]);
      }

      const feature = engine.createFeature({
        name,
        type: FEATURE_TYPES.POLYGON,
        coordinates: ringCoords,
        properties: {
          classification: args.classification || 'restricted',
          alertOnBreach: true,
          source: 'voice_ai_dispatcher',
          usedCameraCenter: usedFallback,
        },
        style: args.style || {
          strokeColor: args.classification === 'hostile' ? '#ff3b30' : '#ff9500',
          fillColor: args.classification === 'hostile' ? 'rgba(255, 59, 48, 0.2)' : 'rgba(255, 149, 0, 0.15)',
          strokeWidth: 2,
        },
      });

      if (locked) {
        engine.lockFeature(feature.id, true);
      }

      const areaKm2 = feature.computed?.areaSquareKm ? feature.computed.areaSquareKm.toFixed(1) : '0';
      const perimKm = feature.computed?.perimeterKm ? feature.computed.perimeterKm.toFixed(1) : '0';

      const speech = `Established geofence ${name} covering ${areaKm2} square kilometers with a ${perimKm} kilometer perimeter.`;

      return {
        ok: true,
        action,
        speech,
        feature,
        metrics: feature.computed,
        usedCameraFallback: usedFallback,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 4: MEASURE DISTANCE
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.MEASURE_DISTANCE: {
      let waypoints = [];

      if (Array.isArray(args.waypoints) && args.waypoints.length >= 2) {
        waypoints = args.waypoints;
      } else if (Array.isArray(args.coordinates) && args.coordinates.length >= 2 && Array.isArray(args.coordinates[0])) {
        waypoints = args.coordinates;
      } else {
        // Measure between camera center and explicit point
        const cameraCenter = resolveCameraCenter(context.viewer || context.engine?.viewer, context.getViewCenter);
        const { coordinates: targetPt } = resolveSinglePointCoordinates(args, context);
        waypoints = [cameraCenter, targetPt];
      }

      const pathMetrics = calculatePathDistance(waypoints);
      const name = String(args.name || 'Distance Vector').trim();

      // Optionally save as persistent line feature
      let feature = null;
      if (args.saveFeature !== false) {
        feature = engine.createFeature({
          name,
          type: FEATURE_TYPES.LINE,
          coordinates: waypoints,
          properties: {
            source: 'voice_ai_dispatcher',
            distanceMeters: pathMetrics.totalMeters,
          },
          style: args.style || {
            strokeColor: '#00f0ff',
            strokeWidth: 2,
          },
        });
      }

      const km = pathMetrics.totalKm.toFixed(1);
      const nm = pathMetrics.totalNm.toFixed(1);
      const nodeCount = pathMetrics.nodeCount;

      const speech = `Measured distance: ${km} kilometers (${nm} nautical miles) across ${nodeCount} waypoints.`;

      return {
        ok: true,
        action,
        speech,
        metrics: pathMetrics,
        feature,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 5: FLY EXTENT
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.FLY_EXTENT: {
      let targetFeature = null;

      if (args.featureId) {
        targetFeature = engine.getFeature(args.featureId);
      } else if (args.name) {
        const queryName = String(args.name).toLowerCase();
        targetFeature = engine.getAllFeatures((f) => f.name.toLowerCase().includes(queryName))[0] || null;
      }

      if (targetFeature) {
        engine.flyToFeature(targetFeature.id);
        const speech = `Camera oriented to tactical feature ${targetFeature.name}.`;
        return {
          ok: true,
          action,
          speech,
          featureId: targetFeature.id,
          feature: targetFeature,
        };
      }

      // If no specific feature, frame all features
      const allFeatures = engine.getAllFeatures();
      if (allFeatures.length === 0) {
        const speech = 'No tactical features are currently plotted to frame.';
        return { ok: false, action, speech, count: 0 };
      }

      // Collect bounding boxes of all features
      let minLon = 180;
      let maxLon = -180;
      let minLat = 90;
      let maxLat = -90;

      for (const f of allFeatures) {
        const box = f.computed?.boundingBox;
        if (box) {
          if (box.minLon < minLon) minLon = box.minLon;
          if (box.maxLon > maxLon) maxLon = box.maxLon;
          if (box.minLat < minLat) minLat = box.minLat;
          if (box.maxLat > maxLat) maxLat = box.maxLat;
        }
      }

      const overallExtent = { minLon, minLat, maxLon, maxLat };
      engine.flyToExtent(overallExtent);

      const speech = `Oriented camera to encompass all ${allFeatures.length} tactical features.`;
      return {
        ok: true,
        action,
        speech,
        count: allFeatures.length,
        extent: overallExtent,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 6: CLEAR ALL
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.CLEAR_ALL: {
      const force = Boolean(args.force);
      const summary = engine.clearAll({ force });

      let lockedNote = '';
      if (summary.remainingCount > 0) {
        lockedNote = ` ${summary.remainingCount} locked feature${summary.remainingCount > 1 ? 's were' : ' was'} preserved. Say "force clear" to remove locked features.`;
      }

      const speech = `Cleared ${summary.deletedCount} tactical feature${summary.deletedCount === 1 ? '' : 's'}.${lockedNote}`;

      return {
        ok: true,
        action,
        speech,
        deletedCount: summary.deletedCount,
        remainingCount: summary.remainingCount,
      };
    }

    // -----------------------------------------------------------------------
    // ACTION 7: QUERY BREACHES
    // -----------------------------------------------------------------------
    case TACTICAL_ACTIONS.QUERY_BREACHES: {
      const breaches = [];

      // Check active breaches registered in GeofenceBreachEngine
      try {
        const sharedGeofence = getSharedGeofenceEngine();
        if (sharedGeofence && sharedGeofence.getActiveBreachCount() > 0) {
          const active = sharedGeofence.getActiveBreaches();
          for (const b of active) {
            breaches.push({
              featureId: b.geofenceId,
              featureName: b.geofenceName,
              targetId: b.unitName || b.unitId,
              unitType: b.unitType,
              violationType: b.violationType,
              severity: b.severity,
              speedKnots: b.speedKnots,
              speedLimitKnots: b.speedLimitKnots,
              coordinates: b.coordinates,
              classification: 'restricted',
            });
          }
        }
      } catch (err) {
        console.warn('[TacticalAiDispatcher] Shared geofence check warning:', err);
      }

      const geofences = engine.getAllFeatures((f) =>
        f.type === FEATURE_TYPES.POLYGON || f.type === FEATURE_TYPES.CIRCLE || f.type === FEATURE_TYPES.RANGE_RING
      );

      if (geofences.length === 0) {
        const speech = 'No active geofences or perimeter rings to monitor.';
        return { ok: true, action, speech, breaches: [], geofenceCount: 0 };
      }

      // Check explicit target coordinate if passed
      if (Array.isArray(args.targetCoordinate) && args.targetCoordinate.length >= 2) {
        const targetPt = [Number(args.targetCoordinate[0]), Number(args.targetCoordinate[1])];
        for (const fence of geofences) {
          if (args.featureId && fence.id !== args.featureId) continue;
          const res = engine.pointInFeature(targetPt, fence.id);
          if (res.inside) {
            breaches.push({
              featureId: fence.id,
              featureName: fence.name,
              targetId: args.targetId || 'Contact',
              coordinates: targetPt,
              classification: fence.properties?.classification || 'restricted',
            });
          }
        }
      }

      // Check live contacts from DataLayerManager if available
      if (context.dataManager && typeof context.dataManager.layers?.get === 'function') {
        const checkLayers = ['military', 'flights', 'ais-live-vessels'];
        for (const layerId of checkLayers) {
          const mod = context.dataManager.layers.get(layerId)?.module;
          if (!mod) continue;
          const records = mod.getAllPositions?.() || mod.getRecords?.() || [];
          for (const rec of records) {
            const lon = rec.longitude ?? rec.lon;
            const lat = rec.latitude ?? rec.lat;
            if (Number.isFinite(lon) && Number.isFinite(lat)) {
              const pt = [lon, lat];
              for (const fence of geofences) {
                if (args.featureId && fence.id !== args.featureId) continue;
                const check = engine.pointInFeature(pt, fence.id);
                if (check.inside) {
                  breaches.push({
                    featureId: fence.id,
                    featureName: fence.name,
                    targetId: rec.callsign || rec.name || rec.id || 'Unknown Contact',
                    layerId,
                    coordinates: pt,
                    classification: fence.properties?.classification || 'restricted',
                  });
                }
              }
            }
          }
        }
      }

      if (breaches.length > 0) {
        const fenceNames = Array.from(new Set(breaches.map((b) => b.featureName))).join(', ');
        const speech = `Warning: ${breaches.length} contact breach${breaches.length > 1 ? 'es' : ''} detected in ${fenceNames}.`;
        return {
          ok: true,
          action,
          speech,
          breaches,
          geofenceCount: geofences.length,
        };
      }

      const speech = `All clear: zero breaches detected across ${geofences.length} active geofence${geofences.length > 1 ? 's' : ''}.`;
      return {
        ok: true,
        action,
        speech,
        breaches: [],
        geofenceCount: geofences.length,
      };
    }

    default:
      throw new Error(`Unsupported tactical action: "${action}". Must be one of: ${Object.values(TACTICAL_ACTIONS).join(', ')}`);
  }
}

// =========================================================================
// MULTIMODAL AI INTEGRATION BRIDGES
// =========================================================================

/**
 * Pushes a detected POI from AI Schema Inspector or Multimodal Analyst into the Map Tools engine.
 *
 * @param {Object} poi
 * @param {string} poi.name - Name of POI
 * @param {number} poi.latitude - Decimal latitude
 * @param {number} poi.longitude - Decimal longitude
 * @param {string} [poi.category] - Category tag (e.g. 'Command', 'Radar', 'Recon', 'Facility')
 * @param {number} [poi.confidence] - AI confidence score (0..1)
 * @param {string} [poi.source] - Origin module name
 * @param {Object} [options={}]
 * @param {MapToolsEngine} [options.engine]
 * @returns {Object} Created tactical feature snapshot
 */
export function pushDetectedPoi(poi, options = {}) {
  if (!poi) throw new Error('Cannot push empty POI');

  const lon = Number(poi.longitude ?? poi.lon ?? poi.lng);
  const lat = Number(poi.latitude ?? poi.lat);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`Invalid POI coordinates: [${lon}, ${lat}]`);
  }

  const engine = options.engine || getSharedMapToolsEngine();
  const category = poi.category || 'Identified POI';

  // Tactical styling mapped to multimodal category
  const colorMap = {
    radar: '#00f0ff',
    command: '#ffcc00',
    threat: '#ff3b30',
    hostile: '#ff3b30',
    facility: '#30d158',
    recon: '#bf5af2',
  };

  const matchedKey = Object.keys(colorMap).find((k) => category.toLowerCase().includes(k));
  const color = matchedKey ? colorMap[matchedKey] : '#00f0ff';

  return engine.createFeature({
    name: poi.name || `POI-${Date.now().toString(36)}`,
    type: FEATURE_TYPES.POINT,
    coordinates: [lon, lat],
    properties: {
      category,
      confidence: poi.confidence ?? 1.0,
      source: poi.source || 'ai_schema_inspector',
      metadata: poi.metadata || {},
      notes: poi.notes || poi.summary || '',
    },
    style: {
      color,
      size: 10,
    },
  });
}

/**
 * Pushes an operational zone or perimeter boundary identified by Intelligence Analyst into Map Tools engine.
 *
 * @param {Object} zone
 * @param {string} zone.name - Zone identifier (e.g. "Cluster Luzon Sector")
 * @param {Array<[number, number]>} [zone.coordinates] - Boundary vertices
 * @param {[number, number]} [zone.center] - Central anchor coordinate
 * @param {number} [zone.radiusKm] - Radial buffer in kilometers
 * @param {string} [zone.zoneType='restricted'] - Classification
 * @param {string} [zone.source='intelligence_analyst']
 * @param {Object} [options={}]
 * @returns {Object} Created tactical feature snapshot
 */
export function pushOperationalZone(zone, options = {}) {
  if (!zone) throw new Error('Cannot push empty operational zone');

  const engine = options.engine || getSharedMapToolsEngine();
  const name = zone.name || 'Operational Zone';

  let ringCoordinates = [];
  if (Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
    ringCoordinates = zone.coordinates;
  } else if (zone.center && Number.isFinite(zone.center[0]) && Number.isFinite(zone.center[1])) {
    const radiusM = (zone.radiusKm || 10) * 1000;
    ringCoordinates = generateRangeRingVertices(zone.center, radiusM, 16);
  } else {
    throw new Error('Operational zone requires coordinates array or center point');
  }

  // Ensure closed polygon ring
  const first = ringCoordinates[0];
  const last = ringCoordinates[ringCoordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ringCoordinates.push([first[0], first[1]]);
  }

  return engine.createFeature({
    name,
    type: FEATURE_TYPES.POLYGON,
    coordinates: ringCoordinates,
    properties: {
      classification: zone.zoneType || 'restricted',
      threatLevel: zone.threatLevel || 'medium',
      assessment: zone.assessment || zone.summary || '',
      source: zone.source || 'intelligence_analyst',
      alertOnBreach: true,
    },
    style: {
      strokeColor: zone.threatLevel === 'high' ? '#ff3b30' : '#ff9500',
      fillColor: zone.threatLevel === 'high' ? 'rgba(255, 59, 48, 0.2)' : 'rgba(255, 149, 0, 0.15)',
      strokeWidth: 2,
    },
  });
}

/**
 * Ingests tabular sample rows or GeoJSON features parsed by the AI Schema Inspector en-masse.
 *
 * @param {Array<Object>} items - Array of data rows or GeoJSON features
 * @param {Object} [options={}]
 * @returns {{ count: number, features: Array<Object> }}
 */
export function ingestMultimodalSchemaData(items = [], options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { count: 0, features: [] };
  }

  const created = [];
  for (const item of items) {
    try {
      const lat = item.latitude ?? item.lat ?? item.Latitude ?? item.LAT;
      const lon = item.longitude ?? item.lon ?? item.lng ?? item.Longitude ?? item.LON;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        const feat = pushDetectedPoi(
          {
            name: item.name || item.Name || item.title || item.Title || 'Detected Entity',
            latitude: Number(lat),
            longitude: Number(lon),
            category: item.category || item.Category || 'Multimodal POI',
            confidence: item.confidence || 0.95,
            source: 'schema_inspector_batch',
            metadata: item,
          },
          options
        );
        created.push(feat);
      }
    } catch {
      // Continue batching
    }
  }

  return {
    count: created.length,
    features: created,
  };
}
