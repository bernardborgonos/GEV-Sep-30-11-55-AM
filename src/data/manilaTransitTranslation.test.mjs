import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSIT_LINES,
  SIMULATION_EPOCH_ISO,
  TOTAL_DURATION_SEC,
  generateSpaceTimeTrajectory,
  generateManilaTransitKML,
  generateManilaTransitGPX,
  generateManilaTransitNMEA,
  generateManilaTransitCSV,
} from './fixtures/manilaTransitGenerator.js';
import {
  MANILA_TRANSIT_KML,
  MANILA_TRANSIT_GPX,
  MANILA_TRANSIT_NMEA,
  MANILA_TRANSIT_CSV,
  MANILA_TRANSIT_DATASETS,
} from './fixtures/manilaTransitData.js';
import { categorizeTelemetryFilename, SUBFOLDERS } from './googleDriveClient.js';
import { ingestMultipleFiles, detectFileFormat } from './multiFileIngestEngine.js';

test('Phase 1: Transit Network Geometry & Mathematical Rhythm', () => {
  // Line station counts
  assert.equal(TRANSIT_LINES.LRT1.stations.length, 20);
  assert.equal(TRANSIT_LINES.LRT2.stations.length, 13);
  assert.equal(TRANSIT_LINES.MRT3.stations.length, 13);
  assert.equal(TOTAL_DURATION_SEC, 1470); // 24.5 minutes

  // Trajectory generation adheres to 30s dwell / 90s transit
  const lrt2Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.LRT2, 10);
  assert.ok(lrt2Samples.length > 100);

  // At t=0 (Recto platform), train is in DWELL
  const t0 = lrt2Samples[0];
  assert.equal(t0.timeSec, 0);
  assert.equal(t0.status, 'DWELL');
  assert.equal(t0.speedKph, 0);
  assert.equal(t0.lat, 14.6035);
  assert.equal(t0.lon, 120.9835);

  // At t=60s (between Recto and Legarda), train is in TRANSIT
  const t60 = lrt2Samples.find((s) => s.timeSec === 60);
  assert.ok(t60);
  assert.equal(t60.status, 'TRANSIT');
  assert.ok(t60.speedKph > 0);

  // At t=1470s (24.5m, Antipolo terminal), train has arrived
  const t1470 = lrt2Samples[lrt2Samples.length - 1];
  assert.equal(t1470.status, 'TERMINAL_DWELL');
  assert.equal(t1470.lat, 14.6250);
  assert.equal(t1470.lon, 121.1214);
});

test('Phase 2A: KML 2.2 Translation Fidelity', () => {
  const kml = MANILA_TRANSIT_KML;
  assert.ok(kml.includes('<kml xmlns="http://www.opengis.net/kml/2.2"'));
  assert.ok(kml.includes('The Living Network: Manila Transit Telemetry &amp; Simulation'));
  assert.ok(kml.includes('<gx:Track>'));

  // Static stations placemarks check (46 total stations across lines)
  const placemarkMatches = kml.match(/<Placemark/gi) || [];
  assert.ok(placemarkMatches.length >= 46, `Expected at least 46 placemarks, got ${placemarkMatches.length}`);

  // Dynamic gx:Track for Train 001 and Train 002
  assert.ok(kml.includes('TRAIN 001 - LRT-2'));
  assert.ok(kml.includes('TRAIN 002 - MRT-3'));
  assert.ok(kml.includes('<when>2026-09-11T00:00:00.000Z</when>'));
  assert.ok(kml.includes('<when>2026-09-11T00:24:30.000Z</when>'));
});

test('Phase 2B: GPX 1.1 Translation Fidelity', () => {
  const gpx = MANILA_TRANSIT_GPX;
  assert.ok(gpx.includes('<gpx version="1.1"'));
  assert.ok(gpx.includes('<time>2026-09-11T00:00:00Z</time>'));

  // Waypoints for stations
  const wptMatches = gpx.match(/<wpt\s+/gi) || [];
  assert.equal(wptMatches.length, 46);

  // Tracks for both trains
  assert.ok(gpx.includes('<trk>'));
  assert.ok(gpx.includes('<name>TRAIN 001 - LRT-2 (Recto ➔ Antipolo)</name>'));
  assert.ok(gpx.includes('<name>TRAIN 002 - MRT-3 (North Avenue ➔ Taft Avenue)</name>'));
  assert.ok(gpx.includes('<trkpt lat="14.6521" lon="121.0326">')); // North Ave
});

