import test from 'node:test';
import assert from 'node:assert/strict';

import { MapToolsEngine, FEATURE_TYPES } from '../tools/mapToolsEngine.js';
import {
  featuresToGeoJsonCollection,
  featuresToKmlDocument,
  parseImportedGeoJson,
  parseImportedKml,
  importTacticalLayerContent,
  verifyGeoJsonRoundTrip,
  toKmlColor,
  kmlColorToHex,
} from '../tools/tacticalGeoExport.js';
import {
  saveTacticalLayerToDrive,
  listTacticalLayersFromDrive,
  loadTacticalLayerFromDrive,
  syncTacticalFeaturesWithDrive,
  ROOT_FOLDER_NAME,
  SUBFOLDERS,
  clearFolderCache,
} from './googleDriveClient.js';
import {
  GeofenceBreachEngine,
  GEOFENCE_RULES,
  VIOLATION_TYPES,
} from '../tools/geofenceEngine.js';
import { setAccessTokenForTesting } from '../auth/googleDriveAuth.js';

test('BACKEND SIMULATION: Google Drive Tactical Cloud Pipeline & Full Interoperability', async (t) => {
  // Setup Virtual In-Memory Google Drive Server for HTTP Simulation
  const virtualDrive = new Map();
  let fileIdCounter = 1000;

  // Mock global fetch to simulate Google Drive v3 REST endpoints
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = (options.method || 'GET').toUpperCase();

    // 1. Folder search: /files?q=...
    if (urlStr.includes('/files?') && method === 'GET') {
      const q = new URL(urlStr).searchParams.get('q') || '';
      const matching = [];

      for (const [id, f] of virtualDrive.entries()) {
        if (f.trashed) continue;
        if (q.includes(`name = '${f.name}'`) && f.mimeType === 'application/vnd.google-apps.folder') {
          matching.push({ id, name: f.name });
        } else if (q.includes(`'${f.parent}' in parents`) || q.includes('trashed = false')) {
          if (q.includes(`name = '${f.name}'`)) {
            matching.push({ id, name: f.name });
          } else if (!q.includes('name =')) {
            matching.push({
              id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size || f.content?.length || 1024,
              modifiedTime: f.modifiedTime,
              webViewLink: `https://drive.google.com/file/d/${id}/view`,
            });
          }
        }
      }

      return new Response(JSON.stringify({ files: matching }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Folder creation: POST /files
    if (urlStr.endsWith('/files') && method === 'POST') {
      const body = JSON.parse(options.body);
      const id = `folder-${++fileIdCounter}`;
      virtualDrive.set(id, {
        id,
        name: body.name,
        mimeType: body.mimeType,
        parent: body.parents?.[0] || 'root',
        trashed: false,
      });
      return new Response(JSON.stringify({ id, name: body.name }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Multipart Upload: /upload/drive/v3/files?uploadType=multipart
    if (urlStr.includes('/upload/drive/v3/files') && method === 'POST') {
      const bodyStr = String(options.body);
      const id = `file-${++fileIdCounter}`;

      // Extract metadata part
      const metaMatch = bodyStr.match(/\{[\s\S]*?\}/);
      const meta = metaMatch ? JSON.parse(metaMatch[0]) : { name: 'unnamed' };

      // Extract raw body payload
      const parts = bodyStr.split(/--[a-zA-Z0-9_-]+/);
      const contentPart = parts[2] || '';
      const payload = contentPart.split('\r\n\r\n')[1] || contentPart.trim();

      virtualDrive.set(id, {
        id,
        name: meta.name,
        mimeType: meta.mimeType || 'application/octet-stream',
        content: payload,
        size: payload.length,
        parent: meta.parents?.[0] || 'root',
        modifiedTime: new Date().toISOString(),
        trashed: false,
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
      });

      return new Response(
        JSON.stringify({
          id,
          name: meta.name,
          mimeType: meta.mimeType,
          size: payload.length,
          modifiedTime: new Date().toISOString(),
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 4. Download file: /files/{fileId}?alt=media
    if (urlStr.includes('/files/') && urlStr.includes('alt=media') && method === 'GET') {
      const match = urlStr.match(/\/files\/([^?]+)/);
      const fileId = match ? decodeURIComponent(match[1]) : '';
      const file = virtualDrive.get(fileId);
      if (!file || file.trashed) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(file.content, {
        status: 200,
        headers: { 'Content-Type': file.mimeType },
      });
    }

    // 5. Delete file: DELETE /files/{fileId}
    if (urlStr.includes('/files/') && method === 'DELETE') {
      const match = urlStr.match(/\/files\/([^?]+)/);
      const fileId = match ? decodeURIComponent(match[1]) : '';
      if (virtualDrive.has(fileId)) {
        virtualDrive.delete(fileId);
      }
      return new Response('', { status: 204 });
    }

    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  // Set drive auth access token
  setAccessTokenForTesting('mock-simulated-token-xyz789');

  t.after(() => {
    globalThis.fetch = originalFetch;
    setAccessTokenForTesting(null);
    clearFolderCache();
  });

  clearFolderCache();

  // -------------------------------------------------------------
  // TEST SUITE 1: Tactical Engine Sector Assembly
  // -------------------------------------------------------------
  let engineA = null;
  let sampleFeatures = [];

  await t.test('SIM-01: Assembles multi-type tactical operational sector in MapToolsEngine', () => {
    engineA = new MapToolsEngine();

    // 1. POI / Recon Point
    const p1 = engineA.createFeature({
      name: 'Recon Outpost Alpha',
      type: FEATURE_TYPES.POINT,
      coordinates: [120.9842, 14.5995],
      properties: {
        category: 'SURVEILLANCE',
        callsign: 'VIPER-1',
        threatLevel: 'MODERATE',
      },
      style: { color: '#00e5ff', pointSize: 8 },
    });

    // 2. Tactical Patrol Corridor (Line)
    const l1 = engineA.createFeature({
      name: 'Maritime Patrol Route Zulu',
      type: FEATURE_TYPES.LINE,
      coordinates: [
        [120.90, 14.45],
        [121.02, 14.55],
        [121.15, 14.70],
      ],
      properties: {
        corridorWidthNm: 4.5,
        speedLimitKts: 28,
      },
      style: { color: '#38bdf8', lineWidth: 3 },
    });

    // 3. Restricted Exclusion Zone (Polygon)
    const poly1 = engineA.createFeature({
      name: 'South Anchorage No-Entry Zone',
      type: FEATURE_TYPES.POLYGON,
      coordinates: [
        [120.92, 14.50],
        [120.97, 14.50],
        [120.97, 14.56],
        [120.92, 14.56],
        [120.92, 14.50],
      ],
      properties: {
        rule: 'KEEP_OUT',
        classification: 'RESTRICTED',
        authorizedUnits: ['COAST_GUARD_01', 'NAVY_PATROL_4'],
      },
      style: { color: '#ef4444', fillOpacity: 0.3 },
    });

    // 4. SAM Radar Dome (Circle)
    const circ1 = engineA.createFeature({
      name: 'Air Defense Radar Umbrella',
      type: FEATURE_TYPES.CIRCLE,
      coordinates: {
        center: [121.05, 14.62],
        radiusMeters: 15000,
      },
      properties: {
        maxCeilingFt: 45000,
        radarFrequencyGhz: 9.4,
      },
      style: { color: '#f59e0b', fillOpacity: 0.2 },
    });

    // 5. Tactical Range Rings (concentric)
    const ring1 = engineA.createFeature({
      name: 'HQ Stand-Off Rings',
      type: FEATURE_TYPES.RANGE_RING,
      coordinates: {
        center: [120.98, 14.60],
        radiiMeters: [5000, 10000, 20000],
      },
      style: { color: '#10b981' },
    });

    sampleFeatures = [p1, l1, poly1, circ1, ring1];
    assert.equal(engineA.getAllFeatures().length, 5);
    assert.equal(sampleFeatures[0].name, 'Recon Outpost Alpha');
    assert.ok(sampleFeatures[2].computed.areaSquareMeters > 0);
    assert.equal(sampleFeatures[3].computed.radiusMeters, 15000);
  });

  // -------------------------------------------------------------
  // TEST SUITE 2: RFC 7946 GeoJSON Lossless Round-Trip
  // -------------------------------------------------------------
  await t.test('SIM-02: Validates zero-loss RFC 7946 GeoJSON export and round-trip verification', () => {
    const geoJsonDoc = featuresToGeoJsonCollection(sampleFeatures);
    assert.equal(geoJsonDoc.type, 'FeatureCollection');
    assert.equal(geoJsonDoc.features.length, 5);

    // Verify properties contain custom gev namespace and computed attributes
    const polyGeo = geoJsonDoc.features.find((f) => f.properties['gev:type'] === 'polygon');
    assert.ok(polyGeo, 'GeoJSON should include polygon');
    assert.equal(polyGeo.properties.rule, 'KEEP_OUT');
    assert.equal(polyGeo.properties['gev:color'], '#ef4444');

    // Test automated round trip validator
    const rtResult = verifyGeoJsonRoundTrip(sampleFeatures);
    assert.equal(rtResult.passed, true);
    assert.equal(rtResult.lossCount, 0);
    assert.equal(rtResult.count, 5);
  });

  // -------------------------------------------------------------
  // TEST SUITE 3: OGC KML 2.2 Serialization & Deserialization
  // -------------------------------------------------------------
  await t.test('SIM-03: Validates OGC KML 2.2 Placemark & ExtendedData structure and parsing', () => {
    const kmlXml = featuresToKmlDocument(sampleFeatures, {
      title: 'Sector North Surveillance Grid',
    });

    assert.ok(kmlXml.includes('<kml xmlns="http://www.opengis.net/kml/2.2">'));
    assert.ok(kmlXml.includes('<name>Sector North Surveillance Grid</name>'));
    assert.ok(kmlXml.includes('<name>Recon Outpost Alpha</name>'));
    assert.ok(kmlXml.includes('<name>South Anchorage No-Entry Zone</name>'));
    assert.ok(kmlXml.includes('<Polygon>'));
    assert.ok(kmlXml.includes('<LinearRing>'));
    assert.ok(kmlXml.includes('ExtendedData'));

    // Parse KML back using parseImportedKml
    const importedFromKml = parseImportedKml(kmlXml);
    assert.equal(importedFromKml.length, 5);

    const importedPoly = importedFromKml.find((f) => f.name === 'South Anchorage No-Entry Zone');
    assert.ok(importedPoly);
    assert.equal(importedPoly.type, 'polygon');
    assert.equal(importedPoly.coordinates.length, 5);
    assert.equal(importedPoly.style.color, '#ef4444');
    assert.equal(importedPoly.properties.rule, 'KEEP_OUT');
  });

  // -------------------------------------------------------------
  // TEST SUITE 4: Google Drive Cloud GIS Pipeline Simulation
  // -------------------------------------------------------------
  let uploadedGeoJsonId = null;
  let uploadedKmlId = null;

  await t.test('SIM-04: Uploads tactical layers (GeoJSON & KML) to Google Drive GodsEyeView/Layers', async () => {
    // 1. Upload GeoJSON layer
    const geoUpload = await saveTacticalLayerToDrive({
      name: 'task_force_sector_77.geojson',
      features: sampleFeatures,
      format: 'geojson',
      category: 'LAYERS',
    });

    assert.ok(geoUpload.id);
    assert.equal(geoUpload.name, 'task_force_sector_77.geojson');
    assert.equal(geoUpload.format, 'geojson');
    assert.equal(geoUpload.category, 'LAYERS');
    uploadedGeoJsonId = geoUpload.id;

    // 2. Upload KML layer
    const kmlUpload = await saveTacticalLayerToDrive({
      name: 'earth_recon_alpha.kml',
      features: sampleFeatures,
      format: 'kml',
      category: 'LAYERS',
      options: { title: 'Earth Recon Grid' },
    });

    assert.ok(kmlUpload.id);
    assert.equal(kmlUpload.name, 'earth_recon_alpha.kml');
    assert.equal(kmlUpload.format, 'kml');
    uploadedKmlId = kmlUpload.id;

    // Verify files in simulated cloud drive
    assert.equal(virtualDrive.has(uploadedGeoJsonId), true);
    assert.equal(virtualDrive.has(uploadedKmlId), true);
  });

  await t.test('SIM-05: Lists tactical layers from Google Drive with format classification', async () => {
    const list = await listTacticalLayersFromDrive();
    assert.ok(Array.isArray(list));
    assert.equal(list.length >= 2, true);

    const geoFile = list.find((f) => f.id === uploadedGeoJsonId);
    assert.ok(geoFile);
    assert.equal(geoFile.format, 'geojson');
    assert.equal(geoFile.isTacticalGis, true);

    const kmlFile = list.find((f) => f.id === uploadedKmlId);
    assert.ok(kmlFile);
    assert.equal(kmlFile.format, 'kml');
    assert.equal(kmlFile.isTacticalGis, true);
  });

  await t.test('SIM-06: Downloads and ingests tactical layer from Drive into a fresh MapToolsEngine', async () => {
    const freshEngine = new MapToolsEngine();
    assert.equal(freshEngine.getAllFeatures().length, 0);

    const syncResult = await syncTacticalFeaturesWithDrive({
      engine: freshEngine,
      mode: 'import',
      fileId: uploadedGeoJsonId,
      name: 'task_force_sector_77.geojson',
    });

    assert.equal(syncResult.success, true);
    assert.equal(syncResult.importedCount, 5);
    assert.equal(syncResult.errors.length, 0);

    // Verify reconstructed features in the fresh engine
    const all = freshEngine.getAllFeatures();
    assert.equal(all.length, 5);

    const reconPt = all.find((f) => f.name === 'Recon Outpost Alpha');
    assert.ok(reconPt);
    assert.equal(reconPt.properties.callsign, 'VIPER-1');

    const restrictedPoly = all.find((f) => f.name === 'South Anchorage No-Entry Zone');
    assert.ok(restrictedPoly);
    assert.equal(restrictedPoly.properties.rule, 'KEEP_OUT');
    assert.ok(restrictedPoly.computed.areaSquareMeters > 0);
  });

  // -------------------------------------------------------------
  // TEST SUITE 5: Cross-Subsystem Real-Time Geofence Breach Validation
  // -------------------------------------------------------------
  await t.test('SIM-07: Validates that cloud-imported features bind seamlessly with GeofenceBreachEngine', async () => {
    // Ingest the KML layer into a 3rd engine
    const engineC = new MapToolsEngine();
    await syncTacticalFeaturesWithDrive({
      engine: engineC,
      mode: 'import',
      fileId: uploadedKmlId,
      name: 'earth_recon_alpha.kml',
    });

    // Create GeofenceBreachEngine
    const breachEngine = new GeofenceBreachEngine({ syncWindowEvents: false });

    // Register the imported polygon as an active KEEP_OUT geofence
    const importedPolygon = engineC.getAllFeatures().find((f) => f.type === FEATURE_TYPES.POLYGON);
    assert.ok(importedPolygon);

    breachEngine.registerGeofence({
      id: importedPolygon.id,
      name: importedPolygon.name,
      type: 'polygon',
      rule: GEOFENCE_RULES.KEEP_OUT,
      coordinates: importedPolygon.coordinates,
      properties: importedPolygon.properties,
    });

    // 1. Ingress Violation Test: Target enters restricted zone [120.94, 14.53]
    const breachInside = breachEngine.evaluateTelemetryPacket({
      unitId: 'BOGEY-99',
      name: 'Unidentified Speedboat',
      coordinates: [120.94, 14.53],
      speedKnots: 32,
    });

    assert.equal(breachInside.length, 1);
    assert.equal(breachInside[0].violationType, VIOLATION_TYPES.INGRESS);
    assert.equal(breachInside[0].rule, GEOFENCE_RULES.KEEP_OUT);
    assert.equal(breachInside[0].geofenceName, 'South Anchorage No-Entry Zone');
    assert.equal(breachEngine.getActiveBreachCount(), 1);

    // 2. Safe Outside Test: Target departs outside [121.20, 14.80]
    const safeOutside = breachEngine.evaluateTelemetryPacket({
      unitId: 'BOGEY-99',
      name: 'Unidentified Speedboat',
      coordinates: [121.20, 14.80],
      speedKnots: 20,
    });

    assert.equal(safeOutside.length, 0);
    assert.equal(breachEngine.getActiveBreachCount(), 0);
  });

  // -------------------------------------------------------------
  // TEST SUITE 6: High-Scale Stress & Latency Simulation
  // -------------------------------------------------------------
  await t.test('SIM-08: High-density sector export/import benchmarking (50 tactical features)', async () => {
    const stressEngine = new MapToolsEngine();
    const startTime = performance.now();

    for (let i = 0; i < 50; i++) {
      stressEngine.createFeature({
        name: `Tactical Node ${i}`,
        type: i % 2 === 0 ? FEATURE_TYPES.POINT : FEATURE_TYPES.POLYGON,
        coordinates: i % 2 === 0
          ? [120.0 + i * 0.01, 14.0 + i * 0.01]
          : [
              [120.0 + i * 0.01, 14.0 + i * 0.01],
              [120.0 + (i + 1) * 0.01, 14.0 + i * 0.01],
              [120.0 + (i + 1) * 0.01, 14.0 + (i + 1) * 0.01],
              [120.0 + i * 0.01, 14.0 + (i + 1) * 0.01],
              [120.0 + i * 0.01, 14.0 + i * 0.01],
            ],
        properties: { index: i, grid: 'SECTOR-STRESS' },
      });
    }

    const allFeatures = stressEngine.getAllFeatures();
    assert.equal(allFeatures.length, 50);

    // Save to simulated drive
    const uploadRes = await saveTacticalLayerToDrive({
      name: 'dense_sector_stress.geojson',
      features: allFeatures,
      format: 'geojson',
    });
    assert.ok(uploadRes.id);

    // Ingest into a brand new engine
    const receiverEngine = new MapToolsEngine();
    const importRes = await syncTacticalFeaturesWithDrive({
      engine: receiverEngine,
      mode: 'import',
      fileId: uploadRes.id,
      name: 'dense_sector_stress.geojson',
    });

    const elapsed = performance.now() - startTime;
    assert.equal(importRes.importedCount, 50);
    assert.equal(receiverEngine.getAllFeatures().length, 50);
    assert.ok(elapsed < 200, `Expected elapsed < 200ms, took ${elapsed.toFixed(1)}ms`);
  });
});
