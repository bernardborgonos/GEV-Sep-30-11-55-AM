import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHandleCentroid,
  restoreCameraControlState,
  setCameraControlState,
  snapshotCameraControlState,
  translateCoordinates,
  updateVertexCoordinate,
} from './mapItemDragHelpers.js';

test('translateCoordinates shifts every vertex by one shared delta while preserving altitude', () => {
  const source = [
    { lng: 120.9842, lat: 14.5995, alt: 35 },
    { lng: 121.05, lat: 14.65, alt: 80 },
    { lng: 121.02, lat: 14.7, alt: 120 },
  ];
  const shifted = translateCoordinates(source, 0.25, -0.1);

  assert.ok(Math.abs(shifted[0].lng - 121.2342) < 1e-9);
  assert.ok(Math.abs(shifted[0].lat - 14.4995) < 1e-9);
  assert.equal(shifted[0].alt, 35);
  assert.deepEqual(shifted.slice(1), [
    { lng: 121.3, lat: 14.55, alt: 80 },
    { lng: 121.27, lat: 14.6, alt: 120 },
  ]);
  assert.deepEqual(source[0], { lng: 120.9842, lat: 14.5995, alt: 35 });
});

test('updateVertexCoordinate only updates the selected vertex', () => {
  const source = [
    { lng: 0, lat: 0, alt: 10 },
    { lng: 1, lat: 1, alt: 20 },
    { lng: 2, lat: 2, alt: 30 },
  ];
  const updated = updateVertexCoordinate(source, 1, { lng: 10, lat: 9, alt: 99 });
  assert.deepEqual(updated, [
    { lng: 0, lat: 0, alt: 10 },
    { lng: 10, lat: 9, alt: 99 },
    { lng: 2, lat: 2, alt: 30 },
  ]);
  assert.deepEqual(source[1], { lng: 1, lat: 1, alt: 20 });
});

test('camera control snapshot and restore preserve prior lock values', () => {
  const controller = {
    enableRotate: true,
    enableTranslate: false,
    enableZoom: true,
    enableTilt: false,
    enableLook: true,
  };
  const snapshot = snapshotCameraControlState(controller);
  setCameraControlState(controller, false);
  assert.deepEqual(controller, {
    enableRotate: false,
    enableTranslate: false,
    enableZoom: false,
    enableTilt: false,
    enableLook: false,
  });
  restoreCameraControlState(controller, snapshot);
  assert.deepEqual(controller, {
    enableRotate: true,
    enableTranslate: false,
    enableZoom: true,
    enableTilt: false,
    enableLook: true,
  });
});

test('computeHandleCentroid derives center and averaged altitude', () => {
  const centroid = computeHandleCentroid([
    { lng: 120, lat: 14, alt: 10 },
    { lng: 121, lat: 14, alt: 30 },
    { lng: 121, lat: 15, alt: 50 },
  ]);
  assert.ok(centroid);
  assert.ok(Number.isFinite(centroid.lng));
  assert.ok(Number.isFinite(centroid.lat));
  assert.equal(centroid.alt, 30);
});
