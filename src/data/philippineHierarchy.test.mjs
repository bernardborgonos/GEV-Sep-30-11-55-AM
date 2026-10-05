import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PH_COUNTRY_NAME,
  PH_COUNTRY_CODE,
  PH_ISLAND_GROUPS,
  PH_ADMIN_REGIONS,
  resolveIslandGroupByCoords,
  resolveRegionByCoords,
  resolvePhilippineHierarchy,
  enrichEntityWithPhilippineHierarchy,
  computePhilippineHierarchySummary,
  getPhilippineTerritorialBounds,
  applySemanticClassification,
  computeGeospatialAnalytics,
  exportEntitiesToGeoJSON,
  exportEntitiesToCSV,
} from './philippineHierarchy.js';

import urlIntelligenceLayer from './urlIntelligence.js';

test('Philippine Administrative Hierarchy Data Structures', () => {
  assert.equal(PH_COUNTRY_NAME, 'Philippines');
  assert.equal(PH_COUNTRY_CODE, 'PH');

  // Verify 3 Major Island Groups
  const islandKeys = Object.keys(PH_ISLAND_GROUPS);
  assert.deepEqual(islandKeys, ['Luzon', 'Visayas', 'Mindanao']);

  assert.equal(PH_ISLAND_GROUPS.Luzon.code, 'LUZ');
  assert.equal(PH_ISLAND_GROUPS.Visayas.code, 'VIS');
  assert.equal(PH_ISLAND_GROUPS.Mindanao.code, 'MIN');

  // Verify 17 PSA Administrative Regions exist
  const regionKeys = Object.keys(PH_ADMIN_REGIONS);
  assert.equal(regionKeys.length, 17, 'Must have exactly 17 administrative regions');

  // Check Luzon regions
  const luzonRegions = ['NCR', 'CAR', 'Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V'];
  for (const reg of luzonRegions) {
    assert.ok(PH_ADMIN_REGIONS[reg], `Luzon region ${reg} should exist`);
    assert.equal(PH_ADMIN_REGIONS[reg].islandGroup, 'Luzon');
  }

  // Check Visayas regions
  const visayasRegions = ['Region VI', 'Region VII', 'Region VIII'];
  for (const reg of visayasRegions) {
    assert.ok(PH_ADMIN_REGIONS[reg], `Visayas region ${reg} should exist`);
    assert.equal(PH_ADMIN_REGIONS[reg].islandGroup, 'Visayas');
  }

  // Check Mindanao regions
  const mindanaoRegions = ['Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'];
  for (const reg of mindanaoRegions) {
    assert.ok(PH_ADMIN_REGIONS[reg], `Mindanao region ${reg} should exist`);
    assert.equal(PH_ADMIN_REGIONS[reg].islandGroup, 'Mindanao');
  }
});

test('Geographic Reverse Geocoding by Coordinates', () => {
  // Manila coordinates -> NCR / Luzon
  const manilaMatch = resolveRegionByCoords(14.5995, 120.9842);
  assert.ok(manilaMatch, 'Should resolve Manila coordinates');
  assert.equal(manilaMatch.islandGroup, 'Luzon');
  assert.equal(manilaMatch.code, 'NCR');

  // Cebu City coordinates -> Region VII / Visayas
  const cebuMatch = resolveRegionByCoords(10.3157, 123.8854);
  assert.ok(cebuMatch, 'Should resolve Cebu coordinates');
  assert.equal(cebuMatch.islandGroup, 'Visayas');
  assert.equal(cebuMatch.code, 'Region VII');

  // Davao City coordinates -> Region XI / Mindanao
  const davaoMatch = resolveRegionByCoords(7.1907, 125.4504);
  assert.ok(davaoMatch, 'Should resolve Davao coordinates');
  assert.equal(davaoMatch.islandGroup, 'Mindanao');
  assert.equal(davaoMatch.code, 'Region XI');
});

test('Deterministic Keyword and Text Resolution for Philippine Hierarchy', () => {
  // Office names with city or region keywords
  const naiaMatch = resolvePhilippineHierarchy({ name: 'Bureau of Immigration NAIA Terminal 3 International Arrival' });
  assert.ok(naiaMatch, 'Should resolve NAIA keyword');
  assert.equal(naiaMatch.islandGroup, 'Luzon');
  assert.equal(naiaMatch.region, 'NCR');

  const bicolMatch = resolvePhilippineHierarchy({ name: 'Legazpi District Office Bicol Albay' });
  assert.ok(bicolMatch, 'Should resolve Albay/Bicol keyword');
  assert.equal(bicolMatch.islandGroup, 'Luzon');
  assert.equal(bicolMatch.region, 'Region V');

  const iloiloMatch = resolvePhilippineHierarchy({ name: 'Iloilo Seaport Field Office Western Visayas' });
  assert.ok(iloiloMatch, 'Should resolve Iloilo keyword');
  assert.equal(iloiloMatch.islandGroup, 'Visayas');
  assert.equal(iloiloMatch.region, 'Region VI');

  const zamboangaMatch = resolvePhilippineHierarchy({ name: 'Zamboanga District Office Maritime Border' });
  assert.ok(zamboangaMatch, 'Should resolve Zamboanga keyword');
  assert.equal(zamboangaMatch.islandGroup, 'Mindanao');
  assert.equal(zamboangaMatch.region, 'Region IX');
});

