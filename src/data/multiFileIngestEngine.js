/**
 * @fileoverview Multi-File Ingestion Engine for GodsEyeView.
 * 
 * Enables simultaneous client-side parsing and merging of multiple geospatial & telemetry
 * files (.csv, .tsv, .gpx, .nmea, .log, .geojson, .json).
 * 
 * Features:
 * - 100% local, high-throughput parsing (zero quota consumption).
 * - Concurrent asynchronous ingestion via Promise.all.
 * - Distinct chromatic signatures (cyan, emerald, amber, rose, violet) for visual separation.
 * - Automated bounds unification across all loaded datasets.
 */

import {
  detectTrajectorySignature,
  processTrajectoryDataset,
  extractGpxEntities,
  extractNmeaEntities,
  extractKmlEntities,
} from './trajectoryProcessor.js';
import {
  extractCsvEntities,
  extractGeoJsonEntities,
} from './urlLayerIngest.js';

export const DATASET_CHROMATIC_PALETTE = Object.freeze([
  '#00e5ff', // Vibrant Cyan (Fleet 1 / Air)
  '#10b981', // Emerald Green (Ground SAR / Trails)
  '#f59e0b', // Solar Amber (Marine / NMEA)
  '#ec4899', // Neon Rose (Tactical Patrol)
  '#8b5cf6', // Electric Violet (Airports / Ports)
  '#06b6d4', // Deep Sky Blue (Logistics)
  '#84cc16', // High-Vis Lime (Emergency)
  '#fb923c', // Warm Coral (Secondary Units)
]);

/**
 * Assigns a deterministic chromatic color to a dataset by its index.
 * @param {number} index
 * @returns {string} Hex color
 */
export function getDatasetColor(index) {
  return DATASET_CHROMATIC_PALETTE[Math.abs(index) % DATASET_CHROMATIC_PALETTE.length];
}

/**
 * Detects the file format from filename extension or content signature.
 * @param {string} filename
 * @param {string} [content='']
 * @returns {'gpx'|'nmea'|'geojson'|'csv'|'unknown'}
 */
export function detectFileFormat(filename = '', content = '') {
  const fn = String(filename || '').toLowerCase();
  if (fn.endsWith('.kml') || content.includes('<kml')) return 'kml';
  if (fn.endsWith('.gpx') || content.includes('<gpx')) return 'gpx';
  if (fn.endsWith('.nmea') || fn.endsWith('.log') || content.startsWith('$GP') || content.startsWith('$GN')) return 'nmea';
  if (fn.endsWith('.geojson') || fn.endsWith('.json') || content.includes('"type": "FeatureCollection"') || content.includes('"type":"FeatureCollection"')) return 'geojson';
  if (fn.endsWith('.csv') || fn.endsWith('.tsv') || content.includes(',') || content.includes('\t')) return 'csv';
  return 'unknown';
}

/**
 * Computes bounding rectangle enclosing a list of points or vehicles.
 * @param {Array<{ lat: number, lon: number }>} items
 * @returns {{ minLat: number, maxLat: number, minLon: number, maxLon: number } | null}
 */
export function computeBounds(items = []) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let validCount = 0;

  for (const it of items) {
    const lat = Number(it.lat);
    const lon = Number(it.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      validCount++;
    }
  }

  if (validCount === 0) return null;
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Merges multiple bounding boxes into a single bounding box.
 * @param {Array<{ minLat: number, maxLat: number, minLon: number, maxLon: number }>} boundsList
 */
export function mergeBounds(boundsList = []) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let hasValid = false;

  for (const b of boundsList) {
    if (!b) continue;
    if (Number.isFinite(b.minLat) && b.minLat < minLat) minLat = b.minLat;
    if (Number.isFinite(b.maxLat) && b.maxLat > maxLat) maxLat = b.maxLat;
    if (Number.isFinite(b.minLon) && b.minLon < minLon) minLon = b.minLon;
    if (Number.isFinite(b.maxLon) && b.maxLon > maxLon) maxLon = b.maxLon;
    hasValid = true;
  }

  if (!hasValid) return null;
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Parses a single file's text content into normalized points or vehicle trajectories.
 * @param {Object} fileSpec
 * @param {string} fileSpec.name Filename
 * @param {string} fileSpec.content Raw text content
 * @param {number} [fileSpec.index=0] File sequence index
 * @param {string} [fileSpec.color] Optional color override
 * @returns {Promise<{ datasetId: string, name: string, format: string, color: string, points: Array, trajectories: Array, isTrajectory: boolean, bounds: Object|null }>}
 */
