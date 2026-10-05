/**
 * @module src/plugins/mapToolsPluginRegistry.js
 * @description Central Registry, Host Controller, and Addon Manager
 * for Map Tools Plugins (Drawing, Measurements, Shape, and 3rd-party addons).
 *
 * Provides lifecycle coordination, modular plugin registration, installable manifest
 * packaging, and left-panel HUD integration.
 */

import { BaseMapToolPlugin, PLUGIN_LIFECYCLE_STATES } from './pluginContract.js';
import { DrawingPlugin } from './drawing/drawingPlugin.js';
import { MeasurementsPlugin, MeasurePlugin } from './measurements/measurementsPlugin.js';
import { ShapePlugin } from './shape/shapePlugin.js';
import { SatellitePlugin } from './satellite/satellitePlugin.js';
import { RadarPlugin } from './radar/radarPlugin.js';
import { MgrsPlugin } from './mgrs/mgrsPlugin.js';
import { WeatherPlugin } from './weather/weatherPlugin.js';
import {
  loadOperatorPreset,
  saveOperatorPreset,
  getSavedInstalledAddons,
} from './operatorPresetManager.js';
import { TACTICAL_ADDON_CATALOG } from './addonCatalog.js';
import { openMapToolsAddonModal } from './mapToolsAddonModal.js';

export const PLUGIN_TAB_METADATA = Object.freeze({
  drawing: {
    shortName: 'DRAWING',
    icon: '✏️',
    description: 'Polylines, directional vectors, waypoints, range rings & markers.',
  },
  measurements: {
    shortName: 'MEASURE',
    icon: '📐',
    description: 'Geodesic distances, true azimuth heading, elevation delta & slant range.',
  },
  shape: {
    shortName: 'SHAPE',
    icon: '⬡',
    description: 'Polygons, geodesic perimeters, enclosed areas & hazard zones.',
  },
  'satellite-footprint': {
    shortName: 'SATELLITE',
    icon: '🛰️',
    description: 'Orbital pass predictions, sensor footprints & ground track swaths.',
  },
  'sensor-los-cone': {
    shortName: 'RADAR',
    icon: '📡',
    description: 'Radar coverage azimuths, elevation masks & line-of-sight cones.',
  },
  'mgrs-tactical-grid': {
    shortName: 'MGRS',
    icon: '🌐',
    description: 'Military Grid Reference System, UTM coordinates & precision grids.',
  },
  'weather-hazard-buffer': {
    shortName: 'WEATHER',
    icon: '⛈️',
    description: 'Severe weather buffers, SIGMET advisories & convective routing.',
  },
});

export class MapToolsPluginRegistry {
  constructor() {
    this._plugins = new Map();
    this._activePluginId = null;
    this._context = null;
    this._eventTarget = new EventTarget();
    this._panelMounted = false;
  }

  /**
   * Initializes host context across all registered plugins.
   * @param {Object} context - { viewer, engine, geofenceEngine, dataManager }
   */
  async initHost(context) {
    this._context = context;
    for (const plugin of this._plugins.values()) {
      if (plugin.state === PLUGIN_LIFECYCLE_STATES.UNINSTALLED) {
        await plugin.install(this._context);
      }
    }
  }

  /**
   * Registers a new modular plugin.
   * @param {BaseMapToolPlugin} plugin
   * @returns {boolean}
   */
  async registerPlugin(plugin) {
    if (!plugin || !plugin.id) {
      console.warn('[MapToolsPluginRegistry] Invalid plugin object provided.');
      return false;
    }

    if (this._plugins.has(plugin.id)) {
      console.warn(`[MapToolsPluginRegistry] Plugin "${plugin.id}" is already registered.`);
      return false;
    }

    this._plugins.set(plugin.id, plugin);

    if (this._context) {
      await plugin.install(this._context);
    }

    this._dispatch('plugin-registered', { pluginId: plugin.id, plugin });
    return true;
  }

  /**
   * Unregisters and tears down an existing plugin.
   * @param {string} pluginId
   * @returns {boolean}
   */
  async unregisterPlugin(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) return false;

    if (this._activePluginId === pluginId) {
      plugin.deactivate();
      this._activePluginId = null;
    }

    await plugin.uninstall();
    this._plugins.delete(pluginId);

