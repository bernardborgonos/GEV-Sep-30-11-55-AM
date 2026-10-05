import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  accentForVesselType,
  applyVesselOverlayPolicy,
  getVesselCategory,
  normalizeVesselType,
  vesselOverlayCohortLimit,
  vesselTypeCss,
} from './vesselLabels.js';

test('getVesselCategory classifies numeric AIS codes and text types', () => {
  assert.equal(getVesselCategory('71'), 'cargo');
  assert.equal(getVesselCategory('Container Ship'), 'cargo');
  assert.equal(getVesselCategory('Bulk Carrier'), 'cargo');
  assert.equal(getVesselCategory('33'), 'cargo'); // dredger
  assert.equal(getVesselCategory('84'), 'tanker');
  assert.equal(getVesselCategory('Crude Oil Tanker'), 'tanker');
  assert.equal(getVesselCategory('60'), 'passenger');
  assert.equal(getVesselCategory('Passenger/Ferry'), 'passenger');
  assert.equal(getVesselCategory('30'), 'fishing');
  assert.equal(getVesselCategory('Trawler'), 'fishing');
  assert.equal(getVesselCategory('52'), 'tug');
  assert.equal(getVesselCategory('Tug'), 'tug');
  assert.equal(getVesselCategory('50'), 'tug'); // pilot
  assert.equal(getVesselCategory('51'), 'tug'); // SAR
  assert.equal(getVesselCategory('35'), 'military');
  assert.equal(getVesselCategory('Coast Guard Patrol'), 'military');
  assert.equal(getVesselCategory('36'), 'pleasure'); // sailing
  assert.equal(getVesselCategory('37'), 'pleasure');
  assert.equal(getVesselCategory('Sailing Yacht'), 'pleasure');
  assert.equal(getVesselCategory('40'), 'high-speed');
  assert.equal(getVesselCategory('Catamaran Fast Ferry'), 'high-speed');
  assert.equal(getVesselCategory('90'), 'vessel');
  assert.equal(getVesselCategory(''), 'vessel');
  assert.equal(getVesselCategory(undefined), 'vessel');
});

test('normalizeVesselType maps numeric AIS codes to type families', () => {
  assert.equal(normalizeVesselType('30'), 'FISHING');
  assert.equal(normalizeVesselType('31'), 'TOWING');
  assert.equal(normalizeVesselType('35'), 'MILITARY');
  assert.equal(normalizeVesselType('36'), 'SAILING');
  assert.equal(normalizeVesselType('37'), 'PLEASURE');
  assert.equal(normalizeVesselType('40'), 'HIGH-SPEED');
  assert.equal(normalizeVesselType('50'), 'PILOT');
  assert.equal(normalizeVesselType('51'), 'SAR');
  assert.equal(normalizeVesselType('52'), 'TUG');
  assert.equal(normalizeVesselType('60'), 'PASSENGER');
  assert.equal(normalizeVesselType('71'), 'CARGO');
  assert.equal(normalizeVesselType('84'), 'TANKER');
  assert.equal(normalizeVesselType('90'), 'OTHER');
});

test('normalizeVesselType preserves text and degrades unknown codes', () => {
  assert.equal(normalizeVesselType('Crude Oil Tanker'), 'Crude Oil Tanker');
  assert.equal(normalizeVesselType('0'), '');
  assert.equal(normalizeVesselType('25'), 'OTHER');
  assert.equal(normalizeVesselType(undefined), '');
});

test('vessel type CSS and card accents stay paired', () => {
  assert.equal(vesselTypeCss('Crude Oil Tanker'), '#ffb347');
  assert.equal(vesselTypeCss('Container Ship'), '#39d5ff');
  assert.equal(vesselTypeCss('Passenger/Ferry'), '#ff7adf');
  assert.equal(vesselTypeCss('Fishing'), '#7cff9b');
  assert.equal(vesselTypeCss('Tug'), '#f7f0a3');
  assert.equal(accentForVesselType('Tanker'), '255, 179, 71');
  assert.equal(accentForVesselType('Cargo'), '57, 213, 255');
  assert.equal(accentForVesselType('Passenger'), '255, 122, 223');
  assert.equal(accentForVesselType('Fishing'), '124, 255, 155');
  assert.equal(accentForVesselType('Pilot Vessel'), '247, 240, 163');
  assert.equal(accentForVesselType('Dredger'), '57, 213, 255');
  assert.equal(accentForVesselType('84'), '255, 179, 71');
  assert.equal(vesselTypeCss('62'), '#ff7adf');
});

test('vessel viewport cohort preserves the shipped 118px grid density', () => {
  assert.equal(vesselOverlayCohortLimit(1600, 900), 112);
  assert.equal(vesselOverlayCohortLimit(1920, 1080), 170);
  assert.equal(vesselOverlayCohortLimit(1920, 1080, 80), 80);
  assert.equal(vesselOverlayCohortLimit(10000, 10000), 900, 'the shipped row ceiling remains absolute');
  assert.equal(vesselOverlayCohortLimit(0, 1080), 0);
  assert.equal(vesselOverlayCohortLimit(1920, 1080, 0), 0);
});

test('vessel host policy uses always-on shared fade and protected selected lane', () => {
  const position = { x: 1, y: 2, z: 3 };
  const ambient = applyVesselOverlayPolicy({
    id: 'vessel:1', position, title: 'AMBIENT', gapPx: 10, selected: false,
  });
  assert.equal(ambient.variant, 'card');
  assert.equal(ambient.protected, false);
  assert.equal(ambient.collisionGroup, 'ambient-card');
  assert.equal(ambient.edgeFade, 'keyhole');
  assert.equal(ambient.maxDistance, 5_000_000);
  assert.equal(ambient.distanceFadeStartRatio, 0.7);
  assert.equal(ambient.cardStyle, 'tactical');
  assert.equal(ambient.verticalOnly, true);

  const selected = applyVesselOverlayPolicy({
    id: 'vessel:2', position, title: 'SELECTED', gapPx: 12, selected: true,
  });
  assert.equal(selected.variant, 'selected');
  assert.equal(selected.protected, true);
  assert.equal(selected.collisionGroup, 'ambient-card');
  assert.equal(selected.maxDistance, Number.POSITIVE_INFINITY);
});

test('vesselLabels cannot resurrect a dedicated renderer', async () => {
  const source = await readFile(new URL('./vesselLabels.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'document.createElement',
    "createElement('canvas')",
    'postRender.addEventListener',
    'worldToWindowCoordinates',
    'requestAnimationFrame',
    "id = 'vessel-labels'",
  ]) {
    assert.equal(source.includes(forbidden), false, `dedicated renderer token returned: ${forbidden}`);
  }
});
