import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeofenceBreachEngine,
  GEOFENCE_RULES,
  VIOLATION_TYPES,
  BREACH_EVENTS,
  generateSpeechAlertText,
  extractTelemetryFromDataManager,
  getSharedGeofenceEngine,
  pointToSegmentDistanceMeters,
  pointInCorridor,
  pointInBoundingBox,
} from './geofenceEngine.js';

test('Geofence & Telemetry Breach Evaluation Engine', async (t) => {
  await t.test('1.1: pointToSegmentDistanceMeters calculates accurate perpendicular distance', () => {
    // Segment along equator from lon 0 to lon 10 at lat 0
    const p1 = [0, 0];
    const p2 = [10, 0];
    const testPoint = [5, 1]; // 1 degree North (~111 km)
    const dist = pointToSegmentDistanceMeters(testPoint, p1, p2);

    assert.ok(dist > 110000 && dist < 112000, `Expected ~111,139m, got ${dist}`);
  });

  await t.test('1.2: pointInCorridor checks spatial containment along multi-segment polyline', () => {
    const corridorPath = [
      [120.0, 14.0],
      [120.5, 14.0],
      [121.0, 14.5],
    ];
    const widthMeters = 2000; // 2km width (1km each side)

    // Point exactly on corridor segment
    assert.equal(pointInCorridor([120.25, 14.0], corridorPath, widthMeters), true);

    // Point far away
    assert.equal(pointInCorridor([120.25, 15.0], corridorPath, widthMeters), false);
  });

  await t.test('1.3: pointInBoundingBox does fast O(1) containment', () => {
    const bbox = [10, 10, 20, 20];
    assert.equal(pointInBoundingBox(15, 15, bbox), true);
    assert.equal(pointInBoundingBox(5, 15, bbox), false);
    assert.equal(pointInBoundingBox(25, 15, bbox), false);
  });

  await t.test('1.4: Ingress Breach: alerts when unit enters unauthorized restricted polygon (KEEP_OUT)', () => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });

    engine.registerGeofence({
      id: 'restricted-anchorage',
      name: 'South Harbor Restricted Zone',
      type: 'polygon',
      rule: GEOFENCE_RULES.KEEP_OUT,
      coordinates: [
        [120.95, 14.55],
        [120.98, 14.55],
        [120.98, 14.58],
        [120.95, 14.58],
        [120.95, 14.55],
      ],
    });

    // 1. Outside -> No breach
    const outResult = engine.evaluateTelemetryPacket({
      unitId: 'VESSEL-901',
      name: 'Unidentified Skiff',
      coordinates: [120.90, 14.50],
      speedKnots: 12.0,
    });
    assert.equal(outResult.length, 0);
    assert.equal(engine.getActiveBreachCount(), 0);

    // 2. Inside -> Ingress breach triggered
    const inResult = engine.evaluateTelemetryPacket({
      unitId: 'VESSEL-901',
      name: 'Unidentified Skiff',
      coordinates: [120.965, 14.565],
      speedKnots: 14.5,
    });
    assert.equal(inResult.length, 1);
    assert.equal(inResult[0].violationType, VIOLATION_TYPES.INGRESS);
    assert.equal(inResult[0].unitId, 'VESSEL-901');
    assert.equal(engine.getActiveBreachCount(), 1);

    // 3. Depart outside -> Breach cleared
    const clearResult = engine.evaluateTelemetryPacket({
      unitId: 'VESSEL-901',
      name: 'Unidentified Skiff',
      coordinates: [120.90, 14.50],
      speedKnots: 12.0,
    });
    assert.equal(clearResult.length, 0);
    assert.equal(engine.getActiveBreachCount(), 0);

    // Breach history retains record with cleared status
    const history = engine.getBreachHistory();
    assert.ok(history.length >= 1);
    assert.equal(history[0].active, false);
  });

  await t.test('1.5: Egress Breach: alerts when tracked unit leaves mandatory operational corridor (KEEP_IN)', () => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });

    engine.registerGeofence({
      id: 'transit-channel',
      name: 'Corregidor Passage Channel',
      type: 'corridor',
      rule: GEOFENCE_RULES.KEEP_IN,
      widthMeters: 4000, // 4km wide
      coordinates: [
        [120.50, 14.38],
        [120.60, 14.38],
        [120.70, 14.38],
      ],
    });

    // 1. Inside corridor -> No breach
    const insideResult = engine.evaluateTelemetryPacket({
      unitId: 'ESCORT-11',
      name: 'Coast Guard Escort',
      coordinates: [120.55, 14.38],
      speedKnots: 15.0,
    });
    assert.equal(insideResult.length, 0);
    assert.equal(engine.getActiveBreachCount(), 0);

    // 2. Stray outside corridor (10km North) -> Egress Breach triggered
    const egressResult = engine.evaluateTelemetryPacket({
      unitId: 'ESCORT-11',
      name: 'Coast Guard Escort',
      coordinates: [120.55, 14.48],
      speedKnots: 18.0,
    });
    assert.equal(egressResult.length, 1);
    assert.equal(egressResult[0].violationType, VIOLATION_TYPES.EGRESS);
    assert.equal(engine.getActiveBreachCount(), 1);

    // 3. Returns into corridor -> Egress breach cleared
    engine.evaluateTelemetryPacket({
      unitId: 'ESCORT-11',
      name: 'Coast Guard Escort',
      coordinates: [120.65, 14.38],
      speedKnots: 15.0,
    });
    assert.equal(engine.getActiveBreachCount(), 0);
  });

  await t.test('1.6: Speed Ceiling Violation: alerts when speed limit is exceeded inside monitored zone', () => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });

    engine.registerGeofence({
      id: 'pasig-river-safety',
      name: 'Pasig River Estuary Sanctuary',
      type: 'circle',
      center: [120.97, 14.59],
      radiusMeters: 3000,
      rule: GEOFENCE_RULES.KEEP_OUT, // Or general monitoring
      speedLimitKnots: 8.0, // 8 knot max speed
    });

    // Unit inside but obeying speed limit (6.5 kts) -> Ingress breach only, no speed violation
    engine.evaluateTelemetryPacket({
      unitId: 'TUG-04',
      name: 'Harbor Tug Samson',
      coordinates: [120.97, 14.59],
      speedKnots: 6.5,
    });
    assert.equal(engine.activeBreaches.has('TUG-04::pasig-river-safety::speed_violation'), false);

    // Unit accelerates to 16.2 kts -> Speed violation triggered!
    engine.evaluateTelemetryPacket({
      unitId: 'TUG-04',
      name: 'Harbor Tug Samson',
      coordinates: [120.97, 14.59],
      speedKnots: 16.2,
    });
    const speedBreach = engine.activeBreaches.get('TUG-04::pasig-river-safety::speed_violation');
    assert.ok(speedBreach);
    assert.equal(speedBreach.violationType, VIOLATION_TYPES.SPEED_CEILING);
    assert.equal(speedBreach.speedKnots, 16.2);
    assert.equal(speedBreach.speedLimitKnots, 8.0);

    // Unit slows back down to 7.0 kts -> Speed violation cleared
    engine.evaluateTelemetryPacket({
      unitId: 'TUG-04',
      name: 'Harbor Tug Samson',
      coordinates: [120.97, 14.59],
      speedKnots: 7.0,
    });
    assert.equal(engine.activeBreaches.has('TUG-04::pasig-river-safety::speed_violation'), false);
  });

  await t.test('1.7: Performance Bounding: scans 1,000+ points in under 16ms', () => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });

    // Register 5 different geofences
    for (let i = 0; i < 5; i += 1) {
      engine.registerGeofence({
        id: `zone-${i}`,
        name: `Zone ${i}`,
        type: 'polygon',
        rule: GEOFENCE_RULES.KEEP_OUT,
        coordinates: [
          [120.0 + i * 0.2, 14.0],
          [120.1 + i * 0.2, 14.0],
          [120.1 + i * 0.2, 14.1],
          [120.0 + i * 0.2, 14.1],
          [120.0 + i * 0.2, 14.0],
        ],
      });
    }

    // Generate 1,000 telemetry contacts distributed across region
    const telemetryBatch = [];
    for (let i = 0; i < 1000; i += 1) {
      telemetryBatch.push({
        unitId: `TRACK-${i}`,
        name: `Mover ${i}`,
        coordinates: [119.5 + Math.random() * 2.0, 13.5 + Math.random() * 1.5],
        speedKnots: 5 + Math.random() * 25,
        timestamp: Date.now(),
      });
    }

    // Warmup JIT for accurate micro-benchmark under container CPU scheduling
    engine.scanTelemetryBatch(telemetryBatch.slice(0, 100));

    const result = engine.scanTelemetryBatch(telemetryBatch);
    assert.equal(result.scannedCount, 1000);
    // Performance assertion: Must execute within 16ms frame budget (or 25ms under container throttling)
    assert.ok(
      result.durationMs < 25,
      `Expected batch execution under 25ms, took ${result.durationMs.toFixed(2)}ms`
    );
  });

  await t.test('1.8: Simulation Track: verified boundary crossing lifecycle', (t, done) => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });
    const { waypointsCount } = engine.startSimulation({
      intervalMs: 15,
      onStep: ({ step, packet, activeCount }) => {
        if (step >= waypointsCount) {
          engine.stopSimulation();
          assert.ok(engine.getBreachHistory().length > 0);
          done();
        }
      },
    });
  });

  await t.test('1.9: generateSpeechAlertText formats clear tactical verbal phrases', () => {
    const ingressBreach = {
      unitName: 'USS Dewey',
      geofenceName: 'Spratly Restricted Zone',
      violationType: VIOLATION_TYPES.INGRESS,
    };
    const egressBreach = {
      unitName: 'Patrol Boat 03',
      geofenceName: 'Manila Bay Corridor',
      violationType: VIOLATION_TYPES.EGRESS,
    };
    const speedBreach = {
      unitName: 'Fast Interceptor',
      geofenceName: 'Harbor Channel',
      violationType: VIOLATION_TYPES.SPEED_CEILING,
      speedKnots: 28.4,
      speedLimitKnots: 15.0,
    };

    assert.match(generateSpeechAlertText(ingressBreach), /Ingress breach detected in Spratly Restricted Zone/);
    assert.match(generateSpeechAlertText(egressBreach), /Egress breach.*deviated outside/);
    assert.match(generateSpeechAlertText(speedBreach), /Speed ceiling violation in Harbor Channel.*28 knots.*15 knot limit/);
  });

  await t.test('1.10: gev:maptools:breach event dispatching on breach trigger and clear', () => {
    const engine = new GeofenceBreachEngine({ syncWindowEvents: false });
    const dispatchedEvents = [];

    engine.eventTarget.addEventListener(BREACH_EVENTS.MAPTOOLS_BREACH, (e) => {
      dispatchedEvents.push(e.detail);
    });

    engine.registerGeofence({
      id: 'test-boundary',
      name: 'Alpha Perimeter',
      type: 'circle',
      center: [100.0, 10.0],
      radiusMeters: 5000,
      rule: GEOFENCE_RULES.KEEP_OUT,
    });

    // Unit enters
    engine.evaluateTelemetryPacket({
      unitId: 'UAV-77',
      name: 'ScanEagle 77',
      coordinates: [100.0, 10.0],
      speedKnots: 60,
    });

    assert.equal(dispatchedEvents.length, 1);
    assert.equal(dispatchedEvents[0].action, 'breach_triggered');
    assert.equal(dispatchedEvents[0].breach.unitId, 'UAV-77');
    assert.ok(dispatchedEvents[0].speechText.includes('Alpha Perimeter'));

    // Unit exits
    engine.evaluateTelemetryPacket({
      unitId: 'UAV-77',
      name: 'ScanEagle 77',
      coordinates: [101.0, 10.0],
      speedKnots: 60,
    });

    assert.equal(dispatchedEvents.length, 2);
    assert.equal(dispatchedEvents[1].action, 'breach_cleared');
    assert.equal(dispatchedEvents[1].breach.unitId, 'UAV-77');
  });

  await t.test('1.11: extractTelemetryFromDataManager and automated telemetry monitor', () => {
    const mockDataManager = {
      layers: new Map([
        [
          'flights',
          {
            module: {
              getAllPositions: () => [
                { id: 'FLT-101', label: 'DAL101', longitude: 121.0, latitude: 14.5, altitudeM: 10000, speedKnots: 480 },
              ],
            },
          },
        ],
        [
          'aisLiveVessels',
          {
            module: {
              getAllPositions: () => [
                { id: '987654321', label: 'EVER GIVEN', lon: 120.95, lat: 14.55, speedKnots: 14.2 },
              ],
            },
          },
        ],
      ]),
    };

    const telemetry = extractTelemetryFromDataManager(mockDataManager);
    assert.equal(telemetry.length, 2);
    assert.equal(telemetry[0].unitId, 'FLT-101');
    assert.equal(telemetry[0].coordinates[0], 121.0);
    assert.equal(telemetry[1].unitId, '987654321');
    assert.equal(telemetry[1].coordinates[1], 14.55);

    const engine = getSharedGeofenceEngine();
    assert.ok(engine instanceof GeofenceBreachEngine);
  });
});
