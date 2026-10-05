import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MapToolsEngine,
  FEATURE_TYPES,
  MAP_TOOLS_EVENTS,
} from './mapToolsEngine.js';

import {
  TACTICAL_ACTIONS,
  CONTROL_TACTICAL_MAP_TOOLS_SCHEMA,
  CONTROL_TACTICAL_MAP_TOOLS_GEMINI_DECLARATION,
  resolveCameraCenter,
  resolveSinglePointCoordinates,
  parseRadiiInMeters,
  formatCoordinatesForSpeech,
  formatRadiiForSpeech,
  dispatchTacticalAiCommand,
  pushDetectedPoi,
  pushOperationalZone,
  ingestMultimodalSchemaData,
} from './tacticalAiDispatcher.js';

import { createGevActionRunner } from '../voice/gevActions.js';

test('CONTROL_TACTICAL_MAP_TOOLS_SCHEMA conforms to OpenAI tool standard', () => {
  assert.equal(CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.type, 'function');
  assert.equal(CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.name, 'control_tactical_map_tools');
  assert.ok(CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.description.length > 20);
  assert.ok(CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.parameters.properties.action);
  assert.deepEqual(
    CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.parameters.properties.action.enum,
    [
      'create_waypoint',
      'create_range_ring',
      'create_geofence',
      'measure_distance',
      'fly_extent',
      'clear_all',
      'query_breaches',
    ]
  );
  assert.deepEqual(CONTROL_TACTICAL_MAP_TOOLS_SCHEMA.parameters.required, ['action']);

  // Gemini declaration conformity
  assert.equal(CONTROL_TACTICAL_MAP_TOOLS_GEMINI_DECLARATION.name, 'control_tactical_map_tools');
  assert.ok(CONTROL_TACTICAL_MAP_TOOLS_GEMINI_DECLARATION.parameters);
});

test('resolveSinglePointCoordinates extracts coordinates or falls back to camera center', () => {
  // Explicit lon / lat
  const r1 = resolveSinglePointCoordinates({ longitude: 121.0, latitude: 14.5 });
  assert.equal(r1.usedFallback, false);
  assert.deepEqual(r1.coordinates, [121.0, 14.5]);

  // Array coordinates [lon, lat]
  const r2 = resolveSinglePointCoordinates({ coordinates: [120.98, 14.59] });
  assert.equal(r2.usedFallback, false);
  assert.deepEqual(r2.coordinates, [120.98, 14.59]);

  // Object coordinates
  const r3 = resolveSinglePointCoordinates({ coordinates: { lon: -122.4, lat: 37.7 } });
  assert.equal(r3.usedFallback, false);
  assert.deepEqual(r3.coordinates, [-122.4, 37.7]);

  // Missing coordinates with custom resolver fallback
  const r4 = resolveSinglePointCoordinates({}, { getViewCenter: () => [115.5, -32.0] });
  assert.equal(r4.usedFallback, true);
  assert.deepEqual(r4.coordinates, [115.5, -32.0]);
});

test('parseRadiiInMeters parses numbers, strings, units, and lists', () => {
  // Direct km number (< 500 defaults to km)
  assert.deepEqual(parseRadiiInMeters({ radius: 25 }), [25000]);

  // Explicit meter number (> 1000 defaults to meters)
  assert.deepEqual(parseRadiiInMeters({ radius: 15000 }), [15000]);

  // Explicit radiusMeters
  assert.deepEqual(parseRadiiInMeters({ radiusMeters: 5000 }), [5000]);

  // Unit nm
  assert.deepEqual(parseRadiiInMeters({ radius: 10, unit: 'nm' }), [18520]);

  // Comma-separated string with mixed units
  const parsed = parseRadiiInMeters({ radii: '10km, 25km, 50nm' });
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0], 10000);
  assert.equal(parsed[1], 25000);
  assert.equal(parsed[2], 92600); // 50 * 1852

  // Default tactical standard
  assert.deepEqual(parseRadiiInMeters({}), [25000]);
});

test('dispatchTacticalAiCommand: create_waypoint with explicit coordinates and locked state', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const result = await dispatchTacticalAiCommand(
    {
      action: 'create_waypoint',
      name: 'Alpha Observation Post',
      coordinates: [120.98, 14.59],
      classification: 'friendly',
      lock: true,
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, 'create_waypoint');
  assert.equal(result.usedCameraFallback, false);
  assert.ok(result.speech.includes('Alpha Observation Post'));
  assert.ok(result.feature.id);
  assert.equal(result.feature.type, FEATURE_TYPES.POINT);
  assert.equal(result.feature.locked, true);
  assert.deepEqual(result.feature.coordinates, [120.98, 14.59]);
});

