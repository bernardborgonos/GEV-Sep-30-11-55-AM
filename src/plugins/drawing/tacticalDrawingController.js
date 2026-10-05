/**
 * @module src/plugins/drawing/tacticalDrawingController.js
 * @description Decoupled spatial calculation and interactive Cesium drafting engine
 * for tactical drawing tools:
 * 1. Line / Path (Polyline with ground clamping)
 * 2. Vector Arrow (Directional vector with bearing, distance, and arrowhead wings)
 * 3. POI Marker (Tactical pushpin point of interest)
 * 4. Waypoints (Multi-node mission route with waypoint sequencing and leg metrics)
 */

import {
  EARTH_RADIUS_METERS,
  haversineDistance,
  initialBearing,
  destinationPoint,
  normalizeCoordinate,
  generateRangeRingVertices,
} from '../../tools/geodesicMath.js';

/**
 * Calculates great-circle bearing between two points in degrees [0, 360).
 * @param {Array<number>|Object} p1 - Origin [lon, lat] or { lat, lng }
 * @param {Array<number>|Object} p2 - Target [lon, lat] or { lat, lng }
 * @returns {number} Bearing in degrees from true North
 */
export function calculateBearing(p1, p2) {
  return initialBearing(p1, p2);
}

/**
 * Calculates distance between two coordinates in requested unit.
 * @param {Array<number>|Object} p1
 * @param {Array<number>|Object} p2
 * @param {'m'|'km'|'nm'} [unit='km']
 * @returns {number}
 */
export function calculateDistance(p1, p2, unit = 'km') {
  return haversineDistance(p1, p2, unit);
}

/**
 * Generates vector arrow geometry including main shaft, arrowhead wings,
 * bearing, ground distance, and tactical label.
 *
 * @param {Array<number>|Object} origin - Start point [lon, lat] or { lat, lng }
 * @param {Array<number>|Object} target - End point [lon, lat] or { lat, lng }
 * @param {Object} [options={}]
 * @param {number} [options.wingAngleDeg=150] - Wing offset angle in degrees
 * @param {number} [options.wingLengthRatio=0.12] - Ratio of arrow length for wings
 * @param {number} [options.minWingLengthMeters=30]
 * @param {number} [options.maxWingLengthMeters=4000]
 * @returns {Object} Vector arrow geometry descriptor
 */
export function generateVectorArrowGeometry(origin, target, options = {}) {
  const [lon1, lat1] = normalizeCoordinate(origin);
  const [lon2, lat2] = normalizeCoordinate(target);

  const bearing = initialBearing([lon1, lat1], [lon2, lat2]);
  const distanceMeters = haversineDistance([lon1, lat1], [lon2, lat2], 'm');
  const distanceKm = distanceMeters / 1000;
  const distanceNm = distanceMeters / 1852;

  const wingAngle = options.wingAngleDeg ?? 150;
  const ratio = options.wingLengthRatio ?? 0.12;
  const minWing = options.minWingLengthMeters ?? 30;
  const maxWing = options.maxWingLengthMeters ?? 4000;

  // Scale wing length proportional to distance with min/max clamps
  const wingLengthMeters = Math.min(maxWing, Math.max(minWing, distanceMeters * ratio));

  // Destination point for left and right wing tips
  const wingLeft = destinationPoint([lon2, lat2], wingLengthMeters, (bearing + wingAngle) % 360);
  const wingRight = destinationPoint([lon2, lat2], wingLengthMeters, (bearing - wingAngle + 360) % 360);

  const formattedBearing = Math.round(bearing).toString().padStart(3, '0');
  const label = `▶ ${formattedBearing}° · ${distanceKm < 10 ? distanceKm.toFixed(2) : distanceKm.toFixed(1)} km (${distanceNm.toFixed(1)} NM)`;

  return {
    origin: { lng: lon1, lat: lat1 },
    target: { lng: lon2, lat: lat2 },
    bearing,
    distanceMeters,
    distanceKm,
    distanceNm,
    label,
    shaft: [
      { lng: lon1, lat: lat1 },
      { lng: lon2, lat: lat2 },
    ],
    arrowhead: [
      { lng: wingLeft[0], lat: wingLeft[1] },
      { lng: lon2, lat: lat2 },
      { lng: wingRight[0], lat: wingRight[1] },
    ],
  };
}

