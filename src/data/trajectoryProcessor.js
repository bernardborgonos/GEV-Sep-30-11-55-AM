/**
 * @module trajectoryProcessor
 * @description Real-time & historical GPS fleet trajectory processor and kinematics analyzer.
 *
 * Automatically detects time-series GPS tracking signatures across protocols and formats
 * (.csv, .xlsx, .gpx, .kml, .geojson, .nmea), computes derived spatial-temporal kinematics
 * (speed, course/bearing, cumulative distance, dwell detection), and supports temporal
 * interpolation for Cesium timeline scrubbing and fleet replay.
 */

/**
 * Tactical color palette for distinguishing vehicles in fleet views.
 */
export const FLEET_COLOR_PALETTE = Object.freeze([
  '#00e5ff', // Vibrant Cyan
  '#10b981', // Emerald Green
  '#f59e0b', // Solar Amber
  '#ec4899', // Neon Rose Pink
  '#8b5cf6', // Electric Purple
  '#3b82f6', // Azure Blue
  '#eab308', // Cyber Yellow
  '#14b8a6', // Maritime Teal
  '#f43f5e', // Ruby Pulse
  '#a855f7', // Royal Amethyst
  '#06b6d4', // Industrial Cyan
  '#84cc16', // High-Vis Lime
  '#fb923c', // Warm Coral
  '#6366f1', // Indigo Accent
  '#d946ef', // Fuchsia Flare
  '#22d3ee', // Sky Bright
]);

/**
 * Returns a consistent distinct color for a given vehicle/entity index or ID.
 * @param {string|number} vehicleId
 * @returns {string} Hex color
 */
export function getVehicleColor(vehicleId) {
  if (typeof vehicleId === 'number') {
    return FLEET_COLOR_PALETTE[Math.abs(vehicleId) % FLEET_COLOR_PALETTE.length];
  }
  const str = String(vehicleId || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return FLEET_COLOR_PALETTE[Math.abs(hash) % FLEET_COLOR_PALETTE.length];
}

/**
 * Calculates Great-Circle distance between two points in meters using Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371000; // Earth radius in meters
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates initial bearing (forward azimuth) from point 1 to point 2 in degrees (0..360).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
export function calculateBearingDegrees(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaLambda = (lon2 - lon1) * toRad;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let brng = Math.atan2(y, x) * toDeg;
  return (brng + 360) % 360;
}

/**
 * Convert bearing angle to human cardinal direction (e.g. N, NNE, NE).
 * @param {number} bearing
 * @returns {string}
 */
export function bearingToCardinal(bearing) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((bearing % 360) / 22.5)) % 16;
  return directions[index];
}

/**
 * Parses any date/time string, timestamp, or epoch into a valid millisecond epoch number.
 * @param {string|number} rawTime
 * @returns {number|null}
 */
