/**
 * @fileoverview Google Drive REST API v3 Client for GodsEyeView.
 * 
 * Provides automated folder structure management:
 * GodsEyeView/
 *   ├── Fleet-GPS/     (CSV/TSV telemetry datasets)
 *   ├── GPX-Tracks/    (GPX traces and waypoints)
 *   ├── NMEA-Logs/     (Raw NMEA streams and logs)
 *   └── Layers/        (GeoJSONs, PDFs, tables)
 * 
 * Includes file listing, uploading, downloading, and streaming.
 */

import { getAccessToken } from '../auth/googleDriveAuth.js';
import {
  featuresToGeoJsonCollection,
  featuresToKmlDocument,
  importTacticalLayerContent,
} from '../tools/tacticalGeoExport.js';

export const ROOT_FOLDER_NAME = 'GodsEyeView';
export const SUBFOLDERS = Object.freeze({
  FLEET_GPS: 'Fleet-GPS',
  GPX_TRACKS: 'GPX-Tracks',
  NMEA_LOGS: 'NMEA-Logs',
  LAYERS: 'Layers',
});

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

/**
 * Cache for folder IDs to prevent redundant lookups.
 */
const folderCache = new Map();

/**
 * Executes an authenticated Google Drive API fetch request.
 */
async function driveFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token missing. Please connect Google Drive first.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(`Google Drive API request failed (${res.status}): ${errorDetail}`);
  }

  return res;
}

/**
 * Finds or creates a folder with the specified name under an optional parent folder.
 * @param {string} folderName
 * @param {string|null} [parentFolderId]
 * @returns {Promise<string>} folderId
 */
export async function getOrCreateFolder(folderName, parentFolderId = null) {
  const cacheKey = `${parentFolderId || 'root'}::${folderName}`;
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey);
  }

  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchUrl = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;
  const res = await driveFetch(searchUrl);
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    const id = data.files[0].id;
    folderCache.set(cacheKey, id);
    return id;
  }

  // Create folder if not found
  const meta = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    meta.parents = [parentFolderId];
  }

  const createRes = await driveFetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });

  const created = await createRes.json();
  folderCache.set(cacheKey, created.id);
  return created.id;
}

/**
 * Ensures the full GodsEyeView folder hierarchy exists in Google Drive.
 * @returns {Promise<{ rootId: string, subfolders: Record<string, string> }>}
 */
export async function ensureGodsEyeViewFolderStructure() {
  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME);
  const subfolderIds = {};

  for (const [key, subName] of Object.entries(SUBFOLDERS)) {
    subfolderIds[key] = await getOrCreateFolder(subName, rootId);
  }

  return { rootId, subfolders: subfolderIds };
}

/**
 * Automatically determines the target subfolder category based on filename or format.
 * @param {string} filename
 * @param {string} [hintFormat]
 * @returns {string} subfolder key (FLEET_GPS | GPX_TRACKS | NMEA_LOGS | LAYERS)
 */
export function categorizeTelemetryFilename(filename = '', hintFormat = '') {
  const fn = filename.toLowerCase();
  const hf = hintFormat.toLowerCase();

  if (fn.endsWith('.gpx') || hf === 'gpx') return 'GPX_TRACKS';
  if (fn.endsWith('.nmea') || fn.endsWith('.log') || hf === 'nmea') return 'NMEA_LOGS';
  if (fn.endsWith('.csv') || fn.endsWith('.tsv') || hf === 'csv' || hf === 'trajectory') return 'FLEET_GPS';
  return 'LAYERS';
}

/**
 * Lists files in a specific Google Drive folder or inside GodsEyeView.
 * Filters out folders so only ingestible data files are returned.
 * @param {Object} [options]
 * @param {string} [options.folderId]
 * @param {string} [options.category] 'FLEET_GPS' | 'GPX_TRACKS' | 'NMEA_LOGS' | 'LAYERS'
 * @param {number} [options.pageSize=50]
 * @returns {Promise<Array<{ id: string, name: string, mimeType: string, modifiedTime: string, size: string, folderCategory?: string }>>}
 */