test('dispatchTacticalAiCommand: create_waypoint falls back to camera view center when omitted', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const result = await dispatchTacticalAiCommand(
    {
      action: 'create_waypoint',
      name: 'Delta Checkpoint',
    },
    {
      engine,
      getViewCenter: () => [100.5, 13.75], // Bangkok coordinates
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.usedCameraFallback, true);
  assert.ok(result.speech.includes('Delta Checkpoint'));
  assert.ok(result.speech.includes('camera center'));
  assert.deepEqual(result.feature.coordinates, [100.5, 13.75]);
});

test('dispatchTacticalAiCommand: create_range_ring generates concentric rings with geodesic metrics', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const result = await dispatchTacticalAiCommand(
    {
      action: 'create_range_ring',
      name: 'Subic Radar Ring',
      coordinates: [120.28, 14.82],
      radii: [10, 25, 50],
      unit: 'km',
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, 'create_range_ring');
  assert.equal(result.feature.type, FEATURE_TYPES.RANGE_RING);
  assert.ok(result.speech.includes('Subic Radar Ring'));
  assert.deepEqual(result.radiiMeters, [10000, 25000, 50000]);
  assert.equal(result.feature.computed.rings.length, 3);
  assert.equal(result.feature.computed.maxRadiusMeters, 50000);
});

test('dispatchTacticalAiCommand: create_geofence calculates area and perimeter correctly', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  // Geofence polygon vertices around Manila Bay
  const coords = [
    [120.7, 14.4],
    [121.0, 14.4],
    [121.0, 14.8],
    [120.7, 14.8],
    [120.7, 14.4],
  ];

  const result = await dispatchTacticalAiCommand(
    {
      action: 'create_geofence',
      name: 'Sector 4 Air Exclusion Zone',
      coordinates: coords,
      classification: 'restricted',
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, 'create_geofence');
  assert.equal(result.feature.type, FEATURE_TYPES.POLYGON);
  assert.ok(result.speech.includes('Sector 4 Air Exclusion Zone'));
  assert.ok(result.metrics.areaSquareMeters > 0);
  assert.ok(result.metrics.areaSquareKm > 1000);
  assert.ok(result.metrics.perimeterKm > 100);
});

test('dispatchTacticalAiCommand: create_geofence auto-generates polygon from center and radius when coordinates omitted', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const result = await dispatchTacticalAiCommand(
    {
      action: 'create_geofence',
      name: 'Tactical Perimeter Bravo',
      coordinates: [120.98, 14.59],
      radius: 12, // 12 km
      unit: 'km',
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.feature.type, FEATURE_TYPES.POLYGON);
  assert.ok(result.feature.coordinates.length >= 8);
  assert.ok(result.speech.includes('Tactical Perimeter Bravo'));
});

test('dispatchTacticalAiCommand: measure_distance calculates multi-segment distance', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  // Manila to Clark to Subic (~150km total)
  const waypoints = [
    [120.9842, 14.5995], // Manila
    [120.5594, 15.1859], // Clark
    [120.2819, 14.8219], // Subic
  ];

  const result = await dispatchTacticalAiCommand(
    {
      action: 'measure_distance',
      waypoints,
      name: 'Transit Route 1',
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, 'measure_distance');
  assert.ok(result.metrics.totalKm > 100);
  assert.ok(result.metrics.totalNm > 50);
  assert.ok(result.speech.includes('Measured distance:'));
  assert.equal(result.metrics.nodeCount, 3);
  assert.ok(result.feature); // saved as line feature
});

test('dispatchTacticalAiCommand: fly_extent directs camera to target feature', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const point = engine.createFeature({
    name: 'Target Echo',
    type: FEATURE_TYPES.POINT,
    coordinates: [121.5, 15.0],
  });

  let flyEventDispatched = null;
  engine.addEventListener(MAP_TOOLS_EVENTS.FLY_EXTENT, (e) => {
    flyEventDispatched = e.detail;
  });

  const result = await dispatchTacticalAiCommand(
    {
      action: 'fly_extent',
      featureId: point.id,
    },
    { engine }
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, 'fly_extent');
  assert.ok(result.speech.includes('Target Echo'));
  assert.ok(flyEventDispatched);
  assert.equal(flyEventDispatched.featureId, point.id);
});

test('dispatchTacticalAiCommand: clear_all preserves locked features unless force is true', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  // Create 1 regular and 1 locked feature
  engine.createFeature({ name: 'F1', type: FEATURE_TYPES.POINT, coordinates: [120, 14] });
  const f2 = engine.createFeature({ name: 'F2', type: FEATURE_TYPES.POINT, coordinates: [121, 15] });
  engine.lockFeature(f2.id, true);

  // Normal clear_all
  const res1 = await dispatchTacticalAiCommand({ action: 'clear_all' }, { engine });
  assert.equal(res1.deletedCount, 1);
  assert.equal(res1.remainingCount, 1);
  assert.ok(res1.speech.includes('1 locked feature was preserved'));

  // Force clear_all
  const res2 = await dispatchTacticalAiCommand({ action: 'clear_all', force: true }, { engine });
  assert.equal(res2.deletedCount, 1);
  assert.equal(res2.remainingCount, 0);
  assert.equal(engine.getAllFeatures().length, 0);
});