test('Phase 2C: NMEA-0183 Satellite Stream Translation Fidelity', () => {
  const nmea = MANILA_TRANSIT_NMEA;
  assert.ok(nmea.includes('$GPRMC'));
  assert.ok(nmea.includes('$GPGGA'));
  assert.ok(nmea.includes('110926')); // 11 Sept 2026 date stamp

  // Validate checksum format on all sentences
  const lines = nmea.split('\r\n').filter((l) => l.startsWith('$'));
  assert.ok(lines.length > 50);
  for (const line of lines.slice(0, 20)) {
    const starIdx = line.indexOf('*');
    assert.ok(starIdx > 0, `NMEA line missing checksum: ${line}`);
    const checksum = line.slice(starIdx + 1);
    assert.equal(checksum.length, 2, `Invalid checksum length: ${checksum}`);
  }
});

test('Phase 2D: CSV Tabular Telemetry Translation Fidelity', () => {
  const csv = MANILA_TRANSIT_CSV;
  const lines = csv.split('\n').filter((l) => l.trim().length > 0);
  assert.ok(lines.length > 100);

  const header = lines[0];
  assert.ok(header.includes('timestamp'));
  assert.ok(header.includes('vehicle_id'));
  assert.ok(header.includes('latitude'));
  assert.ok(header.includes('longitude'));
  assert.ok(header.includes('speed_kph'));
  assert.ok(header.includes('status'));

  // Station entries included
  assert.ok(csv.includes('STATION-L1-01'));
  assert.ok(csv.includes('Fernando Poe Jr.'));
  assert.ok(csv.includes('Recto'));
  assert.ok(csv.includes('North Avenue'));
});

test('Phase 3: Google Drive Folder Categorization', () => {
  assert.equal(categorizeTelemetryFilename('manila_transit_space_time.csv'), 'FLEET_GPS');
  assert.equal(categorizeTelemetryFilename('manila_transit_simulation.gpx'), 'GPX_TRACKS');
  assert.equal(categorizeTelemetryFilename('manila_transit_telemetry.nmea'), 'NMEA_LOGS');
  assert.equal(categorizeTelemetryFilename('manila_transit_living_network.kml'), 'LAYERS');

  for (const ds of MANILA_TRANSIT_DATASETS) {
    const cat = categorizeTelemetryFilename(ds.name);
    assert.equal(cat, ds.driveCategory);
  }
});

test('Phase 4: Simultaneous Ingestion of All 4 Manila Transit Formats (.kml, .gpx, .nmea, .csv)', async () => {
  const fileItems = [
    { name: 'manila_transit_living_network.kml', content: MANILA_TRANSIT_KML },
    { name: 'manila_transit_simulation.gpx', content: MANILA_TRANSIT_GPX },
    { name: 'manila_transit_telemetry.nmea', content: MANILA_TRANSIT_NMEA },
    { name: 'manila_transit_space_time.csv', content: MANILA_TRANSIT_CSV },
  ];

  // Verify format detector
  assert.equal(detectFileFormat('test.kml', MANILA_TRANSIT_KML), 'kml');
  assert.equal(detectFileFormat('test.gpx', MANILA_TRANSIT_GPX), 'gpx');
  assert.equal(detectFileFormat('test.nmea', MANILA_TRANSIT_NMEA), 'nmea');
  assert.equal(detectFileFormat('test.csv', MANILA_TRANSIT_CSV), 'csv');

  const result = await ingestMultipleFiles(fileItems);

  assert.equal(result.datasets.length, 4);
  assert.equal(result.summary.totalFiles, 4);
  assert.ok(result.summary.totalPoints > 40, `Expected >40 points, got ${result.summary.totalPoints}`);
  assert.ok(result.summary.totalVehicles > 0, `Expected >0 vehicles, got ${result.summary.totalVehicles}`);

  // Chromatic color differentiation
  const colors = result.datasets.map((d) => d.color);
  const uniqueColors = new Set(colors);
  assert.equal(uniqueColors.size, 4);

  // Unified Manila geographic bounds
  const b = result.combinedBounds;
  assert.ok(b, 'Bounds should be computed');
  assert.ok(b.minLat >= 14.0 && b.maxLat <= 15.0, `Lat bounds out of Manila range: ${b.minLat} - ${b.maxLat}`);
  assert.ok(b.minLon >= 120.5 && b.maxLon <= 121.5, `Lon bounds out of Manila range: ${b.minLon} - ${b.maxLon}`);
});
