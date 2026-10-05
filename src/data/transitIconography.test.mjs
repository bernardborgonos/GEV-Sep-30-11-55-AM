import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrainBillboardImage,
  getStationBillboardImage,
  normalizeCategory,
  getCategoryColor,
  getCategoryEmoji,
  getCategoryBillboardImage,
} from './urlLayerIcons.js';
import { isTrainVehicle, isStationPoint } from './urlIntelligence.js';

test('Transit Iconography - Category Normalization & Emoji Registry', () => {
  assert.equal(normalizeCategory('train'), 'Train');
  assert.equal(normalizeCategory('mrt-3'), 'Train');
  assert.equal(normalizeCategory('lrt1'), 'Train');
  assert.equal(normalizeCategory('emu'), 'Train');
  assert.equal(normalizeCategory('station'), 'Train Station');
  assert.equal(normalizeCategory('rail_station'), 'Train Station');
  assert.equal(normalizeCategory('subway'), 'Train Station');
  assert.equal(normalizeCategory('transit hub'), 'Transit Hub');

  assert.equal(getCategoryEmoji('Train'), '🚆');
  assert.equal(getCategoryEmoji('Train Station'), '🚉');
  assert.equal(getCategoryEmoji('Transit Hub'), '🚊');

  assert.equal(getCategoryColor('Train'), '#00e5ff');
  assert.equal(getCategoryColor('Train Station'), '#a855f7');
  assert.equal(getCategoryColor('Transit Hub'), '#38bdf8');
});

test('Transit Iconography - Train Vector SVG Billboard Generation', () => {
  // Test LRT-1 Line styling
  const lrt1Img = getTrainBillboardImage({ lineId: 'LRT-1', isSelected: false });
  assert.ok(lrt1Img.startsWith('data:image/svg+xml;base64,'), 'Should return valid base64 data URI');
  const lrt1Svg = atob(lrt1Img.split(',')[1]);
  assert.ok(lrt1Svg.includes('#facc15'), 'LRT-1 should carry distinctive yellow livery theme');
  assert.ok(lrt1Svg.includes('Pantograph'), 'SVG should contain overhead pantograph element');

  // Test MRT-3 Line styling
  const mrt3Img = getTrainBillboardImage({ lineId: 'MRT-3', isSelected: true });
  const mrt3Svg = atob(mrt3Img.split(',')[1]);
  assert.ok(mrt3Svg.includes('#00e5ff'), 'MRT-3 should carry distinctive cyan theme');
  assert.ok(mrt3Svg.includes('headlight-beam'), 'Should render Xenon dual headlight beams');

  // Test Dwell / Stopped state
  const dwellImg = getTrainBillboardImage({ lineId: 'LRT-2', isDwell: true });
  const dwellSvg = atob(dwellImg.split(',')[1]);
  assert.ok(dwellSvg.includes('#f59e0b'), 'Dwell state should display amber dwell stop glow');
});

test('Transit Iconography - Station Vector SVG Billboard Generation', () => {
  // Regular station
  const stationImg = getStationBillboardImage({ lineId: 'MRT-3', isSelected: false });
  assert.ok(stationImg.startsWith('data:image/svg+xml;base64,'), 'Should return valid base64 data URI');
  const stationSvg = atob(stationImg.split(',')[1]);
  assert.ok(stationSvg.includes('Elevated Twin Railway Tracks'), 'Station should contain railway tracks');
  assert.ok(stationSvg.includes('44'), 'Station canvas viewBox dimension');

  // Interchange station
  const interchangeImg = getStationBillboardImage({ isInterchange: true, isSelected: true });
  const interchangeSvg = atob(interchangeImg.split(',')[1]);
  assert.ok(interchangeSvg.includes('polygon'), 'Interchange should have interchange symbol');
  assert.ok(interchangeSvg.includes('#fbbf24'), 'Interchange should display amber interchange indicator');
});

test('Transit Entity Classification Helpers', () => {
  assert.equal(isTrainVehicle({ vehicleId: 'LRT2_EMU_01' }), true);
  assert.equal(isTrainVehicle({ displayName: 'MRT-3 Train Set 04' }), true);
  assert.equal(isTrainVehicle({ vehicleType: 'transit_telemetry' }), true);
  assert.equal(isTrainVehicle({ vehicleId: 'FLEET_TRUCK_88' }), false);

  assert.equal(isStationPoint({ category: 'Train Station', name: 'Cubao' }), true);
  assert.equal(isStationPoint({ category: 'rail_station', name: 'Monumento' }), true);
  assert.equal(isStationPoint({ category: 'Commercial', name: 'SM Mall' }), false);
});
