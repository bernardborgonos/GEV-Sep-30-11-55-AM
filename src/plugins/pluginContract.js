/**
 * @module src/plugins/pluginContract.js
 * @description Standardized Plugin Interface Contract and Manifest Specification
 * for Map Tools and Geospatial Addons.
 *
 * This contract enables modular, decoupled plugins that can be packaged,
 * distributed, and installed into any Cesium/God's-Eye-View geospatial runtime.
 */

/**
 * Standard Plugin Category Types
 */
export const PLUGIN_CATEGORIES = Object.freeze({
  MAP_TOOL: 'map-tool',
  MEASUREMENT: 'measurement',
  DRAWING: 'drawing',
  SHAPE: 'shape',
  INTELLIGENCE: 'intelligence',
  ANALYTICS: 'analytics',
  TACTICAL: 'tactical',
  UTILITY: 'utility',
});

/**
 * Lifecycle execution states of a plugin
 */
export const PLUGIN_LIFECYCLE_STATES = Object.freeze({
  UNINSTALLED: 'uninstalled',
  INSTALLED: 'installed',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
});

/**
 * Base abstract class defining the contract for all Map Tool Plugins.
 * Any addon module wishing to provide tools in the left stack or floating workbench
 * should extend or conform to this interface.
 */
export class BaseMapToolPlugin {
  /**
   * @param {Object} manifest
   * @param {string} manifest.id - Unique machine identifier (e.g. 'drawing', 'measurements')
   * @param {string} manifest.name - Human readable name (e.g. 'Drawing Tools')
   * @param {string} manifest.version - Semantic version string (e.g. '1.0.0')
   * @param {string} [manifest.category='map-tool'] - Plugin category
   * @param {string} [manifest.icon='🛠️'] - Visual emoji or SVG string
   * @param {string} [manifest.description=''] - Functional overview
   * @param {string[]} [manifest.capabilities=[]] - Capability flags
   * @param {Object} [manifest.defaultConfig={}] - Default configuration properties
   */
  constructor(manifest) {
    if (!manifest || !manifest.id || !manifest.name) {
      throw new Error('BaseMapToolPlugin: manifest must contain "id" and "name".');
    }
    this.manifest = Object.freeze({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version || '1.0.0',
      category: manifest.category || PLUGIN_CATEGORIES.MAP_TOOL,
      icon: manifest.icon || '🛠️',
      description: manifest.description || '',
      author: manifest.author || 'Defense Tactical Systems',
      license: manifest.license || 'MIT',
      capabilities: Array.isArray(manifest.capabilities) ? [...manifest.capabilities] : [],
      defaultConfig: manifest.defaultConfig || {},
    });

    this.id = this.manifest.id;
    this.name = this.manifest.name;
    this.version = this.manifest.version;
    this.category = this.manifest.category;
    this.icon = this.manifest.icon;
    this.description = this.manifest.description;

    this.state = PLUGIN_LIFECYCLE_STATES.UNINSTALLED;
    this.context = null;
    this.config = { ...this.manifest.defaultConfig };
    this.container = null;
  }

  /**
   * Called once when the plugin is installed into the application host.
   * Receives host application services: { viewer, engine, geofenceEngine, dataManager, eventBus }
   *
   * @param {Object} context
   * @returns {Promise<void>|void}
   */
  async install(context) {
    this.context = context;
    this.state = PLUGIN_LIFECYCLE_STATES.INSTALLED;
  }

  /**
   * Called when the plugin tab is selected and made visible to the operator.
   * @returns {void}
   */
  activate() {
    this.state = PLUGIN_LIFECYCLE_STATES.ACTIVE;
  }

  /**
   * Called when the operator switches to another plugin tab or collapses the panel.
   * Should pause active crosshairs or mouse drawing listeners.
   * @returns {void}
   */
  deactivate() {
    this.state = PLUGIN_LIFECYCLE_STATES.INACTIVE;
  }

  /**
   * Renders the plugin controls into the given DOM container.
   * @param {HTMLElement} container
   * @returns {void}
   */
  render(container) {
    this.container = container;
  }

  /**
   * Called when the plugin is removed/uninstalled from the host.
   * Cleans up DOM, Cesium entities, and window listeners.
   * @returns {Promise<void>|void}
   */
  async uninstall() {
    this.deactivate();
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.context = null;
    this.state = PLUGIN_LIFECYCLE_STATES.UNINSTALLED;
  }

  /**
   * Updates runtime configuration for the plugin.
   * @param {Object} partialConfig
   */
  updateConfig(partialConfig) {
    this.config = { ...this.config, ...partialConfig };
  }

  /**
   * Exports an installable manifest descriptor representing this plugin package.
   * Can be serialized to JSON for marketplace distribution or addon portability.
   * @returns {Object}
   */
  exportManifest() {
    return {
      schemaVersion: '1.0.0',
      manifest: this.manifest,
      runtimeState: {
        installed: this.state !== PLUGIN_LIFECYCLE_STATES.UNINSTALLED,
        active: this.state === PLUGIN_LIFECYCLE_STATES.ACTIVE,
        currentConfig: this.config,
      },
    };
  }
}
