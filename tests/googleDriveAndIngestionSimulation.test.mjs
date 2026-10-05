import test from 'node:test';
import assert from 'node:assert/strict';

import {
  categorizeTelemetryFilename,
  SUBFOLDERS,
  ROOT_FOLDER_NAME,
  createDriveFile,
  updateDriveFile,
  deleteDriveFile,
  listDriveFiles,
  downloadDriveFile,
  saveMapFeatureLayerToDrive,
} from '../src/data/googleDriveClient.js';

import {
  annotationsToFeatureCollection,
  featureCollectionToAnnotations,
} from '../src/annotations/annotationGeoJson.js';

import {
  SCOPES,
  getAccessToken,
  setAccessTokenForTesting,
} from '../src/auth/googleDriveAuth.js';

import {
  ingestMultipleFiles,
  detectFileFormat,
  getDatasetColor,
} from '../src/data/multiFileIngestEngine.js';

// =========================================================================
// PHASE 1: Google Account Authentication & OAuth Scopes Validation
// =========================================================================
test('Phase 1: Google Account Authentication & Least-Privilege Scopes', async (t) => {
  await t.test('Phase 1.1: Exports strict least-privilege OAuth scopes', () => {
    assert.ok(Array.isArray(SCOPES), 'SCOPES must be an array');
    assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.file'), 'Must include drive.file scope');
    assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.readonly'), 'Must include drive.readonly scope');
    assert.ok(!SCOPES.includes('https://www.googleapis.com/auth/drive'), 'Must NOT request dangerous full drive access');
  });

  await t.test('Phase 1.2: In-memory token starts null or clean string without persistence leak', () => {
    const token = getAccessToken();
    assert.ok(token === null || typeof token === 'string', 'Token must be null or string');
  });
});

// =========================================================================
// PHASE 2: Folder Hierarchy & Auto-Categorization Validation
// =========================================================================
test('Phase 2: GodsEyeView Directory Structure & Auto-Sorting Engine', async (t) => {
  await t.test('Phase 2.1: Target directory tree is correctly configured', () => {
    assert.equal(ROOT_FOLDER_NAME, 'GodsEyeView', 'Root directory must be GodsEyeView');
    assert.equal(SUBFOLDERS.FLEET_GPS, 'Fleet-GPS', 'Fleet GPS must map to Fleet-GPS');
    assert.equal(SUBFOLDERS.GPX_TRACKS, 'GPX-Tracks', 'GPX tracks must map to GPX-Tracks');
    assert.equal(SUBFOLDERS.NMEA_LOGS, 'NMEA-Logs', 'NMEA logs must map to NMEA-Logs');
    assert.equal(SUBFOLDERS.LAYERS, 'Layers', 'Layers must map to Layers');
  });

  await t.test('Phase 2.2: Categorizes varied file formats accurately', () => {
    // CSV telemetry -> Fleet-GPS
    assert.equal(categorizeTelemetryFilename('manila_delivery_fleet.csv'), 'FLEET_GPS');
    assert.equal(categorizeTelemetryFilename('truck_locations.tsv'), 'FLEET_GPS');

    // GPX tracks -> GPX-Tracks
    assert.equal(categorizeTelemetryFilename('luzon_expressway_patrol.gpx'), 'GPX_TRACKS');

    // NMEA serial stream / logs -> NMEA-Logs
    assert.equal(categorizeTelemetryFilename('manila_lrt_mrt_simulation.nmea'), 'NMEA_LOGS');
    assert.equal(categorizeTelemetryFilename('gps_feed_raw.log'), 'NMEA_LOGS');

    // Spatial layers -> Layers
    assert.equal(categorizeTelemetryFilename('subic_clark_corridor.geojson'), 'LAYERS');
    assert.equal(categorizeTelemetryFilename('perimeter_zone.kml'), 'LAYERS');
    assert.equal(categorizeTelemetryFilename('tactical_poi.json'), 'LAYERS');
  });
});