export function parseTimestampMs(rawTime) {
  if (rawTime == null || rawTime === '') return null;
  if (typeof rawTime === 'number') {
    // If epoch seconds (e.g. 1767254400) convert to ms
    if (rawTime > 0 && rawTime < 1e11) return rawTime * 1000;
    return rawTime;
  }
  const str = String(rawTime).trim();
  const num = Number(str);
  if (!Number.isNaN(num) && num > 1e8) {
    if (num < 1e11) return num * 1000;
    return num;
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Detects if a dataset schema represents time-series GPS tracking / fleet telemetry.
 * @param {Array<string>} headers
 * @param {Array<Object>} sampleRows
 * @param {string} [sourceUrl='']
 * @returns {{ isTrajectory: boolean, vehicleCol: string, timeCol: string, latCol: string, lonCol: string, speedCol: string, headingCol: string, altCol: string }}
 */
export function detectTrajectorySignature(headers = [], sampleRows = [], sourceUrl = '') {
  const rawHeaders = (headers || []).map((h) => String(h || '').trim());
  const lowerHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const findCol = (regex) => {
    const idx = lowerHeaders.findIndex((h) => regex.test(h));
    return idx !== -1 ? rawHeaders[idx] : '';
  };

  // 1. Vehicle / Entity identifier column
  let vehicleCol = findCol(/^(vehicle|vehicleid|device|deviceid|tracker|trackerid|imei|asset|assetid|fleet|fleetid|unit|car|truck|bus|callsign|vessel|flight|carrier|tag)$/i);
  if (!vehicleCol && lowerHeaders.some((h) => h.includes('vehicle') || h.includes('tracker') || h.includes('device'))) {
    const idx = lowerHeaders.findIndex((h) => h.includes('vehicle') || h.includes('tracker') || h.includes('device'));
    vehicleCol = rawHeaders[idx];
  }

  // 2. Temporal timestamp column
  let timeCol = findCol(/^(time|timestamp|datetime|datetimeutc|dateandtime|recordedat|fixtime|gpstime|utctime|epoch|date)$/i);
  if (!timeCol && lowerHeaders.some((h) => h.includes('time') || h.includes('timestamp'))) {
    const idx = lowerHeaders.findIndex((h) => h.includes('time') || h.includes('timestamp'));
    timeCol = rawHeaders[idx];
  }

  // 3. Coordinates
  const latCol = findCol(/^(lat|latitude|y|ycoord|coordlat)$/i);
  const lonCol = findCol(/^(lon|lng|long|longitude|x|xcoord|coordlon|coordlng)$/i);

  // 4. Optional telemetry fields
  const speedCol = findCol(/^(speed|spd|velocity|speedkmh|speedmph|speedknots|groundspeed)$/i);
  const headingCol = findCol(/^(heading|course|bearing|bearingdeg|direction|dir|track)$/i);
  const altCol = findCol(/^(alt|altitude|elev|elevation|height)$/i);

  // Verify timestamp column actually holds time/date strings or epochs
  let timeColValid = Boolean(timeCol);
  if (timeCol && sampleRows && sampleRows.length > 0) {
    const sampleVal = sampleRows[0][timeCol];
    const parsed = parseTimestampMs(sampleVal);
    timeColValid = parsed !== null && parsed > 0;
  }

  // Explicit check on source URL hints or file extensions
  const urlLower = String(sourceUrl || '').toLowerCase();
  const isGpsUrl =
    urlLower.includes('simulation') ||
    urlLower.includes('tracking') ||
    urlLower.includes('telemetry') ||
    urlLower.includes('vehicle') ||
    urlLower.includes('fleet') ||
    urlLower.endsWith('.gpx') ||
    urlLower.endsWith('.kml') ||
    urlLower.endsWith('.nmea');

  // If we have lat, lon, and time, and either vehicleCol or isGpsUrl or multiple records per entity
  const isTrajectory = Boolean(latCol && lonCol && timeColValid && (vehicleCol || isGpsUrl || sampleRows.length > 10));

  return {
    isTrajectory,
    vehicleCol: vehicleCol || (isTrajectory ? (headers[0] || 'vehicle') : ''),
    timeCol,
    latCol,
    lonCol,
    speedCol,
    headingCol,
    altCol,
  };
}

/**
 * Processes raw records into structured vehicle trajectories and kinematics metrics.
 * @param {Array<Object>} rawRows - Array of objects or points
 * @param {Object} signature - Result from detectTrajectorySignature
 * @param {string} [sourceUrl='']
 * @returns {Object} Structured trajectory payload
 */
export function processTrajectoryDataset(rawRows = [], signature = {}, sourceUrl = '') {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return {
      isTrajectory: false,
      trajectories: new Map(),
      trajectoryList: [],
      fleetMetrics: null,
      points: [],
    };
  }

  const {
    vehicleCol = 'vehicle',
    timeCol = 'time',
    latCol = 'lat',
    lonCol = 'lon',
    speedCol = '',
    headingCol = '',
    altCol = '',
  } = signature;

  // Group raw rows by vehicle / asset
  const vehicleGroups = new Map();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row) continue;

    const vId = String(
      row[vehicleCol] ||
      (row.rawRecord && row.rawRecord[vehicleCol]) ||
      row.name ||
      row.vehicle ||
      'vehicle_1'
    ).trim() || 'vehicle_1';

    const rawTime =
      row[timeCol] ||
      (row.rawRecord && row.rawRecord[timeCol]) ||
      row.time ||
      row.timestamp;
    const timeMs = parseTimestampMs(rawTime);
    if (timeMs === null) continue;

    const latRaw = row[latCol] ?? (row.rawRecord && row.rawRecord[latCol]) ?? row.lat;
    const lonRaw = row[lonCol] ?? (row.rawRecord && row.rawRecord[lonCol]) ?? row.lon;
    const lat = Number.parseFloat(latRaw);
    const lon = Number.parseFloat(lonRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const altRaw = altCol ? (row[altCol] ?? (row.rawRecord && row.rawRecord[altCol])) : 0;
    const alt = Number.isFinite(Number.parseFloat(altRaw)) ? Number.parseFloat(altRaw) : 10;

    let rawSpeed = speedCol ? Number.parseFloat(row[speedCol] ?? (row.rawRecord && row.rawRecord[speedCol])) : NaN;
    let rawHeading = headingCol ? Number.parseFloat(row[headingCol] ?? (row.rawRecord && row.rawRecord[headingCol])) : NaN;

    if (!vehicleGroups.has(vId)) {
      vehicleGroups.set(vId, []);
    }

    vehicleGroups.get(vId).push({
      index: i,
      timeMs,
      timeIso: new Date(timeMs).toISOString(),
      lat,
      lon,
      alt,
      rawSpeed: Number.isFinite(rawSpeed) ? rawSpeed : null,
      rawHeading: Number.isFinite(rawHeading) ? rawHeading : null,
      rawRecord: row.rawRecord || row,
    });
  }

  const trajectoryList = [];
  const trajectories = new Map();
  const normalizedPoints = [];

  let globalMinTime = Number.POSITIVE_INFINITY;
  let globalMaxTime = Number.NEGATIVE_INFINITY;
  let totalFleetDistanceKm = 0;
  let totalFleetSpeedSum = 0;
  let speedSamplesCount = 0;
  let totalDwellsCount = 0;
  let movingCount = 0;
  let idleCount = 0;

  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  let vehicleIndex = 0;

  for (const [vehicleId, pointsList] of vehicleGroups.entries()) {
    // Sort chronologically
    pointsList.sort((a, b) => a.timeMs - b.timeMs);

    // Deduplicate exact timestamps
    const dedupedPoints = [];
    for (let i = 0; i < pointsList.length; i++) {
      if (i === 0 || pointsList[i].timeMs > pointsList[i - 1].timeMs) {
        dedupedPoints.push(pointsList[i]);
      }
    }

    if (dedupedPoints.length === 0) continue;

    const color = getVehicleColor(vehicleId);
    let cumulativeDistanceMeters = 0;
    let maxSpeedKmh = 0;
    let speedSum = 0;
    let speedCount = 0;
    const dwellStops = [];
    let currentDwellStart = null;

    const enrichedWaypoints = [];

    for (let i = 0; i < dedupedPoints.length; i++) {
      const p = dedupedPoints[i];
      let speedKmh = 0;
      let headingDeg = 0;
      let stepDistMeters = 0;

      if (i > 0) {
        const prev = dedupedPoints[i - 1];
        stepDistMeters = haversineDistanceMeters(prev.lat, prev.lon, p.lat, p.lon);
        const dtSeconds = Math.max(0.5, (p.timeMs - prev.timeMs) / 1000);

        if (p.rawSpeed !== null) {
          speedKmh = p.rawSpeed;
        } else {
          speedKmh = (stepDistMeters / dtSeconds) * 3.6;
          // Cap unrealistic road jumps
          if (speedKmh > 220) speedKmh = 220;
        }

        if (p.rawHeading !== null) {
          headingDeg = p.rawHeading;
        } else {
          headingDeg = calculateBearingDegrees(prev.lat, prev.lon, p.lat, p.lon);
        }
      } else if (dedupedPoints.length > 1) {
        // First point heading towards second
        headingDeg = calculateBearingDegrees(p.lat, p.lon, dedupedPoints[1].lat, dedupedPoints[1].lon);
      }

      cumulativeDistanceMeters += stepDistMeters;
      if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
      if (speedKmh > 0) {
        speedSum += speedKmh;
        speedCount++;
        totalFleetSpeedSum += speedKmh;
        speedSamplesCount++;
      }

      // Dwell / Idle detection (speed < 2.5 km/h)
      const isIdling = speedKmh < 2.5;
      if (isIdling) {
        if (!currentDwellStart) {
          currentDwellStart = {
            startTime: p.timeIso,
            startTimeMs: p.timeMs,
            lat: p.lat,
            lon: p.lon,
          };
        }
      } else if (currentDwellStart) {
        const dwellDurationSec = (p.timeMs - currentDwellStart.startTimeMs) / 1000;
        if (dwellDurationSec >= 90) {
          dwellStops.push({
            ...currentDwellStart,
            endTime: p.timeIso,
            durationSec: dwellDurationSec,
          });
          totalDwellsCount++;
        }
        currentDwellStart = null;
      }

      const isStart = i === 0;
      const isEnd = i === dedupedPoints.length - 1;
      const isDwell = isIdling && (i > 0 && i < dedupedPoints.length - 1);

      const waypoint = {
        pointId: `${vehicleId}_pt_${i}`,
        vehicleId,
        index: i,
        timeMs: p.timeMs,
        timeIso: p.timeIso,
        lat: p.lat,
        lon: p.lon,
        alt: p.alt,
        speedKmh: Math.round(speedKmh * 10) / 10,
        heading: Math.round(headingDeg),
        cardinal: bearingToCardinal(headingDeg),
        cumulativeDistanceKm: Math.round((cumulativeDistanceMeters / 1000) * 100) / 100,
        isStart,
        isEnd,
        isDwell,
        rawRecord: p.rawRecord,
      };

      enrichedWaypoints.push(waypoint);

      // Update global extents
      if (p.timeMs < globalMinTime) globalMinTime = p.timeMs;
      if (p.timeMs > globalMaxTime) globalMaxTime = p.timeMs;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;

      // Populate normalized points
      normalizedPoints.push({
        id: waypoint.pointId,
        name: `${vehicleId} [${waypoint.timeIso.slice(11, 19)}]`,
        category: 'Fleet Vehicle',
        address: `${waypoint.cardinal} · ${waypoint.speedKmh} km/h · ${waypoint.cumulativeDistanceKm} km`,
        contact: `Vehicle ID: ${vehicleId}`,
        details: `Telemetry Breadcrumb ${i + 1}/${dedupedPoints.length} | Lat: ${p.lat.toFixed(6)}, Lon: ${p.lon.toFixed(6)}`,
        lat: p.lat,
        lon: p.lon,
        color,
        sourceUrl,
        vehicleId,
        timeIso: waypoint.timeIso,
        timeMs: waypoint.timeMs,
        speedKmh: waypoint.speedKmh,
        heading: waypoint.heading,
        cardinal: waypoint.cardinal,
        isTrajectoryPoint: true,
        isStart,
        isEnd,
        isDwell,
        rawRecord: p.rawRecord,
      });
    }

    const firstPt = enrichedWaypoints[0];
    const lastPt = enrichedWaypoints[enrichedWaypoints.length - 1];
    const totalDistKm = Math.round((cumulativeDistanceMeters / 1000) * 100) / 100;
    const avgSpeedKmh = speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : 0;
    const durationMinutes = Math.round(((lastPt.timeMs - firstPt.timeMs) / (60 * 1000)) * 10) / 10;
    const isCurrentlyMoving = lastPt.speedKmh > 2.0;

    if (isCurrentlyMoving) movingCount++;
    else idleCount++;

    totalFleetDistanceKm += totalDistKm;

    const trajectory = {
      vehicleId,
      callsign: vehicleId.toUpperCase(),
      color,
      totalPoints: enrichedWaypoints.length,
      startTime: firstPt.timeIso,
      endTime: lastPt.timeIso,
      durationMinutes,
      totalDistanceKm: totalDistKm,
      avgSpeedKmh,
      maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
      currentSpeedKmh: lastPt.speedKmh,
      currentHeading: lastPt.heading,
      currentCardinal: lastPt.cardinal,
      currentPosition: {
        lat: lastPt.lat,
        lon: lastPt.lon,
        alt: lastPt.alt,
        timeMs: lastPt.timeMs,
        timeIso: lastPt.timeIso,
      },
      startPosition: {
        lat: firstPt.lat,
        lon: firstPt.lon,
        alt: firstPt.alt,
        timeMs: firstPt.timeMs,
        timeIso: firstPt.timeIso,
      },
      status: isCurrentlyMoving ? 'moving' : 'idling',
      dwellStops,
      waypoints: enrichedWaypoints,
      // Precomputed Flat Float64 Array for Cesium Polyline Cartesian3 positions
      coordinates: enrichedWaypoints.map((w) => [w.lon, w.lat, w.alt || 10]),
    };

    trajectories.set(vehicleId, trajectory);
    trajectoryList.push(trajectory);
    vehicleIndex++;
  }

  // Compute fleet-level metrics
  const totalVehicles = trajectoryList.length;
  const avgFleetSpeedKmh = speedSamplesCount > 0 ? Math.round((totalFleetSpeedSum / speedSamplesCount) * 10) / 10 : 0;
  const timeSpanMinutes = globalMaxTime > globalMinTime ? Math.round(((globalMaxTime - globalMinTime) / (60 * 1000)) * 10) / 10 : 0;

  const fleetMetrics = {
    totalVehicles,
    totalWaypoints: normalizedPoints.length,
    totalFleetDistanceKm: Math.round(totalFleetDistanceKm * 10) / 10,
    avgFleetSpeedKmh,
    movingCount,
    idleCount,
    totalDwellsCount,
    minTimeMs: Number.isFinite(globalMinTime) ? globalMinTime : Date.now(),
    maxTimeMs: Number.isFinite(globalMaxTime) ? globalMaxTime : Date.now(),
    startTimeIso: Number.isFinite(globalMinTime) ? new Date(globalMinTime).toISOString() : '',
    endTimeIso: Number.isFinite(globalMaxTime) ? new Date(globalMaxTime).toISOString() : '',
    timeSpanMinutes,
    bounds: {
      minLat: Number.isFinite(minLat) ? minLat : 14.5,
      maxLat: Number.isFinite(maxLat) ? maxLat : 14.7,
      minLon: Number.isFinite(minLon) ? minLon : 120.9,
      maxLon: Number.isFinite(maxLon) ? maxLon : 121.1,
    },
    center: {
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2,
    },
  };

  return {
    isTrajectory: true,
    trajectories,
    trajectoryList,
    fleetMetrics,
    points: normalizedPoints,
    detectedHeaders: signature.vehicleCol ? [signature.vehicleCol, signature.timeCol, signature.lonCol, signature.latCol] : [],
  };
}

