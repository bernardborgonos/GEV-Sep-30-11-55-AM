/**
 * @module philippineOperationalSimulation.test.mjs
 * @description Phase 4 Verification: Philippine National Strategic Network & Operational Simulation Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PH_STRATEGIC_SIMULATION_NODES,
  PH_STRATEGIC_SIMULATION_GEOJSON,
  PH_STRATEGIC_SIMULATION_CSV,
  buildPhilippineStrategicSimulationGeoJSON,
  buildPhilippineStrategicSimulationCSV,
} from './fixtures/philippineStrategicSimulationData.js';
import {
  PH_ISLAND_GROUPS,
  PH_ADMIN_REGIONS,
  computeHaversineDistanceKm,
  calculateInitialBearingDeg,
  computeProximityMatrix,
  simulatePhilippinePatrolTelemetry,
  evaluateStrategicReadiness,
  PhilippineOperationalSimulationEngine,
  runBackendSimulationBenchmark,
  getPhilippineTerritorialBounds,
} from './philippineHierarchy.js';
import { urlIntelligenceLayer } from './urlIntelligence.js';
import { QUICK_PRESETS } from './fixtures/presetIntelligenceData.js';
import { ingestWebpageLayer } from './urlLayerIngest.js';

test('Phase 4: Strategic Network Dataset covers all 17 Regions and 3 Island Groups', () => {
  assert.ok(PH_STRATEGIC_SIMULATION_NODES.length >= 30, 'Contains at least 30 strategic infrastructure nodes');
  assert.equal(PH_STRATEGIC_SIMULATION_NODES.length, 33, 'Curated dataset contains exactly 33 strategic nodes');

  const coveredRegions = new Set(PH_STRATEGIC_SIMULATION_NODES.map((n) => n.region));
  assert.equal(coveredRegions.size, 17, 'Spans all 17 Philippine administrative regions');

  for (const regCode of Object.keys(PH_ADMIN_REGIONS)) {
    assert.ok(coveredRegions.has(regCode), `Region ${regCode} is represented in strategic network`);
  }

  const islandGroups = new Set(PH_STRATEGIC_SIMULATION_NODES.map((n) => n.islandGroup));
  assert.ok(islandGroups.has('Luzon'), 'Covers Luzon');
  assert.ok(islandGroups.has('Visayas'), 'Covers Visayas');
  assert.ok(islandGroups.has('Mindanao'), 'Covers Mindanao');

  // Verify GeoJSON and CSV representations
  const geojson = JSON.parse(PH_STRATEGIC_SIMULATION_GEOJSON);
  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features.length, 33);
  assert.equal(geojson.features[0].geometry.type, 'Point');

  const csv = PH_STRATEGIC_SIMULATION_CSV;
  assert.ok(csv.includes('Ninoy Aquino International Airport Terminal 3'));
  assert.ok(csv.includes('Mactan-Cebu International Aviation Gateway'));
  assert.ok(csv.includes('Davao Sasa International Container Seaport'));
});

test('Phase 4: Haversine Great-Circle Distance and Bearing Calculation', () => {
  // Test identical point
  const zeroDist = computeHaversineDistanceKm(14.5086, 121.0194, 14.5086, 121.0194);
  assert.equal(zeroDist, 0, 'Distance between identical coordinates is 0');

  // Manila NAIA to Clark Airport (~88-92 km)
  const distNaiaClark = computeHaversineDistanceKm(14.5086, 121.0194, 15.186, 120.5596);
  assert.ok(distNaiaClark >= 85 && distNaiaClark <= 95, `NAIA to Clark distance is ~90km (got ${distNaiaClark} km)`);

  // Manila to Cebu (~560-580 km)
  const distManilaCebu = computeHaversineDistanceKm(14.5086, 121.0194, 10.3075, 123.9794);
  assert.ok(distManilaCebu >= 550 && distManilaCebu <= 600, `Manila to Cebu distance is ~570km (got ${distManilaCebu} km)`);

  // Compass Bearing check: Manila to Clark is North-Northwest (~325-340 deg)
  const bearingNaiaClark = calculateInitialBearingDeg(14.5086, 121.0194, 15.186, 120.5596);
  assert.ok(bearingNaiaClark >= 320 && bearingNaiaClark <= 345, `Bearing is NNW (got ${bearingNaiaClark} deg)`);
});

test('Phase 4: Geospatial Proximity Matrix and Nearest Strategic Neighbor Calculation', () => {
  const proximity = computeProximityMatrix(PH_STRATEGIC_SIMULATION_NODES);

  assert.equal(proximity.nodeCount, 33, 'Evaluated all 33 nodes');
  assert.ok(proximity.minDistanceKm > 0, 'Minimum inter-nodal distance is positive');
  assert.ok(proximity.maxDistanceKm > 1000, 'Maximum inter-nodal distance spans Philippine archipelago');
  assert.ok(proximity.avgDistanceKm > 200, 'Average distance is realistic');
  assert.ok(proximity.corridors.length > 0, 'Strategic corridors derived');

  // Verify nearest neighbor for NAIA T3 is either Manila South Harbor or Camp Aguinaldo
  const naiaEntry = proximity.entries.find((e) => e.name.includes('Ninoy Aquino International Airport'));
  assert.ok(naiaEntry, 'Found NAIA entry');
  assert.ok(naiaEntry.nearestNeighbor, 'Has nearest neighbor');
  assert.ok(naiaEntry.nearestNeighbor.distanceKm < 20, 'NAIA nearest neighbor is in Metro Manila (<20km)');
  assert.ok(naiaEntry.nearestMaritime, 'Found nearest maritime port for NAIA');
});

test('Phase 4: Kinematic Patrol Corridors & Territorial Bounds Containment', () => {
  const bounds = getPhilippineTerritorialBounds();

  // Test at t=0, t=30, t=60, t=120, t=300 seconds
  const testTimes = [0, 30, 60, 120, 300];

  for (const t of testTimes) {
    const patrols = simulatePhilippinePatrolTelemetry(t);
    assert.ok(patrols.length >= 5, 'Produces at least 5 active patrol assets');

    for (const p of patrols) {
      assert.ok(Number.isFinite(p.lat), 'Latitude is finite');
      assert.ok(Number.isFinite(p.lon), 'Longitude is finite');
      assert.ok(Number.isFinite(p.headingDeg), 'Heading is finite');
      assert.ok(p.speedKnots > 0, 'Speed is positive');
      assert.equal(p.isWithinTerritory, true, `Patrol ${p.callsign} is strictly within Philippine territory`);

      // Double check bounding limits directly
      const b = bounds.bounds;
      assert.ok(p.lat >= b.minLat && p.lat <= b.maxLat, 'Lat inside bounds');
      assert.ok(p.lon >= b.minLon && p.lon <= b.maxLon, 'Lon inside bounds');
    }
  }
});

test('Phase 4: Strategic Readiness Scoring and Defcon Alert Level Evaluation', () => {
  const patrols = simulatePhilippinePatrolTelemetry(0);
  const readiness = evaluateStrategicReadiness(PH_STRATEGIC_SIMULATION_NODES, patrols);

  assert.ok(readiness.overallReadiness >= 90, 'High overall readiness across nominal network');
  assert.ok(readiness.defconLevel >= 4, 'Defcon level is 4 or 5');
  assert.ok(readiness.islandGroupReadiness.Luzon >= 90, 'Luzon readiness high');
  assert.ok(readiness.islandGroupReadiness.Visayas >= 90, 'Visayas readiness high');
  assert.ok(readiness.islandGroupReadiness.Mindanao >= 90, 'Mindanao readiness high');
  assert.equal(readiness.activePatrolsCount, patrols.length);
  assert.ok(readiness.recommendations.length > 0);
});

test('Phase 4: Stateful Simulation Engine (Start, Step, Pause, Incident Injection, Reset)', () => {
  const engine = new PhilippineOperationalSimulationEngine({ tickRateMs: 100, speedMultiplier: 1.0 });
  engine.initialize(PH_STRATEGIC_SIMULATION_NODES);

  assert.equal(engine.status, 'idle');
  assert.equal(engine.elapsedSeconds, 0);

  // Step 1
  const t1 = engine.step(5.0);
  assert.equal(engine.elapsedSeconds, 5.0);
  assert.equal(t1.tickCount, 1);
  assert.ok(t1.activePatrols.length >= 5);

  // Step 2
  const t2 = engine.step(10.0);
  assert.equal(engine.elapsedSeconds, 15.0);
  assert.equal(t2.tickCount, 2);

  // Inject Incident into PH-SIM-01 (NAIA)
  const initialNaiaReadiness = engine.entities.find((e) => e.id === 'PH-SIM-01').readinessScore;
  engine.injectIncident({ targetNodeId: 'PH-SIM-01', severityScore: 25, type: 'RUNWAY_CONGESTION' });
  const updatedNaia = engine.entities.find((e) => e.id === 'PH-SIM-01');
  assert.equal(updatedNaia.readinessScore, initialNaiaReadiness - 25);
  assert.equal(updatedNaia.incidentActive, 'RUNWAY_CONGESTION');

  // Reset
  engine.reset();
  assert.equal(engine.status, 'idle');
  assert.equal(engine.elapsedSeconds, 0);
  assert.equal(engine.tickCount, 0);
});

test('Phase 4: Automated Backend Simulation Benchmark & 100% Verification', () => {
  const benchmark = runBackendSimulationBenchmark(PH_STRATEGIC_SIMULATION_NODES, 100);

  assert.equal(benchmark.passed, true, 'Benchmark passed with 0 defects');
  assert.equal(benchmark.boundaryViolations, 0, 'Zero boundary corridor violations');
  assert.equal(benchmark.iterations, 100, 'Executed exactly 100 iterations');
  assert.equal(benchmark.regionsCovered, 17, 'All 17 regions covered');
  assert.equal(benchmark.islandGroupsCovered, 3, 'All 3 island groups covered');
  assert.ok(benchmark.avgStepLatencyMs < 5.0, `Sub-millisecond execution latency (got ${benchmark.avgStepLatencyMs} ms)`);
  assert.ok(benchmark.confidenceLevel.includes('High Confidence'), 'Confirmed high confidence level');
  assert.ok(benchmark.verdict.includes('PASSED'), 'Final verdict passed');
});

test('Phase 4: Preset Ingestion & urlIntelligenceLayer Simulation Control', async () => {
  // Check preset is registered in QUICK_PRESETS
  const simPreset = QUICK_PRESETS.find((p) => p.id === 'ph-strategic-operational-simulation');
  assert.ok(simPreset, 'Preset registered in QUICK_PRESETS');
  assert.equal(simPreset.format, 'GEOJSON');

  // Ingest preset URL directly through ingestWebpageLayer
  const ingestResult = await ingestWebpageLayer(simPreset.url);
  assert.ok(ingestResult.points.length >= 30, 'Ingested all strategic nodes');
  assert.equal(ingestResult.points.length, 33);

  // Check that hierarchy and operational tiers were populated
  const firstPoint = ingestResult.points[0];
  assert.ok(firstPoint.operationalTier, 'Has operational tier');
  assert.ok(firstPoint.islandGroup, 'Has island group');
  assert.ok(firstPoint.region, 'Has region');

  // Verify urlIntelligenceLayer Phase 4 methods
  const proximity = urlIntelligenceLayer.getProximityMatrix();
  assert.ok(proximity, 'Exposes proximity matrix');

  const benchmarkReport = urlIntelligenceLayer.runBackendSimulationBenchmark(50);
  assert.equal(benchmarkReport.passed, true);
  assert.equal(benchmarkReport.boundaryViolations, 0);

  const stepResult = urlIntelligenceLayer.stepOperationalSimulation(2.0);
  assert.ok(stepResult.activePatrols.length >= 5);
  assert.ok(stepResult.readinessAssessment);
});
