/**
 * @file src/plugins/mapToolsPluginSystem.test.mjs
 * @description Unit tests for the Modular Map Tools Plugin System
 * covering Plugin Contracts, Drawing, Measurements, Shape, and Registry.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BaseMapToolPlugin,
  PLUGIN_CATEGORIES,
  PLUGIN_LIFECYCLE_STATES,
} from './pluginContract.js';
import { DrawingPlugin, DRAWING_MODES, getModeActionLabel } from './drawing/drawingPlugin.js';
import {
  calculateBearing,
  calculateDistance,
  generateVectorArrowGeometry,
  generateWaypointsRoute,
} from './drawing/tacticalDrawingController.js';
import { MapToolsEngine, FEATURE_TYPES } from '../tools/mapToolsEngine.js';
import { MeasurementsPlugin, MEASUREMENT_TYPES, MEASUREMENT_UNITS } from './measurements/measurementsPlugin.js';
import { ShapePlugin, SHAPE_TYPES } from './shape/shapePlugin.js';
import { MapToolsPluginRegistry } from './mapToolsPluginRegistry.js';
import { TACTICAL_ADDON_CATALOG } from './addonCatalog.js';
import {
  loadOperatorPreset,
  saveOperatorPreset,
  resetOperatorPreset,
  getSavedInstalledAddons,
  saveInstalledAddons,
  DEFAULT_OPERATOR_PRESET,
} from './operatorPresetManager.js';

test('BaseMapToolPlugin enforces manifest contract and lifecycle transitions', async () => {
  assert.throws(() => new BaseMapToolPlugin({}), /manifest must contain "id" and "name"/);

  const plugin = new BaseMapToolPlugin({
    id: 'test-tool',
    name: 'Test Tool',
    version: '2.1.0',
    category: PLUGIN_CATEGORIES.INTELLIGENCE,
    capabilities: ['telemetry-radar'],
  });

  assert.equal(plugin.id, 'test-tool');
  assert.equal(plugin.name, 'Test Tool');
  assert.equal(plugin.version, '2.1.0');
  assert.equal(plugin.category, PLUGIN_CATEGORIES.INTELLIGENCE);
  assert.equal(plugin.state, PLUGIN_LIFECYCLE_STATES.UNINSTALLED);

  await plugin.install({ mockHost: true });
  assert.equal(plugin.state, PLUGIN_LIFECYCLE_STATES.INSTALLED);

  plugin.activate();
  assert.equal(plugin.state, PLUGIN_LIFECYCLE_STATES.ACTIVE);

  plugin.deactivate();
  assert.equal(plugin.state, PLUGIN_LIFECYCLE_STATES.INACTIVE);

  const manifest = plugin.exportManifest();
  assert.equal(manifest.manifest.id, 'test-tool');
  assert.equal(manifest.manifest.version, '2.1.0');
  assert.deepEqual(manifest.manifest.capabilities, ['telemetry-radar']);

  await plugin.uninstall();
  assert.equal(plugin.state, PLUGIN_LIFECYCLE_STATES.UNINSTALLED);
});

test('DrawingPlugin initializes with drawing modes and renders DOM matching Map Tools-Drawing', async () => {
  const plugin = new DrawingPlugin();
  assert.equal(plugin.id, 'drawing');
  assert.equal(plugin.name, 'Drawing Tools');
  assert.equal(plugin.category, PLUGIN_CATEGORIES.DRAWING);

  // Mock DOM container
  const container = {
    innerHTML: '',
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };

  plugin.render(container);
  assert.match(container.innerHTML, /DRAWING MODE/);
  assert.match(container.innerHTML, /Line \/ Path/);
  assert.match(container.innerHTML, /Vector Arrow/);
  assert.match(container.innerHTML, /POI Marker/);
  assert.match(container.innerHTML, /Waypoints/);
  assert.match(container.innerHTML, /TACTICAL STYLING/);
  assert.match(container.innerHTML, /DRAW LINE \/ PATH/);
  assert.match(container.innerHTML, /RESET/);

  // Verify icon-only design with alt text & narrow compact capsule
  assert.match(container.innerHTML, /drawing-modes-capsule/);
  assert.doesNotMatch(container.innerHTML, /class="mode-text"/);
  assert.match(container.innerHTML, /class="sr-only">Line \/ Path<\/span>/);
  assert.match(container.innerHTML, /aria-label="Line \/ Path"/);
  assert.match(container.innerHTML, /aria-label="Vector Arrow"/);
  assert.match(container.innerHTML, /aria-label="POI Marker"/);
  assert.match(container.innerHTML, /aria-label="Waypoints"/);

  // Test dynamic action labels for all 4 drawing modes
  assert.equal(getModeActionLabel(DRAWING_MODES.POLYLINE), 'DRAW LINE / PATH');
  assert.equal(getModeActionLabel(DRAWING_MODES.ARROW), 'DRAW VECTOR ARROW');
  assert.equal(getModeActionLabel(DRAWING_MODES.MARKER), 'PLACE POI MARKER');
  assert.equal(getModeActionLabel(DRAWING_MODES.WAYPOINTS), 'PLOT WAYPOINTS');
});

test('MeasurementsPlugin performs accurate geodesic distance, area, and bearing calculations', async () => {
  const plugin = new MeasurementsPlugin();
  assert.equal(plugin.id, 'measurements');
  assert.equal(plugin.name, 'Measurements');

  // Coordinates between New York (JFK) and London (LHR) approx
  const points = [
    { lon: -73.7781, lat: 40.6413 },
    { lon: -0.4543, lat: 51.4700 },
  ];

  plugin.setMeasuredCoordinates(points);
  assert.ok(plugin._measuredMetrics.distanceKm > 5500 && plugin._measuredMetrics.distanceKm < 5650);
  assert.ok(plugin._measuredMetrics.distanceNm > 2900 && plugin._measuredMetrics.distanceNm < 3100);
  assert.ok(plugin._measuredMetrics.bearingDeg > 45 && plugin._measuredMetrics.bearingDeg < 65);
  assert.equal(plugin._measuredMetrics.pointCount, 2);

  // Test polygon area calculation with 3 coordinates
  const triangle = [
    { lon: -97.7431, lat: 30.2672 },
    { lon: -97.7331, lat: 30.2672 },
    { lon: -97.7381, lat: 30.2772 },
  ];
  plugin.setMeasuredCoordinates(triangle);
  assert.ok(plugin._measuredMetrics.areaKm2 > 0);
  assert.equal(plugin._measuredMetrics.pointCount, 3);
});

test('ShapePlugin provides perimeter and watchdog breach alerting capabilities (placeholder mode)', async () => {
  const plugin = new ShapePlugin();
  assert.equal(plugin.id, 'shape');
  assert.equal(plugin.name, 'Shape & Perimeter');
  assert.equal(plugin.category, PLUGIN_CATEGORIES.SHAPE);

  const container = {
    innerHTML: '',
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };

  plugin.render(container);
  assert.match(container.innerHTML, /PERIMETER & GEOFENCE SUITE/);
  assert.ok(container.innerHTML.length > 50);
});

test('MapToolsPluginRegistry coordinates registration, lifecycle, and dynamic addon installation', async () => {
  const registry = new MapToolsPluginRegistry();

  const drawing = new DrawingPlugin();
  const measurements = new MeasurementsPlugin();
  const shape = new ShapePlugin();

  assert.equal(await registry.registerPlugin(drawing), true);
  assert.equal(await registry.registerPlugin(measurements), true);
  assert.equal(await registry.registerPlugin(shape), true);

  // Duplicate registration should be safely rejected
  assert.equal(await registry.registerPlugin(drawing), false);

  assert.equal(registry.getAllPlugins().length, 3);
  assert.equal(registry.getPlugin('drawing'), drawing);
  assert.equal(registry.getPlugin('measurements'), measurements);
  assert.equal(registry.getPlugin('shape'), shape);

  // Activation
  registry.activatePlugin('measurements');
  assert.equal(registry.getActivePlugin(), measurements);

  registry.activatePlugin('drawing');
  assert.equal(registry.getActivePlugin(), drawing);

  // Export Manifest Bundle
  const bundle = registry.exportManifestBundle();
  assert.equal(bundle.schemaVersion, '1.0.0');
  assert.equal(bundle.pluginCount, 3);
  assert.equal(bundle.plugins.length, 3);

  // Dynamic Addon Installation from Portable Manifest Specification
  const externalAddonManifest = {
    schemaVersion: '1.0.0',
    manifest: {
      id: 'satellite-recon-addon',
      name: 'Orbital Recon Addon',
      version: '1.2.0',
      category: 'intelligence',
      description: 'Dynamic satellite pass footprint tracker.',
    },
  };

  const installedAddon = await registry.installFromManifest(externalAddonManifest);
  assert.equal(installedAddon.id, 'satellite-recon-addon');
  assert.equal(installedAddon.version, '1.2.0');
  assert.equal(registry.getAllPlugins().length, 4);

  // Teardown
  assert.equal(await registry.unregisterPlugin('satellite-recon-addon'), true);
  assert.equal(registry.getAllPlugins().length, 3);
});

test('index.html contains #map-tools-panel in #left-panel-stack between data-panel and scenes', () => {
  const html = readFileSync('./index.html', 'utf8');

  // Verify map-tools-panel exists
  assert.match(html, /<div id="map-tools-panel" class="panel-collapsible[^"]*" data-panel-id="map-tools-panel">/);

  // Verify sub-tabs
  assert.match(html, /data-plugin-id="drawing"/);
  assert.match(html, /data-plugin-id="measurements"/);
  assert.match(html, /data-plugin-id="shape"/);

  // Verify DOM order: data-panel appears before map-tools-panel, and scenes appear after
  const dataPanelIndex = html.indexOf('id="data-panel"');
  const mapToolsPanelIndex = html.indexOf('id="map-tools-panel"');
  const scenePanelIndex = html.indexOf('id="scene-panel"');

  assert.ok(dataPanelIndex > 0, 'data-panel exists');
  assert.ok(mapToolsPanelIndex > dataPanelIndex, 'map-tools-panel is inserted after data-panel');
  assert.ok(scenePanelIndex > mapToolsPanelIndex, 'scene-panel is placed after map-tools-panel');

  // Verify + ADDON button exists in footer actions
  assert.match(html, /id="map-tools-manage-addons-btn"/);
  assert.match(html, /\+ ADDON/);
});

test('operatorPresetManager handles defaults, saving, and addon list persistence', () => {
  // Mock localStorage in test environment
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
  };

  const initial = loadOperatorPreset();
  assert.equal(initial.activePluginId, 'drawing');
  assert.equal(initial.drawing.strokeWidth, 3);
  assert.equal(initial.measurements.unit, 'nm');
  assert.equal(initial.shape.radiusKm, 25);

  const updated = saveOperatorPreset({
    activePluginId: 'measurements',
    drawing: { strokeWidth: 5, selectedColor: '#ef4444' },
    measurements: { unit: 'metric' },
    shape: { radiusKm: 50 },
  });

  assert.equal(updated.activePluginId, 'measurements');
  assert.equal(updated.drawing.strokeWidth, 5);
  assert.equal(updated.drawing.selectedColor, '#ef4444');
  assert.equal(updated.measurements.unit, 'metric');
  assert.equal(updated.shape.radiusKm, 50);

  const loaded = loadOperatorPreset();
  assert.equal(loaded.activePluginId, 'measurements');
  assert.equal(loaded.drawing.strokeWidth, 5);
  assert.equal(loaded.measurements.unit, 'metric');

  // Reset
  const reset = resetOperatorPreset();
  assert.equal(reset.activePluginId, 'drawing');
  assert.equal(reset.drawing.strokeWidth, 3);

  // Addon list storage
  assert.deepEqual(getSavedInstalledAddons(), []);
  saveInstalledAddons([{ id: 'satellite-footprint', isCatalog: true }]);
  assert.deepEqual(getSavedInstalledAddons(), [{ id: 'satellite-footprint', isCatalog: true }]);

  delete globalThis.localStorage;
});

test('TACTICAL_ADDON_CATALOG exposes valid modular addons that instantiate cleanly', async () => {
  assert.ok(Array.isArray(TACTICAL_ADDON_CATALOG));
  assert.ok(TACTICAL_ADDON_CATALOG.length >= 4);

  const sat = TACTICAL_ADDON_CATALOG.find((c) => c.id === 'satellite-footprint');
  assert.ok(sat, 'satellite-footprint addon exists');
  assert.equal(sat.category, 'intelligence');
  assert.ok(sat.capabilities.includes('orbital-swath'));

  const plugin = sat.createPlugin();
  assert.equal(plugin.id, 'satellite-footprint');
  assert.equal(plugin.name, sat.name);

  // Test render
  const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  plugin.render(container);
  assert.match(container.innerHTML, /ORBITAL SWATH PARAMETERS/);
  assert.match(container.innerHTML, /PROJECT PASS FOOTPRINT/);

  // Register in registry
  const registry = new MapToolsPluginRegistry();
  await registry.registerPlugin(plugin);
  assert.equal(registry.getPlugin('satellite-footprint'), plugin);
  assert.equal(await registry.unregisterPlugin('satellite-footprint'), true);
});

test('Backend Simulation: Vector Arrow calculates accurate bearing, distance, and arrowhead geometry', () => {
  // Origin: SFO (approx -122.375, 37.619)
  // Target: OAK (approx -122.221, 37.721)
  const origin = { lng: -122.375, lat: 37.619 };
  const target = { lng: -122.221, lat: 37.721 };

  const arrow = generateVectorArrowGeometry(origin, target);

  assert.ok(arrow.bearing > 40 && arrow.bearing < 60, `Bearing expected ~50°, received ${arrow.bearing}`);
  assert.ok(arrow.distanceKm > 15 && arrow.distanceKm < 22, `Distance expected ~17km, received ${arrow.distanceKm}`);
  assert.ok(arrow.distanceNm > 8 && arrow.distanceNm < 12, `Distance expected ~9.5NM, received ${arrow.distanceNm}`);

  // Shaft coordinates
  assert.equal(arrow.shaft.length, 2);
  assert.deepEqual(arrow.shaft[0], origin);
  assert.deepEqual(arrow.shaft[1], target);

  // Arrowhead wings
  assert.equal(arrow.arrowhead.length, 3);
  assert.deepEqual(arrow.arrowhead[1], target); // apex is target
  assert.ok(arrow.arrowhead[0].lng !== arrow.arrowhead[2].lng, 'Wingtips have distinct coordinates');

  // Label formatting
  assert.match(arrow.label, /▶ \d{3}° · \d+\.\d+ km \(\d+\.\d+ NM\)/);
});

test('Backend Simulation: Waypoints generates sequential route, leg metrics, and cumulative distances', () => {
  const points = [
    { lng: -122.4194, lat: 37.7749 }, // WP-01
    { lng: -122.3894, lat: 37.7849 }, // WP-02
    { lng: -122.3500, lat: 37.7950 }, // WP-03
  ];

  const route = generateWaypointsRoute(points, { prefix: 'WP' });

  assert.equal(route.waypoints.length, 3);
  assert.equal(route.legs.length, 2);

  // Waypoints metadata
  assert.equal(route.waypoints[0].id, 'WP-01');
  assert.equal(route.waypoints[1].id, 'WP-02');
  assert.equal(route.waypoints[2].id, 'WP-03');

  assert.equal(route.waypoints[0].cumulativeDistanceKm, 0);
  assert.ok(route.waypoints[1].cumulativeDistanceKm > 2 && route.waypoints[1].cumulativeDistanceKm < 5);
  assert.ok(route.waypoints[2].cumulativeDistanceKm > route.waypoints[1].cumulativeDistanceKm);

  // Total metrics
  assert.ok(route.totalDistanceKm > 6 && route.totalDistanceKm < 10);
  assert.ok(route.totalDistanceNm > 3 && route.totalDistanceNm < 6);

  // Leg 1 metrics
  assert.equal(route.legs[0].fromId, 'WP-01');
  assert.equal(route.legs[0].toId, 'WP-02');
  assert.ok(route.legs[0].distanceMeters > 2000);
});

test('Backend Simulation: DrawingPlugin executes complete drafting lifecycle across all 4 modes', async () => {
  const engine = new MapToolsEngine({ syncWindowEvents: false });
  const plugin = new DrawingPlugin();

  await plugin.install({ engine });
  plugin.activate();

  // Mode 1: Line / Path
  plugin.setMode(DRAWING_MODES.POLYLINE);
  assert.equal(plugin.config.activeMode, DRAWING_MODES.POLYLINE);
  plugin.startInteractiveDraft();
  let features = engine.getAllFeatures();
  assert.equal(features.length, 1);
  assert.equal(features[0].type, FEATURE_TYPES.LINE);
  assert.equal(features[0].properties.drawingSubtype, 'polyline');

  // Mode 2: Vector Arrow
  plugin.setMode(DRAWING_MODES.ARROW);
  assert.equal(plugin.config.activeMode, DRAWING_MODES.ARROW);
  plugin.startInteractiveDraft();
  features = engine.getAllFeatures();
  assert.equal(features.length, 2);
  const arrowFeature = features.find((f) => f.properties.drawingSubtype === 'arrow');
  assert.ok(arrowFeature);
  assert.ok(arrowFeature.properties.arrowData);

  // Mode 3: POI Marker
  plugin.setMode(DRAWING_MODES.MARKER);
  assert.equal(plugin.config.activeMode, DRAWING_MODES.MARKER);
  plugin.startInteractiveDraft();
  features = engine.getAllFeatures();
  assert.equal(features.length, 3);
  const markerFeature = features.find((f) => f.properties.drawingSubtype === 'marker');
  assert.ok(markerFeature);
  assert.equal(markerFeature.type, FEATURE_TYPES.POINT);

  // Mode 4: Waypoints
  plugin.setMode(DRAWING_MODES.WAYPOINTS);
  assert.equal(plugin.config.activeMode, DRAWING_MODES.WAYPOINTS);
  plugin.startInteractiveDraft();
  features = engine.getAllFeatures();
  assert.equal(features.length, 4);
  const waypointsFeature = features.find((f) => f.properties.drawingSubtype === 'waypoints');
  assert.ok(waypointsFeature);
  assert.ok(waypointsFeature.properties.routeData);
  assert.equal(waypointsFeature.properties.routeData.waypoints.length, 3);

  // Verify Reset
  plugin.cancelActiveDraft();
  assert.equal(plugin._statusText, 'Draft reset');

  await plugin.uninstall();
  engine.destroy();
});

test('CSS Verification: Floating #shaper-cad-toolbar is hidden by default and relocated into Map Tools -> Drawing', () => {
  const css = readFileSync('style.css', 'utf-8');
  assert.match(css, /#shaper-cad-toolbar\s*\{[^}]*display:\s*none\s*!important/);
});

test('Working Drawing Tools placeholder verification: Embedded capsule renders in Map Tools -> Drawing with all 6 tools and float toggle', async () => {
  const plugin = new DrawingPlugin();
  const mockContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  plugin.render(mockContainer);

  const html = mockContainer.innerHTML;
  // Verify proper placeholder header and float toggle button
  assert.match(html, /WORKING DRAWING TOOLS/);
  assert.match(html, /id="drawing-toggle-float-btn"/);
  assert.match(html, /id="working-drawing-tools-capsule"/);

  // Verify all 6 tools from Working Drawing Tools are present
  assert.match(html, /data-shaper-tool="pan"/);
  assert.match(html, /data-shaper-tool="select-modify"/);
  assert.match(html, /data-shaper-tool="draw-polygon"/);
  assert.match(html, /data-shaper-tool="draw-polyline"/);
  assert.match(html, /data-shaper-tool="draw-marker"/);
  assert.match(html, /data-shaper-tool="ground-observer"/);

  // Verify the 4 tactical modes from Map Tools-Drawing are also present
  assert.match(html, /Line \/ Path/);
  assert.match(html, /Vector Arrow/);
  assert.match(html, /POI Marker/);
  assert.match(html, /Waypoints/);

  // Verify Tactical Styling swatches and stroke slider
  assert.match(html, /TACTICAL STYLING/);
  assert.match(html, /id="drawing-stroke-slider"/);
  assert.match(html, /id="drawing-start-btn"/);
  assert.match(html, /RESET/);
});

test('CSS Verification: #map-tools-panel matches #data-panel width (280px)', () => {
  const css = readFileSync('style.css', 'utf-8');
  assert.match(css, /#map-tools-panel\s*\{[^}]*--panel-expanded-width:\s*280px/);
  assert.match(css, /#map-tools-panel\s*\{[^}]*max-width:\s*var\(--panel-expanded-width\)/);
});

test('Map Tools Sub-components: All 7 plugins render complete functional UI content with intended controls', async () => {
  const { PLUGIN_TAB_METADATA } = await import('./mapToolsPluginRegistry.js');
  assert.ok(PLUGIN_TAB_METADATA.drawing);
  assert.ok(PLUGIN_TAB_METADATA.measurements);
  assert.ok(PLUGIN_TAB_METADATA.shape);
  assert.ok(PLUGIN_TAB_METADATA['satellite-footprint']);
  assert.ok(PLUGIN_TAB_METADATA['sensor-los-cone']);
  assert.ok(PLUGIN_TAB_METADATA['mgrs-tactical-grid']);
  assert.ok(PLUGIN_TAB_METADATA['weather-hazard-buffer']);

  // Verify short labels
  assert.equal(PLUGIN_TAB_METADATA.drawing.shortName, 'DRAWING');
  assert.equal(PLUGIN_TAB_METADATA.measurements.shortName, 'MEASURE');
  assert.equal(PLUGIN_TAB_METADATA.shape.shortName, 'SHAPE');
  assert.equal(PLUGIN_TAB_METADATA['satellite-footprint'].shortName, 'SATELLITE');
  assert.equal(PLUGIN_TAB_METADATA['sensor-los-cone'].shortName, 'RADAR');
  assert.equal(PLUGIN_TAB_METADATA['mgrs-tactical-grid'].shortName, 'MGRS');
  assert.equal(PLUGIN_TAB_METADATA['weather-hazard-buffer'].shortName, 'WEATHER');

  // Verify each subcomponent renders non-empty DOM with its intended tactical controls
  const registry = new MapToolsPluginRegistry();
  await registry.registerPlugin(new DrawingPlugin());
  await registry.registerPlugin(new MeasurementsPlugin());
  await registry.registerPlugin(new ShapePlugin());
  for (const cat of TACTICAL_ADDON_CATALOG) {
    await registry.registerPlugin(cat.createPlugin());
  }

  const dummyHost = {
    innerHTML: '',
    scrollTop: 0,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  // 1. Drawing
  registry.activatePlugin('drawing', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /WORKING DRAWING TOOLS/);
  assert.match(dummyHost.innerHTML, /TACTICAL STYLING/);

  // 2. Measure (Active Geodesic Suite)
  registry.activatePlugin('measurements', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /GEODESIC MEASUREMENTS/);
  assert.match(dummyHost.innerHTML, /GEODESIC READOUT/);

  // 3. Shape (Perimeter Suite)
  registry.activatePlugin('shape', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /PERIMETER & GEOFENCE SUITE/);
  assert.match(dummyHost.innerHTML, /SHAPE & PERIMETER MODULE/);

  // 4. Satellite
  registry.activatePlugin('satellite-footprint', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /ORBITAL SWATH PARAMETERS/);
  assert.match(dummyHost.innerHTML, /addon-sat-swath/);
  assert.match(dummyHost.innerHTML, /addon-sat-calc-btn/);
  assert.match(dummyHost.innerHTML, /PROJECT PASS FOOTPRINT/);

  // 5. Radar
  registry.activatePlugin('sensor-los-cone', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /RADAR & SENSOR PARAMETERS/);
  assert.match(dummyHost.innerHTML, /addon-sensor-range/);
  assert.match(dummyHost.innerHTML, /addon-sensor-cast-btn/);
  assert.match(dummyHost.innerHTML, /CAST 3D RADAR CONE/);

  // 6. MGRS
  registry.activatePlugin('mgrs-tactical-grid', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /MGRS TACTICAL GRID CONTROLS/);
  assert.match(dummyHost.innerHTML, /data-density="100km"/);
  assert.match(dummyHost.innerHTML, /addon-mgrs-toggle-btn/);
  assert.match(dummyHost.innerHTML, /TOGGLE GRID OVERLAY/);

  // 7. Weather
  registry.activatePlugin('weather-hazard-buffer', dummyHost);
  assert.ok(dummyHost.innerHTML.length > 50);
  assert.match(dummyHost.innerHTML, /HAZARD STANDOFF PARAMETERS/);
  assert.match(dummyHost.innerHTML, /addon-wx-standoff/);
  assert.match(dummyHost.innerHTML, /addon-wx-apply-btn/);
});

test('index.html contains all 7 sub-tabs in #map-tools-plugin-nav', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.match(html, /data-plugin-id="drawing"/);
  assert.match(html, /data-plugin-id="measurements"/);
  assert.match(html, /data-plugin-id="shape"/);
  assert.match(html, /data-plugin-id="satellite-footprint"/);
  assert.match(html, /data-plugin-id="sensor-los-cone"/);
  assert.match(html, /data-plugin-id="mgrs-tactical-grid"/);
  assert.match(html, /data-plugin-id="weather-hazard-buffer"/);
});

test('CSS Layout Constraints: #map-tools-panel has min-height 400px and tabs scroll horizontally without vertical bloat', () => {
  const css = readFileSync('style.css', 'utf-8');
  assert.match(css, /#left-panel-stack\s*>\s*#map-tools-panel:not\(\.collapsed\)\s*\{[^}]*min-height:\s*400px;/);
  assert.match(css, /\.map-tools-plugin-tabs\s*\{[^}]*flex-wrap:\s*nowrap;/);
  assert.match(css, /\.map-tools-plugin-tabs\s*\{[^}]*overflow-x:\s*auto;/);
  assert.match(css, /\.map-tools-plugin-body\s*\{[^}]*min-height:\s*240px;/);
});



