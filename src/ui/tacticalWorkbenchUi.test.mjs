import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGlobeCenterCoordinates,
  TACTICAL_COLORS,
  TacticalWorkbenchUi,
} from './tacticalWorkbenchUi.js';
import { MapToolsEngine, FEATURE_TYPES } from '../tools/mapToolsEngine.js';

test('Tactical Workbench UI Unit Tests', async (t) => {
  await t.test('2.1: getGlobeCenterCoordinates provides stable fallback when viewer unattached', () => {
    const coords = getGlobeCenterCoordinates(null);
    assert.ok(Number.isFinite(coords.lon));
    assert.ok(Number.isFinite(coords.lat));
    assert.equal(coords.lon, 120.9842);
    assert.equal(coords.lat, 14.5995);
  });

  await t.test('2.2: TACTICAL_COLORS contains standard defense HUD colors', () => {
    assert.ok(Array.isArray(TACTICAL_COLORS));
    assert.ok(TACTICAL_COLORS.some((c) => c.hex === '#00e5ff'));
    assert.ok(TACTICAL_COLORS.some((c) => c.hex === '#ef4444'));
  });

  await t.test('2.3: TacticalWorkbenchUi initializes in mock DOM and updates counts', () => {
    // Mock minimal DOM host element
    const host = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };

    const engine = new MapToolsEngine({ syncWindowEvents: false });
    engine.createFeature({
      name: 'Alpha Fort',
      type: FEATURE_TYPES.POINT,
      coordinates: [120.9, 14.5],
    });

    const ui = new TacticalWorkbenchUi(host, { engine });
    assert.equal(ui.engine.getAllFeatures().length, 1);
  });
});
