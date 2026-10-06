import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoord, getCameraCenterCoordinate, drawRangeRingOnGlobe } from './rangeRingWorkbenchModal.js';

test('parseCoord normalizes diverse coordinate representations accurately', () => {
  // Array [lon, lat, alt]
  const c1 = parseCoord([-122.4194, 37.7749, 10]);
  assert.equal(c1.lng, -122.4194);
  assert.equal(c1.lat, 37.7749);
  assert.equal(c1.alt, 10);

  // Object { lng, lat }
  const c2 = parseCoord({ lng: '-122.4', lat: '37.8' });
  assert.equal(c2.lng, -122.4);
  assert.equal(c2.lat, 37.8);

  // Object { lon, lat }
  const c3 = parseCoord({ lon: -122.5, lat: 37.9 });
  assert.equal(c3.lng, -122.5);
  assert.equal(c3.lat, 37.9);

  // Object { longitude, latitude }
  const c4 = parseCoord({ longitude: -122.6, latitude: 38.0 });
  assert.equal(c4.lng, -122.6);
  assert.equal(c4.lat, 38.0);

  // Null/empty
  const c5 = parseCoord(null);
  assert.equal(c5.lng, 0);
  assert.equal(c5.lat, 0);
  assert.equal(c5.alt, 0);
});

test('drawRangeRingOnGlobe creates range ring data with disableDepthTestDistance set', () => {
  // Mock Cesium globally
  globalThis.Cesium = {
    Color: {
      WHITE: 'WHITE',
      BLACK: 'BLACK',
      fromCssColorString: (hex) => ({
        hex,
        withAlpha: (a) => ({ hex, alpha: a }),
      }),
    },
    Cartesian2: class Cartesian2 {
      constructor(x, y) { this.x = x; this.y = y; }
    },
    Cartesian3: {
      fromDegrees: (lon, lat, alt = 0) => ({ lon, lat, alt }),
    },
    HeightReference: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
    LabelStyle: { FILL_AND_OUTLINE: 'FILL_AND_OUTLINE' },
    Math: {
      toRadians: (deg) => (deg * Math.PI) / 180,
    },
  };

  const addedEntities = [];
  const mockViewer = {
    entities: {
      add: (ent) => {
        addedEntities.push(ent);
        return ent;
      },
      removeById: () => {},
    },
    camera: {
      flyTo: () => {},
    },
  };

  const ring = drawRangeRingOnGlobe(mockViewer, {
    center: { lng: -122.4194, lat: 37.7749 },
    radiusMeters: 5000,
    color: '#00e5ff',
    strokeWidth: 3,
  });

  assert.ok(ring);
  assert.equal(ring.radiusMeters, 5000);
  assert.equal(ring.radiusKm, 5);
  assert.equal(ring.entities.length, 3);

  // Verify point and label in center entity have disableDepthTestDistance: Number.POSITIVE_INFINITY
  const pointLabelEntity = ring.entities[2];
  assert.ok(pointLabelEntity.point);
  assert.equal(pointLabelEntity.point.disableDepthTestDistance, Number.POSITIVE_INFINITY);

  assert.ok(pointLabelEntity.label);
  assert.equal(pointLabelEntity.label.disableDepthTestDistance, Number.POSITIVE_INFINITY);

  delete globalThis.Cesium;
});

test('getCameraCenterCoordinate safely degrades without active viewer', () => {
  const coords = getCameraCenterCoordinate(null);
  assert.equal(coords.lat, 37.7749);
  assert.equal(coords.lng, -122.4194);
});
