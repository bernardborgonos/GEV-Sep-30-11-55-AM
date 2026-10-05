import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeLon,
  sanitizeLat,
  sanitizeBounds,
  extractRegionTokens,
  extractSubFacilityTokens,
  parseMultiChainQuery,
  searchUrlIntelligence,
  highlightPulsatingTarget,
  highlightPulsatingPerimeter,
  clearPulsatingTarget,
  clearPulsatingPerimeter,
  clearAllTourHighlights,
  MapTourController,
} from './urlLayerTour.js';

// Mock Cesium environment for backend simulation testing
class MockEntityCollection {
  constructor() {
    this._entities = new Set();
  }
  add(options) {
    // Assert no invalid argument passes through
    assert.ok(options, 'Entity options must be defined');
    const entity = { id: options.id || String(Math.random()), ...options };
    this._entities.add(entity);
    return entity;
  }
  remove(entity) {
    return this._entities.delete(entity);
  }
  contains(entity) {
    return this._entities.has(entity);
  }
  get count() {
    return this._entities.size;
  }
}

class MockCamera {
  constructor() {
    this.lastFlight = null;
  }
  flyTo(options) {
    assert.ok(options, 'Camera flyTo options must be defined');
    assert.ok(options.destination, 'Camera flyTo destination must be defined');
    assert.ok(Number.isFinite(options.duration), 'Flight duration must be finite');
    assert.ok(options.duration > 0, 'Flight duration must be positive');
    this.lastFlight = options;
  }
}

class MockViewer {
  constructor() {
    this.entities = new MockEntityCollection();
    this.camera = new MockCamera();
  }
}

test('URL Tour: coordinate and boundary sanitization prevents Invalid Argument', () => {
  // Test lat/lon sanitization
  assert.equal(sanitizeLat(14.5995), 14.5995);
  assert.equal(sanitizeLat('14.5995'), 14.5995);
  assert.equal(sanitizeLat(95), 89.9); // Clamped
  assert.equal(sanitizeLat(-120), -89.9); // Clamped
  assert.equal(sanitizeLat('invalid'), null);
  assert.equal(sanitizeLat(NaN), null);
  assert.equal(sanitizeLat(undefined), null);

  assert.equal(sanitizeLon(120.9842), 120.9842);
  assert.equal(sanitizeLon('120.9842'), 120.9842);
  assert.equal(sanitizeLon('invalid'), null);
  assert.equal(sanitizeLon(NaN), null);

  // Test degenerate bounds handling (single point or zero area)
  const degenerate = { minLat: 14.5, maxLat: 14.5, minLon: 120.9, maxLon: 120.9 };
  const safe = sanitizeBounds(degenerate, 0.05);
  assert.ok(safe, 'Should produce safe bounds');
  assert.ok(safe.maxLat > safe.minLat, 'maxLat must exceed minLat');
  assert.ok(safe.maxLon > safe.minLon, 'maxLon must exceed minLon');
  assert.ok(safe.maxLat - safe.minLat >= 0.049, 'Span must be non-zero');

  // Null/garbage bounds should safely return null without throwing
  assert.equal(sanitizeBounds(null), null);
  assert.equal(sanitizeBounds({}), null);
  assert.equal(sanitizeBounds({ minLat: 'foo' }), null);
});

test('URL Tour: multi-chain query parser captures levels of data', () => {
  // 1. Hierarchical chain query with '>'
  const q1 = parseMultiChainQuery('Port of Entry > Metro Manila > NAIA');
  assert.equal(q1.isMultiChain, true);
  assert.equal(q1.chainSteps.length, 3);
  assert.equal(q1.categoryHint, 'Port of Entry');
  assert.equal(q1.regionHint, 'Metro Manila');
  assert.equal(q1.entityHint, 'NAIA');
  assert.equal(q1.subFacilityHint, 'NAIA');

  // 2. Hierarchical chain query with '|'
  const q2 = parseMultiChainQuery('Field Office | Cebu');
  assert.equal(q2.isMultiChain, true);
  assert.equal(q2.chainSteps.length, 2);
  assert.equal(q2.categoryHint, 'Field Office');
  assert.equal(q2.regionHint, 'Cebu');

  // 3. Key-value formatted query with sub-facility
  const q3 = parseMultiChainQuery('cat:Port city:Batangas sub:Container Terminal');
  assert.equal(q3.categoryHint, 'Port');
  assert.equal(q3.regionHint, 'Batangas');
  assert.equal(q3.entityHint, 'Container Terminal');
  assert.equal(q3.subFacilityHint, 'Container Terminal');

  // 4. Free text tokens
  const q4 = parseMultiChainQuery('subic bay logistics');
  assert.equal(q4.isMultiChain, false);
  assert.deepEqual(q4.tokens, ['subic', 'bay', 'logistics']);
});

