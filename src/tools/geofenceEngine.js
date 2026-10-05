/**
 * GEOFENCE & TELEMETRY BREACH EVALUATION ENGINE
 * High-performance, real-time spatial boundary surveillance engine.
 * Continuously evaluates moving unit telemetry against active geofence perimeters,
 * raising Ingress, Egress, and Speed Ceiling alarms with O(1) bounding-box pre-filtering.
 *
 * @module src/tools/geofenceEngine.js
 */

import {
  haversineDistance,
  haversineDistanceMeters,
  pointInPolygon,
  pointInCircle,
  calculateBoundingBox,
  normalizeCoordinate,
} from './geodesicMath.js';
import { getSharedMapToolsEngine } from './mapToolsEngine.js';

/**
 * Standard Geofence Rule Types
 */
export const GEOFENCE_RULES = Object.freeze({
  KEEP_OUT: 'keep_out',       // Restricted zone: breach if unit is INSIDE
  KEEP_IN: 'keep_in',         // Mandatory operational zone/corridor: breach if unit is OUTSIDE
  SPEED_LIMIT: 'speed_limit', // Velocity threshold zone: breach if inside AND speed > limit
});

/**
 * Breach Violation Event Types
 */
export const VIOLATION_TYPES = Object.freeze({
  INGRESS: 'ingress_breach',        // Unauthorized entry into restricted perimeter
  EGRESS: 'egress_breach',          // Deviation outside mandatory operational boundary
  SPEED_CEILING: 'speed_violation', // Velocity exceeded inside restricted/monitored zone
});

/**
 * Breach Event Action Types for event bus
 */
export const BREACH_EVENTS = Object.freeze({
  TRIGGERED: 'gev:geofence:breach-triggered',
  CLEARED: 'gev:geofence:breach-cleared',
  UPDATED: 'gev:geofence:breach-updated',
  SCAN_COMPLETED: 'gev:geofence:scan-completed',
  MAPTOOLS_BREACH: 'gev:maptools:breach',
});

/**
 * Generates natural language speech text for AI Voice Assistant or browser speech synthesizer.
 *
 * @param {Object} breach
 * @returns {string}
 */
export function generateSpeechAlertText(breach) {
  if (!breach) return '';
  const unit = breach.unitName || breach.unitId || 'Unidentified contact';
  const zone = breach.geofenceName || 'restricted sector';

  if (breach.violationType === VIOLATION_TYPES.INGRESS) {
    return `Tactical Alert: Ingress breach detected in ${zone}. Contact ${unit} has entered unauthorized boundary.`;
  }
  if (breach.violationType === VIOLATION_TYPES.EGRESS) {
    return `Tactical Warning: Egress breach. Contact ${unit} has deviated outside authorized perimeter ${zone}.`;
  }
  if (breach.violationType === VIOLATION_TYPES.SPEED_CEILING) {
    const spd = Math.round(breach.speedKnots || 0);
    const limit = Math.round(breach.speedLimitKnots || 0);
    return `Tactical Alert: Speed ceiling violation in ${zone}. Contact ${unit} traveling at ${spd} knots, exceeding ${limit} knot limit.`;
  }
  return `Tactical Alert: Geofence violation detected by contact ${unit} in ${zone}.`;
}

let _lastSpokenTime = 0;
let _lastSpokenPhrase = '';

/**
 * Verbally speaks breach alert using the Web Speech API and alerts the AI Voice Assistant if active.
 *
 * @param {string} speechText
 * @param {Object} [options={}]
 * @param {'high'|'standard'} [options.priority='high']
 * @param {number} [options.minIntervalMs=3000]
 * @returns {boolean}
 */
export function speakVerbalBreachAlert(speechText, { priority = 'high', minIntervalMs = 3000 } = {}) {
  if (typeof window === 'undefined' || !speechText) return false;

  const now = Date.now();
  if (now - _lastSpokenTime < minIntervalMs && priority !== 'high') {
    return false;
  }
  if (_lastSpokenPhrase === speechText && now - _lastSpokenTime < 8000) {
    return false;
  }
  _lastSpokenTime = now;
  _lastSpokenPhrase = speechText;

  // 1. If WebRTC OpenAI Realtime session is active, notify the AI Voice Assistant
  if (window.__gevVoiceCommands && typeof window.__gevVoiceCommands.isActive === 'function' && window.__gevVoiceCommands.isActive()) {
    try {
      window.__gevVoiceCommands.notifyMapEvent?.({
        type: 'tactical_geofence_breach_alert',
        speechText,
        priority,
      });
    } catch {
      // Benign catch when voice state is transitioning
    }
  }

  // 2. Synthesize speech via Web Speech API in browser
  if (typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined') {
    try {
      if (window.speechSynthesis.speaking && priority !== 'high') {
        return false;
      }
      const utterance = new window.SpeechSynthesisUtterance(speechText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.95;

      const voices = window.speechSynthesis.getVoices?.() || [];
      const preferred = voices.find(
        (v) =>
          (v.lang?.startsWith('en') || v.lang === 'en-US') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('David') ||
            v.name.includes('Alex'))
      );
      if (preferred) utterance.voice = preferred;

      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      console.warn('[GeofenceEngine] Verbal speech synthesis warning:', err);
    }
  }

  return false;
}

