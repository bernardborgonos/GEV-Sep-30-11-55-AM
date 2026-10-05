import test from 'node:test';
import assert from 'node:assert/strict';
import {
  featureToGeoJson,
  featuresToGeoJsonCollection,
  featureToKmlPlacemark,
  featuresToKmlDocument,
  parseImportedGeoJson,
  parseImportedKml,
  importTacticalLayerContent,
  verifyGeoJsonRoundTrip,
  toKmlColor,
  kmlColorToHex,
} from './tacticalGeoExport.js';
import { MapToolsEngine, FEATURE_TYPES } from './mapToolsEngine.js';

test('Tactical Geo Export & Import Suite', async (t) => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });

  await t.test('1.1: converts point and range ring features to RFC 7946 GeoJSON', () => {
    const point = engine.createFeature({
      name: 'Alpha Observation Post',
      type: FEATURE_TYPES.POINT,
      coordinates: [120.9842, 14.5995],
      properties: { notes: 'Primary coastal radar' },
      style: { color: '#00e5ff' },
    });

    const geojsonPoint = featureToGeoJson(point);
    assert.equal(geojsonPoint.type, 'Feature');
    assert.equal(geojsonPoint.geometry.type, 'Point');
    assert.deepEqual(geojsonPoint.geometry.coordinates, [120.9842, 14.5995]);
    assert.equal(geojsonPoint.properties['gev:name'], 'Alpha Observation Post');
    assert.equal(geojsonPoint.properties['gev:color'], '#00e5ff');

    const ring = engine.createFeature({
      name: 'Subic Radar Perimeter',
      type: FEATURE_TYPES.RANGE_RING,
      coordinates: [120.28, 14.82],
      properties: { radii: [15000, 30000] },
    });

    const geojsonRing = featureToGeoJson(ring);
    assert.equal(geojsonRing.type, 'Feature');
    assert.ok(['MultiLineString', 'Polygon'].includes(geojsonRing.geometry.type));
  });

  await t.test('1.2: converts features collection to GeoJSON FeatureCollection', () => {
    const all = engine.getAllFeatures();
    const collection = featuresToGeoJsonCollection(all);
    assert.equal(collection.type, 'FeatureCollection');
    assert.equal(collection.features.length, 2);
    assert.equal(collection.properties.featureCount, 2);
  });

  await t.test('1.3: converts features to OGC KML Document with proper Placemarks and Styles', () => {
    const all = engine.getAllFeatures();
    const kml = featuresToKmlDocument(all, { title: 'Test Sector' });
    assert.ok(kml.includes('<kml xmlns="http://www.opengis.net/kml/2.2">'));
    assert.ok(kml.includes('<name>Test Sector</name>'));
    assert.ok(kml.includes('<Placemark>'));
    assert.ok(kml.includes('Alpha Observation Post'));
  });

  await t.test('1.4: converts hex colors to KML aabbggrr format and back correctly', () => {
    const kmlColor = toKmlColor('#00e5ff', 1.0);
    assert.equal(kmlColor.length, 8);
    assert.ok(kmlColor.startsWith('ff'));

    const hex = kmlColorToHex(kmlColor);
    assert.equal(hex.toLowerCase(), '#00e5ff');
  });

  await t.test('1.5: parses imported GeoJSON string into compatible feature inputs', () => {
    const sampleGeoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [121.05, 14.55] },
          properties: {
            name: 'Imported Checkpoint',
            notes: 'Restricted Entry',
            color: '#10b981',
          },
        },
      ],
    });

    const parsed = parseImportedGeoJson(sampleGeoJson);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'Imported Checkpoint');
    assert.deepEqual(parsed[0].coordinates, [121.05, 14.55]);

    const created = engine.createFeature(parsed[0]);
    assert.equal(created.name, 'Imported Checkpoint');
    assert.equal(created.type, 'point');
  });

  await t.test('1.6: verifies round-trip export and import of GeoJSON files with zero geometric or metadata loss', () => {
    const features = [
      engine.createFeature({
        name: 'Bravo Polygon Sector',
        type: FEATURE_TYPES.POLYGON,
        coordinates: [
          [120.95, 14.50],
          [121.05, 14.50],
          [121.05, 14.60],
          [120.95, 14.60],
          [120.95, 14.50],
        ],
        properties: { notes: 'Restricted Airspace Zulu', classification: 'SECRET' },
        style: { color: '#ef4444' },
      }),
      engine.createFeature({
        name: 'Patrol Corridor Echo',
        type: FEATURE_TYPES.LINE,
        coordinates: [
          [120.90, 14.40],
          [121.10, 14.70],
        ],
        properties: { corridorWidthNm: 5 },
        style: { color: '#f59e0b' },
      }),
    ];

    const roundTrip = verifyGeoJsonRoundTrip(features);
    assert.equal(roundTrip.success, true);
    assert.equal(roundTrip.count, 2);
    assert.equal(roundTrip.lossCount, 0);
  });

  await t.test('1.7: parses OGC KML with ExtendedData and geometries via universal importer', () => {
    const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Naval Sector Delta</name>
    <Placemark id="f-placemark-1">
      <name>Delta Anchor POI</name>
      <description>Anchorage harbor buoy</description>
      <ExtendedData>
        <Data name="gev:type"><value>point</value></Data>
        <Data name="gev:color"><value>#10b981</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>120.92,14.55,0</coordinates>
      </Point>
    </Placemark>
    <Placemark id="f-placemark-2">
      <name>Exclusion Polygon</name>
      <ExtendedData>
        <Data name="gev:type"><value>polygon</value></Data>
        <Data name="gev:color"><value>#ef4444</value></Data>
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>120.8,14.4,0 120.9,14.4,0 120.9,14.5,0 120.8,14.5,0 120.8,14.4,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    const parsedKml = parseImportedKml(sampleKml);
    assert.equal(parsedKml.length, 2);
    assert.equal(parsedKml[0].name, 'Delta Anchor POI');
    assert.deepEqual(parsedKml[0].coordinates, [120.92, 14.55]);
    assert.equal(parsedKml[0].style.color, '#10b981');

    assert.equal(parsedKml[1].name, 'Exclusion Polygon');
    assert.equal(parsedKml[1].type, 'polygon');
    assert.equal(parsedKml[1].coordinates.length, 5);

    // Universal parser test
    const universal = importTacticalLayerContent(sampleKml, 'naval_sector_delta.kml');
    assert.equal(universal.length, 2);
  });
});