// =========================================================================
// PHASE 3: CRED (Create, Read, Edit, Delete) & Map Tools Layer Save
// =========================================================================
test('Phase 3: CRED Lifecycle & Map Tools GeoJSON Layer Save', async (t) => {
  await t.test('Phase 3.1: CRED API interfaces exist and throw clear auth error without token', async () => {
    assert.equal(typeof createDriveFile, 'function', 'createDriveFile must exist');
    assert.equal(typeof updateDriveFile, 'function', 'updateDriveFile must exist');
    assert.equal(typeof deleteDriveFile, 'function', 'deleteDriveFile must exist');
    assert.equal(typeof listDriveFiles, 'function', 'listDriveFiles must exist');
    assert.equal(typeof saveMapFeatureLayerToDrive, 'function', 'saveMapFeatureLayerToDrive must exist');

    await assert.rejects(
      async () => {
        await createDriveFile({ name: 'test.csv', content: 'id,lat,lon\n1,14.5,120.9' });
      },
      /Google Drive access token/,
      'Must reject when not authenticated'
    );
  });

  await t.test('Phase 3.2: Map Tools Annotations <-> GeoJSON Serialization is bidirectional', () => {
    const originalAnnotations = [
      {
        id: 'pin-1',
        type: 'pin',
        label: 'Command Post Alpha',
        color: 'cyan',
        anchor: { lon: 120.9842, lat: 14.5995, height: 10 },
      },
      {
        id: 'area-1',
        type: 'area',
        label: 'Sector Bravo',
        color: 'primary',
        ring: [
          [120.97, 14.58],
          [121.00, 14.58],
          [121.00, 14.61],
          [120.97, 14.61],
          [120.97, 14.58],
        ],
      },
    ];

    const fc = annotationsToFeatureCollection(originalAnnotations);
    assert.equal(fc.type, 'FeatureCollection');
    assert.equal(fc.features.length, 2);

    const backToAnno = featureCollectionToAnnotations(fc);
    assert.equal(backToAnno.length, 2);
    assert.equal(backToAnno[0].label, 'Command Post Alpha');
    assert.equal(backToAnno[1].label, 'Sector Bravo');
  });
});

// =========================================================================
// PHASE 4: Simultaneous Parallel Multi-File Ingestion Pipeline
// =========================================================================
test('Phase 4: Simultaneous Parallel Multi-File Ingestion Pipeline', async (t) => {
  await t.test('Phase 4.1: Format detection handles varied extensions and signatures', () => {
    assert.equal(detectFileFormat('fleet.csv', 'id,lat,lon'), 'csv');
    assert.equal(detectFileFormat('track.gpx', '<gpx></gpx>'), 'gpx');
    assert.equal(detectFileFormat('gps.nmea', '$GPGGA,123'), 'nmea');
    assert.equal(detectFileFormat('layer.geojson', '{"type":"FeatureCollection"}'), 'geojson');
  });

  await t.test('Phase 4.2: Ingests multiple files simultaneously with chromatic separation', async () => {
    const csvContent = `id,name,lat,lon,timestamp\nV1,Fleet Unit 1,14.5995,120.9842,2026-09-15T08:00:00Z\nV1,Fleet Unit 1,14.6055,120.9912,2026-09-15T08:05:00Z`;
    const nmeaContent = `$GPGGA,080000.00,1435.97,N,12059.05,E,1,08,0.9,15.0,M,0.0,M,,*47\n$GPRMC,080000.00,A,1435.97,N,12059.05,E,22.5,084.2,150926,,,A*7C`;

    const result = await ingestMultipleFiles([
      { name: 'fleet_test.csv', content: csvContent },
      { name: 'marine_test.nmea', content: nmeaContent },
    ]);

    assert.ok(result.datasets, 'Result must contain datasets array');
    assert.equal(result.datasets.length, 2, 'Must have parsed exactly 2 datasets simultaneously');
    assert.notEqual(result.datasets[0].color, result.datasets[1].color, 'Chromatic separation: colors must differ');
    assert.ok(result.summary.totalFiles === 2, 'Summary must record 2 total files');
  });
});

// =========================================================================
// PHASE 5: UI Module Navigation & Direct Access Wiring Verification
// =========================================================================
test('Phase 5: UI Module Integration & Direct Access Wiring', async (t) => {
  const fs = await import('node:fs/promises');
  const uiJs = await fs.readFile('src/urlIntelligenceUi.js', 'utf8');

  await t.test('Phase 5.1: Navigation tab buttons and panes are defined in UI markup', () => {
    assert.ok(uiJs.includes('id="url-intel-tab-btn-ingest"'), 'Ingestion tab button must exist');
    assert.ok(uiJs.includes('id="url-intel-tab-btn-drive"'), 'Google Drive tab button must exist');
    assert.ok(uiJs.includes('id="url-intel-pane-drive"'), 'Google Drive tab pane must exist');
  });

  await t.test('Phase 5.2: Direct dropzone shortcut for Google Drive is wired', () => {
    assert.ok(uiJs.includes('id="url-intel-dropzone-open-drive-btn"'), 'Dropzone Google Drive button must exist');
    assert.ok(uiJs.includes("dropzoneOpenDriveBtn?.addEventListener('click'"), 'Dropzone button must have click listener');
    assert.ok(uiJs.includes("switchTab('drive')"), 'Clicking dropzone button must switch to drive tab');
  });

  await t.test('Phase 5.3: Google Drive CRED controls are wired in UI markup', () => {
    assert.ok(uiJs.includes('id="url-intel-gdrive-auth-btn"'), 'Auth button must exist');
    assert.ok(uiJs.includes('id="url-intel-gdrive-upload-btn"'), 'Upload button must exist');
    assert.ok(uiJs.includes('id="url-intel-gdrive-refresh-btn"'), 'Refresh/Sync button must exist');
    assert.ok(uiJs.includes('id="url-intel-gdrive-save-map-btn"'), 'Save Map Tools button must exist');
    assert.ok(uiJs.includes('id="url-intel-gdrive-ingest-btn"'), 'Simultaneous Ingestion button must exist');
  });
});

