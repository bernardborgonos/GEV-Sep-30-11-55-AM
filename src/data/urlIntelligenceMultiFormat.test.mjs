import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  extractCsvEntities,
  extractGeoJsonEntities,
  extractPdfTextEntities,
  ingestWebpageLayer,
  QUICK_PRESETS,
} from './urlLayerIngest.js';
import {
  SAMPLE_SEAPORTS_CSV,
  SAMPLE_GOOGLE_SHEETS_LOGISTICS,
  SAMPLE_CUSTOMS_PDF_TEXT,
  SAMPLE_UN_LOGISTICS_GEOJSON,
} from './fixtures/presetIntelligenceData.js';
import { DataLayerManager } from './manager.js';

test('normalizeUrl converts Google Drive, Docs, and Sheets URLs into exportable endpoints', () => {
  // Google Sheets
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=123#gid=123';
  const normSheet = normalizeUrl(sheetUrl);
  assert.equal(
    normSheet,
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=123'
  );

  // Google Drive
  const driveUrl = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view';
  const normDrive = normalizeUrl(driveUrl);
  assert.equal(
    normDrive,
    'https://drive.usercontent.google.com/download?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms&export=download&confirm=t'
  );

  // Google Docs
  const docUrl = 'https://docs.google.com/document/d/1DocId12345/edit';
  const normDoc = normalizeUrl(docUrl);
  assert.equal(
    normDoc,
    'https://docs.google.com/document/d/1DocId12345/export?format=txt'
  );

  // Standard web URL
  assert.equal(normalizeUrl('immigration.gov.ph'), 'https://immigration.gov.ph/');
});

test('extractCsvEntities correctly parses tabular CSV with headers and coordinates', () => {
  const points = extractCsvEntities(SAMPLE_SEAPORTS_CSV, 'https://example.com/seaports.csv');
  assert.ok(points.length >= 15, `Extracted ${points.length} seaports`);

  const shanghai = points.find((p) => p.name.includes('Shanghai'));
  assert.ok(shanghai, 'Found Port of Shanghai');
  assert.equal(shanghai.category, 'Seaport');
  assert.ok(Math.abs(shanghai.lat - 31.23) < 0.1);
  assert.ok(Math.abs(shanghai.lon - 121.47) < 0.1);

  const manila = points.find((p) => p.name.includes('Manila'));
  assert.ok(manila, 'Found Port of Manila');
  assert.ok(Math.abs(manila.lat - 14.59) < 0.1);
  assert.ok(Math.abs(manila.lon - 120.98) < 0.1);
});

test('extractCsvEntities extracts Google Sheets disaster logistics facilities', () => {
  const points = extractCsvEntities(SAMPLE_GOOGLE_SHEETS_LOGISTICS, 'https://docs.google.com/spreadsheets/d/123');
  assert.ok(points.length >= 8, `Extracted ${points.length} logistics facilities`);

  const clark = points.find((p) => p.name.includes('Clark'));
  assert.ok(clark, 'Found Clark Forward Air Logistics Base');
  assert.equal(clark.category, 'Airport');
  assert.ok(Math.abs(clark.lat - 15.18) < 0.1);
  assert.ok(Math.abs(clark.lon - 120.55) < 0.1);
});

test('extractGeoJsonEntities correctly parses FeatureCollection Points', () => {
  const points = extractGeoJsonEntities(SAMPLE_UN_LOGISTICS_GEOJSON, 'https://logcluster.org/data/hubs.geojson');
  assert.ok(points.length >= 5, `Extracted ${points.length} UN logistics depots`);

  const manilaHub = points.find((p) => p.name.includes('Manila'));
  assert.ok(manilaHub, 'Found UN Manila hub');
  assert.ok(Math.abs(manilaHub.lat - 14.59) < 0.1);
  assert.ok(Math.abs(manilaHub.lon - 120.98) < 0.1);

  const dubaiHub = points.find((p) => p.name.includes('Dubai'));
  assert.ok(dubaiHub, 'Found UN Dubai hub');
  assert.ok(Math.abs(dubaiHub.lat - 25.01) < 0.1);
  assert.ok(Math.abs(dubaiHub.lon - 55.06) < 0.1);
});

test('extractPdfTextEntities parses structured PDF bulletin text', () => {
  const points = extractPdfTextEntities(SAMPLE_CUSTOMS_PDF_TEXT, 'https://customs.gov.ph/bulletin.pdf');
  assert.ok(points.length >= 8, `Extracted ${points.length} customs inspection points`);

  const naia = points.find((p) => p.name.includes('NAIA'));
  assert.ok(naia, 'Found NAIA Customs Inspection');
  assert.equal(naia.category, 'Airport');
  assert.ok(Math.abs(naia.lat - 14.52) < 0.1);

  const cebu = points.find((p) => p.name.includes('Cebu'));
  assert.ok(cebu, 'Found Cebu customs district');
  assert.ok(Math.abs(cebu.lat - 10.31) < 0.1);
});

test('QUICK_PRESETS contains entries for HTML, CSV, Google Drive/Sheets, PDF, and GeoJSON', () => {
  assert.ok(QUICK_PRESETS.length >= 5, 'Has at least 5 quick presets');

  const formats = QUICK_PRESETS.map((p) => p.format);
  assert.ok(formats.includes('HTML'), 'Includes HTML preset');
  assert.ok(formats.includes('CSV'), 'Includes CSV preset');
  assert.ok(formats.includes('G-SHEET'), 'Includes Google Sheets preset');
  assert.ok(formats.includes('PDF'), 'Includes PDF preset');
  assert.ok(formats.includes('GEOJSON'), 'Includes GeoJSON preset');
});

test('ingestWebpageLayer processes CSV, PDF, Google Sheets, and GeoJSON presets', async () => {
  // Test CSV preset ingestion
  const csvRes = await ingestWebpageLayer('https://raw.githubusercontent.com/datasets/seaports/master/data/seaports.csv');
  assert.ok(csvRes.ok, 'CSV ingest ok');
  assert.ok(csvRes.count > 0, 'CSV extracted points');
  assert.ok(csvRes.bounds, 'Computed bounds');

  // Test Google Sheet preset ingestion
  const sheetRes = await ingestWebpageLayer('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv');
  assert.ok(sheetRes.ok, 'Google Sheet ingest ok');
  assert.ok(sheetRes.count > 0, 'Google Sheet extracted points');

  // Test PDF bulletin preset ingestion
  const pdfRes = await ingestWebpageLayer('https://customs.gov.ph/bulletin/port-clearance-advisory.pdf');
  assert.ok(pdfRes.ok, 'PDF ingest ok');
  assert.ok(pdfRes.count > 0, 'PDF extracted points');

  // Test GeoJSON preset ingestion
  const geoRes = await ingestWebpageLayer('https://logcluster.org/data/global-logistics-hubs.geojson');
  assert.ok(geoRes.ok, 'GeoJSON ingest ok');
  assert.ok(geoRes.count > 0, 'GeoJSON extracted points');
});

test('DataLayerManager implements isLayerEnabled and setLayerEnabled contract', () => {
  const manager = new DataLayerManager();
  
  // Test non-existent layer defaults to false
  assert.equal(manager.isLayerEnabled('unknown-layer'), false);

  // Test setLayerEnabled
  manager.setLayerEnabled('test-layer', true);
  assert.equal(manager.isLayerEnabled('test-layer'), true);

  manager.setLayerEnabled('test-layer', false);
  assert.equal(manager.isLayerEnabled('test-layer'), false);
});