/**
 * Interpolates vehicle position and state at an exact target timestamp tMs.
 * @param {Object} trajectory - Vehicle trajectory object
 * @param {number} targetTimeMs - Target time in milliseconds
 * @returns {{ lat: number, lon: number, alt: number, speedKmh: number, heading: number, cardinal: string, isInterpolated: boolean }}
 */
export function interpolateVehicleAtTime(trajectory, targetTimeMs) {
  if (!trajectory || !Array.isArray(trajectory.waypoints) || trajectory.waypoints.length === 0) {
    return null;
  }
  const pts = trajectory.waypoints;
  if (targetTimeMs <= pts[0].timeMs) {
    const p = pts[0];
    return {
      lat: p.lat,
      lon: p.lon,
      alt: p.alt || 10,
      speedKmh: p.speedKmh,
      heading: p.heading,
      cardinal: p.cardinal,
      isInterpolated: false,
    };
  }
  if (targetTimeMs >= pts[pts.length - 1].timeMs) {
    const p = pts[pts.length - 1];
    return {
      lat: p.lat,
      lon: p.lon,
      alt: p.alt || 10,
      speedKmh: p.speedKmh,
      heading: p.heading,
      cardinal: p.cardinal,
      isInterpolated: false,
    };
  }

  // Binary search for interval
  let low = 0;
  let high = pts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pts[mid].timeMs <= targetTimeMs) {
      if (mid === pts.length - 1 || pts[mid + 1].timeMs > targetTimeMs) {
        low = mid;
        break;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const p0 = pts[low];
  const p1 = pts[Math.min(low + 1, pts.length - 1)];

  if (p0.timeMs === p1.timeMs) {
    return {
      lat: p0.lat,
      lon: p0.lon,
      alt: p0.alt || 10,
      speedKmh: p0.speedKmh,
      heading: p0.heading,
      cardinal: p0.cardinal,
      isInterpolated: false,
    };
  }

  const fraction = Math.max(0, Math.min(1, (targetTimeMs - p0.timeMs) / (p1.timeMs - p0.timeMs)));
  const lat = p0.lat + (p1.lat - p0.lat) * fraction;
  const lon = p0.lon + (p1.lon - p0.lon) * fraction;
  const alt = (p0.alt || 10) + ((p1.alt || 10) - (p0.alt || 10)) * fraction;
  const speedKmh = Math.round((p0.speedKmh + (p1.speedKmh - p0.speedKmh) * fraction) * 10) / 10;
  const heading = p0.heading;

  return {
    lat,
    lon,
    alt,
    speedKmh,
    heading,
    cardinal: bearingToCardinal(heading),
    isInterpolated: true,
  };
}

/**
 * Extracts GPS tracking entities from a GPX XML text document.
 * @param {string} gpxText
 * @param {string} sourceUrl
 * @returns {Object} Result compatible with processTrajectoryDataset
 */
export function extractGpxEntities(gpxText, sourceUrl = '') {
  if (!gpxText || typeof gpxText !== 'string') return { points: [], isTrajectory: false };

  const staticPoints = [];
  // Extract station waypoints (<wpt>)
  const wptRegex = /<wpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi;
  let wptMatch;
  while ((wptMatch = wptRegex.exec(gpxText)) !== null) {
    const lat = Number.parseFloat(wptMatch[1]);
    const lon = Number.parseFloat(wptMatch[2]);
    const inner = wptMatch[3] || '';
    const nameM = inner.match(/<name>([^<]+)<\/name>/i);
    const descM = inner.match(/<desc>([^<]+)<\/desc>/i);
    const eleM = inner.match(/<ele>([^<]+)<\/ele>/i);
    const name = nameM ? nameM[1].trim() : 'Station Waypoint';
    const ele = eleM ? Number.parseFloat(eleM[1]) : 10;
    const isStation = name.toLowerCase().includes('station') || String(descM ? descM[1] : '').toLowerCase().includes('station');
    staticPoints.push({
      name,
      lat,
      lon,
      height: ele,
      elevation: ele,
      description: descM ? descM[1].trim() : '',
      category: isStation ? 'Train Station' : 'Waypoint',
      sourceUrl,
    });
  }

  // Extract each track (<trk>) preserving individual vehicle identities
  const rawRows = [];
  const trkRegex = /<trk>([\s\S]*?)<\/trk>/gi;
  let trkMatch;
  while ((trkMatch = trkRegex.exec(gpxText)) !== null) {
    const trkContent = trkMatch[1];
    const nameM = trkContent.match(/<name>([^<]+)<\/name>/i);
    const trackName = nameM ? nameM[1].trim() : 'TRACK_VEHICLE';

    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let ptMatch;
    while ((ptMatch = trkptRegex.exec(trkContent)) !== null) {
      const lat = Number.parseFloat(ptMatch[1]);
      const lon = Number.parseFloat(ptMatch[2]);
      const inner = ptMatch[3] || '';
      const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const time = timeMatch ? timeMatch[1].trim() : new Date().toISOString();
      const ele = eleMatch ? Number.parseFloat(eleMatch[1]) : 10;

      rawRows.push({
        vehicle: trackName,
        time,
        lat,
        lon,
        ele,
      });
    }
  }

  // Fallback if no <trk> wrappers exist but bare <trkpt> points are present
  if (rawRows.length === 0) {
    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match;
    while ((match = trkptRegex.exec(gpxText)) !== null) {
      const lat = Number.parseFloat(match[1]);
      const lon = Number.parseFloat(match[2]);
      const inner = match[3] || '';
      const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const time = timeMatch ? timeMatch[1].trim() : new Date().toISOString();
      const ele = eleMatch ? Number.parseFloat(eleMatch[1]) : 10;

      rawRows.push({
        vehicle: 'TRACK_VEHICLE',
        time,
        lat,
        lon,
        ele,
      });
    }
  }

  if (rawRows.length === 0) {
    return { points: staticPoints, isTrajectory: false };
  }

  const trajResult = processTrajectoryDataset(rawRows, {
    isTrajectory: true,
    vehicleCol: 'vehicle',
    timeCol: 'time',
    latCol: 'lat',
    lonCol: 'lon',
    altCol: 'ele',
  }, sourceUrl);

  if (staticPoints.length > 0) {
    trajResult.points = [...staticPoints, ...(trajResult.points || [])];
  }

  return trajResult;
}

/**
 * Extracts GPS tracking entities from an NMEA-0183 log text stream.
 * @param {string} nmeaText
 * @param {string} sourceUrl
 * @returns {Object}
 */
export function extractNmeaEntities(nmeaText, sourceUrl = '') {
  if (!nmeaText || typeof nmeaText !== 'string') return { points: [], isTrajectory: false };

  const lines = nmeaText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rawRows = [];

  for (const line of lines) {
    if (line.startsWith('$GPRMC') || line.startsWith('$GNRMC')) {
      // $GPRMC,080000.00,A,1435.9700,N,12058.8000,E,22.5,145.2,010126,,,A*7A
      const parts = line.split(',');
      if (parts.length >= 10 && parts[2] === 'A') {
        const rawTime = parts[1]; // hhmmss.ss
        const rawLat = parts[3];  // ddmm.mmmm
        const latHem = parts[4];  // N/S
        const rawLon = parts[5];  // dddmm.mmmm
        const lonHem = parts[6];  // E/W
        const speedKnots = Number.parseFloat(parts[7]) || 0;
        const headingDeg = Number.parseFloat(parts[8]) || 0;
        const rawDate = parts[9]; // ddmmyy

        if (rawLat && rawLon) {
          const latDeg = Number.parseFloat(rawLat.slice(0, 2)) + Number.parseFloat(rawLat.slice(2)) / 60;
          const lat = latHem === 'S' ? -latDeg : latDeg;

          const lonDeg = Number.parseFloat(rawLon.slice(0, 3)) + Number.parseFloat(rawLon.slice(3)) / 60;
          const lon = lonHem === 'W' ? -lonDeg : lonDeg;

          let timeIso = new Date().toISOString();
          if (rawDate && rawDate.length === 6 && rawTime && rawTime.length >= 6) {
            const day = rawDate.slice(0, 2);
            const month = rawDate.slice(2, 4);
            const year = `20${rawDate.slice(4, 6)}`;
            const hh = rawTime.slice(0, 2);
            const mm = rawTime.slice(2, 4);
            const ss = rawTime.slice(4, 6);
            timeIso = `${year}-${month}-${day}T${hh}:${mm}:${ss}Z`;
          }

          rawRows.push({
            vehicle: 'NMEA_RECEIVER_01',
            time: timeIso,
            lat,
            lon,
            speed: speedKnots * 1.852, // convert knots to km/h
            heading: headingDeg,
          });
        }
      }
    }
  }

  if (rawRows.length === 0) return { points: [], isTrajectory: false };

  return processTrajectoryDataset(rawRows, {
    isTrajectory: true,
    vehicleCol: 'vehicle',
    timeCol: 'time',
    latCol: 'lat',
    lonCol: 'lon',
    speedCol: 'speed',
    headingCol: 'heading',
  }, sourceUrl);
}

/**
 * Extracts static stations and dynamic gx:Track entities from KML 2.2 XML content.
 * @param {string} kmlText
 * @param {string} sourceUrl
 * @returns {{ points: Array, isTrajectory: boolean, trajectoryList?: Array, trajectories?: Map }}
 */
export function extractKmlEntities(kmlText, sourceUrl = '') {
  if (!kmlText || typeof kmlText !== 'string') return { points: [], isTrajectory: false };

  const staticPoints = [];
  const rawRows = [];

  const pointPlacemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let pmMatch;
  while ((pmMatch = pointPlacemarkRegex.exec(kmlText)) !== null) {
    const pmInner = pmMatch[1];
    const nameMatch = pmInner.match(/<name>([\s\S]*?)<\/name>/i);
    const descMatch = pmInner.match(/<description>([\s\S]*?)<\/description>/i);
    const coordMatch = pmInner.match(/<Point>[\s\S]*?<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?[\s\S]*?<\/coordinates>[\s\S]*?<\/Point>/i);

    if (coordMatch) {
      const lon = Number.parseFloat(coordMatch[1]);
      const lat = Number.parseFloat(coordMatch[2]);
      const ele = coordMatch[3] ? Number.parseFloat(coordMatch[3]) : 10;
      const name = nameMatch ? nameMatch[1].trim() : 'Placemark';
      const description = descMatch ? descMatch[1].trim() : '';

      staticPoints.push({
        name,
        lat,
        lon,
        height: ele,
        elevation: ele,
        description,
        category: 'Train Station',
        sourceUrl,
      });
    }

    const trackMatch = pmInner.match(/<gx:Track>([\s\S]*?)<\/gx:Track>/i);
    if (trackMatch) {
      const trackInner = trackMatch[1];
      const trackName = nameMatch ? nameMatch[1].trim() : 'KML_TRACK_01';

      const whens = [];
      const coords = [];

      const whenRegex = /<when>([^<]+)<\/when>/gi;
      let wMatch;
      while ((wMatch = whenRegex.exec(trackInner)) !== null) {
        whens.push(wMatch[1].trim());
      }

      const coordRegex = /<gx:coord>\s*([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\s*<\/gx:coord>/gi;
      let cMatch;
      while ((cMatch = coordRegex.exec(trackInner)) !== null) {
        coords.push({
          lon: Number.parseFloat(cMatch[1]),
          lat: Number.parseFloat(cMatch[2]),
          ele: cMatch[3] ? Number.parseFloat(cMatch[3]) : 10,
        });
      }

      const count = Math.min(whens.length, coords.length);
      for (let i = 0; i < count; i++) {
        rawRows.push({
          vehicle: trackName,
          time: whens[i],
          lat: coords[i].lat,
          lon: coords[i].lon,
          ele: coords[i].ele,
        });
      }
    }
  }

  if (rawRows.length > 0) {
    const trajResult = processTrajectoryDataset(rawRows, {
      isTrajectory: true,
      vehicleCol: 'vehicle',
      timeCol: 'time',
      latCol: 'lat',
      lonCol: 'lon',
      altCol: 'ele',
    }, sourceUrl);

    return {
      points: [...staticPoints, ...(trajResult.points || [])],
      isTrajectory: true,
      trajectoryList: trajResult.trajectoryList,
      trajectories: trajResult.trajectories,
    };
  }

  return {
    points: staticPoints,
    isTrajectory: false,
  };
}

