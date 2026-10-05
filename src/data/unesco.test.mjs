import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import unescoLayer, {
  UNESCO_LAYER_ID,
  UNESCO_SELECTED_OVERLAY_SOURCE_ID,
  createUnescoSelectedOverlayEntry,
} from './unesco.js';
import {
  UNESCO_BENCHMARK_COUNTRIES,
  UNESCO_INDICATORS,
  UNESCO_INDICATOR_CONFIG,
  lookupUnescoCountry,
} from './fixtures/unescoData.js';
import { normalizeRegionalUnesco } from './regionalBrief.js';

test('UNESCO benchmark dataset contains expected high-coverage indicator records', () => {
  assert.ok(UNESCO_BENCHMARK_COUNTRIES.length >= 50, 'Benchmark covers at least 50 global nations');
  const usa = lookupUnescoCountry('USA');
  assert.ok(usa, 'USA lookup succeeded');
  assert.equal(usa.id, 'USA');
  assert.equal(usa.code2, 'US');
  assert.ok(usa.gerd > 3.0, 'USA GERD is expected > 3.0% GDP');
  assert.ok(usa.researchers > 4000, 'USA researchers/million is expected > 4000');
  assert.ok(usa.tertiary > 75, 'USA tertiary enrolment is expected > 75%');
  assert.ok(usa.education > 4.0, 'USA education expenditure is expected > 4.0%');
});

test('lookupUnescoCountry handles ISO-2, ISO-3, and common country names', () => {
  const deByCode3 = lookupUnescoCountry('DEU');
  const deByCode2 = lookupUnescoCountry('DE');
  const deByName = lookupUnescoCountry('Germany');
  assert.ok(deByCode3 && deByCode2 && deByName);
  assert.equal(deByCode3.id, 'DEU');
  assert.equal(deByCode2.id, 'DEU');
  assert.equal(deByName.id, 'DEU');

  const phByCode2 = lookupUnescoCountry('PH');
  assert.ok(phByCode2);
  assert.equal(phByCode2.id, 'PHL');
});

test('UNESCO indicator tier configurations provide valid colors and formatters', () => {
  for (const [key, cfg] of Object.entries(UNESCO_INDICATOR_CONFIG)) {
    assert.ok(cfg.label, `Config for ${key} has label`);
    assert.ok(typeof cfg.format === 'function', `Config for ${key} has format function`);
    assert.ok(typeof cfg.getColor === 'function', `Config for ${key} has getColor function`);
    assert.ok(Array.isArray(cfg.tiers), `Config for ${key} has tiers array`);

    const sampleColor = cfg.getColor(2.5);
    assert.match(sampleColor, /^#[0-9a-fA-F]{6}$/, `Color for ${key} returns valid hex`);
  }
});

test('createUnescoSelectedOverlayEntry generates structured HUD card payload', () => {
  const country = lookupUnescoCountry('KOR');
  const pos = Cesium.Cartesian3.fromDegrees(country.lon, country.lat, 1000);
  const entry = createUnescoSelectedOverlayEntry('KOR', country, pos);

  assert.ok(entry);
  assert.equal(entry.id, 'unesco:KOR');
  assert.equal(entry.variant, 'selected');
  assert.ok(entry.title.includes('KOREA') || entry.title.includes('KOR'));
  assert.ok(entry.details.some((d) => d.includes('R&D EXPENDITURE')));
  assert.ok(entry.details.some((d) => d.includes('RESEARCHERS')));
  assert.ok(entry.details.some((d) => d.includes('TERTIARY ENROLMENT')));
  assert.ok(entry.details.some((d) => d.includes('UNESCO UIS')));
});

test('normalizeRegionalUnesco formats payload for cockpit HUD', () => {
  const normalized = normalizeRegionalUnesco({
    id: 'FRA',
    name: 'France',
    gerd: 2.22,
    researchers: 5042.8,
    tertiary: 71.3,
    education: 5.4,
  });

  assert.equal(normalized.countryCode, 'FRA');
  assert.equal(normalized.country, 'France');
  assert.equal(normalized.gerd, 2.22);
  assert.equal(normalized.researchers, 5043);
  assert.equal(normalized.tertiary, 71.3);
  assert.equal(normalized.education, 5.4);
});

test('unescoLayer lifecycle and row controls work correctly', () => {
  assert.equal(unescoLayer.id, UNESCO_LAYER_ID);
  assert.equal(unescoLayer.name, 'UNESCO Science & Education');
  assert.equal(unescoLayer.source, 'UNESCO UIS');

  const controls = unescoLayer.getRowControls();
  assert.ok(Array.isArray(controls.chips));
  assert.equal(controls.chips.length, 4);
  assert.ok(controls.chips.find((c) => c.id === 'gerd')?.active);

  // Test setParams metric switching
  unescoLayer.setParams({ metric: UNESCO_INDICATORS.RESEARCHERS });
  const updatedControls = unescoLayer.getRowControls();
  assert.ok(updatedControls.chips.find((c) => c.id === 'researchers')?.active);
  assert.equal(unescoLayer.getParams().metric, 'researchers');

  // Reset to default
  unescoLayer.setParams({ metric: UNESCO_INDICATORS.GERD });
  assert.equal(unescoLayer.getParams().metric, 'gerd');
});