export async function listDriveFiles(options = {}) {
  const { rootId, subfolders } = await ensureGodsEyeViewFolderStructure();

  let query = '';
  if (options.folderId) {
    query = `'${options.folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  } else if (options.category && SUBFOLDERS[options.category]) {
    const targetFolderId = subfolders[options.category];
    query = `'${targetFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  } else {
    // 'ALL' files inside GodsEyeView and all of its subfolders
    const parentIds = [
      subfolders.FLEET_GPS,
      subfolders.GPX_TRACKS,
      subfolders.NMEA_LOGS,
      subfolders.LAYERS,
      rootId,
    ].filter(Boolean);
    const parentQuery = parentIds.map((id) => `'${id}' in parents`).join(' or ');
    query = `(${parentQuery}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  }

  const url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,parents)&orderBy=modifiedTime desc&pageSize=${options.pageSize || 50}`;

  const res = await driveFetch(url);
  const data = await res.json();
  const rawFiles = data.files || [];

  return rawFiles.map((file) => {
    let folderCategory = categorizeTelemetryFilename(file.name);
    if (file.parents && Array.isArray(file.parents)) {
      for (const [catKey, subId] of Object.entries(subfolders)) {
        if (file.parents.includes(subId)) {
          folderCategory = catKey;
          break;
        }
      }
    }
    return {
      ...file,
      folderCategory,
    };
  });
}

/**
 * Uploads a telemetry or layer file to Google Drive under the structured GodsEyeView hierarchy.
 * @param {Object} params
 * @param {string} params.name Filename
 * @param {string|Blob} params.content Text or binary content
 * @param {string} [params.contentType='text/plain']
 * @param {string} [params.category] 'FLEET_GPS' | 'GPX_TRACKS' | 'NMEA_LOGS' | 'LAYERS'
 * @param {string} [params.folderId] Explicit folder override
 * @returns {Promise<{ id: string, name: string, webViewLink: string }>}
 */
export async function uploadTelemetryFile(params) {
  const { name, content, contentType = 'text/plain', category, folderId } = params;

  let targetFolderId = folderId;
  if (!targetFolderId) {
    const cat = category || categorizeTelemetryFilename(name);
    const { subfolders } = await ensureGodsEyeViewFolderStructure();
    targetFolderId = subfolders[cat] || subfolders.LAYERS;
  }

  const metadata = {
    name,
    parents: [targetFolderId],
  };

  const boundary = `-------314159265358979323846`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bodyParts = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${contentType}\r\n\r\n`,
    typeof content === 'string' ? content : await content.text(),
    closeDelimiter,
  ];

  const multipartRequestBody = bodyParts.join('');

  const res = await driveFetch(UPLOAD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  return await res.json();
}

/**
 * Downloads a file from Google Drive as text.
 * Automatically handles Google Docs / Sheets files by exporting them to text/csv,
 * and rejects folder downloads gracefully.
 * @param {string} fileId
 * @param {string} [mimeType]
 * @returns {Promise<string>}
 */
export async function downloadDriveFile(fileId, mimeType = '') {
  if (mimeType === 'application/vnd.google-apps.folder') {
    throw new Error('Selected item is a directory/folder and cannot be ingested as a telemetry file.');
  }

  // Google Sheets (export to CSV format)
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportUrl = `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`;
    const res = await driveFetch(exportUrl);
    return await res.text();
  }

  // Google Docs (export to plain text)
  if (mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
    const res = await driveFetch(exportUrl);
    return await res.text();
  }

  // Standard file download
  const url = `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`;
  try {
    const res = await driveFetch(url);
    return await res.text();
  } catch (err) {
    // If it's a Docs Editor file that threw 403: "Only files with binary content can be downloaded. Use Export with Docs Editors files."
    if (err.message && (err.message.includes('Docs Editors') || err.message.includes('Only files with binary content'))) {
      const meta = await getDriveFileMetadata(fileId);
      if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const exportRes = await driveFetch(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`);
        return await exportRes.text();
      }
      if (meta.mimeType === 'application/vnd.google-apps.document') {
        const exportRes = await driveFetch(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`);
        return await exportRes.text();
      }
      if (meta.mimeType === 'application/vnd.google-apps.folder') {
        throw new Error('Selected item is a directory/folder and cannot be downloaded as a telemetry file.');
      }
    }
    throw err;
  }
}

/**
 * Creates/uploads a file to Google Drive (alias for uploadTelemetryFile with flexible options).
 * @param {Object} params
 */
export async function createDriveFile(params) {
  return await uploadTelemetryFile(params);
}

/**
 * Updates an existing file's content and/or metadata in Google Drive (Edit / Update).
 * @param {Object} params
 * @param {string} params.fileId The Google Drive file ID
 * @param {string} [params.name] New filename if renaming
 * @param {string|Blob} [params.content] New file text or blob content
 * @param {string} [params.contentType='application/json']
 * @returns {Promise<object>} Updated file metadata
 */
export async function updateDriveFile({ fileId, name, content, contentType = 'application/json' }) {
  if (!fileId) {
    throw new Error('Google Drive fileId is required for update');
  }

  // Update metadata (e.g. rename) if provided
  let metadataRes = null;
  if (name) {
    const res = await driveFetch(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    metadataRes = await res.json();
  }

  // Update content if provided
  if (content !== undefined) {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`;
    const payload = typeof content === 'string' ? content : await content.text();
    const res = await driveFetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': contentType },
      body: payload,
    });
    return await res.json();
  }

  return metadataRes || await getDriveFileMetadata(fileId);
}