test('Enrichment and Summary Computation', () => {
  const testEntities = [
    { name: 'BI Headquarters Intramuros', lat: 14.5905, lon: 120.9750, category: 'Headquarters' },
    { name: 'Mactan-Cebu International Airport', lat: 10.3113, lon: 123.9794, category: 'Airport' },
    { name: 'Davao International Airport Bureau', lat: 7.1253, lon: 125.6456, category: 'Airport' },
    { name: 'Baguio City Field Office', lat: 16.4023, lon: 120.5960, category: 'Field Office' },
  ];

  for (const entity of testEntities) {
    enrichEntityWithPhilippineHierarchy(entity);
    assert.equal(entity.country, 'Philippines');
    assert.equal(entity.countryCode, 'PH');
    assert.ok(['Luzon', 'Visayas', 'Mindanao'].includes(entity.islandGroup));
    assert.ok(entity.region);
  }

  assert.equal(testEntities[0].islandGroup, 'Luzon');
  assert.equal(testEntities[0].region, 'NCR');

  assert.equal(testEntities[1].islandGroup, 'Visayas');
  assert.equal(testEntities[1].region, 'Region VII');

  assert.equal(testEntities[2].islandGroup, 'Mindanao');
  assert.equal(testEntities[2].region, 'Region XI');

  assert.equal(testEntities[3].islandGroup, 'Luzon');
  assert.equal(testEntities[3].region, 'CAR');

  const summary = computePhilippineHierarchySummary(testEntities);
  assert.equal(summary.total, 4);
  assert.equal(summary.islandGroups.Luzon, 2);
  assert.equal(summary.islandGroups.Visayas, 1);
  assert.equal(summary.islandGroups.Mindanao, 1);
  assert.equal(summary.regions.NCR, 1);
  assert.equal(summary.regions.CAR, 1);
  assert.equal(summary.regions['Region VII'], 1);
  assert.equal(summary.regions['Region XI'], 1);
});

test('urlIntelligenceLayer Hierarchy State and Filtering', () => {
  // Reset initial filters
  urlIntelligenceLayer.resetHierarchyFilters();
  assert.equal(urlIntelligenceLayer.getSelectedIslandGroup(), 'All');
  assert.equal(urlIntelligenceLayer.getSelectedRegion(), 'All');

  // Set Island Group
  urlIntelligenceLayer.setIslandGroupFilter('Luzon');
  assert.equal(urlIntelligenceLayer.getSelectedIslandGroup(), 'Luzon');

  // Set Region
  urlIntelligenceLayer.setRegionFilter('NCR');
  assert.equal(urlIntelligenceLayer.getSelectedRegion(), 'NCR');

  // Reset
  urlIntelligenceLayer.resetHierarchyFilters();
  assert.equal(urlIntelligenceLayer.getSelectedIslandGroup(), 'All');
  assert.equal(urlIntelligenceLayer.getSelectedRegion(), 'All');
});

test('Phase 3: Philippine Territorial Bounds and Corridors', () => {
  const ncrBounds = getPhilippineTerritorialBounds('NCR');
  assert.ok(ncrBounds);
  assert.equal(ncrBounds.code, 'NCR');
  assert.equal(ncrBounds.islandGroup, 'Luzon');
  assert.ok(ncrBounds.polygonCoords.length >= 5);
  assert.ok(ncrBounds.color);

  const luzonBounds = getPhilippineTerritorialBounds('Luzon');
  assert.ok(luzonBounds);
  assert.equal(luzonBounds.code, 'LUZ');
  assert.ok(luzonBounds.bounds.minLat < luzonBounds.bounds.maxLat);
  assert.ok(luzonBounds.bounds.minLon < luzonBounds.bounds.maxLon);

  const unknown = getPhilippineTerritorialBounds('NON_EXISTENT');
  assert.equal(unknown, null);
});

test('Phase 3: Semantic Classification and Operational Tiers', () => {
  const airport = { name: 'Ninoy Aquino International Airport Terminal 3', category: 'Airport' };
  applySemanticClassification(airport);
  assert.equal(airport.operationalTier, 'International Aviation Gateway');
  assert.equal(airport.jurisdictionLevel, 'National');
  assert.ok(airport.semanticTags.includes('Aviation'));

  const seaport = { name: 'Manila South Harbor International Port', category: 'Seaport' };
  applySemanticClassification(seaport);
  assert.equal(seaport.operationalTier, 'Maritime Border & Port of Entry');

  const hq = { name: 'Bureau of Immigration Main Headquarters Intramuros', category: 'Headquarters' };
  applySemanticClassification(hq);
  assert.equal(hq.operationalTier, 'National Command & Executive Center');
  assert.equal(hq.jurisdictionLevel, 'National');
});

