import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_METERS,
  METERS_PER_KM,
  METERS_PER_NM,
  haversineDistance,
  haversineDistanceMeters,
  haversineDistanceKm,
  haversineDistanceNm,
  initialBearing,
  destinationPoint,
  calculatePathDistance,
  calculatePolygonPerimeter,
  calculatePolygonGeodesicArea,
  calculatePolygonMetrics,
  generateRangeRingVertices,
  generateConcentricRangeRings,
  pointInPolygon,
  pointInCircle,
  calculateBoundingBox,
  calculateCentroid,
} from './geodesicMath.js';

import {
  MapToolsEngine,
  getSharedMapToolsEngine,
  resetSharedMapToolsEngine,
  MAP_TOOLS_EVENTS,
  FEATURE_TYPES,
} from './mapToolsEngine.js';

// =========================================================================
// SECTION 1: GEODESIC MATH FACADE & BENCHMARK PRECISION
// =========================================================================

test('Section 1: Geodesic Math Facade & Benchmark Distances', async (t) => {
  // Benchmark Coordinates
  const manila = [120.9842, 14.5995];
  const tokyo = [139.6503, 35.6762];

  await t.test('1.1: Haversine distance Manila to Tokyo matches benchmark across units', () => {
    const meters = haversineDistanceMeters(manila, tokyo);
    const km = haversineDistanceKm(manila, tokyo);
    const nm = haversineDistanceNm(manila, tokyo);

    // Manila to Tokyo benchmark: ~2,991.80 km (within 0.05% tolerance)
    assert.ok(meters > 2991000 && meters < 2992500, `Meters ${meters} should match benchmark (~2,991,802m)`);
    assert.ok(km > 2991.0 && km < 2992.5, `Kilometers ${km} should match benchmark (~2,991.8km)`);
    assert.ok(nm > 1615.0 && nm < 1616.0, `Nautical miles ${nm} should match benchmark (~1,615.4nm)`);

    // Exact conversion relationship
    assert.equal(km, meters / METERS_PER_KM, 'km must equal meters / 1000');
    assert.equal(nm, meters / METERS_PER_NM, 'nm must equal meters / 1852');

    // Multi-unit accessor
    const all = haversineDistance(manila, tokyo, 'all');
    assert.equal(all.meters, meters);
    assert.equal(all.kilometers, km);
    assert.equal(all.nauticalMiles, nm);
  });

  await t.test('1.2: Distance between identical points is zero', () => {
    const dist = haversineDistanceMeters(manila, manila);
    assert.equal(dist, 0);
  });

  await t.test('1.3: Great-circle initial bearing and destination point round-trip', () => {
    const bearing = initialBearing(manila, tokyo);
    // Bearing from Manila northeast towards Tokyo is ~36.8°
    assert.ok(bearing > 35 && bearing < 40, `Bearing ${bearing}° should be ~36.8°`);

    // Project destination along great circle for 500 km at 90° (due East)
    const distMeters = 500000;
    const dest = destinationPoint(manila, distMeters, 90);
    const measuredDist = haversineDistanceMeters(manila, dest);
    assert.ok(
      Math.abs(measuredDist - distMeters) < 0.01,
      `Measured destination distance ${measuredDist} must equal requested ${distMeters}`,
    );
  });

  await t.test('1.4: Multi-node path distance summation across flight segments', () => {
    // Manila -> Taipei -> Tokyo
    const taipei = [121.5654, 25.0330];
    const waypoints = [manila, taipei, tokyo];

    const path = calculatePathDistance(waypoints);
    assert.equal(path.nodeCount, 3);
    assert.equal(path.segmentDistances.length, 2);

    const seg1 = haversineDistanceMeters(manila, taipei);
    const seg2 = haversineDistanceMeters(taipei, tokyo);
    const expectedTotal = seg1 + seg2;

    assert.ok(
      Math.abs(path.totalMeters - expectedTotal) < 0.001,
      `Total meters ${path.totalMeters} must equal sum of segments ${expectedTotal}`,
    );
    assert.equal(path.cumulativeDistancesMeters[0], 0);
    assert.ok(Math.abs(path.cumulativeDistancesMeters[1] - seg1) < 0.001);
    assert.ok(Math.abs(path.cumulativeDistancesMeters[2] - expectedTotal) < 0.001);
    assert.ok(path.boundingBox.minLon <= 120.9842 && path.boundingBox.maxLon >= 139.6503);
  });

  await t.test('1.5: Spherical polygon geodesic area matches analytical calculus benchmark', () => {
    // 1. Exact Spherical Triangle Benchmark (Octant of Sphere: 1/8th of Earth surface)
    // Vertices at (0°, 0°), (90°, 0°), (0°, 90°)
    const octant = [
      [0, 0],
      [90, 0],
      [0, 90],
      [0, 0],
    ];
    const octantResult = calculatePolygonGeodesicArea(octant);
    const expectedOctantM2 = (Math.PI / 2) * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS;
    const octantDiff = Math.abs(octantResult.areaSquareMeters - expectedOctantM2) / expectedOctantM2;
    assert.ok(octantDiff < 1e-12, `Octant area diff ${octantDiff} must be essentially zero (< 1e-12)`);

    // 2. 1 degree x 1 degree equatorial polygon: [0,0] -> [1,0] -> [1,1] -> [0,1] -> [0,0]
    const square = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];

    const areaResult = calculatePolygonGeodesicArea(square);
    // Analytical expectation for latitude-longitude quad: R^2 * (pi/180) * sin(1 deg)
    const expectedAreaM2 = EARTH_RADIUS_METERS * EARTH_RADIUS_METERS * (Math.PI / 180) * Math.sin(Math.PI / 180);

    const relativeDiff = Math.abs(areaResult.areaSquareMeters - expectedAreaM2) / expectedAreaM2;
    // Great circle arc vs parallel difference is ~0.0025%
    assert.ok(relativeDiff < 0.0001, `Geodesic area relative difference ${relativeDiff} must be < 0.01%`);
    assert.equal(areaResult.areaSquareKm, areaResult.areaSquareMeters / 1e6);
    assert.equal(areaResult.areaHectares, areaResult.areaSquareMeters / 10000);

    const perimResult = calculatePolygonPerimeter(square);
    assert.ok(perimResult.perimeterMeters > 400000, 'Equatorial 1 deg square perimeter > 400 km');
  });

  await t.test('1.6: Concentric range ring vertex generator generates radial equidistant coordinates', () => {
    const radii = [10000, 25000, 50000]; // 10km, 25km, 50km
    const rings = generateConcentricRangeRings(manila, radii, 64);

    assert.equal(rings.length, 3);
    assert.equal(rings[0].radiusMeters, 10000);
    assert.equal(rings[1].radiusMeters, 25000);
    assert.equal(rings[2].radiusMeters, 50000);

    // Verify each vertex in the 50km ring is exactly 50,000m from the center within sub-millimeter precision
    const outerRing = rings[2];
    assert.equal(outerRing.vertices.length, 65); // 64 segments + 1 closing vertex

    for (const vertex of outerRing.vertices) {
      const dist = haversineDistanceMeters(manila, vertex);
      assert.ok(
        Math.abs(dist - 50000) < 0.01,
        `Range ring vertex must be exactly 50,000m from center, measured: ${dist}`,
      );
    }

    // Closing vertex must equal first vertex
    assert.deepEqual(outerRing.vertices[0], outerRing.vertices[outerRing.vertices.length - 1]);
  });

  await t.test('1.7: Ray-Casting Point-in-Polygon and Point-in-Circle containment', () => {
    const polygon = [
      [120.0, 14.0],
      [122.0, 14.0],
      [122.0, 16.0],
      [120.0, 16.0],
      [120.0, 14.0],
    ];

    // Inside polygon
    assert.equal(pointInPolygon([121.0, 15.0], polygon), true);

    // Outside polygon
    assert.equal(pointInPolygon([119.0, 15.0], polygon), false);
    assert.equal(pointInPolygon([121.0, 17.0], polygon), false);

    // Point in Circle: Center [0, 0], Radius 10 km (10,000m)
    const center = [0, 0];
    const testInside = [0.01, 0.01]; // ~1.57 km away
    const testOutside = [0.2, 0.2]; // ~31.4 km away

    const insideCircle = pointInCircle(testInside, center, 10000);
    assert.equal(insideCircle.inside, true);
    assert.ok(insideCircle.distanceMeters < 10000);

    const outsideCircle = pointInCircle(testOutside, center, 10000);
    assert.equal(outsideCircle.inside, false);
    assert.ok(outsideCircle.distanceMeters > 10000);
  });
});