/**
 * Deletes a file from Google Drive (Delete).
 * @param {string} fileId
 * @returns {Promise<{ success: boolean, fileId: string }>}
 */
export async function deleteDriveFile(fileId) {
  if (!fileId) {
    throw new Error('Google Drive fileId is required for deletion');
  }

  await driveFetch(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });

  return { success: true, fileId };
}

/**
 * Saves Map Tools spatial annotations (points, polygons, lines, POIs) to Google Drive as GeoJSON.
 * @param {Object} params
 * @param {string} [params.name='map_tools_annotations.geojson']
 * @param {object} params.featureCollection GeoJSON FeatureCollection
 * @returns {Promise<{ id: string, name: string, webViewLink: string }>}
 */
export async function saveMapFeatureLayerToDrive({ name = 'map_tools_features.geojson', featureCollection }) {
  const safeName = name.endsWith('.geojson') || name.endsWith('.json') ? name : `${name}.geojson`;
  const content = typeof featureCollection === 'string'
    ? featureCollection
    : JSON.stringify(featureCollection, null, 2);

  return await uploadTelemetryFile({
    name: safeName,
    content,
    contentType: 'application/geo+json',
    category: 'LAYERS',
  });
}

/**
 * Fetches file metadata from Google Drive.
 * @param {string} fileId
 */
export async function getDriveFileMetadata(fileId) {
  const url = `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink`;
  const res = await driveFetch(url);
  return await res.json();
}

/**
 * Clears the in-memory folder lookup cache.
 */
export function clearFolderCache() {
  folderCache.clear();
}

/**
 * Saves tactical map features (points, lines, polygons, circles, geofences) to Google Drive
 * as standard GeoJSON or Google Earth KML under the dedicated GodsEyeView/Layers folder.
 *
 * @param {Object} params
 * @param {string} [params.name='tactical_sector.geojson'] - Desired file name
 * @param {Array<Object>} [params.features=[]] - Tactical feature instances from MapToolsEngine
 * @param {Object} [params.featureCollection] - Pre-built GeoJSON FeatureCollection
 * @param {string} [params.format='geojson'] - Format: 'geojson' or 'kml'
 * @param {string} [params.category='LAYERS'] - Folder category
 * @param {Object} [params.options={}] - Additional metadata or KML options
 * @returns {Promise<{ id: string, name: string, webViewLink: string, format: string, category: string }>}
 */
export async function saveTacticalLayerToDrive({
  name = 'tactical_sector.geojson',
  features = [],
  featureCollection = null,
  format = 'geojson',
  category = 'LAYERS',
  options = {},
}) {
  const normFormat = String(format || 'geojson').toLowerCase();
  let content = '';
  let contentType = 'application/geo+json';
  let safeName = name.trim();

  if (normFormat === 'kml') {
    contentType = 'application/vnd.google-earth.kml+xml';
    if (!safeName.toLowerCase().endsWith('.kml')) {
      safeName = `${safeName.replace(/\.[^/.]+$/, '')}.kml`;
    }
    content = featuresToKmlDocument(features, {
      title: options.title || safeName,
      description: options.description || 'GodsEyeView Tactical Layer Export',
    });
  } else {
    contentType = 'application/geo+json';
    if (!safeName.toLowerCase().endsWith('.geojson') && !safeName.toLowerCase().endsWith('.json')) {
      safeName = `${safeName.replace(/\.[^/.]+$/, '')}.geojson`;
    }
    const collection = featureCollection || featuresToGeoJsonCollection(features);
    content = typeof collection === 'string' ? collection : JSON.stringify(collection, null, 2);
  }

  const uploaded = await uploadTelemetryFile({
    name: safeName,
    content,
    contentType,
    category,
  });

  return {
    ...uploaded,
    format: normFormat,
    category,
  };
}