// =========================================================================
// PHASE 6: Synchronize Files & Docs/Sheets vs Binary Ingestion Validation
// =========================================================================
test('Phase 6: Google Drive Synchronization & Docs Editors Export Pipeline', async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    setAccessTokenForTesting(null);
  });

  await t.test('Phase 6.1: downloadDriveFile rejects folders before invalid binary transfer', async () => {
    await assert.rejects(
      async () => {
        await downloadDriveFile('folder-abc', 'application/vnd.google-apps.folder');
      },
      /Selected item is a directory\/folder/,
      'Must reject folder items with clear diagnostic error'
    );
  });

  await t.test('Phase 6.2: Google Sheets export converts native spreadsheet to CSV', async () => {
    setAccessTokenForTesting('mock-drive-test-token');

    let exportUrlCalled = '';
    let authHeader = '';

    globalThis.fetch = async (url, options = {}) => {
      exportUrlCalled = url.toString();
      authHeader = options.headers?.Authorization || '';
      return {
        ok: true,
        status: 200,
        text: async () => 'id,vehicle,lat,lon\n1,Alpha,14.5995,120.9842\n2,Alpha,14.6000,120.9850',
      };
    };

    const csvContent = await downloadDriveFile('sheet-id-123', 'application/vnd.google-apps.spreadsheet');
    assert.ok(exportUrlCalled.includes('/files/sheet-id-123/export?mimeType=text/csv'), 'Must call Drive /export endpoint with text/csv');
    assert.equal(authHeader, 'Bearer mock-drive-test-token', 'Must include OAuth token in request');
    assert.ok(csvContent.includes('Alpha,14.5995,120.9842'), 'Must return converted CSV spreadsheet text');
  });

  await t.test('Phase 6.3: Recovers from 403 "Only files with binary content can be downloaded" via metadata lookup', async () => {
    setAccessTokenForTesting('mock-drive-test-token');

    let callCount = 0;
    globalThis.fetch = async (url) => {
      const urlStr = url.toString();
      callCount++;
      // First attempt: direct media download fails with 403
      if (urlStr.includes('alt=media')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 403,
              message: 'Only files with binary content can be downloaded. Use Export with Docs Editors files.',
            },
          }),
          text: async () => '{"error":{"code":403,"message":"Only files with binary content can be downloaded. Use Export with Docs Editors files."}}',
        };
      }
      // Second attempt: get metadata
      if (urlStr.includes('fields=id,name,mimeType')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'doc-id-999',
            name: 'FlightLog.gpx',
            mimeType: 'application/vnd.google-apps.document',
          }),
        };
      }
      // Third attempt: export
      if (urlStr.includes('/export?mimeType=text/plain')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<gpx version="1.1"><trk><trkseg><trkpt lat="14.5" lon="121.0"/></trkseg></trk></gpx>',
        };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };

    const result = await downloadDriveFile('doc-id-999');
    assert.ok(result.includes('<gpx version="1.1">'), 'Must successfully recover and export Google Doc as plain text');
    assert.ok(callCount >= 3, 'Must have inspected metadata and exported after initial 403');
  });

  await t.test('Phase 6.4: listDriveFiles excludes folder directories and maps category correctly', async () => {
    setAccessTokenForTesting('mock-drive-test-token');

    globalThis.fetch = async (url) => {
      const urlStr = url.toString();
      // Ensure folder query or list files
      if (urlStr.includes('fields=files(id,name,mimeType,modifiedTime,size,webViewLink,parents)')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            files: [
              {
                id: 'file-1',
                name: 'patrol_route.gpx',
                mimeType: 'application/gpx+xml',
                modifiedTime: '2026-09-15T12:00:00Z',
                size: '1024',
              },
              {
                id: 'file-2',
                name: 'fleet_status.csv',
                mimeType: 'text/csv',
                modifiedTime: '2026-09-15T12:05:00Z',
                size: '2048',
              },
            ],
          }),
        };
      }
      // Folder structure creation/resolution mock
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            { id: 'root-id', name: 'GodsEyeView' },
            { id: 'sub-fleet', name: 'Fleet-GPS' },
            { id: 'sub-gpx', name: 'GPX-Tracks' },
            { id: 'sub-nmea', name: 'NMEA-Logs' },
            { id: 'sub-layers', name: 'Layers' },
          ],
        }),
      };
    };

    const files = await listDriveFiles();
    assert.equal(files.length, 2, 'Must list only data files and no folder items');
    assert.equal(files[0].name, 'patrol_route.gpx');
    assert.equal(files[0].folderCategory, 'GPX_TRACKS');
    assert.equal(files[1].name, 'fleet_status.csv');
    assert.equal(files[1].folderCategory, 'FLEET_GPS');
  });
});

