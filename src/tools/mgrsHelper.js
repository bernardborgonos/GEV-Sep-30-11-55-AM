/**
 * @module src/tools/mgrsHelper.js
 * High-precision NATO Military Grid Reference System (MGRS) & UTM coordinate conversion utilities.
 * Powered by WGS84 ellipsoid geodetic math.
 */

import * as mgrsModule from 'mgrs';

const _forward = mgrsModule.forward || (mgrsModule.default && mgrsModule.default.forward);

/**
 * Converts WGS84 geographic coordinates (lat, lng) to a standardized MGRS coordinate string.
 *
 * @param {number} lat - Latitude in degrees [-90, 90]
 * @param {number} lng - Longitude in degrees [-180, 180]
 * @param {number} [precision=5] - 1 = 10km, 2 = 1km, 3 = 100m, 4 = 10m, 5 = 1m precision
 * @returns {string} Standard compact MGRS string (e.g., '51PTS8284814992') or fallback coordinate string
 */
export function toMgrsString(lat, lng, precision = 5) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return 'N/A';
  try {
    const numLat = Number(lat);
    const numLng = Number(lng);
    // MGRS is defined between 80°S and 84°N
    if (numLat < -80 || numLat > 84) {
      return `UPS: ${numLat >= 0 ? 'N' : 'S'} ${numLat.toFixed(4)}°, ${numLng.toFixed(4)}°`;
    }
    if (typeof _forward === 'function') {
      return _forward([numLng, numLat], precision);
    }
    return `${numLat.toFixed(4)}°, ${numLng.toFixed(4)}°`;
  } catch (err) {
    console.warn('[MGRS] Conversion error for:', lat, lng, err);
    return `${Number(lat).toFixed(4)}°, ${Number(lng).toFixed(4)}°`;
  }
}

/**
 * Formats a raw compact MGRS string into standardized tactical military spaced notation:
 * E.g., '51PTS8284814992' -> '51P TS 82848 14992' (Grid Zone, 100km ID, Easting, Northing).
 *
 * @param {string} rawMgrs
 * @returns {string} Spaced MGRS string
 */
export function formatMgrsSpaced(rawMgrs) {
  if (!rawMgrs || typeof rawMgrs !== 'string') return 'N/A';
  const clean = rawMgrs.trim().toUpperCase();

  // Pattern: 1-2 digits, 1 letter (GZD), 2 letters (100k square), followed by 2N digits (easting + northing)
  const match = clean.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);
  if (!match) return clean;

  const gzd = match[1];
  const sq = match[2];
  const coords = match[3];
  const halfLen = coords.length / 2;
  const easting = coords.slice(0, halfLen);
  const northing = coords.slice(halfLen);

  return `${gzd} ${sq} ${easting} ${northing}`;
}

/**
 * Returns structured military grid breakdown for inspector tables and tooltips.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [precision=5]
 * @returns {{ raw: string, formatted: string, gzd: string, squareId: string, easting: string, northing: string }}
 */
export function getMgrsBreakdown(lat, lng, precision = 5) {
  const raw = toMgrsString(lat, lng, precision);
  const formatted = formatMgrsSpaced(raw);
  const match = raw.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);

  if (!match) {
    return {
      raw,
      formatted,
      gzd: 'N/A',
      squareId: 'N/A',
      easting: 'N/A',
      northing: 'N/A',
    };
  }

  const gzd = match[1];
  const squareId = match[2];
  const coords = match[3];
  const half = coords.length / 2;
  return {
    raw,
    formatted,
    gzd,
    squareId,
    easting: coords.slice(0, half),
    northing: coords.slice(half),
  };
}
