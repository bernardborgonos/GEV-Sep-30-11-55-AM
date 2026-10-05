import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import rentalsLayer, {
  RENTALS_SELECTED_OVERLAY_SOURCE_ID,
  RENTALS_SELECTED_OVERLAY_SOURCE_OPTIONS,
  _clearSelectionForTest,
  _selectRentalForTest,
  _setRentalsOverlayHostForTest,
  _setRentalsSelectionStateForTest,
  buildRentalSelectionLabel,
  createRentalsSelectedOverlayEntry,
  getRentalColor,
} from './rentals.js';

function makeRentalRecord() {
  return {
    id: 'abnb-test-101',
    listing: {
      id: 'abnb-test-101',
      name: 'Downtown Skyline Penthouse',
      room_type: 'Entire home/apt',
      property_type: 'Condo',
      price: 220,
      accommodates: 4,
      bedrooms: 2,
      bathrooms: 2,
      rating: 4.95,
      reviews_count: 140,
      host_name: 'Jessica & Alan',
      host_is_superhost: true,
      listing_url: 'https://www.airbnb.com/rooms/999999',
    },
    point: {
      position: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 4),
      show: true,
    },
  };
}

test('getRentalColor maps room types to distinct signature palettes', () => {
  const entireColor = getRentalColor('Entire home/apt');
  const privateColor = getRentalColor('Private room');
  const sharedColor = getRentalColor('Shared room');

  assert.ok(entireColor instanceof Cesium.Color);
  assert.ok(privateColor instanceof Cesium.Color);
  assert.ok(sharedColor instanceof Cesium.Color);

  assert.notDeepEqual(entireColor, privateColor);
});

test('buildRentalSelectionLabel constructs formatted multi-line summary', () => {
  const record = makeRentalRecord();
  const label = buildRentalSelectionLabel(record.listing);

  assert.ok(label.includes('Downtown Skyline Penthouse'));
  assert.ok(label.includes('$220/night'));
  assert.ok(label.includes('⭐ 4.95'));
  assert.ok(label.includes('(140 reviews)'));
  assert.ok(label.includes('👥 Up to 4 guests'));
  assert.ok(label.includes('Superhost'));
});

test('createRentalsSelectedOverlayEntry formats tactical HUD overlay card', () => {
  const record = makeRentalRecord();
  const entry = createRentalsSelectedOverlayEntry('abnb-test-101', record);

  assert.equal(entry.id, 'abnb-test-101');
  assert.equal(entry.position, record.point.position);
  assert.equal(entry.variant, 'selected');
  assert.equal(entry.selected, true);
  assert.equal(entry.protected, true);
  assert.equal(entry.paintLane, 'selected');
  assert.equal(entry.title, 'Downtown Skyline Penthouse');
  assert.ok(entry.details.length >= 1);
  assert.equal(entry.accent, '#FF5A5F');
});

test('selection and clear path manages entity and overlay card', () => {
  const calls = [];
  const overlayHost = {
    setEntries: (...args) => calls.push(['entries', ...args]),
    setVisible: (...args) => calls.push(['visible', ...args]),
    clearSource: (...args) => calls.push(['clear', ...args]),
  };

  const key = 'abnb-test-101';
  const record = makeRentalRecord();
  const viewer = { entities: new Cesium.EntityCollection() };

  _setRentalsSelectionStateForTest({ viewer, key, record, overlayHost });

  try {
    _selectRentalForTest(key);
    assert.equal(record.point.show, false, 'Base point hidden during selection highlight');
    assert.equal(viewer.entities.values.length, 1, 'Selection highlight entity added');

    const entryCall = calls.find((c) => c[0] === 'entries');
    assert.ok(entryCall, 'Overlay host received entry');
    assert.equal(entryCall[1], RENTALS_SELECTED_OVERLAY_SOURCE_ID);
    assert.equal(entryCall[2][0].id, key);

    _clearSelectionForTest();
    assert.equal(record.point.show, true, 'Base point restored on clear');
    assert.equal(viewer.entities.values.length, 0, 'Selection highlight entity removed');

    const clearCall = calls.find((c) => c[0] === 'clear');
    assert.ok(clearCall, 'Overlay host cleared');
  } finally {
    _setRentalsOverlayHostForTest(null);
  }
});

test('rentalsLayer parameters and row controls conform to dataManager contract', () => {
  let controlRefreshed = false;
  rentalsLayer.setRowControlsListener(() => {
    controlRefreshed = true;
  });

  const initialParams = rentalsLayer.getParams();
  assert.equal(initialParams.roomType, 'all');

  rentalsLayer.setParams({ roomType: 'entire' });
  assert.equal(rentalsLayer.getParams().roomType, 'entire');

  const controls = rentalsLayer.getRowControls();
  assert.ok(Array.isArray(controls.chips));
  assert.ok(Array.isArray(controls.legend));
  assert.equal(controls.chips.length, 3);
  assert.equal(controls.chips.find((c) => c.id === 'entire').active, true);
  assert.equal(controls.chips.find((c) => c.id === 'all').active, false);

  rentalsLayer.setParams({ roomType: 'all' });
});

test('rentalsLayer stats report expected metadata structure', () => {
  const stats = rentalsLayer.getStats();
  assert.ok(typeof stats === 'object');
  assert.ok('count' in stats);
  assert.ok('lastUpdate' in stats);
  assert.ok('loading' in stats);
});
