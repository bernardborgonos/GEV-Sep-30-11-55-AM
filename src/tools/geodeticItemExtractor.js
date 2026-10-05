/**
 * @module src/tools/geodeticItemExtractor.js
 * High-precision extraction, capture, formatting, and dynamic auto-updating
 * of Geodetic Measurement information (Distance, Area, Bearing, Elevation)
 * for spatial items, map persistence, inspector dialogs, and callout cards.
 */

import {
  calculatePathDistance,
  calculatePolygonGeodesicArea,
  calculatePolygonPerimeter,
  initialBearing,
  haversineDistanceMeters,
  checkPolygonSelfIntersection,
} from './geodesicMath.js';
import { getCompassCardinal } from '../ui/geodeticMeasurementHud.js';
import { toMgrsString, formatMgrsSpaced } from './mgrsHelper.js';

/**
 * Determines measurement classification for a given item or type hint.
 * @param {Object} itemOrType
 * @returns {'bearing'|'elevation'|'area'|'distance'|'point'}
 */
export function detectMeasurementType(itemOrType, coords = []) {
  if (typeof itemOrType === 'string') {
    const t = itemOrType.toLowerCase();
    if (t === 'bearing') return 'bearing';
    if (t === 'elevation') return 'elevation';
    if (t === 'area' || t === 'polygon') return 'area';
    if (t === 'distance' || t === 'polyline') return 'distance';
    return 'point';
  }

  const item = itemOrType || {};
  if (item.measurementType) return item.measurementType;
  if (item.geodeticMetrics?.measurementType) return item.geodeticMetrics.measurementType;

  const name = (item.name || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();

  if (name.startsWith('bearing') || desc.includes('compass bearing') || desc.includes('forward azimuth')) {
    return 'bearing';
  }
  if (name.startsWith('elevation') || desc.includes('elevation profile') || desc.includes('elevation difference')) {
    return 'elevation';
  }
  if (item.type === 'polygon' || name.startsWith('area') || desc.includes('enclosed area')) {
    return 'area';
  }
  if (item.type === 'polyline' || name.startsWith('distance') || desc.includes('distance path')) {
    return 'distance';
  }
  return item.type === 'marker' ? 'point' : 'distance';
}

/**
 * Parses raw coordinates into an array of { lat, lng, alt } objects.
 */
export function normalizeItemCoordinates(coords) {
  if (!coords) return [];
  if (Array.isArray(coords)) {
    return coords.map((c) => ({
      lat: Number(c.lat) || 0,
      lng: Number(c.lng) || 0,
      alt: Number(c.alt) || 0,
    }));
  }
  if (typeof coords === 'string') {
    try {
      const parsed = JSON.parse(coords);
      if (Array.isArray(parsed)) {
        return normalizeItemCoordinates(parsed);
      }
    } catch (_e) {
      return [];
    }
  }
  return [];
}

/**
 * Extracts and calculates comprehensive geodetic telemetry metrics from coordinates.
 *
 * @param {Array|string} rawCoords
 * @param {string} [typeHint]
 * @returns {Object} Comprehensive metrics object
 */
export function extractGeodeticMetrics(rawCoords, typeHint) {
  const coords = normalizeItemCoordinates(rawCoords);
  const count = coords.length;
  const measurementType = detectMeasurementType(typeHint, coords);

  const baseMetrics = {
    measurementType,
    pointCount: count,
    capturedAt: new Date().toISOString(),
  };

  if (measurementType === 'bearing') {
    if (count < 2) {
      return {
        ...baseMetrics,
        forwardBearingDeg: 0,
        forwardCardinal: 'N',
        backAzimuthDeg: 180,
        backCardinal: 'S',
        distanceMeters: 0,
        distanceKm: 0,
        distanceNm: 0,
        origin: coords[0] || null,
        target: null,
        summary: 'Bearing: 000.0° N · Range: 0 m',
      };
    }

    const p1 = coords[0];
    const p2 = coords[coords.length - 1];
    const fwd = initialBearing(p1, p2);
    const card = getCompassCardinal(fwd);
    const rev = (fwd + 180) % 360;
    const revCard = getCompassCardinal(rev);
    const distM = haversineDistanceMeters(p1, p2);
    const distKm = distM / 1000;
    const distNm = distM / 1852;

    const fwdFormatted = `${fwd.toFixed(1).padStart(5, '0')}° ${card}`;
    const revFormatted = `${rev.toFixed(1).padStart(5, '0')}° ${revCard}`;
    const rangeFormatted = distKm >= 1 ? `${distKm.toFixed(2)} km (${distNm.toFixed(2)} NM)` : `${Math.round(distM)} m (${distNm.toFixed(2)} NM)`;
    const originMgrs = formatMgrsSpaced(toMgrsString(p1.lat, p1.lng, 5));
    const targetMgrs = formatMgrsSpaced(toMgrsString(p2.lat, p2.lng, 5));

    return {
      ...baseMetrics,
      forwardBearingDeg: Number(fwd.toFixed(2)),
      forwardCardinal: card,
      backAzimuthDeg: Number(rev.toFixed(2)),
      backCardinal: revCard,
      distanceMeters: Math.round(distM),
      distanceKm: Number(distKm.toFixed(3)),
      distanceNm: Number(distNm.toFixed(3)),
      forwardFormatted: fwdFormatted,
      reciprocalFormatted: revFormatted,
      rangeFormatted,
      origin: p1,
      target: p2,
      originMgrs,
      targetMgrs,
      summary: `Azimuth: ${fwdFormatted} · Reciprocal: ${revFormatted} · Range: ${rangeFormatted} · MGRS: ${targetMgrs}`,
    };
  }

  if (measurementType === 'elevation') {
    if (count < 2) {
      const singleAlt = coords[0]?.alt || 0;
      return {
        ...baseMetrics,
        deltaM: 0,
        baseAltitudeM: singleAlt,
        peakAltitudeM: singleAlt,
        gainM: 0,
        lossM: 0,
        horizontalDistM: 0,
        horizontalDistKm: 0,
        slantDistM: 0,
        slantDistKm: 0,
        slopePct: 0,
        slopeAngleDeg: 0,
        summary: `Elevation: Base ${Math.round(singleAlt)} m MSL (Single Node)`,
      };
    }

    const p1 = coords[0];
    const pEnd = coords[coords.length - 1];
    const alt1 = p1.alt || 0;
    const alt2 = pEnd.alt || 0;
    const deltaH = alt2 - alt1;

    let gainM = 0;
    let lossM = 0;
    let minAlt = alt1;
    let maxAlt = alt1;

    for (let i = 0; i < count - 1; i++) {
      const a = coords[i].alt || 0;
      const b = coords[i + 1].alt || 0;
      const diff = b - a;
      if (diff > 0) gainM += diff;
      else lossM += Math.abs(diff);
      minAlt = Math.min(minAlt, b);
      maxAlt = Math.max(maxAlt, b);
    }

    const pathMetrics = calculatePathDistance(coords);
    const horizM = pathMetrics.totalMeters;
    const slantM = Math.sqrt(horizM * horizM + deltaH * deltaH);
    const slopePct = horizM > 0 ? (deltaH / horizM) * 100 : 0;
    const slopeAngleDeg = horizM > 0 ? (Math.atan(Math.abs(deltaH) / horizM) * 180 / Math.PI) : 0;

    const sign = deltaH >= 0 ? '+' : '';
    const gainTag = deltaH >= 0 ? '▲ GAIN' : '▼ DESCENT';
    const horizFormatted = horizM >= 1000 ? `${(horizM / 1000).toFixed(2)} km` : `${Math.round(horizM)} m`;
    const slantFormatted = slantM >= 1000 ? `${(slantM / 1000).toFixed(2)} km` : `${Math.round(slantM)} m`;
    const baseMgrs = formatMgrsSpaced(toMgrsString(p1.lat, p1.lng, 5));
    const peakMgrs = formatMgrsSpaced(toMgrsString(pEnd.lat, pEnd.lng, 5));

    return {
      ...baseMetrics,
      deltaM: Math.round(deltaH),
      baseAltitudeM: Math.round(alt1),
      peakAltitudeM: Math.round(alt2),
      minAltitudeM: Math.round(minAlt),
      maxAltitudeM: Math.round(maxAlt),
      gainM: Math.round(gainM),
      lossM: Math.round(lossM),
      horizontalDistM: Math.round(horizM),
      horizontalDistKm: Number((horizM / 1000).toFixed(3)),
      slantDistM: Math.round(slantM),
      slantDistKm: Number((slantM / 1000).toFixed(3)),
      slopePct: Number(slopePct.toFixed(1)),
      slopeAngleDeg: Number(slopeAngleDeg.toFixed(1)),
      baseMgrs,
      peakMgrs,
      deltaFormatted: `Δh ${sign}${Math.round(deltaH)} m (${gainTag})`,
      basePeakFormatted: `Base: ${Math.round(alt1)} m MSL ➔ Peak: ${Math.round(alt2)} m MSL`,
      slopeFormatted: `Slope: ${sign}${slopePct.toFixed(1)}% (${slopeAngleDeg.toFixed(1)}°)`,
      summary: `Δh ${sign}${Math.round(deltaH)} m (${gainTag}) · Base: ${Math.round(alt1)} m ➔ Peak: ${Math.round(alt2)} m · Slope: ${sign}${slopePct.toFixed(1)}% (${slopeAngleDeg.toFixed(1)}°) · MGRS: ${peakMgrs}`,
    };
  }

  if (measurementType === 'area') {
    if (count < 3) {
      return {
        ...baseMetrics,
        areaHectares: 0,
        areaSquareMeters: 0,
        areaKm2: 0,
        areaAcres: 0,
        perimeterMeters: 0,
        perimeterKm: 0,
        perimeterNm: 0,
        summary: 'Enclosed Area: 0.00 ha (Needs 3+ vertices)',
      };
    }

    const areaMetrics = calculatePolygonGeodesicArea(coords);
    const perimMetrics = calculatePolygonPerimeter(coords);
    const selfIntersect = checkPolygonSelfIntersection(coords);
    const ha = areaMetrics.areaHectares;
    const m2 = areaMetrics.areaSquareMeters;
    const km2 = m2 / 1000000;
    const acres = ha * 2.47105;
    const perimM = perimMetrics.perimeterMeters;
    const perimKm = perimM / 1000;
    const perimNm = perimM / 1852;

    const perimFormatted = perimKm >= 1 ? `${perimKm.toFixed(2)} km (${Math.round(perimM).toLocaleString()} m)` : `${Math.round(perimM).toLocaleString()} m`;
    const centroidLat = coords.reduce((acc, c) => acc + c.lat, 0) / count;
    const centroidLng = coords.reduce((acc, c) => acc + c.lng, 0) / count;
    const centroidMgrs = formatMgrsSpaced(toMgrsString(centroidLat, centroidLng, 5));
    const warningText = selfIntersect.isSelfIntersecting ? ' · ⚠️ Bowtie/Self-Intersecting' : '';

    return {
      ...baseMetrics,
      areaHectares: Number(ha.toFixed(2)),
      areaSquareMeters: Math.round(m2),
      areaKm2: Number(km2.toFixed(3)),
      areaAcres: Number(acres.toFixed(2)),
      perimeterMeters: Math.round(perimM),
      perimeterKm: Number(perimKm.toFixed(3)),
      perimeterNm: Number(perimNm.toFixed(3)),
      centroidMgrs,
      isSelfIntersecting: selfIntersect.isSelfIntersecting,
      selfIntersectionCount: selfIntersect.count,
      areaFormatted: `${ha.toFixed(2)} ha (${Math.round(m2).toLocaleString()} m²)`,
      perimeterFormatted: perimFormatted,
      summary: `Area: ${ha.toFixed(2)} ha (${Math.round(m2).toLocaleString()} m²) · Perimeter: ${perimFormatted} · Centroid MGRS: ${centroidMgrs}${warningText}`,
    };
  }

  // Fallback: Distance / Polyline
  if (count < 2) {
    return {
      ...baseMetrics,
      measurementType: 'distance',
      totalMeters: 0,
      totalKm: 0,
      totalNm: 0,
      summary: 'Distance: 0 m',
    };
  }

  const distMetrics = calculatePathDistance(coords);
  const totalM = distMetrics.totalMeters;
  const totalKm = distMetrics.totalKm;
  const totalNm = distMetrics.totalNm;
  const distFormatted = totalKm >= 1 ? `${totalKm.toFixed(2)} km (${Math.round(totalM).toLocaleString()} m)` : `${Math.round(totalM).toLocaleString()} m`;
  const originMgrs = formatMgrsSpaced(toMgrsString(coords[0].lat, coords[0].lng, 5));
  const terminusMgrs = formatMgrsSpaced(toMgrsString(coords[coords.length - 1].lat, coords[coords.length - 1].lng, 5));

  return {
    ...baseMetrics,
    measurementType: 'distance',
    totalMeters: Math.round(totalM),
    totalKm: Number(totalKm.toFixed(3)),
    totalNm: Number(totalNm.toFixed(3)),
    distanceFormatted: distFormatted,
    originMgrs,
    terminusMgrs,
    summary: `Distance: ${distFormatted} (${totalNm.toFixed(2)} NM) · ${count} waypoints · Terminus: ${terminusMgrs}`,
  };
}

/**
 * Generates an automated, structured Geodetic Telemetry Report string
 * suitable for the item's description field.
 */
export function generateGeodeticDescription(metrics, customNotes = '') {
  if (!metrics) return customNotes || '';

  const cleanNotes = (customNotes || '')
    .replace(/\[GEODETIC TELEMETRY REPORT\][\s\S]*?(?=\n\n[^\n]|$)/gi, '')
    .trim();

  const lines = ['[GEODETIC TELEMETRY REPORT]'];

  if (metrics.measurementType === 'bearing') {
    lines.push(`• Mode: COMPASS BEARING & AZIMUTH`);
    lines.push(`• Forward Azimuth: ${metrics.forwardFormatted || `${metrics.forwardBearingDeg}° ${metrics.forwardCardinal}`}`);
    lines.push(`• Reciprocal / Back Azimuth: ${metrics.reciprocalFormatted || `${metrics.backAzimuthDeg}° ${metrics.backCardinal}`}`);
    lines.push(`• Geodesic Range: ${metrics.rangeFormatted || `${metrics.distanceMeters} m`}`);
    if (metrics.origin) {
      lines.push(`• Observer Coordinates: ${metrics.origin.lat.toFixed(6)}°N, ${metrics.origin.lng.toFixed(6)}°E (${Math.round(metrics.origin.alt || 0)} m MSL)`);
    }
    if (metrics.originMgrs) {
      lines.push(`• Observer MGRS: ${metrics.originMgrs}`);
    }
    if (metrics.target) {
      lines.push(`• Target Coordinates: ${metrics.target.lat.toFixed(6)}°N, ${metrics.target.lng.toFixed(6)}°E (${Math.round(metrics.target.alt || 0)} m MSL)`);
    }
    if (metrics.targetMgrs) {
      lines.push(`• Target MGRS: ${metrics.targetMgrs}`);
    }
  } else if (metrics.measurementType === 'elevation') {
    lines.push(`• Mode: ELEVATION & SLOPE PROFILE`);
    lines.push(`• Elevation Delta (Δh): ${metrics.deltaFormatted || `Δh ${metrics.deltaM >= 0 ? '+' : ''}${metrics.deltaM} m`}`);
    lines.push(`• Altitudes: ${metrics.basePeakFormatted || `Base: ${metrics.baseAltitudeM} m ➔ Peak: ${metrics.peakAltitudeM} m MSL`}`);
    if (metrics.baseMgrs) {
      lines.push(`• Base MGRS: ${metrics.baseMgrs}`);
    }
    if (metrics.peakMgrs) {
      lines.push(`• Summit MGRS: ${metrics.peakMgrs}`);
    }
    lines.push(`• Incline & Gradient: ${metrics.slopeFormatted || `Slope: ${metrics.slopePct}% (${metrics.slopeAngleDeg}°)`}`);
    lines.push(`• Horizontal Distance: ${metrics.horizontalDistKm >= 1 ? `${metrics.horizontalDistKm} km` : `${metrics.horizontalDistM} m`}`);
    lines.push(`• 3D Slant Range: ${metrics.slantDistKm >= 1 ? `${metrics.slantDistKm} km` : `${metrics.slantDistM} m`}`);
    lines.push(`• Transect Nodes: ${metrics.pointCount} points`);
  } else if (metrics.measurementType === 'area') {
    lines.push(`• Mode: ENCLOSED POLYGON AREA`);
    lines.push(`• Enclosed Surface Area: ${metrics.areaFormatted || `${metrics.areaHectares} ha`}`);
    lines.push(`• Total Perimeter: ${metrics.perimeterFormatted || `${metrics.perimeterMeters} m`}`);
    if (metrics.centroidMgrs) {
      lines.push(`• Centroid MGRS: ${metrics.centroidMgrs}`);
    }
    lines.push(`• Boundary Vertices: ${metrics.pointCount} points`);
  } else {
    lines.push(`• Mode: GEODESIC DISTANCE & PATH`);
    lines.push(`• Total Path Distance: ${metrics.distanceFormatted || `${metrics.totalMeters} m`}`);
    lines.push(`• Nautical Equivalent: ${metrics.totalNm} NM`);
    if (metrics.originMgrs) {
      lines.push(`• Origin MGRS: ${metrics.originMgrs}`);
    }
    if (metrics.terminusMgrs) {
      lines.push(`• Terminus MGRS: ${metrics.terminusMgrs}`);
    }
    lines.push(`• Path Waypoints: ${metrics.pointCount} points`);
  }

  const reportBlock = lines.join('\n');
  if (cleanNotes) {
    return `${cleanNotes}\n\n${reportBlock}`;
  }
  return reportBlock;
}

/**
 * Updates a spatial item with freshly computed geodetic telemetry.
 * Auto-updates name (if patterned), description report, and properties.
 *
 * @param {Object} item
 * @param {Array|string} [newCoords]
 * @param {string} [typeHint]
 * @returns {Object} Fully updated item
 */
export function updateItemGeodeticData(item, newCoords, typeHint) {
  if (!item) return item;

  const coords = newCoords || item.coordinates;
  const normalized = normalizeItemCoordinates(coords);
  const type = typeHint || item.measurementType || detectMeasurementType(item, normalized);
  const metrics = extractGeodeticMetrics(normalized, type);

  // Auto-generate descriptive name if item's name is default or unedited
  let updatedName = item.name;
  const isDefaultName = !item.name ||
    item.name.toLowerCase().startsWith('bearing') ||
    item.name.toLowerCase().startsWith('elevation') ||
    item.name.toLowerCase().startsWith('area') ||
    item.name.toLowerCase().startsWith('distance') ||
    item.name === 'polyline' ||
    item.name === 'polygon' ||
    item.name === 'point of interest' ||
    item.name === 'Untitled Item';

  if (isDefaultName) {
    if (metrics.measurementType === 'bearing') {
      const deg = Math.round(metrics.forwardBearingDeg || 0);
      const card = metrics.forwardCardinal || 'N';
      const distStr = metrics.distanceKm >= 1 ? `${metrics.distanceKm.toFixed(1)} km` : `${metrics.distanceMeters} m`;
      updatedName = `Bearing ${deg}° ${card} (${distStr})`;
    } else if (metrics.measurementType === 'elevation') {
      const sign = metrics.deltaM >= 0 ? '+' : '';
      updatedName = `Elevation (Δh ${sign}${metrics.deltaM} m, ${metrics.slopeAngleDeg}°)`;
    } else if (metrics.measurementType === 'area') {
      updatedName = `Area (${metrics.areaHectares} ha)`;
    } else if (metrics.measurementType === 'distance') {
      const distStr = metrics.totalKm >= 1 ? `${metrics.totalKm.toFixed(2)} km` : `${metrics.totalMeters} m`;
      updatedName = `Distance (${distStr})`;
    }
  }

  // Update description
  const updatedDesc = generateGeodeticDescription(metrics, item.description);

  return {
    ...item,
    name: updatedName,
    measurementType: metrics.measurementType,
    coordinates: JSON.stringify(normalized),
    geodeticMetrics: metrics,
    description: updatedDesc,
    properties: {
      ...(item.properties || {}),
      ...metrics,
    },
    updatedAt: new Date().toISOString(),
  };
}