// =========================================================================
// SECTION 2: MODULAR PLUGIN ENGINE & HEADLESS CAPABILITY
// =========================================================================

test('Section 2: Modular Headless MapToolsEngine Singleton & Decoupled Event Bus', async (t) => {
  t.afterEach(() => {
    resetSharedMapToolsEngine();
  });

  await t.test('2.1: Instantiates and operates completely headless without DOM or viewer', () => {
    const engine = new MapToolsEngine({ syncWindowEvents: false });
    assert.ok(engine instanceof MapToolsEngine, 'Engine must instantiate without viewer or DOM');
    assert.equal(engine.features.size, 0);

    const shared = getSharedMapToolsEngine();
    assert.ok(shared instanceof MapToolsEngine, 'Shared singleton must return MapToolsEngine');
    assert.equal(shared, getSharedMapToolsEngine(), 'Subsequent calls must return same singleton');
  });

  await t.test('2.2: Decoupled Event Bus dispatches custom events without foreign coupling', () => {
    const engine = new MapToolsEngine({ syncWindowEvents: false });
    const receivedEvents = [];

    engine.on(MAP_TOOLS_EVENTS.CREATE, (e) => {
      receivedEvents.push({ type: e.type, detail: e.detail });
    });
    engine.on(MAP_TOOLS_EVENTS.UPDATE, (e) => {
      receivedEvents.push({ type: e.type, detail: e.detail });
    });
    engine.on(MAP_TOOLS_EVENTS.DELETE, (e) => {
      receivedEvents.push({ type: e.type, detail: e.detail });
    });
    engine.on(MAP_TOOLS_EVENTS.FLY_EXTENT, (e) => {
      receivedEvents.push({ type: e.type, detail: e.detail });
    });

    // Create
    const feat = engine.createFeature({
      type: FEATURE_TYPES.POINT,
      coordinates: [120.9842, 14.5995],
      name: 'Alpha Outpost',
    });

    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0].type, MAP_TOOLS_EVENTS.CREATE);
    assert.equal(receivedEvents[0].detail.feature.name, 'Alpha Outpost');

    // Update
    engine.updateFeature(feat.id, { name: 'Alpha Outpost Prime' });
    assert.equal(receivedEvents.length, 2);
    assert.equal(receivedEvents[1].type, MAP_TOOLS_EVENTS.UPDATE);
    assert.equal(receivedEvents[1].detail.feature.name, 'Alpha Outpost Prime');

    // Fly Extent
    engine.flyToFeature(feat.id);
    assert.equal(receivedEvents.length, 3);
    assert.equal(receivedEvents[2].type, MAP_TOOLS_EVENTS.FLY_EXTENT);
    assert.equal(receivedEvents[2].detail.featureId, feat.id);

    // Delete
    engine.deleteFeature(feat.id);
    assert.equal(receivedEvents.length, 4);
    assert.equal(receivedEvents[3].type, MAP_TOOLS_EVENTS.DELETE);
    assert.equal(receivedEvents[3].detail.featureId, feat.id);
  });
});