test('dispatchTacticalAiCommand: query_breaches detects contacts inside geofences', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  // Geofence around Manila
  const fence = engine.createFeature({
    name: 'NCR Geofence',
    type: FEATURE_TYPES.POLYGON,
    coordinates: [
      [120.9, 14.5],
      [121.1, 14.5],
      [121.1, 14.7],
      [120.9, 14.7],
      [120.9, 14.5],
    ],
  });

  // Contact inside: [121.0, 14.6]
  const resInside = await dispatchTacticalAiCommand(
    {
      action: 'query_breaches',
      targetCoordinate: [121.0, 14.6],
      targetId: 'BOGEY-01',
    },
    { engine }
  );

  assert.equal(resInside.ok, true);
  assert.equal(resInside.breaches.length, 1);
  assert.equal(resInside.breaches[0].targetId, 'BOGEY-01');
  assert.ok(resInside.speech.includes('Warning: 1 contact breach detected in NCR Geofence'));

  // Contact outside: [125.0, 10.0]
  const resOutside = await dispatchTacticalAiCommand(
    {
      action: 'query_breaches',
      targetCoordinate: [125.0, 10.0],
      targetId: 'FRIENDLY-01',
    },
    { engine }
  );

  assert.equal(resOutside.ok, true);
  assert.equal(resOutside.breaches.length, 0);
  assert.ok(resOutside.speech.includes('All clear: zero breaches detected'));
});

test('Multimodal AI Bridge: pushDetectedPoi instantiates tactical pins with proper styling and metadata', () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const poi = {
    name: 'Manila Port Radar',
    latitude: 14.585,
    longitude: 120.965,
    category: 'Radar Facility',
    confidence: 0.98,
    source: 'ai_schema_inspector',
    notes: 'Detected high-frequency coastal surveillance radar',
  };

  const feature = pushDetectedPoi(poi, { engine });
  assert.ok(feature.id);
  assert.equal(feature.name, 'Manila Port Radar');
  assert.equal(feature.type, FEATURE_TYPES.POINT);
  assert.deepEqual(feature.coordinates, [120.965, 14.585]);
  assert.equal(feature.properties.source, 'ai_schema_inspector');
  assert.equal(feature.properties.confidence, 0.98);
  assert.equal(feature.style.color, '#00f0ff'); // radar category color
});

test('Multimodal AI Bridge: pushOperationalZone creates tactical polygon with threat styling', () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const zone = {
    name: 'High Threat Corridor',
    center: [120.5, 15.0],
    radiusKm: 20,
    threatLevel: 'high',
    zoneType: 'restricted',
    assessment: 'Active aerial intercept operations reported',
  };

  const feature = pushOperationalZone(zone, { engine });
  assert.ok(feature.id);
  assert.equal(feature.name, 'High Threat Corridor');
  assert.equal(feature.type, FEATURE_TYPES.POLYGON);
  assert.ok(feature.coordinates.length >= 16);
  assert.equal(feature.style.strokeColor, '#ff3b30'); // high threat red
  assert.equal(feature.properties.threatLevel, 'high');
});

test('Multimodal AI Bridge: ingestMultimodalSchemaData batches tabular records into tactical waypoints', () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const sampleRows = [
    { name: 'Station Alpha', lat: 14.5, lon: 121.0, category: 'Base' },
    { name: 'Station Bravo', lat: 14.6, lon: 121.1, category: 'Command Post' },
    { name: 'Invalid Row', lat: null, lon: null },
    { name: 'Station Charlie', lat: 14.7, lon: 121.2, category: 'Recon' },
  ];

  const result = ingestMultimodalSchemaData(sampleRows, { engine });
  assert.equal(result.count, 3);
  assert.equal(engine.getAllFeatures().length, 3);
});

test('Integration with createGevActionRunner dispatches control_tactical_map_tools seamlessly', async () => {
  const mockViewer = {
    clock: {
      onTick: { addEventListener: () => {}, removeEventListener: () => {} },
    },
    camera: {
      moveEnd: { addEventListener: () => {}, removeEventListener: () => {} },
      positionCartographic: {
        longitude: (121.0 * Math.PI) / 180,
        latitude: (14.5 * Math.PI) / 180,
      },
    },
    scene: {
      globe: {},
      canvas: {
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    },
  };

  const runner = createGevActionRunner({
    viewer: mockViewer,
    styleManager: null,
    dataManager: null,
  });

  const response = await runner('control_tactical_map_tools', {
    action: 'create_waypoint',
    name: 'Voice Waypoint Victor',
    coordinates: [120.95, 14.62],
  });

  assert.equal(response.ok, true);
  assert.equal(response.action, 'create_waypoint');
  assert.ok(response.speech.includes('Voice Waypoint Victor'));
  assert.ok(response.feature);
});