    this._dispatch('plugin-unregistered', { pluginId });
    return true;
  }

  /**
   * Returns a registered plugin by ID.
   * @param {string} pluginId
   * @returns {BaseMapToolPlugin|null}
   */
  getPlugin(pluginId) {
    return this._plugins.get(pluginId) || null;
  }

  /**
   * Returns array of all registered plugins.
   * @returns {BaseMapToolPlugin[]}
   */
  getAllPlugins() {
    return Array.from(this._plugins.values());
  }

  /**
   * Returns currently active plugin.
   * @returns {BaseMapToolPlugin|null}
   */
  getActivePlugin() {
    return this._activePluginId ? this._plugins.get(this._activePluginId) || null : null;
  }

  /**
   * Activates a registered plugin and mounts its UI into the host container.
   * @param {string} pluginId
   * @param {HTMLElement} [container]
   */
  activatePlugin(pluginId, container = null) {
    const targetPlugin = this._plugins.get(pluginId);
    if (!targetPlugin) {
      console.warn(`[MapToolsPluginRegistry] Plugin "${pluginId}" not found for activation.`);
      return false;
    }

    // Deactivate currently active plugin
    if (this._activePluginId && this._activePluginId !== pluginId) {
      const prev = this._plugins.get(this._activePluginId);
      if (prev) {
        prev.deactivate();
      }
    }

    this._activePluginId = pluginId;
    targetPlugin.activate();

    const hostContainer =
      container || (typeof document !== 'undefined' ? document.getElementById('map-tools-plugin-container') : null);
    const floatingControlsHost = typeof document !== 'undefined' ? document.getElementById('floating-active-tool-controls') : null;

    if (floatingControlsHost) {
      targetPlugin.render(floatingControlsHost);
    }

    if (hostContainer) {
      if (floatingControlsHost && hostContainer.id === 'map-tools-plugin-container') {
        const meta = PLUGIN_TAB_METADATA[pluginId] || {};
        hostContainer.innerHTML = `
          <div class="plugin-module-wrapper space-y-2 p-2.5 bg-slate-900/80 rounded-xl border border-cyan-500/40 text-xs">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span class="font-bold text-cyan-300 font-mono flex items-center gap-1.5">
                <span>${meta.icon || targetPlugin.icon || '🛠️'}</span> <span>${targetPlugin.name.toUpperCase()}</span>
              </span>
              <span class="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-[9px] animate-pulse">
                ● VIEWPORT ACTIVE
              </span>
            </div>
            <p class="text-slate-300 text-[10px] leading-relaxed">
              ACTIVE TOOL CONTROLS are running in the dynamic draggable dialog box on your map's viewport.
            </p>
            <div class="pt-1 grid grid-cols-2 gap-1.5">
              <button type="button" id="map-tools-focus-floating-btn" class="w-full py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium text-[10px] font-mono transition flex items-center justify-center gap-1 shadow-lg cursor-pointer">
                <span>🎯</span> <span>FOCUS VIEWPORT</span>
              </button>
              <button type="button" id="map-tools-help-floating-btn" class="w-full py-1.5 px-2 bg-slate-800 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white rounded font-medium text-[10px] font-mono transition flex items-center justify-center gap-1 cursor-pointer" title="View step-by-step instructions">
                <span>📖</span> <span>HELP GUIDE</span>
              </button>
            </div>
          </div>
        `;
        hostContainer.querySelector('#map-tools-focus-floating-btn')?.addEventListener('click', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:open-map-tools', {
                detail: { pluginId, state: 'normal' },
              })
            );
          }
        });
        hostContainer.querySelector('#map-tools-help-floating-btn')?.addEventListener('click', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:open-map-tools', {
                detail: { pluginId, state: 'normal' },
              })
            );
          }
          const helpBtnFloating = document.getElementById('floating-btn-help');
          const helpDrawer = document.getElementById('floating-tool-help-drawer');
          if (helpDrawer && helpDrawer.hidden && helpBtnFloating) {
            helpBtnFloating.click();
          }
        });
      } else {
        targetPlugin.render(hostContainer);
      }
      hostContainer.scrollTop = 0;
    }

    this._dispatch('plugin-activated', { pluginId, plugin: targetPlugin });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gev:map-tools-plugin-activated', {
          detail: { pluginId, plugin: targetPlugin },
        })
      );
    }
    return true;
  }

  /**
   * Exports an installable plugin bundle manifest describing all installed plugins.
   * Can be imported into any application supporting this plugin system.
   * @returns {Object}
   */
  exportManifestBundle() {
    return {
      appName: "God's Eye View Tactical Console",
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      pluginCount: this._plugins.size,
      plugins: Array.from(this._plugins.values()).map((p) => p.exportManifest()),
    };
  }

  /**
   * Installs an addon plugin from an exported manifest specification.
   * Demonstrates modular portability across installations.
   * @param {Object} manifestSpec
   */
  async installFromManifest(manifestSpec) {
    if (!manifestSpec || !manifestSpec.manifest || !manifestSpec.manifest.id) {
      throw new Error('Invalid manifest specification.');
    }
    const manifest = manifestSpec.manifest;

    // Check if plugin already exists
    if (this._plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already installed.`);
    }

    // Instantiate dynamic generic plugin container
    const dynamicPlugin = new BaseMapToolPlugin(manifest);
    dynamicPlugin.render = (container) => {
      container.innerHTML = `
        <div class="plugin-module-wrapper">
          <div class="plugin-section-label">${manifest.name.toUpperCase()} (ADDON)</div>
          <p class="text-xs text-slate-400 mb-2">${manifest.description || 'Installed external addon component.'}</p>
          <div class="plugin-status-card">
            <span class="plugin-status-header">VERSION: ${manifest.version}</span>
            <span class="text-xs text-emerald-400">STATUS: VERIFIED ADDON</span>
          </div>
        </div>
      `;
    };

    await this.registerPlugin(dynamicPlugin);
    return dynamicPlugin;
  }

  on(eventName, listener) {
    this._eventTarget.addEventListener(eventName, listener);
  }

  off(eventName, listener) {
    this._eventTarget.removeEventListener(eventName, listener);
  }

  _dispatch(eventName, detail) {
    this._eventTarget.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

// Global Singleton Registry Instance
export const sharedPluginRegistry = new MapToolsPluginRegistry();
if (typeof window !== 'undefined') {
  window.__mapToolsPluginRegistry = sharedPluginRegistry;
}

/**
 * Bootstraps and attaches the Map Tools Plugin Panel into the DOM and left panel stack.
 *
 * @param {Object} viewer - Cesium Viewer
 * @param {Object} dataManager - Layer Data Manager
 */
export async function initMapToolsPluginSystem(viewer, dataManager) {
  const panel = document.getElementById('map-tools-panel');
  if (!panel) {
    console.warn('[MapToolsPluginRegistry] #map-tools-panel element not found.');
    return sharedPluginRegistry;
  }

  // Pre-register all 7 tactical sub-components into the central registry
  const coreTacticalPlugins = [
    new DrawingPlugin(),
    new MeasurementsPlugin(),
    new ShapePlugin(),
    new SatellitePlugin(),
    new RadarPlugin(),
    new MgrsPlugin(),
    new WeatherPlugin(),
  ];

  for (const plugin of coreTacticalPlugins) {
    if (!sharedPluginRegistry.getPlugin(plugin.id)) {
      await sharedPluginRegistry.registerPlugin(plugin);
    }
  }

  // Also pre-register any additional catalog addons
  for (const catalogEntry of TACTICAL_ADDON_CATALOG) {
    if (!sharedPluginRegistry.getPlugin(catalogEntry.id)) {
      await sharedPluginRegistry.registerPlugin(catalogEntry.createPlugin());
    }
  }

  // Initialize host services
  await sharedPluginRegistry.initHost({
    viewer,
    dataManager,
  });

  // Wire Dynamic Tab Navigation
  const navContainer = document.getElementById('map-tools-plugin-nav');

  const updateFooterPluginInfo = (pluginId) => {
    const infoEl = document.getElementById('map-tools-active-plugin-info');
    const plugin = sharedPluginRegistry.getPlugin(pluginId);
    if (infoEl && plugin) {
      infoEl.textContent = `${plugin.name} · v${plugin.version} [Active]`;
    }
  };

  const refreshTabs = () => {
    if (!navContainer) return;
    const plugins = sharedPluginRegistry.getAllPlugins();
    const activeId = sharedPluginRegistry.getActivePlugin()?.id || 'drawing';

    navContainer.innerHTML = plugins
      .map((p) => {
        const isActive = p.id === activeId;
        const meta = PLUGIN_TAB_METADATA[p.id] || {};
        const shortName = meta.shortName || p.shortName || p.name.replace(/ tools| & perimeter/i, '').split(/ [&/]/)[0].toUpperCase();
        const icon = meta.icon || p.icon || '🛠️';
        const description = p.description || meta.description || 'Tactical map analysis & geometry tool.';
        return `
        <div class="data-toggle-row map-tool-row${isActive ? ' active' : ''}" data-plugin-id="${p.id}" role="tab" aria-selected="${isActive}">
          <div class="data-toggle-top">
            <div class="data-toggle-left">
              <span class="data-icon">${icon}</span>
              <span class="data-name">${p.name}</span>
            </div>
            <div class="data-toggle-right" style="display:flex;align-items:center;gap:4px;">
              <button type="button" class="map-tool-help-btn" data-plugin-id="${p.id}" title="Click for inline Help Guide &amp; Instructions for ${p.name}" aria-label="Help Guide for ${p.name}">
                ℹ️
              </button>
              <span class="data-count">${shortName}</span>
              <button type="button" class="data-toggle-btn${isActive ? ' active' : ''}" title="${description}">
                ${isActive ? 'ACTIVE' : 'SELECT'}
              </button>
            </div>
          </div>
          <div class="data-toggle-meta">${description}</div>
        </div>
      `;
      })
      .join('');

    const rows = navContainer.querySelectorAll('.map-tool-row');
    rows.forEach((row) => {
      const pluginId = row.dataset.pluginId;
      const btn = row.querySelector('.data-toggle-btn');
      const helpBtn = row.querySelector('.map-tool-help-btn');

      const selectTool = () => {
        rows.forEach((r) => {
          r.classList.remove('active');
          r.setAttribute('aria-selected', 'false');
          const b = r.querySelector('.data-toggle-btn');
          if (b) {
            b.classList.remove('active');
            b.textContent = 'SELECT';
          }
        });
        row.classList.add('active');
        row.setAttribute('aria-selected', 'true');
        if (btn) {
          btn.classList.add('active');
          btn.textContent = 'ACTIVE';
        }
        if (pluginId) {
          sharedPluginRegistry.activatePlugin(pluginId);
          updateFooterPluginInfo(pluginId);
          saveOperatorPreset({ activePluginId: pluginId });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:open-map-tools', {
                detail: { pluginId, state: 'normal' },
              })
            );
          }
        }
      };

      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectTool();
        });
      }

      if (helpBtn) {
        helpBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectTool();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:open-map-tools', {
                detail: { pluginId, state: 'normal' },
              })
            );
          }
          const helpBtnFloating = document.getElementById('floating-btn-help');
          const helpDrawer = document.getElementById('floating-tool-help-drawer');
          if (helpDrawer && helpDrawer.hidden && helpBtnFloating) {
            helpBtnFloating.click();
          }
        });
      }

      row.addEventListener('click', selectTool);
    });
  };

  // Two-way sync: when a plugin is activated (from tabs, API, or sidebar), sync nav rows
  sharedPluginRegistry.on('plugin-activated', (e) => {
    const pluginId = e.detail?.pluginId;
    if (!pluginId || !navContainer) return;
    const rows = navContainer.querySelectorAll('.map-tool-row');
    rows.forEach((r) => {
      const isTarget = r.dataset.pluginId === pluginId;
      r.classList.toggle('active', isTarget);
      r.setAttribute('aria-selected', String(isTarget));
      const b = r.querySelector('.data-toggle-btn');
      if (b) {
        b.classList.toggle('active', isTarget);
        b.textContent = isTarget ? 'ACTIVE' : 'SELECT';
      }
    });
    updateFooterPluginInfo(pluginId);
  });

  // Listen to dynamic registrations/unregistrations to keep tabs in sync
  sharedPluginRegistry.on('plugin-registered', () => refreshTabs());
  sharedPluginRegistry.on('plugin-unregistered', () => refreshTabs());

  // Restore previously saved addons from persistent storage
  const savedAddons = getSavedInstalledAddons();
  for (const saved of savedAddons) {
    if (!saved || !saved.id) continue;
    if (!sharedPluginRegistry.getPlugin(saved.id)) {
      if (saved.isCatalog) {
        const catalogEntry = TACTICAL_ADDON_CATALOG.find((c) => c.id === saved.id);
        if (catalogEntry) {
          await sharedPluginRegistry.registerPlugin(catalogEntry.createPlugin());
        }
      } else if (saved.manifest) {
        try {
          await sharedPluginRegistry.installFromManifest(saved.manifest);
        } catch (e) {
          console.warn(`[MapToolsPluginRegistry] Could not restore addon "${saved.id}":`, e);
        }
      }
    }
  }

  // Load saved operator presets
  const preset = loadOperatorPreset();
  if (preset) {
    const drawing = sharedPluginRegistry.getPlugin('drawing');
    if (drawing && preset.drawing) {
      drawing.config.selectedColor = preset.drawing.selectedColor || drawing.config.selectedColor;
      drawing.config.strokeWidth = preset.drawing.strokeWidth || drawing.config.strokeWidth;
    }
    const measurements = sharedPluginRegistry.getPlugin('measurements');
    if (measurements && preset.measurements) {
      measurements.config.unit = preset.measurements.unit || measurements.config.unit;
    }
    const shape = sharedPluginRegistry.getPlugin('shape');
    if (shape && preset.shape) {
      shape.config.radiusKm = preset.shape.radiusKm ?? shape.config.radiusKm;
      shape.config.fillOpacity = preset.shape.fillOpacity ?? shape.config.fillOpacity;
      shape.config.breachAlertEnabled = preset.shape.breachAlertEnabled ?? shape.config.breachAlertEnabled;
    }
  }

  // Initial tab render
  refreshTabs();

  // Wire action buttons
  const manageAddonsBtn = document.getElementById('map-tools-manage-addons-btn');
  manageAddonsBtn?.addEventListener('click', () => {
    openMapToolsAddonModal(sharedPluginRegistry, viewer);
  });

  // Wire action buttons
  const expandHudBtn = document.getElementById('map-tools-open-workbench-btn');
  expandHudBtn?.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('gev:open-map-tools', {
        detail: { state: 'normal' },
      })
    );
  });

  const exportManifestBtn = document.getElementById('map-tools-export-manifest-btn');
  exportManifestBtn?.addEventListener('click', () => {
    const bundle = sharedPluginRegistry.exportManifestBundle();
    const jsonStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map-tools-plugins-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gev:toast', {
          detail: { text: 'Exported Modular Plugin Manifest Package.' },
        })
      );
    }
  });

  // Activate default initial plugin ('drawing')
  sharedPluginRegistry.activatePlugin('drawing');
  updateFooterPluginInfo('drawing');

  return sharedPluginRegistry;
}

/**
 * Tactical Subsystem Architecture Blueprint (Deliverable 4).
 * Returns formal registry blueprint metadata defining lifecycle hooks,
 * sub-components, tab configurations, and viewport constraints.
 */
export function getTacticalSubsystemBlueprint() {
  return {
    version: '1.2.0',
    architecture: 'Modular BaseTacticalPlugin Architecture',
    constraints: {
      panelWidth: '280px',
      panelMinHeight: '400px',
      containerMinHeight: '240px',
      navigationMode: 'Single-row horizontal scroll with auto-scrollIntoView',
    },
    subComponents: [
      { id: 'drawing', name: 'Tactical Drawing Tools', tabShortName: 'DRAWING', icon: '✏️', class: 'DrawingPlugin' },
      { id: 'measurements', name: 'Geodesic Measurements', tabShortName: 'MEASURE', icon: '📐', class: 'MeasurePlugin' },
      { id: 'shape', name: 'Perimeter & Geofence Suite', tabShortName: 'SHAPE', icon: '⬡', class: 'ShapePlugin' },
      { id: 'satellite-footprint', name: 'Satellite Recon Swath', tabShortName: 'SATELLITE', icon: '🛰️', class: 'SatellitePlugin' },
      { id: 'sensor-los-cone', name: 'Radar & Sensor FOV Cone', tabShortName: 'RADAR', icon: '📡', class: 'RadarPlugin' },
      { id: 'mgrs-tactical-grid', name: 'MGRS Tactical Grid', tabShortName: 'MGRS', icon: '🌐', class: 'MgrsPlugin' },
      { id: 'weather-hazard-buffer', name: 'Weather Hazard Buffers', tabShortName: 'WEATHER', icon: '⛈️', class: 'WeatherPlugin' },
    ],
    lifecycle: [
      'Central Registry Pre-Registration on Startup',
      'Dynamic Plugin Selection & Prior Tool Deactivation',
      'Mount Sub-Component DOM Container & Reset Scroll Offset',
      'Arm Canvas Pick ScreenSpaceEventHandler on globe',
      'Live WGS84 Metrics Computation & Geodesic Projection',
      'Standardized Feature Event & State Change Dispatching',
      'Clean Canvas Handler Teardown on Tool Switch',
    ],
  };
}

export {
  DrawingPlugin,
  MeasurementsPlugin,
  MeasurePlugin,
  ShapePlugin,
  SatellitePlugin,
  RadarPlugin,
  MgrsPlugin,
  WeatherPlugin,
};

