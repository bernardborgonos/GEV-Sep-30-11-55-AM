/**
 * @module src/plugins/addonCatalog.js
 * @description Catalog of Pre-Built Modular Tactical Addon Plugins.
 *
 * Demonstrates modular portability where external specialized tactical capabilities
 * can be installed, dynamically mounted, and configured at runtime without core codebase changes.
 */

import { PLUGIN_CATEGORIES } from './pluginContract.js';
import { SatellitePlugin } from './satellite/satellitePlugin.js';
import { RadarPlugin } from './radar/radarPlugin.js';
import { MgrsPlugin } from './mgrs/mgrsPlugin.js';
import { WeatherPlugin } from './weather/weatherPlugin.js';

export const TACTICAL_ADDON_CATALOG = Object.freeze([
  {
    id: 'satellite-footprint',
    name: 'Satellite Pass & Ground Swath',
    version: '1.2.0',
    category: PLUGIN_CATEGORIES.INTELLIGENCE,
    icon: '🛰️',
    description: 'Calculate orbital nadir ground tracks, sensor swath footprint widths, and pass elevation masks.',
    capabilities: ['orbital-swath', 'ground-track', 'elevation-mask', 'footprint-polygon', 'canvas-pick'],
    author: 'GEV Orbital Recon Unit',
    defaultConfig: {
      swathWidthKm: 450,
      minElevationDeg: 15,
      orbitalRegime: 'LEO',
      showNadirTrack: true,
      swathColor: '#00e5ff',
    },
    createPlugin() {
      return new SatellitePlugin();
    },
  },

  {
    id: 'sensor-los-cone',
    name: 'Radar & Line-of-Sight Cone',
    version: '1.2.0',
    category: PLUGIN_CATEGORIES.ANALYTICS,
    icon: '📡',
    description: '3D sensor field-of-view, radar horizon line-of-sight analysis, and terrain mask occlusion.',
    capabilities: ['sensor-cone', 'radar-horizon', 'terrain-mask', 'azimuth-fan', 'canvas-pick'],
    author: 'Tactical Electronic Warfare Lab',
    defaultConfig: {
      rangeKm: 80,
      azimuthSpanDeg: 90,
      sensorHeightM: 25,
      coneColor: '#f59e0b',
    },
    createPlugin() {
      return new RadarPlugin();
    },
  },

  {
    id: 'mgrs-tactical-grid',
    name: 'MGRS & Tactical Coordinate Grid',
    version: '1.2.0',
    category: PLUGIN_CATEGORIES.INTELLIGENCE,
    icon: '🌐',
    description: 'Military Grid Reference System 100km square identifiers, 10km grid lines, and precision UTM coordinates.',
    capabilities: ['mgrs-grid', 'utm-projection', 'grid-labels', 'coordinate-conversion', 'canvas-pick'],
    author: 'NATO GeoSpatial Division',
    defaultConfig: {
      activeDensity: '10km',
      opacity: 40,
      showLabels: true,
      overlayActive: false,
    },
    createPlugin() {
      return new MgrsPlugin();
    },
  },

  {
    id: 'weather-hazard-buffer',
    name: 'Weather & SIGMET Avoidance Buffer',
    version: '1.2.0',
    category: PLUGIN_CATEGORIES.UTILITY,
    icon: '⛈️',
    description: 'Dynamic convective storm cell standoff envelopes, icing levels, and SIGMET turbulence clearance zones.',
    capabilities: ['weather-buffer', 'convective-standoff', 'sigmet-corridor', 'aviation-safety', 'canvas-pick'],
    author: 'Aero-Meteorology Command',
    defaultConfig: {
      standoffNm: 20,
      flightLevel: 320,
      showTStormBuffer: true,
      hazardColor: '#ef4444',
    },
    createPlugin() {
      return new WeatherPlugin();
    },
  },
]);
