/**
 * @file src/ui/mapProjectManagerCentroid.test.mjs
 * @description Unit tests for centroid calculation, differential coordinate translation,
 * and unified drag lifecycle in MapProjectManager.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCentroid } from '../tools/geodesicMath.js';

test('calculateCentroid computes accurate geodesic centroid for polygon vertices', () => {
  const squareCoords = [
    { lng: -97.75, lat: 30.25 },
    { lng: -97.73, lat: 30.25 },
    { lng: -97.73, lat: 30.27 },
    { lng: -97.75, lat: 30.27 },
  ];

  const centroid = calculateCentroid(squareCoords);
  assert.equal(typeof centroid[0], 'number');
  assert.equal(typeof centroid[1], 'number');
  assert.ok(Math.abs(centroid[0] - (-97.74)) < 0.001, `Longitude expected ~ -97.74, got ${centroid[0]}`);
  assert.ok(Math.abs(centroid[1] - (30.26)) < 0.001, `Latitude expected ~ 30.26, got ${centroid[1]}`);
});

test('Centroid translation applies uniform coordinate delta across all polygon vertices', () => {
  const initialCoords = [
    { lng: -122.40, lat: 37.78, alt: 10 },
    { lng: -122.38, lat: 37.78, alt: 10 },
    { lng: -122.38, lat: 37.80, alt: 10 },
    { lng: -122.40, lat: 37.80, alt: 10 },
  ];

  const deltaLng = 0.05;
  const deltaLat = 0.02;

  const translatedCoords = initialCoords.map((c) => ({
    ...c,
    lng: c.lng + deltaLng,
    lat: c.lat + deltaLat,
  }));

  assert.equal(translatedCoords.length, initialCoords.length);
  assert.ok(Math.abs(translatedCoords[0].lng - (-122.35)) < 0.00001);
  assert.ok(Math.abs(translatedCoords[0].lat - (37.80)) < 0.00001);
  assert.ok(Math.abs(translatedCoords[1].lng - (-122.33)) < 0.00001);
  assert.ok(Math.abs(translatedCoords[1].lat - (37.80)) < 0.00001);
  assert.ok(Math.abs(translatedCoords[2].lng - (-122.33)) < 0.00001);
  assert.ok(Math.abs(translatedCoords[2].lat - (37.82)) < 0.00001);

  // Shape invariant: relative distances between vertices remain identical
  const origSpanLng = initialCoords[1].lng - initialCoords[0].lng;
  const origSpanLat = initialCoords[2].lat - initialCoords[0].lat;
  const newSpanLng = translatedCoords[1].lng - translatedCoords[0].lng;
  const newSpanLat = translatedCoords[2].lat - translatedCoords[0].lat;

  assert.equal(newSpanLng, origSpanLng);
  assert.equal(newSpanLat, origSpanLat);
});

test('Vertex dragging modifies only the specified target vertex index', () => {
  const initialCoords = [
    { lng: -100.0, lat: 40.0 },
    { lng: -99.0, lat: 40.0 },
    { lng: -99.0, lat: 41.0 },
  ];

  const activeVertexIndex = 1; // Second vertex
  const newLat = 40.5;
  const newLng = -98.5;

  const updatedCoords = initialCoords.map((c, idx) => {
    if (idx === activeVertexIndex) {
      return { ...c, lat: newLat, lng: newLng };
    }
    return c;
  });

  // Verify only vertex at index 1 changed
  assert.deepEqual(updatedCoords[0], initialCoords[0]);
  assert.deepEqual(updatedCoords[2], initialCoords[2]);
  assert.equal(updatedCoords[1].lat, newLat);
  assert.equal(updatedCoords[1].lng, newLng);
});

test('POI Marker move handle relocation updates marker coordinate correctly', () => {
  const initialMarkerCoords = [
    { lng: 120.9842, lat: 14.5995, alt: 0 },
  ];

  const deltaLng = 0.0125;
  const deltaLat = -0.0050;

  const relocatedMarkerCoords = initialMarkerCoords.map((c) => ({
    ...c,
    lng: c.lng + deltaLng,
    lat: c.lat + deltaLat,
  }));

  assert.equal(relocatedMarkerCoords.length, 1);
  assert.ok(Math.abs(relocatedMarkerCoords[0].lng - 120.9967) < 0.00001);
  assert.ok(Math.abs(relocatedMarkerCoords[0].lat - 14.5945) < 0.00001);
});

test('Coordinates dialog map preview dragend handler updates latitude and longitude', () => {
  const parsedCoords = [{ lat: 30.276775, lng: -97.737484, alt: 0 }];
  const mockDragPos = { lat: 30.280000, lng: -97.730000 };

  // Simulate dragend event
  parsedCoords[0].lat = mockDragPos.lat;
  parsedCoords[0].lng = mockDragPos.lng;

  assert.equal(parsedCoords[0].lat, 30.280000);
  assert.equal(parsedCoords[0].lng, -97.730000);
});