/**
 * Lists tactical layer files from Google Drive with format classification.
 *
 * @param {Object} [params={}]
 * @param {string} [params.category='LAYERS'] - Folder category
 * @returns {Promise<Array<Object>>} List of tactical layer file descriptors
 */
export async function listTacticalLayersFromDrive({ category = 'LAYERS' } = {}) {
  const allFiles = await listDriveFiles({ category });

  return allFiles.map((f) => {
    const lowerName = (f.name || '').toLowerCase();
    let format = 'unknown';
    if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
      format = 'geojson';
    } else if (lowerName.endsWith('.kml')) {
      format = 'kml';
    } else if (lowerName.endsWith('.gpx')) {
      format = 'gpx';
    }

    return {
      ...f,
      format,
      isTacticalGis: ['geojson', 'kml', 'json'].includes(format),
    };
  });
}

/**
 * Downloads a tactical layer file from Google Drive and parses its features
 * using the universal tactical GIS parser (supporting GeoJSON and KML).
 *
 * @param {string} fileId - Google Drive file ID
 * @param {Object} [options={}]
 * @param {string} [options.name=''] - Original filename hint
 * @param {string} [options.mimeType=''] - Optional MIME type hint
 * @returns {Promise<{ fileId: string, name: string, format: string, features: Array<Object>, rawContent: string }>}
 */
export async function loadTacticalLayerFromDrive(fileId, options = {}) {
  if (!fileId) {
    throw new Error('Google Drive fileId is required to load tactical layer');
  }

  const rawContent = await downloadDriveFile(fileId, options.mimeType);
  const nameHint = options.name || '';
  const features = importTacticalLayerContent(rawContent, nameHint);

  const lowerName = nameHint.toLowerCase();
  const format = lowerName.endsWith('.kml') || rawContent.startsWith('<?xml') || rawContent.includes('<kml')
    ? 'kml'
    : 'geojson';

  return {
    fileId,
    name: nameHint,
    format,
    features,
    rawContent,
  };
}

/**
 * Bi-directional synchronization between MapToolsEngine and Google Drive tactical layers.
 *
 * @param {Object} params
 * @param {Object} params.engine - MapToolsEngine instance
 * @param {'save'|'import'} params.mode - Sync direction
 * @param {string} [params.fileId] - File ID for import
 * @param {string} [params.name] - File name for save
 * @param {string} [params.format='geojson'] - Format for save ('geojson'|'kml')
 * @returns {Promise<Object>}
 */
export async function syncTacticalFeaturesWithDrive({
  engine,
  mode = 'save',
  fileId = '',
  name = 'tactical_layer.geojson',
  format = 'geojson',
}) {
  if (!engine) {
    throw new Error('MapToolsEngine instance is required for syncTacticalFeaturesWithDrive');
  }

  if (mode === 'save') {
    const features = engine.getAllFeatures();
    const result = await saveTacticalLayerToDrive({
      name,
      features,
      format,
    });
    return {
      success: true,
      mode: 'save',
      count: features.length,
      file: result,
    };
  } else if (mode === 'import') {
    if (!fileId) {
      throw new Error('fileId is required when importing from Google Drive');
    }
    const layer = await loadTacticalLayerFromDrive(fileId, { name });
    const createdFeatures = [];
    const errors = [];

    for (const f of layer.features) {
      try {
        const created = engine.createFeature(f);
        createdFeatures.push(created);
      } catch (err) {
        errors.push({ feature: f.name || 'unnamed', error: err.message });
      }
    }

    return {
      success: true,
      mode: 'import',
      layerName: layer.name,
      format: layer.format,
      totalCount: layer.features.length,
      importedCount: createdFeatures.length,
      errors,
      createdFeatures,
    };
  } else {
    throw new Error(`Invalid sync mode: ${mode}. Expected "save" or "import".`);
  }
}