// =========================================================================
// SECTION 3: CRED STATE MACHINE, VERSIONING & GEOMETRY RECALCULATION
// =========================================================================

test('Section 3: CRED State Machine, Versioning & Recalculation', async (t) => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });

  await t.test('3.1: createFeature initializes version 1 and calculates dependent line metrics', () => {
    const feature = engine.createFeature({
      id: 'flight-route-01',
      name: 'Corridor Luzon',
      type: FEATURE_TYPES.LINE,
      coordinates: [
        [120.9842, 14.5995],
        [121.5654, 25.0330],
      ],
      properties: { tacticalCallsign: 'VIPER-1' },
    });

    assert.equal(feature.id, 'flight-route-01');
    assert.equal(feature.version, 1, 'Initial version must be 1');
    assert.equal(feature.locked, false, 'Default lock must be false');
    assert.ok(feature.createdAt, 'Must record createdAt');
    assert.ok(feature.computed.totalMeters > 0, 'Must calculate total distance');
    assert.equal(feature.computed.nodeCount, 2);
    assert.equal(feature.properties.tacticalCallsign, 'VIPER-1');
  });

  await t.test('3.2: updateFeature increments version and recalculates dependent geometry', () => {
    // Extend flight route with a third waypoint (Tokyo)
    const updated = engine.updateFeature('flight-route-01', {
      coordinates: [
        [120.9842, 14.5995],
        [121.5654, 25.0330],
        [139.6503, 35.6762],
      ],
    });

    assert.equal(updated.version, 2, 'Version must auto-increment to 2');
    assert.equal(updated.computed.nodeCount, 3);
    assert.ok(
      updated.computed.totalMeters > 2900000,
      'Recalculated line metrics must reflect extended route',
    );

    // Retrieve via getFeature to verify persistence
    const retrieved = engine.getFeature('flight-route-01');
    assert.equal(retrieved.version, 2);
    assert.equal(retrieved.computed.nodeCount, 3);
  });

  await t.test('3.3: lockFeature prevents unauthorized updates and deletions', () => {
    // Lock feature
    const locked = engine.lockFeature('flight-route-01', true);
    assert.equal(locked.locked, true);
    assert.equal(locked.version, 3, 'Locking increments version');

    // Attempting update without force must throw
    assert.throws(
      () => {
        engine.updateFeature('flight-route-01', { name: 'Attempted Renaming' });
      },
      /Cannot update locked feature/,
      'Must reject update on locked feature',
    );

    // Attempting delete without force must throw
    assert.throws(
      () => {
        engine.deleteFeature('flight-route-01');
      },
      /Cannot delete locked feature/,
      'Must reject delete on locked feature',
    );

    // clearAll preserves locked feature
    const clearSummary = engine.clearAll({ force: false });
    assert.equal(clearSummary.remainingCount, 1, 'Locked feature must survive clearAll');
    assert.ok(engine.getFeature('flight-route-01'), 'Locked feature must still exist');

    // Unlock and delete
    engine.lockFeature('flight-route-01', false);
    const deleteSuccess = engine.deleteFeature('flight-route-01');
    assert.equal(deleteSuccess, true);
    assert.equal(engine.getFeature('flight-route-01'), null);
  });

  await t.test('3.4: Polygon feature calculates area, perimeter and tests point containment', () => {
    const polygonFeature = engine.createFeature({
      id: 'restricted-zone-z1',
      name: 'Restricted Airspace Zone',
      type: FEATURE_TYPES.POLYGON,
      coordinates: [
        [120.0, 14.0],
        [122.0, 14.0],
        [122.0, 16.0],
        [120.0, 16.0],
        [120.0, 14.0],
      ],
    });

    assert.equal(polygonFeature.computed.type, 'polygon');
    assert.ok(polygonFeature.computed.areaSquareMeters > 0);
    assert.ok(polygonFeature.computed.perimeterMeters > 0);
    assert.ok(polygonFeature.computed.centroid);

    // Test containment query via engine.pointInFeature
    const insideTest = engine.pointInFeature([121.0, 15.0], 'restricted-zone-z1');
    assert.equal(insideTest.inside, true);

    const outsideTest = engine.pointInFeature([119.0, 15.0], 'restricted-zone-z1');
    assert.equal(outsideTest.inside, false);
  });

  await t.test('3.5: Circle and Range Ring features compute radii and test containment', () => {
    const circleFeature = engine.createFeature({
      id: 'radar-dome-01',
      name: 'Early Warning Radar',
      type: FEATURE_TYPES.CIRCLE,
      coordinates: [120.9842, 14.5995],
      properties: { radiusMeters: 25000 }, // 25 km
    });

    assert.equal(circleFeature.computed.radiusMeters, 25000);
    assert.equal(circleFeature.computed.radiusKm, 25);
    assert.ok(circleFeature.computed.circumferenceMeters > 0);

    // Target 10 km away is inside
    const nearTarget = destinationPoint([120.9842, 14.5995], 10000, 45);
    const nearCheck = engine.pointInFeature(nearTarget, 'radar-dome-01');
    assert.equal(nearCheck.inside, true);

    // Target 40 km away is outside
    const farTarget = destinationPoint([120.9842, 14.5995], 40000, 45);
    const farCheck = engine.pointInFeature(farTarget, 'radar-dome-01');
    assert.equal(farCheck.inside, false);
  });
});

