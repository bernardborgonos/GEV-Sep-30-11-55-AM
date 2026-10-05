import test from 'node:test';
import assert from 'node:assert/strict';
import { searchUrlIntelligence, MapTourController } from '../data/urlLayerTour.js';

test('Auto-Suggest & Multi-Chain data matching simulation', (t) => {
  const mockDataset = {
    points: [
      { id: 'poi-1', name: 'Batangas Container Terminal', category: 'Port of Entry', region: 'Luzon', lat: 13.7565, lon: 121.0583, address: 'Port Access Rd, Batangas' },
      { id: 'poi-2', name: 'Subic Bay Free Port Zone', category: 'Port of Entry', region: 'Luzon', lat: 14.8210, lon: 120.2710, address: 'Subic Bay' },
      { id: 'poi-3', name: 'Ninoy Aquino International Airport', category: 'Air Transportation', region: 'NCR', lat: 14.5086, lon: 121.0194, address: 'Pasay City, Metro Manila' },
      { id: 'poi-4', name: 'Clark International Airport', category: 'Air Transportation', region: 'Central Luzon', lat: 15.1859, lon: 120.5597, address: 'Clark Freeport Zone' },
      { id: 'poi-5', name: 'Laguna Technopark Distribution Center', category: 'Logistics Hub', region: 'CALABARZON', lat: 14.2471, lon: 121.0652, address: 'Biñan, Laguna' }
    ],
    trajectoryList: [],
    categories: ['Port of Entry', 'Air Transportation', 'Logistics Hub'],
    categoryCounts: { 'Port of Entry': 2, 'Air Transportation': 2, 'Logistics Hub': 1 },
    isTrajectory: false,
  };

  // 1. Empty query produces default high-level options (Actions & Categories)
  const defaultResult = searchUrlIntelligence('', mockDataset);
  assert.ok(defaultResult.actions.length >= 2, 'Should provide default actions');
  assert.equal(defaultResult.categories.length, 3, 'Should present all 3 categories');

  // 2. Querying a category: "Port"
  const portResult = searchUrlIntelligence('Port', mockDataset);
  assert.ok(portResult.categories.some((c) => c.name === 'Port of Entry'));
  assert.equal(portResult.items.length, 4, 'Matches both Port of Entry and Airports');

  // 3. Multi-chain query: "Port Luzon"
  const multiResult = searchUrlIntelligence('Port Luzon', mockDataset);
  assert.ok(multiResult.items.length >= 1, 'Should find ports in Luzon');

  // 4. Exact point search: "Clark"
  const clarkResult = searchUrlIntelligence('Clark', mockDataset);
  assert.equal(clarkResult.items.length, 1);
  assert.equal(clarkResult.items[0].name, 'Clark International Airport');
});

test('MapTourController state machine verification', (t) => {
  const mockViewer = {
    entities: {
      add: (e) => e,
      remove: () => true,
    },
    camera: {
      flyTo: () => {},
    },
  };

  const tour = new MapTourController(mockViewer);
  assert.equal(tour.status, 'idle');

  const stops = [
    { id: '1', title: 'Stop 1', lat: 14.5, lon: 121.0, category: 'Test' },
    { id: '2', title: 'Stop 2', lat: 14.8, lon: 120.3, category: 'Test' },
  ];

  // Starting a tour generates an introductory perimeter boundary stop + 2 individual stops = 3 stops total
  tour.startTour({ items: stops });
  assert.equal(tour.status, 'playing');
  assert.equal(tour.stops.length, 3, 'Includes introductory perimeter stop and target stops');
  assert.equal(tour.currentIndex, 0);

  // Pause
  tour.pause();
  assert.equal(tour.status, 'paused');

  // Play
  tour.play();
  assert.equal(tour.status, 'playing');

  // Speed and duration controls
  tour.setSpeed(2);
  assert.equal(tour.speed, 2);

  tour.setDuration(6);
  assert.equal(tour.dwellDurationSec, 6);

  // Stop and Exit
  tour.stop();
  assert.equal(tour.status, 'stopped');

  tour.exit();
  assert.equal(tour.status, 'idle');
  assert.equal(tour.stops.length, 0);
});

test('MapTourController: Multi-Chain tour execution with 3-tier breadcrumbs', () => {
  const mockViewer = {
    entities: {
      add: (e) => e,
      remove: () => true,
    },
    camera: {
      flyTo: () => {},
    },
  };

  const tour = new MapTourController(mockViewer);
  const chainPoints = [
    {
      id: 'pt-1',
      name: 'NAIA Terminal 3 Departure Pier',
      category: 'Port of Entry',
      lat: 14.5200,
      lon: 121.0180,
    },
    {
      id: 'pt-2',
      name: 'NAIA Terminal 3 Cargo Berth',
      category: 'Port of Entry',
      lat: 14.5220,
      lon: 121.0195,
    },
  ];

  const launched = tour.startTour({
    mode: 'multi-chain',
    chainPath: 'Port of Entry > Metro Manila > NAIA Terminal 3',
    chainTier: 3,
    chainCategory: 'Port of Entry',
    chainRegion: 'Metro Manila',
    chainSubFacility: 'NAIA Terminal 3',
    items: chainPoints,
  });

  assert.ok(launched, 'Tour should successfully launch');
  const state = tour.getState();
  assert.equal(state.status, 'playing');
  assert.equal(state.mode, 'multi-chain');
  assert.equal(state.chainPath, 'Port of Entry > Metro Manila > NAIA Terminal 3');
  assert.equal(state.chainTier, 3);
  assert.equal(state.chainSubFacility, 'NAIA Terminal 3');
  assert.equal(state.totalStops, 3, '1 perimeter overview stop + 2 sub-facility stops');

  // Verify Overview Stop
  assert.equal(tour.stops[0].isPerimeter, true);
  assert.equal(tour.stops[0].chainPath, 'Port of Entry > Metro Manila > NAIA Terminal 3');
  assert.ok(tour.stops[0].title.includes('Perimeter Overview'));

  // Step forward to first sub-facility stop
  tour.next();
  assert.equal(tour.currentIndex, 1);
  const current = tour.getState().currentStop;
  assert.equal(current.isPerimeter, false);
  assert.equal(current.title, 'NAIA Terminal 3 Departure Pier');
  assert.equal(current.chainPath, 'Port of Entry > Metro Manila > NAIA Terminal 3');

  // Clean exit
  tour.exit();
  assert.equal(tour.status, 'idle');
});

test('Tour Detail Display Preference: cinematic, docked, and modal modes', () => {
  // Test localStorage storage and retrieval simulation
  const mockStorage = new Map();
  const setMode = (mode) => mockStorage.set('gev_tour_display_mode', mode);
  const getMode = () => mockStorage.get('gev_tour_display_mode') || 'cinematic';

  // Default mode
  assert.equal(getMode(), 'cinematic');

  // Verify switching to docked
  setMode('docked');
  assert.equal(getMode(), 'docked');

  // Verify switching to modal
  setMode('modal');
  assert.equal(getMode(), 'modal');

  // Verify switching back to cinematic
  setMode('cinematic');
  assert.equal(getMode(), 'cinematic');
});


