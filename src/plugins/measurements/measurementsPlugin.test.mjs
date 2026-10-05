import test from 'node:test';
import assert from 'node:assert/strict';
import { MeasurePlugin, MEASUREMENT_TYPES } from './measurementsPlugin.js';

test('MeasurePlugin instantiates cleanly with required methods', () => {
  const plugin = new MeasurePlugin();
  assert.ok(plugin);
  assert.equal(plugin.id, 'measurements');
  assert.equal(typeof plugin.armPickingSession, 'function');
  assert.equal(typeof plugin.abortPickingSession, 'function');
  assert.equal(typeof plugin.startInteractiveMeasurement, 'function');
  assert.equal(typeof plugin.cancelActiveSession, 'function');
  assert.equal(typeof plugin.clearAllMeasurements, 'function');
  assert.equal(typeof plugin.addDraftEntity, 'function');
  assert.equal(typeof plugin.clearDraftEntities, 'function');
  assert.equal(typeof plugin.addCreatedEntity, 'function');
  assert.equal(typeof plugin.clearAllCreatedEntities, 'function');
});

test('startInteractiveMeasurement invokes armPickingSession without throwing TypeError', () => {
  const plugin = new MeasurePlugin();

  let armedWith = null;
  plugin.armPickingSession = (options) => {
    armedWith = options;
    return {};
  };

  // 1. Distance measurement
  plugin.startInteractiveMeasurement(MEASUREMENT_TYPES.DISTANCE);
  assert.ok(armedWith);
  assert.equal(typeof armedWith.onLeftClick, 'function');
  assert.equal(typeof armedWith.onMouseMove, 'function');
  assert.equal(typeof armedWith.onRightClick, 'function');

  // 2. Area measurement
  armedWith = null;
  plugin.startInteractiveMeasurement(MEASUREMENT_TYPES.AREA);
  assert.ok(armedWith);
  assert.equal(typeof armedWith.onLeftClick, 'function');
  assert.equal(typeof armedWith.onMouseMove, 'function');
  assert.equal(typeof armedWith.onDoubleClick, 'function');

  // 3. Cleanup
  plugin.clearAllMeasurements();
});

test('armPickingSession returns null safely when viewer has no scene canvas', () => {
  const plugin = new MeasurePlugin();
  const res = plugin.armPickingSession({ cursor: 'crosshair' });
  assert.equal(res, null);
});