/**
 * Computes tactical mission route with sequential numbered waypoints,
 * individual leg distances, and cumulative route distance.
 *
 * @param {Array<Object|Array<number>>} points - Sequence of coordinates
 * @param {Object} [options={}]
 * @param {string} [options.prefix='WP']
 * @returns {Object} Route descriptor
 */
export function generateWaypointsRoute(points, options = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return { waypoints: [], totalDistanceKm: 0, totalDistanceNm: 0, legs: [] };
  }

  const prefix = options.prefix || 'WP';
  const waypoints = [];
  const legs = [];
  let cumulativeDistMeters = 0;

  for (let i = 0; i < points.length; i++) {
    const [lon, lat, alt] = normalizeCoordinate(points[i]);
    const num = String(i + 1).padStart(2, '0');
    const id = `${prefix}-${num}`;

    let legDistMeters = 0;
    let legBearing = 0;

    if (i > 0) {
      const prev = waypoints[i - 1];
      legDistMeters = haversineDistance([prev.lng, prev.lat], [lon, lat], 'm');
      legBearing = initialBearing([prev.lng, prev.lat], [lon, lat]);
      cumulativeDistMeters += legDistMeters;

      legs.push({
        fromIndex: i - 1,
        toIndex: i,
        fromId: prev.id,
        toId: id,
        distanceMeters: legDistMeters,
        distanceKm: legDistMeters / 1000,
        distanceNm: legDistMeters / 1852,
        bearing: legBearing,
      });
    }

    waypoints.push({
      index: i,
      id,
      label: id,
      lng: lon,
      lat,
      alt: alt || 0,
      legDistanceKm: legDistMeters / 1000,
      legDistanceNm: legDistMeters / 1852,
      cumulativeDistanceKm: cumulativeDistMeters / 1000,
      cumulativeDistanceNm: cumulativeDistMeters / 1852,
      bearing: legBearing,
    });
  }

  return {
    waypoints,
    legs,
    totalDistanceMeters: cumulativeDistMeters,
    totalDistanceKm: cumulativeDistMeters / 1000,
    totalDistanceNm: cumulativeDistMeters / 1852,
  };
}

/**
 * Interactive Cesium Drawing Controller
 * Manages active drafting session on the 3D globe for all 4 drawing modes.
 */
export class TacticalCesiumDrawingSession {
  /**
   * @param {Object} options
   * @param {Object} options.viewer - Cesium viewer instance
   * @param {string} options.mode - 'polyline' | 'arrow' | 'marker' | 'waypoints'
   * @param {string} [options.color='#00e5ff']
   * @param {number} [options.strokeWidth=3]
   * @param {string} [options.label='']
   * @param {Function} [options.onUpdate]
   * @param {Function} [options.onComplete]
   * @param {Function} [options.onCancel]
   */
  constructor(options) {
    this.viewer = options.viewer;
    this.mode = options.mode;
    this.color = options.color || '#00e5ff';
    this.strokeWidth = options.strokeWidth || 3;
    this.label = options.label || '';
    this.onUpdate = options.onUpdate || null;
    this.onComplete = options.onComplete || null;
    this.onCancel = options.onCancel || null;

    this.points = [];
    this.mousePoint = null;
    this.isActive = true;
    this.handler = null;
    this.previewEntities = [];
    this.banner = null;

    if (this.viewer && typeof Cesium !== 'undefined') {
      this._initCesiumSession();
    }
  }

