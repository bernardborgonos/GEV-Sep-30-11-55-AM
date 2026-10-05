import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  extractPdfTextEntities,
  extractCsvEntities,
  extractHtmlTableEntities,
  resolvePointCoordinates,
  ingestWebpageLayer,
  QUICK_PRESETS,
} from './urlLayerIngest.js';

test('normalizeUrl unwraps chrome-extension and edge-extension URLs cleanly', () => {
  const chromeExtUrl =
    'https://chrome-extension//efaidnbmnnnibpcajpcglclefindmkaj/https://immigration.gov.ph/wp-content/uploads/2025/03/2021_BI_-Citizens-Charter_2nd-Ed.pdf';
  assert.equal(
    normalizeUrl(chromeExtUrl),
    'https://immigration.gov.ph/wp-content/uploads/2025/03/2021_BI_-Citizens-Charter_2nd-Ed.pdf',
  );

  const directExt =
    'chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://pdf.bankexamstoday.com/raman_files/LIst-of-countries-and-capitals-and-currency.pdf';
  assert.equal(
    normalizeUrl(directExt),
    'https://pdf.bankexamstoday.com/raman_files/LIst-of-countries-and-capitals-and-currency.pdf',
  );

  const edgeExt =
    'edge-extension://someextensionid/https://links.bmiglobaled.com/kit/GISFW_ListofUniversities.pdf';
  assert.equal(
    normalizeUrl(edgeExt),
    'https://links.bmiglobaled.com/kit/GISFW_ListofUniversities.pdf',
  );
});

test('normalizeUrl handles Google Docs and Google Sheets sharing links', () => {
  const sheetsUrl =
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
  assert.equal(
    normalizeUrl(sheetsUrl),
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=0',
  );

  const driveUrl =
    'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I/view?usp=sharing';
  assert.equal(
    normalizeUrl(driveUrl),
    'https://drive.usercontent.google.com/download?id=1A2B3C4D5E6F7G8H9I&export=download&confirm=t',
  );
});

test('QUICK_PRESETS contains all required formats: PDF, CSV, Google Drive/Sheets, HTML, and GeoJSON', () => {
  assert.ok(QUICK_PRESETS.length >= 6);
  const formats = QUICK_PRESETS.map((p) => p.format);
  assert.ok(formats.includes('PDF'));
  assert.ok(formats.includes('CSV'));
  assert.ok(formats.includes('G-SHEET'));
  assert.ok(formats.includes('HTML'));
  assert.ok(formats.includes('GEOJSON'));
});

test('resolvePointCoordinates resolves world capitals and universities', () => {
  const parisPoint = resolvePointCoordinates({ name: 'Paris (Capital of France)', address: 'Paris, France' });
  assert.ok(parisPoint);
  assert.ok(Math.abs(parisPoint.lat - 48.8566) < 0.1);

  const tokyoPoint = resolvePointCoordinates({ name: 'Tokyo Port Authority', address: 'Tokyo, Japan' });
  assert.ok(tokyoPoint);
  assert.ok(Math.abs(tokyoPoint.lat - 35.6762) < 0.1);

  const oxfordPoint = resolvePointCoordinates({ name: 'Oxford University', address: 'Oxford, UK' });
  assert.ok(oxfordPoint);
  assert.ok(Math.abs(oxfordPoint.lat - 51.7548) < 0.1);
});

test('ingestWebpageLayer successfully ingests Bureau of Immigration PDF preset with extension wrapper', async () => {
  const extWrapped =
    'https://chrome-extension//efaidnbmnnnibpcajpcglclefindmkaj/https://immigration.gov.ph/wp-content/uploads/2025/03/2021_BI_-Citizens-Charter_2nd-Ed.pdf';
  const result = await ingestWebpageLayer(extWrapped);
  assert.equal(result.ok, true);
  assert.ok(result.points.length > 0);
  assert.ok(result.categories.includes('Airport') || result.categories.includes('Seaport'));
});

test('ingestWebpageLayer successfully ingests World Capitals PDF preset with extension wrapper', async () => {
  const extWrapped =
    'https://chrome-extension//efaidnbmnnnibpcajpcglclefindmkaj/https://pdf.bankexamstoday.com/raman_files/LIst-of-countries-and-capitals-and-currency.pdf';
  const result = await ingestWebpageLayer(extWrapped);
  assert.equal(result.ok, true);
  assert.ok(result.points.length >= 50);
  assert.ok(result.categories.includes('Embassy'));
});

test('ingestWebpageLayer successfully ingests Global Universities PDF preset with extension wrapper', async () => {
  const extWrapped =
    'https://chrome-extension//efaidnbmnnnibpcajpcglclefindmkaj/https://links.bmiglobaled.com/kit/GISFW_ListofUniversities.pdf';
  const result = await ingestWebpageLayer(extWrapped);
  assert.equal(result.ok, true);
  assert.ok(result.points.length >= 20);
  assert.ok(result.categories.includes('Landmark'));
});

test('ingestWebpageLayer successfully ingests Manila 100-vehicle simulation preset without network fetch or warnings', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
    originalWarn(...args);
  };

  try {
    const result = await ingestWebpageLayer('https://telemetry.nav/manila_100_vehicle_simulation.xlsx');
    assert.equal(result.ok, true);
    assert.equal(result.isTrajectory, true);
    assert.equal(result.count, 6100);
    assert.equal(result.fleetMetrics?.totalVehicles, 100);
    assert.equal(result.trajectoryList?.length, 100);

    // Verify no fetch failure or upstream warnings were emitted
    const fetchWarnings = warnings.filter((w) => w.includes('fetch failed') || w.includes('Upstream fetch warning') || w.includes('XLSX direct export attempt notice'));
    assert.equal(fetchWarnings.length, 0, `Expected 0 fetch warnings, found: ${fetchWarnings.join('; ')}`);
  } finally {
    console.warn = originalWarn;
  }
});

test('ingestWebpageLayer ingests Bureau of Immigration contacts default preset with zero network fetch warnings', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
    originalWarn(...args);
  };

  try {
    const result = await ingestWebpageLayer('https://immigration.gov.ph/contacts/');
    assert.equal(result.ok, true);
    assert.ok(result.points.length > 0);
    assert.ok(result.points.some((p) => p.name.includes('Port') || p.name.includes('Office') || p.name.includes('Immigration')));

    const fetchWarnings = warnings.filter((w) => w.includes('fetch failed') || w.includes('Upstream fetch warning'));
    assert.equal(fetchWarnings.length, 0, `Expected 0 fetch warnings, found: ${fetchWarnings.join('; ')}`);
  } finally {
    console.warn = originalWarn;
  }
});


