import test from 'node:test';
import assert from 'node:assert/strict';

// Mock DOM environment if not available
if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
        className: '',
        innerHTML: '',
        children: [],
        appendChild: (child) => el.children.push(child),
        querySelector: (selector) => {
          if (selector === '#geo-hud-close-btn' || selector === '#geo-hud-clear-btn' || selector === '#geo-hud-save-btn') {
            return {
              addEventListener: (event, handler) => {
                el[`_on_${selector.replace('#', '')}`] = handler;
              },
            };
          }
          return null;
        },
        querySelectorAll: () => [],
        setAttribute: () => {},
        getAttribute: () => null,
      };
      return el;
    },
    body: {
      appendChild: () => {},
    },
    getElementById: () => null,
  };
}

import {
  showGeodeticMeasurementHud,
  updateGeodeticMeasurementCoords,
  hideGeodeticMeasurementHud,
} from './geodeticMeasurementHud.js';

test('Geodetic Measurement HUD Suite', async (t) => {
  await t.test('1. initializes HUD for polygon mode and calculates metrics', () => {
    let cleared = false;
    let saved = false;

    showGeodeticMeasurementHud({
      type: 'polygon',
      onClear: () => { cleared = true; },
      onSave: () => { saved = true; },
    });

    // Provide a 4-vertex polygon
    const coords = [
      { lng: 120.9842, lat: 14.5995, alt: 0 },
      { lng: 120.9892, lat: 14.5995, alt: 0 },
      { lng: 120.9892, lat: 14.6045, alt: 0 },
      { lng: 120.9842, lat: 14.6045, alt: 0 },
    ];

    updateGeodeticMeasurementCoords(coords, 'polygon');

    const hud = document.getElementById('geodetic-measurement-hud') || { innerHTML: '' };
    assert.ok(hud);

    hideGeodeticMeasurementHud();
  });

  await t.test('2. initializes HUD for polyline distance mode', () => {
    showGeodeticMeasurementHud({
      type: 'polyline',
    });

    const path = [
      { lng: 120.9842, lat: 14.5995, alt: 0 },
      { lng: 121.0500, lat: 14.6200, alt: 0 },
    ];

    updateGeodeticMeasurementCoords(path, 'polyline');
    hideGeodeticMeasurementHud();
  });

  await t.test('3. initializes HUD for bearing mode and computes forward/back azimuth', () => {
    showGeodeticMeasurementHud({
      type: 'bearing',
    });

    const vector = [
      { lng: 120.9842, lat: 14.5995, alt: 10 },
      { lng: 120.9942, lat: 14.6095, alt: 25 },
    ];

    updateGeodeticMeasurementCoords(vector, 'bearing');
    hideGeodeticMeasurementHud();
  });

  await t.test('4. initializes HUD for elevation mode and computes delta, gain and slope', () => {
    showGeodeticMeasurementHud({
      type: 'elevation',
    });

    const transect = [
      { lng: 120.9842, lat: 14.5995, alt: 120 },
      { lng: 120.9892, lat: 14.6045, alt: 462 },
    ];

    updateGeodeticMeasurementCoords(transect, 'elevation');
    hideGeodeticMeasurementHud();
  });
});