test('URL Tour: extractSubFacilityTokens extracts facility names and structural landmarks', () => {
  const pt1 = {
    name: 'NAIA Terminal 3',
    category: 'Port of Entry',
  };
  const tokens1 = extractSubFacilityTokens(pt1);
  assert.ok(tokens1.includes('NAIA Terminal 3'));
  assert.ok(tokens1.includes('Terminal 3'));

  const pt2 = {
    title: 'Manila North Harbor Pier 4',
    subfacility: 'Berth 12',
  };
  const tokens2 = extractSubFacilityTokens(pt2);
  assert.ok(tokens2.includes('Berth 12'));
  assert.ok(tokens2.includes('Manila North Harbor Pier 4'));
  assert.ok(tokens2.includes('Pier 4'));
});

test('URL Tour: multi-chain search engine surfaces Level 1, 2, and 3 data', () => {
  const sampleDataset = {
    categories: ['Port of Entry', 'Field Office', 'Logistics Hub'],
    categoryCounts: { 'Port of Entry': 2, 'Field Office': 1, 'Logistics Hub': 1 },
    points: [
      {
        id: 'p1',
        name: 'NAIA Terminal 3',
        category: 'Port of Entry',
        lat: 14.5204,
        lon: 121.0144,
        address: 'Pasay City, Metro Manila',
      },
      {
        id: 'p2',
        name: 'Port of Batangas Container Terminal',
        category: 'Port of Entry',
        lat: 13.7565,
        lon: 121.0453,
        address: 'Batangas City, Calabarzon',
      },
      {
        id: 'p3',
        name: 'Cebu Field Office',
        category: 'Field Office',
        lat: 10.3157,
        lon: 123.8854,
        address: 'Cebu City, Central Visayas',
      },
    ],
    trajectoryList: [],
  };

  // Search 1: Filter by category and city
  const res1 = searchUrlIntelligence('Port > Batangas', sampleDataset);
  assert.ok(res1.categories.length > 0, 'Should match category');
  assert.equal(res1.categories[0].name, 'Port of Entry');
  assert.ok(res1.items.length > 0, 'Should match Batangas port item');
  assert.equal(res1.items[0].name, 'Port of Batangas Container Terminal');

  // Search 2: Filter by 3-tier multi-chain hierarchy: Category > Region > Sub-facility
  const res3Tier = searchUrlIntelligence('Port of Entry > Metro Manila > NAIA Terminal 3', sampleDataset);
  assert.ok(res3Tier.multiChains.length > 0, 'Should return multi-chain matches');
  const topChain = res3Tier.multiChains[0];
  assert.equal(topChain.tier, 3, 'Top result should be tier 3 hierarchy');
  assert.equal(topChain.category, 'Port of Entry');
  assert.equal(topChain.region, 'Metro Manila');
  assert.equal(topChain.subFacility, 'NAIA Terminal 3');
  assert.equal(topChain.points.length, 1);
  assert.equal(topChain.points[0].id, 'p1');

  // Search 3: Filter by 2-tier multi-chain hierarchy
  const res2 = searchUrlIntelligence('Port > Metro Manila', sampleDataset);
  assert.ok(res2.items.length > 0);
  assert.equal(res2.items[0].name, 'NAIA Terminal 3');

  // Search 4: Actions should always be offered
  const emptyQueryRes = searchUrlIntelligence('', sampleDataset);
  assert.ok(emptyQueryRes.actions.some((a) => a.action === 'start-tour-all'));
  assert.ok(emptyQueryRes.actions.some((a) => a.action === 'fit-extent'));
});

