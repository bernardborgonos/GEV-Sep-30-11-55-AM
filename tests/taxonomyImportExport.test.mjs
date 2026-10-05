import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTaxonomyStatistics,
  exportTaxonomyToJsonString,
  exportTaxonomyToCsvString,
  validateTaxonomyImport,
  importTaxonomyData,
  resetTaxonomyToDefaults,
} from '../src/data/taxonomyImportExport.js';

test('Taxonomy Statistics calculation', () => {
  const stats = getTaxonomyStatistics();
  assert.ok(stats.totalDomains >= 12, 'Expected at least 12 Level-1 Domains');
  assert.ok(stats.totalSubcategories >= 40, 'Expected at least 40 Subcategories');
  assert.ok(stats.totalClassifications >= 100, 'Expected at least 100 Classifications');
  assert.equal(typeof stats.customCount, 'number');
});

test('Taxonomy JSON Export Schema', () => {
  const jsonStr = exportTaxonomyToJsonString();
  assert.ok(typeof jsonStr === 'string' && jsonStr.length > 500);

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.schema, 'gev_tactical_taxonomy_v1');
  assert.ok(Array.isArray(parsed.domains));
  assert.ok(parsed.domains.length >= 12);
  assert.ok(parsed.customStorage);

  const tacticalDomain = parsed.domains.find((d) => d.name === 'Tactical & Defense');
  assert.ok(tacticalDomain);
  assert.ok(Array.isArray(tacticalDomain.subcategories));
  assert.ok(tacticalDomain.subcategories.length > 0);
});

test('Taxonomy CSV Export Format', () => {
  const csvStr = exportTaxonomyToCsvString();
  assert.ok(typeof csvStr === 'string');

  const lines = csvStr.split('\n');
  assert.ok(lines.length > 50, 'Expected multiple rows in CSV export');
  assert.equal(lines[0], 'Domain,Subcategory,Classification,DomainColor,DomainIcon');
  assert.ok(csvStr.includes('Tactical & Defense'));
});

test('Validate Taxonomy Import - JSON and CSV', () => {
  // Valid JSON test
  const sampleJson = JSON.stringify({
    schema: 'gev_tactical_taxonomy_v1',
    domains: [
      {
        name: 'Maritime Operations',
        subcategories: [
          {
            label: 'Patrol Boats',
            level3Presets: ['Fast Attack Craft', 'Interception Skiff'],
          },
        ],
      },
    ],
  });

  const validJsonResult = validateTaxonomyImport(sampleJson);
  assert.equal(validJsonResult.valid, true);
  assert.equal(validJsonResult.format, 'json');
  assert.equal(validJsonResult.count.domains, 1);
  assert.equal(validJsonResult.count.subcategories, 1);
  assert.equal(validJsonResult.count.classifications, 2);

  // Valid CSV test
  const sampleCsv = `Domain,Subcategory,Classification,DomainColor,DomainIcon
"Space Defense","Orbital Platforms","Low Earth Orbit Sentinel","#9333ea","satellite"
"Space Defense","Ground Stations","Deep Space Uplink Dish","#9333ea","satellite"`;

  const validCsvResult = validateTaxonomyImport(sampleCsv);
  assert.equal(validCsvResult.valid, true);
  assert.equal(validCsvResult.format, 'csv');
  assert.equal(validCsvResult.count.domains, 1);
  assert.equal(validCsvResult.count.subcategories, 2);
  assert.equal(validCsvResult.count.classifications, 2);

  // Invalid JSON test
  const invalidJson = '{ not valid json syntax';
  const invalidResult = validateTaxonomyImport(invalidJson);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.error);
});

test('Import Taxonomy Data - Merge and Apply', () => {
  const customPayload = {
    schema: 'gev_tactical_taxonomy_v1',
    domains: [
      {
        name: 'Cyber Warfare Command',
        subcategories: [
          {
            label: 'Electronic Countermeasures',
            level3Presets: ['GPS Jamming Array', 'Signal Interceptor Node'],
          },
        ],
      },
    ],
  };

  const validation = validateTaxonomyImport(JSON.stringify(customPayload));
  assert.equal(validation.valid, true);

  const importResult = importTaxonomyData(validation, 'merge');
  assert.equal(importResult.success, true);
  assert.ok(importResult.applied.classifications >= 2);
});

test('Reset Taxonomy to baseline defaults', () => {
  resetTaxonomyToDefaults(false);
  const stats = getTaxonomyStatistics();
  assert.ok(stats.totalDomains >= 12);
});
