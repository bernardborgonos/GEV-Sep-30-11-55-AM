import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_CATEGORIES,
  LAYER_DOMAIN_MAPPING,
  OPERATIONAL_PRESETS,
  calculatePresetLayerVisibility,
  calculateDomainSoloVisibility,
  invertVisibility,
  validateCustomPreset,
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  applyPresetToDataManager,
  applyBulkStateToDataManager,
  applyInvertToDataManager,
} from './tacticalPresets.js';

test('DOMAIN_CATEGORIES contains expected standard operational domains', () => {
  assert.equal(DOMAIN_CATEGORIES.AIR, 'air');
  assert.equal(DOMAIN_CATEGORIES.SEA, 'sea');
  assert.equal(DOMAIN_CATEGORIES.SPACE, 'space');
  assert.equal(DOMAIN_CATEGORIES.GROUND, 'ground');
  assert.equal(DOMAIN_CATEGORIES.ENVIRONMENTAL, 'environmental');
  assert.equal(DOMAIN_CATEGORIES.INFRASTRUCTURE, 'infrastructure');
});

test('OPERATIONAL_PRESETS provides standard tactical presets', () => {
  assert.ok(OPERATIONAL_PRESETS.length >= 5);
  const ids = OPERATIONAL_PRESETS.map((p) => p.id);
  assert.ok(ids.includes('full_c4isr'));
  assert.ok(ids.includes('air_defense'));
  assert.ok(ids.includes('maritime_surface'));
  assert.ok(ids.includes('space_surveillance'));
  assert.ok(ids.includes('stealth_recon'));
});

test('calculatePresetLayerVisibility enables only air domain and overrides for air_defense', () => {
  const airPreset = OPERATIONAL_PRESETS.find((p) => p.id === 'air_defense');
  assert.ok(airPreset);

  const layerIds = ['flights', 'military', 'ais-live-vessels', 'satellites', 'military-installations'];
  const vis = calculatePresetLayerVisibility(airPreset, layerIds);

  assert.equal(vis.flights, true);
  assert.equal(vis.military, true);
  assert.equal(vis['military-installations'], true); // via override
  assert.equal(vis['ais-live-vessels'], false);
  assert.equal(vis.satellites, false);
});

test('calculateDomainSoloVisibility isolates only target domain layers', () => {
  const layerIds = ['flights', 'military', 'ais-live-vessels', 'satellites', 'earthquakes'];
  const spaceSolo = calculateDomainSoloVisibility(DOMAIN_CATEGORIES.SPACE, layerIds);

  assert.equal(spaceSolo.satellites, true);
  assert.equal(spaceSolo.flights, false);
  assert.equal(spaceSolo['ais-live-vessels'], false);
  assert.equal(spaceSolo.earthquakes, false);
});

test('invertVisibility flips all boolean layer flags', () => {
  const current = {
    flights: true,
    military: false,
    satellites: true,
  };
  const inverted = invertVisibility(current);

  assert.equal(inverted.flights, false);
  assert.equal(inverted.military, true);
  assert.equal(inverted.satellites, false);
});

test('validateCustomPreset validates required schema attributes', () => {
  assert.equal(validateCustomPreset(null).valid, false);
  assert.equal(validateCustomPreset({}).valid, false);
  assert.equal(validateCustomPreset({ id: 'test' }).valid, false); // missing label
  assert.equal(validateCustomPreset({ id: 'test', label: 'Test Preset' }).valid, true);

  assert.equal(
    validateCustomPreset({
      id: 'test',
      label: 'Test Preset',
      activeDomains: 'not an array',
    }).valid,
    false
  );
});

test('Custom preset storage functions persist, read, and delete correctly', () => {
  const mockStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
  };

  assert.deepEqual(loadCustomPresets(mockStorage), []);

  const custom = {
    id: 'my-custom-ops',
    label: 'Custom OPS',
    activeDomains: [DOMAIN_CATEGORIES.AIR, DOMAIN_CATEGORIES.SPACE],
    layerOverrides: { 'military-installations': true },
  };

  const saved = saveCustomPreset(custom, mockStorage);
  assert.equal(saved, true);

  const loaded = loadCustomPresets(mockStorage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'my-custom-ops');
  assert.equal(loaded[0].label, 'Custom OPS');

  const deleted = deleteCustomPreset('my-custom-ops', mockStorage);
  assert.equal(deleted, true);
  assert.deepEqual(loadCustomPresets(mockStorage), []);
});

test('applyPresetToDataManager updates dataManager layer states properly', () => {
  const calls = [];
  const mockDataManager = {
    layers: [
      { id: 'flights', enabled: false },
      { id: 'ais-live-vessels', enabled: true },
      { id: 'satellites', enabled: false },
    ],
    getLayer(id) {
      return this.layers.find((l) => l.id === id);
    },
    setLayerEnabled(layerId, enabled, meta) {
      calls.push({ layerId, enabled, meta });
      const layer = this.getLayer(layerId);
      if (layer) layer.enabled = enabled;
    },
  };

  const airPreset = OPERATIONAL_PRESETS.find((p) => p.id === 'air_defense');
  const count = applyPresetToDataManager(airPreset, mockDataManager);

  assert.ok(count >= 2);
  assert.equal(mockDataManager.getLayer('flights').enabled, true);
  assert.equal(mockDataManager.getLayer('ais-live-vessels').enabled, false);
});

test('applyBulkStateToDataManager toggles all layers cleanly', () => {
  const mockDataManager = {
    layers: [
      { id: 'flights', enabled: false },
      { id: 'ais-live-vessels', enabled: false },
    ],
    setLayerEnabled(layerId, enabled) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (layer) layer.enabled = enabled;
    },
  };

  const count = applyBulkStateToDataManager(true, mockDataManager);
  assert.equal(count, 2);
  assert.equal(mockDataManager.layers[0].enabled, true);
  assert.equal(mockDataManager.layers[1].enabled, true);

  const turnOffCount = applyBulkStateToDataManager(false, mockDataManager);
  assert.equal(turnOffCount, 2);
  assert.equal(mockDataManager.layers[0].enabled, false);
  assert.equal(mockDataManager.layers[1].enabled, false);
});

test('applyBulkStateToDataManager and applyInvertToDataManager work with Map-based DataManager and setEnabled', () => {
  const mapData = new Map([
    ['flights', { enabled: true }],
    ['satellites', { enabled: false }]
  ]);

  const mockRealDataManager = {
    layers: mapData,
    isEnabled(id) {
      return Boolean(this.layers.get(id)?.enabled);
    },
    setEnabled(id, shouldEnable) {
      const entry = this.layers.get(id);
      if (entry) entry.enabled = shouldEnable;
    },
    getAll() {
      return Array.from(this.layers.entries()).map(([id, entry]) => ({ id, enabled: entry.enabled }));
    }
  };

  // Test ALL OFF
  const offCount = applyBulkStateToDataManager(false, mockRealDataManager);
  assert.equal(offCount, 1);
  assert.equal(mockRealDataManager.isEnabled('flights'), false);
  assert.equal(mockRealDataManager.isEnabled('satellites'), false);

  // Test INVERT
  applyInvertToDataManager(mockRealDataManager);
  assert.equal(mockRealDataManager.isEnabled('flights'), true);
  assert.equal(mockRealDataManager.isEnabled('satellites'), true);
});
