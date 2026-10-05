/**
 * Custom Map Tiles & Imagery Layers Manager.
 * Supports XYZ / TMS / Slippy Map Tiles, WMS, WMTS, ArcGIS MapServer, and 3D Tilesets.
 * Persists user custom tile layers in localStorage and manages live Cesium ImageryLayers.
 */

import * as Cesium from 'cesium';

const STORAGE_KEY = 'gev_custom_tile_layers';

/** Preset examples that users can quickly try */
export const PRESET_CUSTOM_TILES = [
  {
    id: 'preset-carto-dark',
    name: 'CARTO Dark Matter (XYZ)',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    attribution: '© CARTO, © OpenStreetMap',
    minLevel: 0,
    maxLevel: 19,
    opacity: 0.85,
    enabled: false,
    description: 'Clean high-contrast dark cartographic raster tiles.',
  },
  {
    id: 'preset-carto-light',
    name: 'CARTO Positron Light (XYZ)',
    type: 'xyz',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    attribution: '© CARTO, © OpenStreetMap',
    minLevel: 0,
    maxLevel: 19,
    opacity: 0.85,
    enabled: false,
    description: 'Minimalist light cartographic raster tiles.',
  },
  {
    id: 'preset-opentopo',
    name: 'OpenTopoMap (Topography)',
    type: 'xyz',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '© OpenTopoMap, © OpenStreetMap',
    minLevel: 0,
    maxLevel: 17,
    opacity: 0.85,
    enabled: false,
    description: 'Contour lines and hillshaded topographic terrain map.',
  },
  {
    id: 'preset-stamen-toner',
    name: 'Stadiamaps Toner (High Contrast)',
    type: 'xyz',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png',
    subdomains: '',
    attribution: '© Stamen Design, © Stadia Maps, © OpenStreetMap',
    minLevel: 0,
    maxLevel: 18,
    opacity: 0.85,
    enabled: false,
    description: 'Black and white high contrast road and boundary tiles.',
  },
  {
    id: 'preset-esri-natgeo',
    name: 'Esri National Geographic (ArcGIS)',
    type: 'arcgis',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer',
    subdomains: '',
    attribution: '© National Geographic, Esri',
    minLevel: 0,
    maxLevel: 16,
    opacity: 0.9,
    enabled: false,
    description: 'National Geographic world reference basemap.',
  },
  {
    id: 'preset-noaa-seamless',
    name: 'NOAA Nautical RNC (WMS)',
    type: 'wms',
    url: 'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/exts/MaritimeChartService/WMSServer',
    layers: '0,1,2,3,4,5,6',
    attribution: 'NOAA Office of Coast Survey',
    minLevel: 0,
    maxLevel: 18,
    opacity: 0.8,
    enabled: false,
    description: 'Official NOAA electronic nautical charts overlay.',
  },
];

export class CustomTileLayerManager {
  /**
   * @param {Cesium.Viewer} viewer
   */
  constructor(viewer) {
    this.viewer = viewer;
    /** Map of layerId -> { config, cesiumLayer, cesiumTileset } */
    this.activeLayers = new Map();
    this.customConfigs = this.loadStoredConfigs();
  }

