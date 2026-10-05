import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeTelemetryFilename,
  ROOT_FOLDER_NAME,
  SUBFOLDERS,
  createDriveFile,
  updateDriveFile,
  deleteDriveFile,
  saveMapFeatureLayerToDrive,
  saveTacticalLayerToDrive,
  listTacticalLayersFromDrive,
  loadTacticalLayerFromDrive,
  syncTacticalFeaturesWithDrive,
} from './googleDriveClient.js';
import { SCOPES } from '../auth/googleDriveAuth.js';

test('categorizeTelemetryFilename correctly sorts files into GodsEyeView subfolders', () => {
  assert.equal(categorizeTelemetryFilename('metro_fleet_100.csv'), 'FLEET_GPS');
  assert.equal(categorizeTelemetryFilename('courier_run.tsv'), 'FLEET_GPS');
  assert.equal(categorizeTelemetryFilename('track.gpx'), 'GPX_TRACKS');
  assert.equal(categorizeTelemetryFilename('search_rescue.GPX'), 'GPX_TRACKS');
  assert.equal(categorizeTelemetryFilename('marine_vessel.nmea'), 'NMEA_LOGS');
  assert.equal(categorizeTelemetryFilename('gps_satellite.log'), 'NMEA_LOGS');
  assert.equal(categorizeTelemetryFilename('evacuation_centers.geojson'), 'LAYERS');
  assert.equal(categorizeTelemetryFilename('bulletin.pdf'), 'LAYERS');
});

test('Google Drive folder structure constants match specification', () => {
  assert.equal(ROOT_FOLDER_NAME, 'GodsEyeView');
  assert.equal(SUBFOLDERS.FLEET_GPS, 'Fleet-GPS');
  assert.equal(SUBFOLDERS.GPX_TRACKS, 'GPX-Tracks');
  assert.equal(SUBFOLDERS.NMEA_LOGS, 'NMEA-Logs');
  assert.equal(SUBFOLDERS.LAYERS, 'Layers');
});

test('Google Drive Auth exports valid least-privilege scopes', () => {
  assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.readonly'));
});

test('Google Drive client exports CRED (Create, Read, Edit, Delete) operations for Map Tools and Ingestion', () => {
  assert.equal(typeof createDriveFile, 'function');
  assert.equal(typeof updateDriveFile, 'function');
  assert.equal(typeof deleteDriveFile, 'function');
  assert.equal(typeof saveMapFeatureLayerToDrive, 'function');
});

test('Google Drive client exports dedicated tactical layer synchronization methods', () => {
  assert.equal(typeof saveTacticalLayerToDrive, 'function');
  assert.equal(typeof listTacticalLayersFromDrive, 'function');
  assert.equal(typeof loadTacticalLayerFromDrive, 'function');
  assert.equal(typeof syncTacticalFeaturesWithDrive, 'function');
});