test('Phase 3: Geospatial Analytics and Leaderboards', () => {
  const dataset = [
    { name: 'NAIA T1', islandGroup: 'Luzon', region: 'NCR', category: 'Airport' },
    { name: 'NAIA T2', islandGroup: 'Luzon', region: 'NCR', category: 'Airport' },
    { name: 'NAIA T3', islandGroup: 'Luzon', region: 'NCR', category: 'Airport' },
    { name: 'Cebu Port', islandGroup: 'Visayas', region: 'Region VII', category: 'Seaport' },
    { name: 'Mactan Airport', islandGroup: 'Visayas', region: 'Region VII', category: 'Airport' },
    { name: 'Davao Field Office', islandGroup: 'Mindanao', region: 'Region XI', category: 'Field Office' },
  ];

  const analytics = computeGeospatialAnalytics(dataset);
  assert.equal(analytics.totalEntities, 6);
  assert.equal(analytics.islandCounts.Luzon, 3);
  assert.equal(analytics.islandCounts.Visayas, 2);
  assert.equal(analytics.islandCounts.Mindanao, 1);
  assert.equal(analytics.islandPercentages.Luzon, 50);

  assert.equal(analytics.regionalLeaderboard[0].regionCode, 'NCR');
  assert.equal(analytics.regionalLeaderboard[0].count, 3);
  assert.equal(analytics.regionalLeaderboard[1].regionCode, 'Region VII');
  assert.equal(analytics.regionalLeaderboard[1].count, 2);
  assert.equal(analytics.regionalLeaderboard[2].regionCode, 'Region XI');
  assert.equal(analytics.regionalLeaderboard[2].count, 1);
});

test('Phase 3: Data Export to GeoJSON and CSV', () => {
  const dataset = [
    {
      id: 'pt-1',
      name: 'Clark International Airport',
      lat: 15.1860,
      lon: 120.5596,
      category: 'Airport',
      operationalTier: 'International Port of Entry',
      islandGroup: 'Luzon',
      region: 'Region III',
      country: 'Philippines',
    },
    {
      id: 'pt-2',
      name: 'Batangas International Port',
      lat: 13.7565,
      lon: 121.0440,
      category: 'Seaport',
      operationalTier: 'International Port of Entry',
      islandGroup: 'Luzon',
      region: 'Region IV-A',
      country: 'Philippines',
    },
  ];

  // GeoJSON export test
  const geoJsonString = exportEntitiesToGeoJSON(dataset);
  const parsed = JSON.parse(geoJsonString);
  assert.equal(parsed.type, 'FeatureCollection');
  assert.equal(parsed.features.length, 2);
  assert.equal(parsed.features[0].geometry.type, 'Point');
  assert.deepEqual(parsed.features[0].geometry.coordinates, [120.5596, 15.1860, 0]);
  assert.equal(parsed.features[0].properties.name, 'Clark International Airport');
  assert.equal(parsed.features[0].properties.islandGroup, 'Luzon');
  assert.equal(parsed.features[0].properties.region, 'Region III');

  // CSV export test
  const csvString = exportEntitiesToCSV(dataset);
  assert.ok(csvString.includes('Name,Latitude,Longitude,Category,InjectedClassification,OperationalTier'));
  assert.ok(csvString.includes('Clark International Airport'));
  assert.ok(csvString.includes('Batangas International Port'));
  assert.ok(csvString.includes('Region IV-A'));
});

test('Phase 3: urlIntelligenceLayer Territorial Bounds and Export Integration', () => {
  // Test bounds visibility toggle
  urlIntelligenceLayer.setTerritorialBoundsVisible(false);
  assert.equal(urlIntelligenceLayer.getTerritorialBoundsVisible(), false);
  urlIntelligenceLayer.setTerritorialBoundsVisible(true);
  assert.equal(urlIntelligenceLayer.getTerritorialBoundsVisible(), true);

  // Test export integration
  const exportedGeo = urlIntelligenceLayer.exportActiveEntities('geojson');
  assert.ok(typeof exportedGeo === 'string');
  const parsed = JSON.parse(exportedGeo);
  assert.equal(parsed.type, 'FeatureCollection');

  const exportedCsv = urlIntelligenceLayer.exportActiveEntities('csv');
  assert.ok(typeof exportedCsv === 'string');

  const exportedJson = urlIntelligenceLayer.exportActiveEntities('json');
  assert.ok(typeof exportedJson === 'string');
  assert.ok(Array.isArray(JSON.parse(exportedJson)));
});