test('URL Tour: Cesium pulsating ring and perimeter safely render with zero Invalid Argument errors', () => {
  const mockViewer = new MockViewer();

  // 1. Render pulsating ring for valid target
  const clearRing = highlightPulsatingTarget(mockViewer, {
    lat: 14.5995,
    lon: 120.9842,
    color: '#00e5ff',
    baseRadius: 250,
  });
  assert.ok(mockViewer.entities.count >= 2, 'Should create inner core and outer pulse ring');

  // Verify that the ellipse entity strictly satisfies semiMajorAxis >= semiMinorAxis
  const ringEntity = Array.from(mockViewer.entities._entities.values()).find((e) => e.ellipse);
  assert.ok(ringEntity, 'Ring entity with ellipse geometry must exist');
  for (let i = 0; i < 10; i++) {
    const major = ringEntity.ellipse.semiMajorAxis.getValue();
    const minor = ringEntity.ellipse.semiMinorAxis.getValue();
    assert.ok(
      major >= minor,
      `semiMajorAxis (${major}) must be greater than or equal to semiMinorAxis (${minor})`
    );
  }

  // Clear ring
  clearRing();
  assert.equal(mockViewer.entities.count, 0, 'All ring entities should be cleanly removed');

  // 2. Reject invalid/corrupted coordinates safely without throwing
  const noop1 = highlightPulsatingTarget(mockViewer, { lat: NaN, lon: 'abc' });
  assert.equal(mockViewer.entities.count, 0, 'Corrupted coordinates must not create entities');
  noop1();

  const noop2 = highlightPulsatingTarget(mockViewer, { lat: null, lon: undefined });
  assert.equal(mockViewer.entities.count, 0);
  noop2();

  // 3. Render pulsating boundary perimeter
  const clearPerim = highlightPulsatingPerimeter(mockViewer, {
    bounds: { minLat: 13.5, maxLat: 15.0, minLon: 120.5, maxLon: 121.5 },
    color: '#fbbf24',
  });
  assert.ok(mockViewer.entities.count >= 2, 'Should create perimeter line and fill');

  clearPerim();
  assert.equal(mockViewer.entities.count, 0, 'Perimeter entities removed cleanly');

  // 4. Test perimeter with degenerate (single point) bounds
  const clearDegenerate = highlightPulsatingPerimeter(mockViewer, {
    bounds: { minLat: 14.5, maxLat: 14.5, minLon: 121.0, maxLon: 121.0 },
    color: '#10b981',
  });
  assert.ok(mockViewer.entities.count >= 2, 'Degenerate bounds must be auto-padded safely');
  clearDegenerate();
  assert.equal(mockViewer.entities.count, 0);
});

test('URL Tour: MapTourController handles play, pause, stop, speed, and duration transitions', () => {
  const mockViewer = new MockViewer();
  const controller = new MapTourController(mockViewer);

  const sampleItems = [
    { id: '1', name: 'Stop A', lat: 14.5, lon: 120.9, category: 'Port' },
    { id: '2', name: 'Stop B', lat: 14.6, lon: 121.0, category: 'Port' },
    { id: '3', name: 'Stop C', lat: 14.7, lon: 121.1, category: 'Port' },
  ];

  let stateUpdates = [];
  const unsubscribe = controller.subscribe((state) => {
    stateUpdates.push(state.status);
  });

  // Start Tour
  const started = controller.startTour({
    mode: 'all',
    items: sampleItems,
    title: 'Test Tour',
  });
  assert.equal(started, true);
  assert.equal(controller.status, 'playing');
  assert.ok(controller.stops.length >= 4, 'Should include overview perimeter + 3 stops');

  // Pause
  controller.pause();
  assert.equal(controller.status, 'paused');

  // Play
  controller.play();
  assert.equal(controller.status, 'playing');

  // Next / Prev navigation
  const idx0 = controller.currentIndex;
  controller.next();
  assert.equal(controller.currentIndex, (idx0 + 1) % controller.stops.length);

  controller.prev();
  assert.equal(controller.currentIndex, idx0);

  // Speed and duration controls
  controller.setSpeed(2.0);
  assert.equal(controller.speed, 2.0);

  controller.setDuration(6.0);
  assert.equal(controller.dwellDurationSec, 6.0);

  // Stop
  controller.stop();
  assert.equal(controller.status, 'stopped');
  assert.equal(controller.currentIndex, 0);

  // Exit
  controller.exit();
  assert.equal(controller.status, 'idle');
  assert.equal(controller.stops.length, 0);

  unsubscribe();
});