  loadStoredConfigs() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      }
    } catch (e) {
      console.warn('[CustomTileLayerManager] Failed reading localStorage:', e);
    }
    return [];
  }

  saveConfigs() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customConfigs));
      }
    } catch (e) {
      console.warn('[CustomTileLayerManager] Failed writing localStorage:', e);
    }
  }

  /**
   * Returns all available custom tile layers (presets + user defined).
   */
  getAllLayers() {
    const list = [...this.customConfigs];
    // Add presets if not overridden
    for (const preset of PRESET_CUSTOM_TILES) {
      const existing = list.find((c) => c.id === preset.id);
      if (!existing) {
        list.push({ ...preset });
      }
    }
    return list;
  }

  /**
   * Initializes all layers that were flagged as enabled.
   */
  async initEnabledLayers() {
    const all = this.getAllLayers();
    for (const layer of all) {
      if (layer.enabled) {
        await this.enableLayer(layer.id);
      }
    }
  }

  /**
   * Adds or updates a custom tile configuration.
   */
  async saveLayer(layerConfig) {
    const id = layerConfig.id || `custom-tile-${Date.now()}`;
    const cleanConfig = {
      ...layerConfig,
      id,
      opacity: typeof layerConfig.opacity === 'number' ? layerConfig.opacity : 1.0,
      minLevel: Number(layerConfig.minLevel) || 0,
      maxLevel: Number(layerConfig.maxLevel) || 19,
      enabled: Boolean(layerConfig.enabled),
    };

    const idx = this.customConfigs.findIndex((c) => c.id === id);
    if (idx >= 0) {
      this.customConfigs[idx] = cleanConfig;
    } else {
      this.customConfigs.push(cleanConfig);
    }
    this.saveConfigs();

    // If currently active, refresh it
    if (this.activeLayers.has(id)) {
      this.disableLayer(id);
      if (cleanConfig.enabled) {
        await this.enableLayer(id);
      }
    } else if (cleanConfig.enabled) {
      await this.enableLayer(id);
    }

    return cleanConfig;
  }

  /**
   * Deletes a custom tile configuration.
   */
  deleteLayer(id) {
    this.disableLayer(id);
    this.customConfigs = this.customConfigs.filter((c) => c.id !== id);
    this.saveConfigs();
  }

  /**
   * Toggles a layer's enabled state.
   */
  async toggleLayer(id, enabled) {
    const all = this.getAllLayers();
    const config = all.find((c) => c.id === id);
    if (!config) return;

    config.enabled = enabled;
    await this.saveLayer(config);

    if (enabled) {
      await this.enableLayer(id);
    } else {
      this.disableLayer(id);
    }
  }

  /**
   * Updates layer opacity in real time.
   */
  setLayerOpacity(id, opacity) {
    const all = this.getAllLayers();
    const config = all.find((c) => c.id === id);
    if (config) {
      config.opacity = opacity;
      const idx = this.customConfigs.findIndex((c) => c.id === id);
      if (idx >= 0) {
        this.customConfigs[idx] = config;
      } else {
        this.customConfigs.push(config);
      }
      this.saveConfigs();
    }

    const active = this.activeLayers.get(id);
    if (active?.cesiumLayer) {
      active.cesiumLayer.alpha = opacity;
    }
  }

  /**
   * Attaches the layer to Cesium globe / imagery collection.
   */
  async enableLayer(id) {
    if (this.activeLayers.has(id)) return;

    const all = this.getAllLayers();
    const config = all.find((c) => c.id === id);
    if (!config || !config.url) return;

    try {
      let provider = null;
      let cesiumTileset = null;
      let cesiumLayer = null;

      const subdomains = config.subdomains ? config.subdomains.split('') : undefined;
      const credit = config.attribution ? new Cesium.Credit(config.attribution, true) : undefined;

      if (config.type === 'xyz' || config.type === 'slippy' || !config.type) {
        provider = new Cesium.UrlTemplateImageryProvider({
          url: config.url,
          subdomains,
          minimumLevel: config.minLevel ?? 0,
          maximumLevel: config.maxLevel ?? 19,
          credit,
        });
        cesiumLayer = this.viewer.imageryLayers.addImageryProvider(provider);
        cesiumLayer.alpha = config.opacity ?? 1.0;
      } else if (config.type === 'arcgis') {
        provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(config.url, {
          credit: config.attribution || undefined,
          enablePickFeatures: false,
        });
        cesiumLayer = this.viewer.imageryLayers.addImageryProvider(provider);
        cesiumLayer.alpha = config.opacity ?? 1.0;
      } else if (config.type === 'wms') {
        provider = new Cesium.WebMapServiceImageryProvider({
          url: config.url,
          layers: config.layers || '0',
          parameters: {
            service: 'WMS',
            format: 'image/png',
            transparent: true,
          },
          credit,
        });
        cesiumLayer = this.viewer.imageryLayers.addImageryProvider(provider);
        cesiumLayer.alpha = config.opacity ?? 1.0;
      } else if (config.type === 'wmts') {
        provider = new Cesium.WebMapTileServiceImageryProvider({
          url: config.url,
          layer: config.layers || '',
          style: 'default',
          format: 'image/png',
          tileMatrixSetID: 'default028mm',
          credit,
        });
        cesiumLayer = this.viewer.imageryLayers.addImageryProvider(provider);
        cesiumLayer.alpha = config.opacity ?? 1.0;
      } else if (config.type === '3dtiles') {
        cesiumTileset = await Cesium.Cesium3DTileset.fromUrl(config.url);
        this.viewer.scene.primitives.add(cesiumTileset);
      }

      this.activeLayers.set(id, {
        config,
        provider,
        cesiumLayer,
        cesiumTileset,
      });

      // Force render frame
      if (this.viewer.scene?.requestRender) {
        this.viewer.scene.requestRender();
      }

      return true;
    } catch (err) {
      console.error(`[CustomTileLayerManager] Failed to load custom tile layer ${config.name || id}:`, err);
      throw err;
    }
  }

  /**
   * Removes layer from Cesium scene.
   */
  disableLayer(id) {
    const active = this.activeLayers.get(id);
    if (!active) return;

    if (active.cesiumLayer) {
      this.viewer.imageryLayers.remove(active.cesiumLayer, true);
    }
    if (active.cesiumTileset) {
      this.viewer.scene.primitives.remove(active.cesiumTileset);
    }

    this.activeLayers.delete(id);

    if (this.viewer.scene?.requestRender) {
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Returns whether a layer is currently active on the globe.
   */
  isLayerActive(id) {
    return this.activeLayers.has(id);
  }
}

let sharedTileManager = null;

export function getCustomTileLayerManager(viewer) {
  if (!sharedTileManager && viewer) {
    sharedTileManager = new CustomTileLayerManager(viewer);
  }
  return sharedTileManager;
}