export async function parseSingleFile(fileSpec) {
  const { name, content, index = 0, color } = fileSpec;
  const datasetId = `ds-${Date.now().toString(36)}-${index}-${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const datasetColor = color || getDatasetColor(index);
  const format = detectFileFormat(name, content);

  let points = [];
  let trajectories = [];
  let isTrajectory = false;

  switch (format) {
    case 'kml': {
      const kmlResult = extractKmlEntities(content, name);
      points = kmlResult.points || [];
      if (kmlResult.isTrajectory) {
        isTrajectory = true;
        trajectories = kmlResult.trajectoryList || (kmlResult.trajectories instanceof Map ? Array.from(kmlResult.trajectories.values()) : []);
      }
      break;
    }
    case 'gpx': {
      const gpxResult = extractGpxEntities(content, name);
      points = gpxResult.points || [];
      if (gpxResult.isTrajectory) {
        isTrajectory = true;
        trajectories = gpxResult.trajectoryList || (gpxResult.trajectories instanceof Map ? Array.from(gpxResult.trajectories.values()) : []);
      }
      break;
    }
    case 'nmea': {
      const nmeaResult = extractNmeaEntities(content, name);
      points = nmeaResult.points || [];
      if (nmeaResult.isTrajectory) {
        isTrajectory = true;
        trajectories = nmeaResult.trajectoryList || (nmeaResult.trajectories instanceof Map ? Array.from(nmeaResult.trajectories.values()) : []);
      }
      break;
    }
    case 'geojson': {
      points = extractGeoJsonEntities(content, name);
      break;
    }
    case 'csv':
    default: {
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const headers = (lines[0] || '').split(/,|\t/).map((h) => h.trim().toLowerCase());
      const sig = detectTrajectorySignature(headers);

      if (sig.isTrajectory) {
        const rows = lines.slice(1).map((line) => {
          const cells = line.split(/,|\t/);
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = cells[i] ? cells[i].trim() : '';
          });
          return obj;
        });
        const trajData = processTrajectoryDataset(rows, sig, name);
        isTrajectory = true;
        trajectories = trajData.trajectoryList || [];
        points = trajData.points || [];
      } else {
        points = extractCsvEntities(content, name);
      }
      break;
    }
  }

  // Stamp every entity and trajectory with dataset identity and distinct color
  points = points.map((p, pIdx) => ({
    ...p,
    datasetId,
    datasetName: name,
    datasetColor,
    color: datasetColor,
    id: p.id || `${datasetId}-pt-${pIdx}`,
  }));

  trajectories = trajectories.map((t, tIdx) => ({
    ...t,
    datasetId,
    datasetName: name,
    datasetColor,
    color: datasetColor,
    vehicleId: t.vehicleId ? `${datasetId}::${t.vehicleId}` : `${datasetId}::v-${tIdx}`,
    displayName: t.vehicleId || `Unit ${tIdx + 1}`,
  }));

  const allCoords = [
    ...points.map((p) => ({ lat: p.lat, lon: p.lon })),
    ...trajectories.flatMap((t) => (t.points || []).map((tp) => ({ lat: tp.lat, lon: tp.lon }))),
  ];
  const bounds = computeBounds(allCoords);

  return {
    datasetId,
    name,
    format,
    color: datasetColor,
    points,
    trajectories,
    isTrajectory,
    pointCount: points.length,
    vehicleCount: trajectories.length,
    bounds,
  };
}

/**
 * Ingests and merges multiple files simultaneously.
 * @param {Array<{ name: string, content: string }>} files
 * @returns {Promise<{ datasets: Array, combinedPoints: Array, combinedTrajectories: Array, combinedBounds: Object|null, combinedCenter: Object|null, summary: Object }>}
 */
export async function ingestMultipleFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      datasets: [],
      combinedPoints: [],
      combinedTrajectories: [],
      combinedBounds: null,
      combinedCenter: null,
      summary: { totalFiles: 0, totalPoints: 0, totalVehicles: 0 },
    };
  }

  // Parse all files concurrently
  const parsePromises = files.map((file, index) =>
    parseSingleFile({
      name: file.name,
      content: file.content,
      index,
    })
  );

  const datasets = await Promise.all(parsePromises);

  const combinedPoints = [];
  const combinedTrajectories = [];
  const boundsList = [];

  for (const ds of datasets) {
    if (ds.points && ds.points.length > 0) {
      combinedPoints.push(...ds.points);
    }
    if (ds.trajectories && ds.trajectories.length > 0) {
      combinedTrajectories.push(...ds.trajectories);
    }
    if (ds.bounds) {
      boundsList.push(ds.bounds);
    }
  }

  const combinedBounds = mergeBounds(boundsList);
  const combinedCenter = combinedBounds
    ? {
        lat: (combinedBounds.minLat + combinedBounds.maxLat) / 2,
        lon: (combinedBounds.minLon + combinedBounds.maxLon) / 2,
      }
    : null;

  return {
    datasets,
    combinedPoints,
    combinedTrajectories,
    combinedBounds,
    combinedCenter,
    summary: {
      totalFiles: datasets.length,
      totalPoints: combinedPoints.length,
      totalVehicles: combinedTrajectories.length,
      isTrajectory: combinedTrajectories.length > 0,
      datasetsSummary: datasets.map((d) => ({
        id: d.datasetId,
        name: d.name,
        color: d.color,
        format: d.format,
        points: d.pointCount,
        vehicles: d.vehicleCount,
      })),
    },
  };
}
