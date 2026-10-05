import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOT_FOLDER_NAME,
  SUBFOLDERS,
  categorizeTelemetryFilename,
} from './googleDriveClient.js';
import {
  QUICK_PRESETS,
  SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
  SAMPLE_METRO_PATROL_GPX,
  SAMPLE_NMEA_GPS_STREAM,
  SAMPLE_UN_LOGISTICS_GEOJSON,
} from './fixtures/presetIntelligenceData.js';
import { ingestMultipleFiles } from './multiFileIngestEngine.js';

test('Phase 3: Google Drive root and tactical subfolder hierarchy', () => {
  assert.equal(ROOT_FOLDER_NAME, 'GodsEyeView');
  assert.equal(SUBFOLDERS.FLEET_GPS, 'Fleet-GPS');
  assert.equal(SUBFOLDERS.GPX_TRACKS, 'GPX-Tracks');
  assert.equal(SUBFOLDERS.NMEA_LOGS, 'NMEA-Logs');
  assert.equal(SUBFOLDERS.LAYERS, 'Layers');
});

test('Phase 3: Category mapping for Drive folder targets', () => {
  assert.equal(categorizeTelemetryFilename('metro_fleet_100.csv'), 'FLEET_GPS');
  assert.equal(categorizeTelemetryFilename('tactical_route.gpx'), 'GPX_TRACKS');
  assert.equal(categorizeTelemetryFilename('satellite_stream.nmea'), 'NMEA_LOGS');
  assert.equal(categorizeTelemetryFilename('humanitarian_depots.geojson'), 'LAYERS');
});

test('Phase 3: Quick presets define Drive links with designated subfolder categories', () => {
  const driveFleet = QUICK_PRESETS.find((p) => p.id === 'gdrive-fleet-gps');
  assert.ok(driveFleet);
  assert.equal(driveFleet.folderCategory, 'Fleet-GPS');
  assert.ok(driveFleet.url.includes('1_GodsEyeView_Metro_Fleet_Telemetry'));

  const driveGpx = QUICK_PRESETS.find((p) => p.id === 'gdrive-gpx-track');
  assert.ok(driveGpx);
  assert.equal(driveGpx.folderCategory, 'GPX-Tracks');
  assert.ok(driveGpx.url.includes('2_GodsEyeView_Mountain_Rescue_Track'));

  const driveNmea = QUICK_PRESETS.find((p) => p.id === 'gdrive-nmea-stream');
  assert.ok(driveNmea);
  assert.equal(driveNmea.folderCategory, 'NMEA-Logs');
  assert.ok(driveNmea.url.includes('3_GodsEyeView_Coastal_Patrol_NMEA'));
});

test('Phase 3: Parse all 4 curated Google Drive presets simultaneously via multi-file engine', async () => {
  const driveFiles = [
    { name: 'metro_fleet_100_telemetry.csv', content: SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV },
    { name: 'alpine_mountain_rescue_track.gpx', content: SAMPLE_METRO_PATROL_GPX },
    { name: 'coastal_patrol_gps_stream.nmea', content: SAMPLE_NMEA_GPS_STREAM },
    { name: 'un_humanitarian_logistics_hubs.geojson', content: JSON.stringify(SAMPLE_UN_LOGISTICS_GEOJSON) },
  ];

  const result = await ingestMultipleFiles(driveFiles);

  assert.equal(result.datasets.length, 4);
  assert.equal(result.summary.totalFiles, 4);

  // Verify distinct chromatic color assignments for each Drive dataset
  const colors = result.datasets.map((d) => d.color);
  const uniqueColors = new Set(colors);
  assert.equal(uniqueColors.size, 4);

  // Verify points and trajectories parsed
  assert.ok(result.summary.totalPoints > 50);
  assert.ok(result.summary.totalVehicles > 0);
});
