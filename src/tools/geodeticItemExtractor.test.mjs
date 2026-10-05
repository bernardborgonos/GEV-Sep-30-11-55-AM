import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGeodeticMetrics,
  generateGeodeticDescription,
  updateItemGeodeticData,
} from './geodeticItemExtractor.js';

test('geodeticItemExtractor extracts bearing metrics and formats report', () => {
  const coords = [
    { lat: 14.5995, lng: 120.9842, alt: 10 },
    { lat: 14.6500, lng: 121.0500, alt: 35 },
  ];
  const metrics = extractGeodeticMetrics(coords, 'bearing');
  assert.equal(metrics.measurementType, 'bearing');
  assert.ok(typeof metrics.forwardBearingDeg === 'number');
  assert.ok(typeof metrics.backAzimuthDeg === 'number');
  assert.ok(metrics.distanceMeters > 0);
  assert.ok(metrics.forwardCardinal.length >= 1);

  const report = generateGeodeticDescription(metrics);
  assert.ok(report.includes('GEODETIC TELEMETRY REPORT'));
  assert.ok(report.includes('COMPASS BEARING & AZIMUTH'));

  const item = updateItemGeodeticData({}, coords, 'bearing');
  assert.equal(item.measurementType, 'bearing');
  assert.ok(item.name.startsWith('Bearing'));
  assert.ok(item.description.includes('Forward Azimuth'));
});

test('geodeticItemExtractor extracts elevation profile and slope grade', () => {
  const coords = [
    { lat: 14.5995, lng: 120.9842, alt: 15 },
    { lat: 14.6100, lng: 120.9900, alt: 150 },
  ];
  const metrics = extractGeodeticMetrics(coords, 'elevation');
  assert.equal(metrics.measurementType, 'elevation');
  assert.equal(metrics.baseAltitudeM, 15);
  assert.equal(metrics.peakAltitudeM, 150);
  assert.equal(metrics.deltaM, 135);
  assert.ok(metrics.slopePct > 0);

  const item = updateItemGeodeticData({}, coords, 'elevation');
  assert.ok(item.name.startsWith('Elevation'));
  assert.ok(item.description.includes('ELEVATION & SLOPE PROFILE'));
});

test('geodeticItemExtractor extracts polygon area and perimeter', () => {
  const coords = [
    { lat: 14.590, lng: 120.980 },
    { lat: 14.600, lng: 120.980 },
    { lat: 14.600, lng: 120.990 },
    { lat: 14.590, lng: 120.990 },
  ];
  const metrics = extractGeodeticMetrics(coords, 'area');
  assert.equal(metrics.measurementType, 'area');
  assert.ok(metrics.areaHectares > 0);
  assert.ok(metrics.perimeterMeters > 0);

  const item = updateItemGeodeticData({}, coords, 'area');
  assert.ok(item.name.startsWith('Area'));
  assert.ok(item.description.includes('ENCLOSED POLYGON AREA'));
});

test('geodeticItemExtractor generates precision NATO MGRS coordinate references', () => {
  const coords = [
    { lat: 14.5995, lng: 120.9842, alt: 10 },
    { lat: 14.6500, lng: 121.0500, alt: 35 },
  ];
  const metrics = extractGeodeticMetrics(coords, 'bearing');
  assert.ok(metrics.originMgrs);
  assert.ok(metrics.targetMgrs);
  assert.ok(metrics.targetMgrs.startsWith('51P'));

  const report = generateGeodeticDescription(metrics);
  assert.ok(report.includes('Observer MGRS:'));
  assert.ok(report.includes('Target MGRS:'));
  assert.ok(report.includes('51P'));
});

test('geodeticItemExtractor flags self-intersecting bowtie polygons', () => {
  // Classic bowtie / figure-8 polygon
  const bowtieCoords = [
    { lat: 10.0, lng: 10.0 },
    { lat: 20.0, lng: 20.0 },
    { lat: 20.0, lng: 10.0 },
    { lat: 10.0, lng: 20.0 },
  ];
  const metrics = extractGeodeticMetrics(bowtieCoords, 'area');
  assert.equal(metrics.isSelfIntersecting, true);
  assert.ok(metrics.selfIntersectionCount >= 1);
  assert.ok(metrics.summary.includes('Bowtie/Self-Intersecting'));
});