// =========================================================================
// SECTION 4: ARCHITECTURAL MODULARITY & ZERO COUPLING VERIFICATION
// =========================================================================

test('Section 4: Architectural Modularity & Zero Foreign Coupling', async (t) => {
  const fs = await import('node:fs/promises');

  await t.test('4.1: Module sources contain zero imports of scraper, ingestion, or Drive modules', async () => {
    const mathSource = await fs.readFile('src/tools/geodesicMath.js', 'utf8');
    const engineSource = await fs.readFile('src/tools/mapToolsEngine.js', 'utf8');
    const indexSource = await fs.readFile('src/tools/index.js', 'utf8');

    const forbiddenTerms = [
      'googleDrive',
      'multiFileIngestEngine',
      'scraper',
      'ingestion',
      'Drive',
      'auth/google',
      'openSky',
      'xlsx',
    ];

    [mathSource, engineSource, indexSource].forEach((src) => {
      forbiddenTerms.forEach((term) => {
        const importRegex = new RegExp(`import.*from.*['"].*${term}.*['"]`, 'i');
        assert.ok(!importRegex.test(src), `Module must not import forbidden foreign module: ${term}`);
      });
    });
  });

  await t.test('4.2: getAllFeatures supports functional and criteria-based filtering', () => {
    const engine = new MapToolsEngine({ syncWindowEvents: false });
    engine.createFeature({ type: FEATURE_TYPES.POINT, coordinates: [120, 14], name: 'Pt 1' });
    engine.createFeature({ type: FEATURE_TYPES.POINT, coordinates: [121, 15], name: 'Pt 2' });
    const poly = engine.createFeature({
      type: FEATURE_TYPES.POLYGON,
      coordinates: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
      name: 'Poly 1',
    });
    engine.lockFeature(poly.id, true);

    // Filter by type
    const points = engine.getAllFeatures({ type: 'point' });
    assert.equal(points.length, 2);

    // Filter by locked
    const locked = engine.getAllFeatures({ locked: true });
    assert.equal(locked.length, 1);
    assert.equal(locked[0].id, poly.id);

    // Filter by predicate function
    const polyFn = engine.getAllFeatures((f) => f.type === 'polygon');
    assert.equal(polyFn.length, 1);
  });

  await t.test('4.3: Point-in-polygon handles complex polygons with holes', () => {
    // Outer square: [0, 0] to [10, 10]
    // Inner hole: [3, 3] to [7, 7]
    const polygonWithHole = [
      // Outer ring
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      // Hole ring
      [
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
        [3, 3],
      ],
    ];

    // Inside outer ring, outside hole
    assert.equal(pointInPolygon([1, 1], polygonWithHole), true);

    // Inside the hole -> must return false
    assert.equal(pointInPolygon([5, 5], polygonWithHole), false);

    // Outside outer ring -> must return false
    assert.equal(pointInPolygon([12, 12], polygonWithHole), false);
  });
});

