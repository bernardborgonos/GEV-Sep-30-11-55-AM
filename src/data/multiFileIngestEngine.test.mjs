import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFileFormat,
  getDatasetColor,
  computeBounds,
  mergeBounds,
  parseSingleFile,
  ingestMultipleFiles,
  DATASET_CHROMATIC_PALETTE,
} from './multiFileIngestEngine.js';

test('detectFileFormat correctly identifies file types by name and signature', () => {
  assert.equal(detectFileFormat('patrol.gpx'), 'gpx');
  assert.equal(detectFileFormat('marine_telemetry.nmea'), 'nmea');
  assert.equal(detectFileFormat('gps.log'), 'nmea');
  assert.equal(detectFileFormat('facilities.geojson'), 'geojson');
  assert.equal(detectFileFormat('fleet.csv'), 'csv');
  assert.equal(detectFileFormat('unknown.txt', '<gpx version="1.1">'), 'gpx');
  assert.equal(detectFileFormat('stream.txt', '$GPRMC,081836'), 'nmea');
});

test('getDatasetColor cycles deterministically across the chromatic palette', () => {
  assert.equal(getDatasetColor(0), DATASET_CHROMATIC_PALETTE[0]);
  assert.equal(getDatasetColor(1), DATASET_CHROMATIC_PALETTE[1]);
  assert.equal(getDatasetColor(DATASET_CHROMATIC_PALETTE.length), DATASET_CHROMATIC_PALETTE[0]);
});

test('computeBounds and mergeBounds calculate valid bounding rectangles', () => {
  const points = [
    { lat: 14.5, lon: 120.9 },
    { lat: 14.7, lon: 121.1 },
  ];
  const bounds = computeBounds(points);
  assert.ok(bounds);
  assert.equal(bounds.minLat, 14.5);
  assert.equal(bounds.maxLat, 14.7);
  assert.equal(bounds.minLon, 120.9);
  assert.equal(bounds.maxLon, 121.1);

  const merged = mergeBounds([
    bounds,
    { minLat: 13.0, maxLat: 15.0, minLon: 119.0, maxLon: 122.0 },
  ]);
  assert.equal(merged.minLat, 13.0);
  assert.equal(merged.maxLat, 15.0);
  assert.equal(merged.minLon, 119.0);
  assert.equal(merged.maxLon, 122.0);
});

test('ingestMultipleFiles concurrently parses GPX, NMEA, and CSV files simultaneously', async () => {
  const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>SAR Mountain Patrol</name>
    <trkseg>
      <trkpt lat="14.5995" lon="120.9842"><ele>15.0</ele><time>2026-09-14T00:00:00Z</time></trkpt>
      <trkpt lat="14.6010" lon="120.9860"><ele>18.5</ele><time>2026-09-14T00:01:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const sampleNmea = `$GPRMC,081836,A,1435.2410,N,12059.1234,E,12.5,045.2,140926,,,A*77
$GPRMC,081936,A,1435.4510,N,12059.3456,E,13.0,046.0,140926,,,A*78`;

  const sampleCsv = `vehicle_id,latitude,longitude,speed_kmh,timestamp
FLEET-ALPHA,14.5547,121.0244,45.2,2026-09-14T00:00:00Z
FLEET-ALPHA,14.5560,121.0255,48.0,2026-09-14T00:01:00Z`;

  const result = await ingestMultipleFiles([
    { name: 'alpine_sar.gpx', content: sampleGpx },
    { name: 'coastal_patrol.nmea', content: sampleNmea },
    { name: 'logistics_fleet.csv', content: sampleCsv },
  ]);

  assert.equal(result.datasets.length, 3);
  assert.equal(result.summary.totalFiles, 3);
  assert.ok(result.combinedPoints.length > 0, 'Extracts combined points');
  assert.ok(result.combinedBounds, 'Computes combined bounds');
  assert.ok(result.combinedCenter, 'Computes combined center');

  // Verify dataset tagging and chromatic coloring
  const colors = result.datasets.map((d) => d.color);
  assert.equal(colors[0], DATASET_CHROMATIC_PALETTE[0]);
  assert.equal(colors[1], DATASET_CHROMATIC_PALETTE[1]);
  assert.equal(colors[2], DATASET_CHROMATIC_PALETTE[2]);

  // Points must inherit datasetColor
  for (const pt of result.combinedPoints) {
    assert.ok(pt.datasetId);
    assert.ok(pt.datasetColor);
  }
});