/**
 * Calculates perpendicular or nearest distance from a point to a 2D line segment.
 * Coordinates in [lon, lat]. Returns distance in meters.
 *
 * @param {[number, number]} point - [lon, lat]
 * @param {[number, number]} p1 - Segment start [lon, lat]
 * @param {[number, number]} p2 - Segment end [lon, lat]
 * @returns {number} Distance in meters
 */
export function pointToSegmentDistanceMeters(point, p1, p2) {
  const [px, py] = point;
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return haversineDistanceMeters(point, p1);
  }

  // Projection parameter t
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj = [x1 + t * dx, y1 + t * dy];
  return haversineDistanceMeters(point, proj);
}

/**
 * Determines whether a point is within a corridor of given width along a polyline.
 *
 * @param {[number, number]} point - [lon, lat]
 * @param {Array<[number, number]>} polylineCoords - [[lon, lat], ...]
 * @param {number} widthMeters - Full corridor width in meters
 * @returns {boolean}
 */
export function pointInCorridor(point, polylineCoords, widthMeters) {
  if (!point || !Array.isArray(polylineCoords) || polylineCoords.length < 2) {
    return false;
  }
  const halfWidth = Math.max(1, widthMeters / 2);

  for (let i = 0; i < polylineCoords.length - 1; i += 1) {
    const d = pointToSegmentDistanceMeters(point, polylineCoords[i], polylineCoords[i + 1]);
    if (d <= halfWidth) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a point falls within a 2D bounding box [minLon, minLat, maxLon, maxLat].
 *
 * @param {number} lon
 * @param {number} lat
 * @param {[number, number, number, number]} bbox
 * @returns {boolean}
 */
export function pointInBoundingBox(lon, lat, bbox) {
  if (!bbox || bbox.length < 4) return true;
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Expands a 2D bounding box by an approximate meter buffer.
 *
 * @param {[number, number, number, number]} bbox - [minLon, minLat, maxLon, maxLat]
 * @param {number} bufferMeters
 * @returns {[number, number, number, number]}
 */
export function expandBoundingBox(bbox, bufferMeters = 0) {
  if (!bbox) return [-180, -90, 180, 90];

  let minLon;
  let minLat;
  let maxLon;
  let maxLat;

  if (Array.isArray(bbox)) {
    [minLon, minLat, maxLon, maxLat] = bbox;
  } else {
    minLon = bbox.minLon !== undefined ? bbox.minLon : -180;
    minLat = bbox.minLat !== undefined ? bbox.minLat : -90;
    maxLon = bbox.maxLon !== undefined ? bbox.maxLon : 180;
    maxLat = bbox.maxLat !== undefined ? bbox.maxLat : 90;
  }

  if (bufferMeters <= 0) {
    return [minLon, minLat, maxLon, maxLat];
  }

  // 1 degree latitude ~ 111,139 meters
  const degLat = bufferMeters / 111139;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const degLon = bufferMeters / (111139 * cosLat);

  return [
    Math.max(-180, minLon - degLon),
    Math.max(-90, minLat - degLat),
    Math.min(180, maxLon + degLon),
    Math.min(90, maxLat + degLat),
  ];
}

/**
 * GeofenceBreachEngine
 * Real-time telemetry scanner, spatial rules evaluator, and alarm coordinator.
 */
export class GeofenceBreachEngine {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.mapToolsEngine=null] - Optional reference to MapToolsEngine
   * @param {boolean} [options.syncWindowEvents=true]
   * @param {boolean} [options.voiceAlertsEnabled=true]
   */
  constructor(options = {}) {
    this.mapToolsEngine = options.mapToolsEngine || null;
    this.syncWindowEvents = options.syncWindowEvents ?? (typeof window !== 'undefined');
    this.voiceAlertsEnabled = options.voiceAlertsEnabled ?? true;

    /** Active breaches indexed by composite key `${unitId}::${geofenceId}::${violationType}` */
    this.activeBreaches = new Map();

    /** Historical breach feed log (newest first, capped at 250 records) */
    this.breachHistory = [];

    /** Geofence definitions indexed by id */
    this.geofences = new Map();

    /** Unit tracking state registry */
    this.monitoredUnits = new Map();

    /** Event listeners */
    this.eventTarget = new EventTarget();

    /** Simulation runner reference */
    this._simulationTimer = null;
    this._simulationStep = 0;
    this._simulationTracks = [];

    /** Automated background telemetry monitor */
    this._telemetryMonitorTimer = null;

    // Automatically sync geofences from MapToolsEngine if provided
    if (this.mapToolsEngine) {
      this._bindMapToolsEngine();
    }
  }

  /**
   * Binds to MapToolsEngine CRUD events to auto-register / unregister tactical geofences.
   * @private
   */
  _bindMapToolsEngine() {
    this.mapToolsEngine.addEventListener('create', (e) => {
      if (e.detail?.feature) this.registerGeofenceFromFeature(e.detail.feature);
    });
    this.mapToolsEngine.addEventListener('update', (e) => {
      if (e.detail?.feature) this.registerGeofenceFromFeature(e.detail.feature);
    });
    this.mapToolsEngine.addEventListener('delete', (e) => {
      if (e.detail?.id) this.unregisterGeofence(e.detail.id);
    });

    // Populate existing features from engine
    const existing = this.mapToolsEngine.getAllFeatures();
    existing.forEach((f) => this.registerGeofenceFromFeature(f));
  }

  /**
   * Registers or updates a geofence zone from a MapToolsEngine feature.
   *
   * @param {Object} feature
   */
  registerGeofenceFromFeature(feature) {
    if (!feature || !feature.id) return;

    // Detect if this feature should be monitored as a geofence
    // Supported types: polygon, circle, corridor, range_ring, or explicit rule
    const rule = feature.geofenceRule || (feature.type === 'corridor' ? GEOFENCE_RULES.KEEP_IN : GEOFENCE_RULES.KEEP_OUT);
    const speedLimitKnots = Number(feature.speedLimitKnots || feature.speedCeilingKnots || 0);

    const geofence = {
      id: feature.id,
      name: feature.name || `Geofence ${feature.id.slice(0, 8)}`,
      type: feature.type,
      rule,
      enabled: feature.geofenceEnabled !== false,
      speedLimitKnots,
      severity: feature.severity || (rule === GEOFENCE_RULES.KEEP_OUT ? 'critical' : 'warning'),
      coordinates: feature.coordinates || [],
      center: feature.center || null,
      radiusMeters: feature.radiusMeters || 0,
      radii: feature.radii || [],
      widthMeters: feature.widthMeters || 1000,
      color: feature.color || '#00e5ff',
      _bbox: null,
    };

    // Calculate and cache bounding box for O(1) pre-filtering
    this._computeGeofenceBoundingBox(geofence);
    this.geofences.set(geofence.id, geofence);
  }

  /**
   * Directly registers an arbitrary custom geofence perimeter.
   *
   * @param {Object} geofenceConfig
   */
  registerGeofence(geofenceConfig) {
    if (!geofenceConfig || !geofenceConfig.id) {
      throw new Error('Geofence configuration requires a unique id');
    }

    const geofence = {
      id: geofenceConfig.id,
      name: geofenceConfig.name || `Geofence ${geofenceConfig.id}`,
      type: geofenceConfig.type || 'polygon',
      rule: geofenceConfig.rule || GEOFENCE_RULES.KEEP_OUT,
      enabled: geofenceConfig.enabled !== false,
      speedLimitKnots: Number(geofenceConfig.speedLimitKnots || 0),
      severity: geofenceConfig.severity || 'critical',
      coordinates: geofenceConfig.coordinates || [],
      center: geofenceConfig.center || null,
      radiusMeters: geofenceConfig.radiusMeters || 0,
      radii: geofenceConfig.radii || [],
      widthMeters: geofenceConfig.widthMeters || 1000,
      color: geofenceConfig.color || '#ef4444',
      _bbox: null,
    };

    this._computeGeofenceBoundingBox(geofence);
    this.geofences.set(geofence.id, geofence);
    return geofence;
  }

  /**
   * Removes a geofence by ID and clears any active breaches associated with it.
   *
   * @param {string} geofenceId
   */
  unregisterGeofence(geofenceId) {
    this.geofences.delete(geofenceId);

    // Clear active breaches for this geofence
    const toClear = [];
    for (const [key, breach] of this.activeBreaches.entries()) {
      if (breach.geofenceId === geofenceId) {
        toClear.push(key);
      }
    }
    toClear.forEach((key) => {
      const b = this.activeBreaches.get(key);
      this._resolveBreach(b, 'geofence_removed');
      this.activeBreaches.delete(key);
    });

    this._updateGlobeVisuals(geofenceId, false);
  }

  /**
   * Pre-calculates the 2D bounding box with safety margin for rapid rejection.
   * @private
   */
  _computeGeofenceBoundingBox(geofence) {
    if (geofence.type === 'circle' && geofence.center && geofence.radiusMeters > 0) {
      const [lon, lat] = geofence.center;
      const degLat = geofence.radiusMeters / 111139;
      const degLon = geofence.radiusMeters / (111139 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      geofence._bbox = [lon - degLon, lat - degLat, lon + degLon, lat + degLat];
    } else if (geofence.type === 'range_ring' && geofence.center) {
      const maxR = geofence.radii?.length ? Math.max(...geofence.radii) : (geofence.radiusMeters || 10000);
      const [lon, lat] = geofence.center;
      const degLat = maxR / 111139;
      const degLon = maxR / (111139 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      geofence._bbox = [lon - degLon, lat - degLat, lon + degLon, lat + degLat];
    } else if (geofence.type === 'point' || (Array.isArray(geofence.coordinates) && typeof geofence.coordinates[0] === 'number')) {
      const coord = geofence.center || (Array.isArray(geofence.coordinates) && typeof geofence.coordinates[0] === 'number' ? geofence.coordinates : null);
      if (Array.isArray(coord) && typeof coord[0] === 'number') {
        const [lon, lat] = coord;
        geofence._bbox = [lon - 0.005, lat - 0.005, lon + 0.005, lat + 0.005];
      } else {
        geofence._bbox = [-180, -90, 180, 90];
      }
    } else if (Array.isArray(geofence.coordinates) && geofence.coordinates.length > 0) {
      const rawBbox = calculateBoundingBox(geofence.coordinates);
      const buffer = geofence.type === 'corridor' ? (geofence.widthMeters || 1000) / 2 : 0;
      geofence._bbox = expandBoundingBox(rawBbox, buffer);
    } else {
      geofence._bbox = [-180, -90, 180, 90];
    }
  }

  /**
   * Evaluates spatial containment of a coordinate [lon, lat] against a specific geofence.
   *
   * @param {[number, number]} coord - [lon, lat]
   * @param {Object} geofence
   * @returns {boolean} True if point is INSIDE the perimeter
   */
  isPointInsideGeofence(coord, geofence) {
    const [lon, lat] = coord;

    // Fast BBox Pre-Filter
    if (geofence._bbox && !pointInBoundingBox(lon, lat, geofence._bbox)) {
      return false;
    }

    if (geofence.type === 'circle' && geofence.center && geofence.radiusMeters > 0) {
      return pointInCircle(coord, geofence.center, geofence.radiusMeters);
    }

    if (geofence.type === 'range_ring' && geofence.center) {
      const maxR = geofence.radii?.length ? Math.max(...geofence.radii) : geofence.radiusMeters;
      return pointInCircle(coord, geofence.center, maxR);
    }

    if (geofence.type === 'corridor') {
      return pointInCorridor(coord, geofence.coordinates, geofence.widthMeters || 1000);
    }

    if (geofence.type === 'polygon' || geofence.type === 'geofence') {
      return pointInPolygon(coord, geofence.coordinates);
    }

    return false;
  }

  /**
   * Ingests a single telemetry packet and evaluates boundary rules.
   *
   * @param {Object} packet
   * @param {string} packet.unitId - Unique identifier (MMSI, ICAO, Call sign)
   * @param {string} [packet.name] - Friendly name
   * @param {[number, number]} packet.coordinates - [lon, lat]
   * @param {number} [packet.speedKnots=0] - Speed in knots
   * @param {string} [packet.unitType='vessel'] - 'vessel' | 'aircraft' | 'vehicle'
   * @param {number} [packet.timestamp=Date.now()]
   * @returns {Array<Object>} List of newly triggered or ongoing violations
   */
  evaluateTelemetryPacket(packet) {
    if (!packet || !packet.unitId || !packet.coordinates) {
      return [];
    }

    const unitId = String(packet.unitId);
    const name = packet.name || unitId;
    const [lon, lat] = packet.coordinates;
    const speedKnots = Number(packet.speedKnots || 0);
    const unitType = packet.unitType || 'vessel';
    const timestamp = Number(packet.timestamp || Date.now());

    this.monitoredUnits.set(unitId, {
      unitId,
      name,
      coordinates: [lon, lat],
      speedKnots,
      unitType,
      lastSeen: timestamp,
    });

    const activeViolations = [];

    // Evaluate against each active geofence
    for (const geofence of this.geofences.values()) {
      if (!geofence.enabled) continue;

      const isInside = this.isPointInsideGeofence([lon, lat], geofence);
      let violationType = null;
      let reason = '';

      // Rule 1: KEEP_OUT (Ingress Breach)
      if (geofence.rule === GEOFENCE_RULES.KEEP_OUT && isInside) {
        violationType = VIOLATION_TYPES.INGRESS;
        reason = `Unauthorized Ingress into restricted zone [${geofence.name}]`;
      }

      // Rule 2: KEEP_IN (Egress Breach)
      else if (geofence.rule === GEOFENCE_RULES.KEEP_IN && !isInside) {
        violationType = VIOLATION_TYPES.EGRESS;
        reason = `Egress violation: Unit strayed outside designated perimeter/corridor [${geofence.name}]`;
      }

      // Rule 3: SPEED_LIMIT (Velocity Ceiling)
      if (geofence.speedLimitKnots > 0 && isInside && speedKnots > geofence.speedLimitKnots) {
        // Can either be standalone speed violation or additional breach
        const speedKey = `${unitId}::${geofence.id}::${VIOLATION_TYPES.SPEED_CEILING}`;
        this._handleViolation(speedKey, {
          unitId,
          unitName: name,
          unitType,
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          violationType: VIOLATION_TYPES.SPEED_CEILING,
          rule: geofence.rule,
          severity: 'warning',
          speedKnots,
          speedLimitKnots: geofence.speedLimitKnots,
          coordinates: [lon, lat],
          timestamp,
          reason: `Speed ceiling exceeded (${speedKnots.toFixed(1)} kts > ${geofence.speedLimitKnots} kts) inside [${geofence.name}]`,
        });
      } else {
        // Clear speed breach if no longer overspeeding
        const speedKey = `${unitId}::${geofence.id}::${VIOLATION_TYPES.SPEED_CEILING}`;
        if (this.activeBreaches.has(speedKey)) {
          this._resolveBreach(this.activeBreaches.get(speedKey), 'speed_normalized');
          this.activeBreaches.delete(speedKey);
        }
      }

      // Handle Primary Boundary Ingress / Egress
      const boundKey = `${unitId}::${geofence.id}::${violationType || 'boundary'}`;
      if (violationType) {
        const breach = this._handleViolation(boundKey, {
          unitId,
          unitName: name,
          unitType,
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          violationType,
          rule: geofence.rule,
          severity: geofence.severity || 'critical',
          speedKnots,
          speedLimitKnots: geofence.speedLimitKnots,
          coordinates: [lon, lat],
          timestamp,
          reason,
        });
        activeViolations.push(breach);
      } else {
        // Clear primary boundary breach if resolved
        for (const vType of [VIOLATION_TYPES.INGRESS, VIOLATION_TYPES.EGRESS]) {
          const testKey = `${unitId}::${geofence.id}::${vType}`;
          if (this.activeBreaches.has(testKey)) {
            this._resolveBreach(this.activeBreaches.get(testKey), 'perimeter_restored');
            this.activeBreaches.delete(testKey);
          }
        }
      }
    }

    return activeViolations;
  }

  /**
   * Internal handler to record or update an active breach alarm.
   * @private
   */
  _handleViolation(key, data) {
    const existing = this.activeBreaches.get(key);

    if (existing) {
      existing.lastDetectedAt = data.timestamp;
      existing.durationMs = data.timestamp - existing.firstDetectedAt;
      existing.speedKnots = data.speedKnots;
      existing.coordinates = data.coordinates;
      this._emitBreachEvent(BREACH_EVENTS.UPDATED, existing);
      return existing;
    }

    // New breach triggered
    const breachRecord = {
      id: `breach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      unitId: data.unitId,
      unitName: data.unitName,
      unitType: data.unitType,
      geofenceId: data.geofenceId,
      geofenceName: data.geofenceName,
      violationType: data.violationType,
      rule: data.rule,
      severity: data.severity,
      speedKnots: data.speedKnots,
      speedLimitKnots: data.speedLimitKnots,
      coordinates: data.coordinates,
      firstDetectedAt: data.timestamp,
      lastDetectedAt: data.timestamp,
      durationMs: 0,
      active: true,
      reason: data.reason,
    };

    this.activeBreaches.set(key, breachRecord);

    // Prepend to feed history
    this.breachHistory.unshift(breachRecord);
    if (this.breachHistory.length > 250) {
      this.breachHistory.pop();
    }

    this._updateGlobeVisuals(data.geofenceId, true);
    this._emitBreachEvent(BREACH_EVENTS.TRIGGERED, breachRecord);
    return breachRecord;
  }

  /**
   * Internal handler to resolve and log a cleared breach.
   * @private
   */
  _resolveBreach(breach, reason = 'cleared') {
    if (!breach) return;
    breach.active = false;
    breach.clearedAt = Date.now();
    breach.clearReason = reason;

    // Check if geofence has any remaining active breaches
    let hasOtherBreachesInZone = false;
    for (const b of this.activeBreaches.values()) {
      if (b.active && b.geofenceId === breach.geofenceId && b.id !== breach.id) {
        hasOtherBreachesInZone = true;
        break;
      }
    }

    if (!hasOtherBreachesInZone) {
      this._updateGlobeVisuals(breach.geofenceId, false);
    }

    this._emitBreachEvent(BREACH_EVENTS.CLEARED, breach);
  }

  /**
   * Updates globe visual state of the geofence entity (pulsing alarm vs normal).
   * @private
   */
  _updateGlobeVisuals(geofenceId, isBreached) {
    if (this.mapToolsEngine && typeof this.mapToolsEngine.setFeatureBreachHighlight === 'function') {
      this.mapToolsEngine.setFeatureBreachHighlight(geofenceId, isBreached);
    }
  }

  /**
   * Dispatches events across both internal EventTarget and window CustomEvents.
   * Dispatches both specific breach event and standard gev:maptools:breach for AI Voice.
   * @private
   */
  _emitBreachEvent(eventName, breach) {
    const speechText = generateSpeechAlertText(breach);
    const actionType =
      eventName === BREACH_EVENTS.TRIGGERED
        ? 'breach_triggered'
        : eventName === BREACH_EVENTS.CLEARED
          ? 'breach_cleared'
          : 'breach_updated';

    const detail = {
      breach,
      speechText,
      action: actionType,
      priority: breach.severity === 'critical' ? 'high' : 'standard',
      activeBreachCount: this.getActiveBreachCount(),
      timestamp: Date.now(),
    };

    this.eventTarget.dispatchEvent(new CustomEvent(eventName, { detail }));

    if (this.syncWindowEvents && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    // Always dispatch gev:maptools:breach for cross-system coordination and AI Voice Assistant
    this.eventTarget.dispatchEvent(new CustomEvent(BREACH_EVENTS.MAPTOOLS_BREACH, { detail }));
    if (this.syncWindowEvents && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BREACH_EVENTS.MAPTOOLS_BREACH, { detail }));
    }

    // Trigger verbal speech synthesis if enabled and event is a triggered breach
    if (this.voiceAlertsEnabled && eventName === BREACH_EVENTS.TRIGGERED) {
      speakVerbalBreachAlert(speechText, {
        priority: breach.severity === 'critical' ? 'high' : 'standard',
      });
    }
  }

  /**
   * Scans an entire telemetry array (e.g. 1,000+ AIS vessels or flight contacts).
   * Highly optimized with bounding box pre-filtering to maintain < 16ms performance.
   *
   * @param {Array<Object>} telemetryBatch
   * @returns {{ scannedCount: number, durationMs: number, activeBreachesCount: number }}
   */
  scanTelemetryBatch(telemetryBatch) {
    if (!Array.isArray(telemetryBatch) || telemetryBatch.length === 0) {
      return { scannedCount: 0, durationMs: 0, activeBreachesCount: this.getActiveBreachCount() };
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let count = 0;

    for (let i = 0; i < telemetryBatch.length; i += 1) {
      this.evaluateTelemetryPacket(telemetryBatch[i]);
      count += 1;
    }

    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

    const summary = {
      scannedCount: count,
      durationMs,
      activeBreachesCount: this.getActiveBreachCount(),
    };

    if (this.syncWindowEvents && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BREACH_EVENTS.SCAN_COMPLETED, { detail: summary }));
    }

    return summary;
  }

  /**
   * Returns all active breach alarms.
   * @returns {Array<Object>}
   */
  getActiveBreaches() {
    return Array.from(this.activeBreaches.values());
  }

  /**
   * Returns the count of currently active breach alarms.
   * @returns {number}
   */
  getActiveBreachCount() {
    return this.activeBreaches.size;
  }

  /**
   * Returns recent breach log history (both active and resolved).
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  getBreachHistory(limit = 50) {
    return this.breachHistory.slice(0, limit);
  }

  /**
   * Manually acknowledges and dismisses a breach alarm.
   *
   * @param {string} breachId
   */
  acknowledgeBreach(breachId) {
    for (const [key, b] of this.activeBreaches.entries()) {
      if (b.id === breachId) {
        this._resolveBreach(b, 'acknowledged_by_operator');
        this.activeBreaches.delete(key);
        break;
      }
    }
  }

  /**
   * Clears resolved logs from feed history.
   */
  clearResolvedHistory() {
    this.breachHistory = this.breachHistory.filter((b) => b.active);
  }

  /**
   * Subscribes a callback to breach events.
   *
   * @param {string} event - 'breach-triggered' | 'breach-cleared' | 'breach-updated'
   * @param {Function} callback
   */
  addEventListener(event, callback) {
    const mapped = event.startsWith('gev:') ? event : `gev:geofence:${event}`;
    this.eventTarget.addEventListener(mapped, callback);
  }

  /**
   * Unsubscribes a callback from breach events.
   *
   * @param {string} event
   * @param {Function} callback
   */
  removeEventListener(event, callback) {
    const mapped = event.startsWith('gev:') ? event : `gev:geofence:${event}`;
    this.eventTarget.removeEventListener(mapped, callback);
  }

  /**
   * Built-in Simulation Driver
   * Generates moving tracks that cross in and out of a sample geofence to verify
   * Ingress, Speed Ceiling violation, and Egress clearing.
   *
   * @param {Object} [options={}]
   * @param {number} [options.intervalMs=600]
   * @param {Function} [options.onStep=null]
   */
  startSimulation(options = {}) {
    this.stopSimulation();

    // Ensure at least one test geofence exists (e.g. Manila Bay Restricted Zone)
    let testGeofence = Array.from(this.geofences.values())[0];
    if (!testGeofence) {
      testGeofence = this.registerGeofence({
        id: 'sim-manila-bay-restricted',
        name: 'Manila Anchorage Restricted Zone',
        type: 'polygon',
        rule: GEOFENCE_RULES.KEEP_OUT,
        speedLimitKnots: 12.0,
        severity: 'critical',
        coordinates: [
          [120.93, 14.54],
          [120.97, 14.54],
          [120.97, 14.58],
          [120.93, 14.58],
          [120.93, 14.54],
        ],
      });
    }

    // Waypoints for simulated patrol unit
    // Starts outside, enters restricted polygon, accelerates, and departs outside
    const waypoints = [
      { coords: [120.9100, 14.5300], speed: 10.0, note: 'Outside restricted zone (Secure)' },
      { coords: [120.9250, 14.5360], speed: 11.5, note: 'Approaching boundary' },
      { coords: [120.9400, 14.5500], speed: 11.8, note: 'Inside zone (Ingress Breach Triggered!)' },
      { coords: [120.9500, 14.5600], speed: 24.2, note: 'Accelerating inside zone (Speed Ceiling Breach!)' },
      { coords: [120.9600, 14.5700], speed: 26.8, note: 'High-speed transit through zone' },
      { coords: [120.9850, 14.5900], speed: 14.0, note: 'Exiting zone boundary (Breach Cleared!)' },
      { coords: [120.9950, 14.6000], speed: 10.5, note: 'Outside perimeter (Normal operation)' },
    ];

    this._simulationStep = 0;
    const interval = options.intervalMs || 700;

    this._simulationTimer = setInterval(() => {
      const wp = waypoints[this._simulationStep % waypoints.length];

      const packet = {
        unitId: 'SIM-PH-PATROL-401',
        name: 'Fast Interceptor Orion',
        unitType: 'vessel',
        coordinates: wp.coords,
        speedKnots: wp.speed,
        timestamp: Date.now(),
      };

      const violations = this.evaluateTelemetryPacket(packet);

      if (typeof options.onStep === 'function') {
        options.onStep({
          step: this._simulationStep,
          packet,
          violations,
          activeCount: this.getActiveBreachCount(),
          note: wp.note,
        });
      }

      this._simulationStep += 1;
    }, interval);

    return {
      geofence: testGeofence,
      waypointsCount: waypoints.length,
    };
  }

  /**
   * Starts automated continuous background monitoring of telemetry against active boundaries.
   * Evaluates live units (e.g. from DataLayerManager) on an interval and raises breach alarms.
   *
   * @param {Object} [options={}]
   * @param {Object} [options.dataManager=null]
   * @param {number} [options.intervalMs=2000]
   * @param {Function} [options.getLiveUnits=null]
   * @param {Function} [options.onScan=null]
   * @returns {{ active: boolean, intervalMs: number }}
   */
  startAutomatedTelemetryMonitor({ dataManager = null, intervalMs = 2000, getLiveUnits = null, onScan = null } = {}) {
    this.stopAutomatedTelemetryMonitor();

    const targetDataManager =
      dataManager || (typeof window !== 'undefined' ? window.__godsEyeView?.dataManager : null);

    this._telemetryMonitorTimer = setInterval(() => {
      let units = [];
      if (typeof getLiveUnits === 'function') {
        units = getLiveUnits();
      } else if (targetDataManager) {
        units = extractTelemetryFromDataManager(targetDataManager);
      }

      if (Array.isArray(units) && units.length > 0) {
        const scanResult = this.scanTelemetryBatch(units);
        if (typeof onScan === 'function') {
          onScan(scanResult);
        }
      }
    }, Math.max(500, intervalMs));

    return {
      active: true,
      intervalMs,
    };
  }

  /**
   * Stops automated telemetry monitor.
   */
  stopAutomatedTelemetryMonitor() {
    if (this._telemetryMonitorTimer) {
      clearInterval(this._telemetryMonitorTimer);
      this._telemetryMonitorTimer = null;
    }
  }

  /**
   * Checks if automated telemetry monitoring is currently active.
   * @returns {boolean}
   */
  isAutomatedTelemetryMonitorRunning() {
    return this._telemetryMonitorTimer !== null;
  }

  /**
   * Stops active simulation runner.
   */
  stopSimulation() {
    if (this._simulationTimer) {
      clearInterval(this._simulationTimer);
      this._simulationTimer = null;
    }
  }

  /**
   * Resets all engine state and cleans up timers.
   */
  destroy() {
    this.stopSimulation();
    this.stopAutomatedTelemetryMonitor();
    this.activeBreaches.clear();
    this.breachHistory = [];
    this.geofences.clear();
    this.monitoredUnits.clear();
  }
}

/**
 * Extracts and normalizes live unit coordinates and speeds from DataLayerManager layers.
 * Extracts positions across flights, military flights, AIS live vessels, and satellites.
 *
 * @param {Object} dataManager
 * @returns {Array<Object>} Normalized telemetry packets
 */
export function extractTelemetryFromDataManager(dataManager) {
  if (!dataManager || typeof dataManager.layers?.get !== 'function') {
    return [];
  }

  const packets = [];
  const layerDefs = [
    { id: 'flights', type: 'aircraft', defaultSpeed: 450 },
    { id: 'militaryFlights', type: 'military_aircraft', defaultSpeed: 520 },
    { id: 'aisLiveVessels', type: 'vessel', defaultSpeed: 16 },
    { id: 'satellites', type: 'satellite', defaultSpeed: 14000 },
  ];

  for (const def of layerDefs) {
    const layer = dataManager.layers.get(def.id)?.module;
    if (!layer) continue;

    let positions = [];
    if (typeof layer.getAllPositions === 'function') {
      positions = layer.getAllPositions(def.id === 'aisLiveVessels' ? 800 : 500) || [];
    } else if (typeof layer.getRecords === 'function') {
      positions = layer.getRecords() || [];
    }

    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      const lon = p.longitude ?? p.lon;
      const lat = p.latitude ?? p.lat;

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const unitId = String(p.id ?? p.icao24 ?? p.mmsi ?? `contact-${i}`);
      const name = p.label || p.callsign || p.name || unitId;
      const speedKnots = Number(
        p.speedKnots ?? (Number.isFinite(p.speed) ? p.speed * 1.94384 : def.defaultSpeed)
      );

      packets.push({
        unitId,
        name,
        unitType: p.unitType || def.type,
        layerId: def.id,
        coordinates: [lon, lat],
        speedKnots,
        altitudeM: p.altitudeM ?? p.altitude,
        timestamp: Date.now(),
      });
    }
  }

  return packets;
}

let _sharedGeofenceEngine = null;

/**
 * Returns singleton instance of GeofenceBreachEngine tied to shared MapToolsEngine.
 *
 * @param {Object} [options={}]
 * @returns {GeofenceBreachEngine}
 */
export function getSharedGeofenceEngine(options = {}) {
  if (!_sharedGeofenceEngine) {
    const mapToolsEngine = options.mapToolsEngine || getSharedMapToolsEngine();
    _sharedGeofenceEngine = new GeofenceBreachEngine({ mapToolsEngine, ...options });
  }
  return _sharedGeofenceEngine;
}

/**
 * Resets the shared singleton instance of GeofenceBreachEngine.
 */
export function resetSharedGeofenceEngine() {
  if (_sharedGeofenceEngine) {
    if (typeof _sharedGeofenceEngine.destroy === 'function') {
      _sharedGeofenceEngine.destroy();
    }
    _sharedGeofenceEngine = null;
  }
}