  _initCesiumSession() {
    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.viewer.scene.canvas.style.cursor = 'crosshair';

    this._createBanner();

    // 1. LEFT_CLICK
    this.handler.setInputAction((click) => {
      const coord = this._pickGlobePosition(click.position);
      if (!coord) return;

      this.points.push(coord);

      if (this.mode === 'marker') {
        // POI marker finishes on single click
        this._finish({
          type: 'marker',
          name: this.label || 'Point of Interest',
          coordinates: [coord],
          color: this.color,
        });
        return;
      }

      if (this.mode === 'measure') {
        if (this.points.length === 1) {
          this._updateBanner('MEASURE TAPE: Click target point to complete distance & bearing readout.');
          if (this.onUpdate) {
            this.onUpdate({ pointsCount: 1, status: 'Origin set. Click destination point.' });
          }
        } else if (this.points.length >= 2) {
          const distMeters = haversineDistance(this.points[0], this.points[1], 'm');
          const distKm = distMeters / 1000;
          const distNm = distMeters / 1852;
          const brg = initialBearing(this.points[0], this.points[1]);
          this._finish({
            type: 'measure',
            name: this.label || `Ruler: ${distNm.toFixed(1)} NM (${distKm.toFixed(1)} km)`,
            coordinates: this.points,
            color: this.color,
            distanceMeters: distMeters,
            distanceKm: distKm,
            distanceNm: distNm,
            bearingDeg: brg,
          });
        }
        return;
      }

      if (this.mode === 'circle') {
        if (this.points.length === 1) {
          this._updateBanner('RANGE RING: Move mouse to expand radius, click to commit ring.');
          if (this.onUpdate) {
            this.onUpdate({ pointsCount: 1, status: 'Center set. Click radius perimeter.' });
          }
        } else if (this.points.length >= 2) {
          const radiusMeters = haversineDistance(this.points[0], this.points[1], 'm');
          const radiusKm = radiusMeters / 1000;
          const radiusNm = radiusMeters / 1852;
          this._finish({
            type: 'circle',
            name: this.label || `Range Ring (${radiusKm.toFixed(1)} km / ${radiusNm.toFixed(1)} NM)`,
            coordinates: this.points,
            center: this.points[0],
            radiusMeters,
            radiusKm,
            radiusNm,
            color: this.color,
          });
        }
        return;
      }

      if (this.mode === 'arrow') {
        if (this.points.length === 1) {
          this._updateBanner('Click target location to place directional arrowhead');
          if (this.onUpdate) {
            this.onUpdate({ pointsCount: 1, status: 'Origin set. Click target location.' });
          }
        } else if (this.points.length >= 2) {
          const arrowData = generateVectorArrowGeometry(this.points[0], this.points[1]);
          this._finish({
            type: 'arrow',
            name: this.label || 'Vector Arrow',
            coordinates: this.points,
            color: this.color,
            arrowData,
          });
        }
        return;
      }

      // Polyline / Waypoints
      this._updatePreview();
      const count = this.points.length;
      const status = this.mode === 'waypoints'
        ? `Added WP-${String(count).padStart(2, '0')}. Click next waypoint or double-click to finish.`
        : `Point ${count} added. Double-click or press Enter to finish.`;

      this._updateBanner(status);
      if (this.onUpdate) {
        this.onUpdate({ pointsCount: count, status });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 2. MOUSE_MOVE
    this.handler.setInputAction((movement) => {
      if (this.points.length === 0) return;
      const coord = this._pickGlobePosition(movement.endPosition);
      if (!coord) return;

      this.mousePoint = coord;
      this._updatePreviewDynamic();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 3. LEFT_DOUBLE_CLICK
    this.handler.setInputAction(() => {
      if (this.points.length >= 2) {
        this._commitMultiPoint();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // 4. Keyboard shortcuts (Enter / Escape)
    this._keyHandler = (e) => {
      if (e.key === 'Enter' && this.points.length >= 2) {
        this._commitMultiPoint();
      } else if (e.key === 'Escape') {
        this.cancel();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _commitMultiPoint() {
    if (this.mode === 'waypoints') {
      const routeData = generateWaypointsRoute(this.points);
      this._finish({
        type: 'waypoints',
        name: this.label || 'Tactical Route Alpha',
        coordinates: this.points,
        color: this.color,
        strokeWidth: this.strokeWidth,
        routeData,
      });
    } else {
      this._finish({
        type: 'polyline',
        name: this.label || 'Tactical Trace',
        coordinates: this.points,
        color: this.color,
        strokeWidth: this.strokeWidth,
      });
    }
  }

  _pickGlobePosition(pixel) {
    if (!this.viewer || !pixel) return null;
    let cartesian = null;

    // 1. Try scene.pickPosition (picks Google Photorealistic 3D Tiles, 3D models, and terrain)
    try {
      if (this.viewer.scene && this.viewer.scene.pickPositionSupported) {
        cartesian = this.viewer.scene.pickPosition(pixel);
      }
    } catch (_e) {}

    // 2. Try globe.pick if globe is visible
    if (!cartesian) {
      try {
        const ray = this.viewer.camera.getPickRay(pixel);
        if (ray && this.viewer.scene.globe && this.viewer.scene.globe.show) {
          cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        }
      } catch (_e) {}
    }

    // 3. Fallback to camera.pickEllipsoid (works ALWAYS on standard WGS84 globe even when globe.show is false)
    if (!cartesian) {
      try {
        const ellipsoid = this.viewer.scene?.globe?.ellipsoid || (typeof Cesium !== 'undefined' ? Cesium.Ellipsoid.WGS84 : null);
        if (ellipsoid) {
          cartesian = this.viewer.camera.pickEllipsoid(pixel, ellipsoid);
        }
      } catch (_e) {}
    }

    if (!cartesian) return null;

    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    if (!carto) return null;

    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lng: Cesium.Math.toDegrees(carto.longitude),
      alt: carto.height || 0,
    };
  }

  _createBanner() {
    const titles = {
      polyline: 'DRAWING LINE / PATH: Click terrain points. Double-click or press ENTER to commit.',
      arrow: 'DRAWING VECTOR ARROW: Click 1 for origin, Click 2 for target vector.',
      marker: 'DROPPING POI MARKER: Click anywhere on the 3D globe to place pin.',
      waypoints: 'PLOTTING WAYPOINTS: Click terrain to place WP-01, WP-02... Double-click to commit route.',
      measure: 'GEODESIC RULER: Click 1st point, then click 2nd point to measure distance & azimuth.',
      circle: 'TACTICAL RANGE RING: Click center point, then click to set standoff radius.',
    };

    const text = titles[this.mode] || 'Click terrain to draft.';

    this.banner = document.createElement('div');
    this.banner.id = 'tactical-drafting-hud-banner';
    this.banner.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-[10000] bg-slate-950/95 border border-cyan-500/60 px-5 py-2 rounded-full shadow-[0_0_25px_rgba(0,212,255,0.25)] text-slate-100 font-sans text-xs flex items-center gap-3 backdrop-blur-md animate-fade-in select-none';
    this.banner.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
      <span id="tactical-drafting-hud-text" class="font-mono text-cyan-200">${text}</span>
      <button id="tactical-drafting-cancel-btn" class="ml-2 px-2.5 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 rounded font-mono font-bold text-[11px] transition">CANCEL</button>
    `;

    document.body.appendChild(this.banner);
    this.banner.querySelector('#tactical-drafting-cancel-btn')?.addEventListener('click', () => this.cancel());
  }

  _updateBanner(text) {
    if (!this.banner) return;
    const textEl = this.banner.querySelector('#tactical-drafting-hud-text');
    if (textEl) textEl.textContent = text;
  }

  _updatePreview() {
    // Clear old previews
    this._clearPreviews();

    const cesiumColor = Cesium.Color.fromCssColorString(this.color);

    if (this.mode === 'arrow' && this.points.length === 1 && this.mousePoint) {
      const arrowData = generateVectorArrowGeometry(this.points[0], this.mousePoint);
      const shaftPositions = arrowData.shaft.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));
      const headPositions = arrowData.arrowhead.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 1));

      const shaft = this.viewer.entities.add({
        polyline: {
          positions: shaftPositions,
          width: this.strokeWidth + 1,
          material: cesiumColor,
          clampToGround: true,
        },
      });
      const head = this.viewer.entities.add({
        polyline: {
          positions: headPositions,
          width: this.strokeWidth + 2,
          material: cesiumColor,
          clampToGround: true,
        },
      });
      this.previewEntities.push(shaft, head);
    } else if (this.mode === 'measure' && this.points.length === 1 && this.mousePoint) {
      const p1 = this.points[0];
      const p2 = this.mousePoint;
      const distMeters = haversineDistance(p1, p2, 'm');
      const distKm = distMeters / 1000;
      const distNm = distMeters / 1852;
      const brg = initialBearing(p1, p2);

      const positions = [
        Cesium.Cartesian3.fromDegrees(p1.lng, p1.lat, 1),
        Cesium.Cartesian3.fromDegrees(p2.lng, p2.lat, 1),
      ];

      const rulerLine = this.viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#c084fc'),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });

      const midLng = (p1.lng + p2.lng) / 2;
      const midLat = (p1.lat + p2.lat) / 2;
      const label = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 1),
        label: {
          text: `📏 ${distNm.toFixed(1)} NM (${distKm.toFixed(1)} km) · HDG ${Math.round(brg).toString().padStart(3, '0')}°`,
          font: '12px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      this.previewEntities.push(rulerLine, label);
    } else if (this.mode === 'circle' && this.points.length === 1 && this.mousePoint) {
      const center = this.points[0];
      const edge = this.mousePoint;
      const radiusMeters = Math.max(10, haversineDistance(center, edge, 'm'));
      const radiusKm = radiusMeters / 1000;
      const radiusNm = radiusMeters / 1852;

      const circle = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 1),
        ellipse: {
          semiMinorAxis: radiusMeters,
          semiMajorAxis: radiusMeters,
          material: Cesium.Color.fromCssColorString(this.color).withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(this.color),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      // Crisp ground-clamped polyline perimeter ring
      const ringVerts = generateRangeRingVertices(center, radiusMeters, 48);
      const ringPositions = ringVerts.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 2));
      const ringPolyline = this.viewer.entities.add({
        polyline: {
          positions: ringPositions,
          width: 2.5,
          material: Cesium.Color.fromCssColorString(this.color),
          clampToGround: true,
        },
      });

      // Radius line from center to mouse point
      const radiusLine = this.viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 2),
            Cesium.Cartesian3.fromDegrees(edge.lng, edge.lat, 2),
          ],
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(this.color),
            dashLength: 12,
          }),
          clampToGround: true,
        },
      });

      const label = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(edge.lng, edge.lat, 2),
        label: {
          text: `⭕ RADIUS: ${radiusKm.toFixed(1)} km (${radiusNm.toFixed(1)} NM)`,
          font: '12px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      this.previewEntities.push(circle, ringPolyline, radiusLine, label);
    } else if (this.points.length >= 1) {
      // Polyline / Waypoints Preview
      const allPts = this.mousePoint ? [...this.points, this.mousePoint] : this.points;
      const positions = allPts.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 1));

      if (positions.length >= 2) {
        const line = this.viewer.entities.add({
          polyline: {
            positions,
            width: this.strokeWidth,
            material: cesiumColor,
            clampToGround: true,
          },
        });
        this.previewEntities.push(line);
      }

      // Waypoint nodes preview
      if (this.mode === 'waypoints') {
        this.points.forEach((pt, idx) => {
          const wpNode = this.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, pt.alt || 2),
            point: {
              pixelSize: 10,
              color: Cesium.Color.WHITE,
              outlineColor: cesiumColor,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: `WP-${String(idx + 1).padStart(2, '0')}`,
              font: '11px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          this.previewEntities.push(wpNode);
        });
      }
    }
  }

  _updatePreviewDynamic() {
    this._updatePreview();
  }

  _clearPreviews() {
    if (this.viewer && this.previewEntities.length > 0) {
      for (const ent of this.previewEntities) {
        this.viewer.entities.remove(ent);
      }
      this.previewEntities = [];
    }
  }

  _finish(result) {
    this.destroy();
    if (this.onComplete) {
      this.onComplete(result);
    }
  }

  cancel() {
    this.destroy();
    if (this.onCancel) {
      this.onCancel();
    }
  }

  destroy() {
    this.isActive = false;
    this._clearPreviews();

    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }

    if (this.viewer && this.viewer.scene && this.viewer.scene.canvas) {
      this.viewer.scene.canvas.style.cursor = 'default';
    }

    if (this.banner) {
      this.banner.remove();
      this.banner = null;
    }

    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
}