// =========================================================================
// PHASE 7: Google Drive File Edit (Rename) & Delete CRED Operations
// =========================================================================
test('Phase 7: Google Drive File Edit (Rename) and Delete CRED Operations', async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    setAccessTokenForTesting(null);
  });

  await t.test('Phase 7.1: updateDriveFile issues PATCH request with new filename and Bearer token', async () => {
    setAccessTokenForTesting('mock-drive-test-token');

    let patchUrl = '';
    let patchMethod = '';
    let patchHeaders = {};
    let patchBody = '';

    globalThis.fetch = async (url, options = {}) => {
      patchUrl = url.toString();
      patchMethod = options.method;
      patchHeaders = options.headers;
      patchBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'file-edit-123',
          name: 'renamed_flight_log.gpx',
          mimeType: 'application/gpx+xml',
        }),
      };
    };

    const updated = await updateDriveFile({
      fileId: 'file-edit-123',
      name: 'renamed_flight_log.gpx',
    });

    assert.ok(patchUrl.includes('/files/file-edit-123'), 'PATCH URL must target fileId');
    assert.equal(patchMethod, 'PATCH', 'HTTP method must be PATCH');
    assert.equal(patchHeaders.Authorization, 'Bearer mock-drive-test-token');
    assert.equal(JSON.parse(patchBody).name, 'renamed_flight_log.gpx', 'PATCH payload must include new filename');
    assert.equal(updated.name, 'renamed_flight_log.gpx', 'Return value must match response');
  });

  await t.test('Phase 7.2: deleteDriveFile issues DELETE request with Bearer token', async () => {
    setAccessTokenForTesting('mock-drive-test-token');

    let deleteUrl = '';
    let deleteMethod = '';
    let deleteHeaders = {};

    globalThis.fetch = async (url, options = {}) => {
      deleteUrl = url.toString();
      deleteMethod = options.method;
      deleteHeaders = options.headers;
      return {
        ok: true,
        status: 204,
      };
    };

    const success = await deleteDriveFile('file-delete-456');

    assert.ok(deleteUrl.includes('/files/file-delete-456'), 'DELETE URL must target fileId');
    assert.equal(deleteMethod, 'DELETE', 'HTTP method must be DELETE');
    assert.equal(deleteHeaders.Authorization, 'Bearer mock-drive-test-token');
    assert.equal(success.success, true, 'deleteDriveFile must return success: true');
    assert.equal(success.fileId, 'file-delete-456', 'deleteDriveFile must return deleted fileId');
  });

  await t.test('Phase 7.3: UI contains inline edit (rename) and delete confirmation elements without popup blocking', async () => {
    const fs = await import('node:fs/promises');
    const uiJs = await fs.readFile('src/urlIntelligenceUi.js', 'utf8');

    // Inline edit elements
    assert.ok(uiJs.includes('url-intel-inline-rename-form'), 'Must render inline rename form');
    assert.ok(uiJs.includes('url-intel-inline-rename-input'), 'Must render inline rename text input');
    assert.ok(uiJs.includes('url-intel-inline-btn-save'), 'Must render inline save button');
    assert.ok(uiJs.includes('url-intel-inline-btn-cancel'), 'Must render inline cancel button');

    // Inline delete elements
    assert.ok(uiJs.includes('url-intel-inline-delete-box'), 'Must render inline delete confirmation box');
    assert.ok(uiJs.includes('url-intel-btn-delete-confirm'), 'Must render inline confirm delete button');
    assert.ok(uiJs.includes('url-intel-btn-delete-cancel'), 'Must render inline cancel delete button');

    // Verify neither window.prompt nor window.confirm is used for drive file management
    assert.ok(!uiJs.includes('window.prompt('), 'Must NOT use window.prompt (prohibited by iframe sandbox)');
    assert.ok(!uiJs.includes('window.confirm('), 'Must NOT use window.confirm (prohibited by iframe sandbox)');
  });
});
