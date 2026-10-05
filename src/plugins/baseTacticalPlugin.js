/**
 * @module src/plugins/baseTacticalPlugin.js
 * @description Standard Base Tactical Plugin class for modular map tools and addons.
 */

import { BaseMapToolPlugin, PLUGIN_CATEGORIES, PLUGIN_LIFECYCLE_STATES } from './pluginContract.js';

export { PLUGIN_CATEGORIES, PLUGIN_LIFECYCLE_STATES };

export const TACTICAL_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  SELECT: 'select',
  EXPORT: 'export',
  CLEAR: 'clear',
  TOGGLE: 'toggle',
});

/**
 * BaseTacticalPlugin provides uniform event dispatching, state lifecycle,
 * and UI container coordination for all tactical drafting and analytics modules.
 */
export class BaseTacticalPlugin extends BaseMapToolPlugin {
  constructor(manifest) {
    super(manifest);
    this._listeners = [];
  }

  /**
   * Dispatches a standardized tactical feature event to the host application.
   * @param {string} action - Action verb from TACTICAL_ACTIONS
   * @param {Object} payload - Event payload
   */
  dispatchFeatureEvent(action, payload) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gev:tactical:feature', {
          detail: {
            pluginId: this.id,
            category: this.category,
            action,
            payload,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  /**
   * Helper to register managed window listeners that automatically clean up on uninstall.
   * @param {EventTarget} target
   * @param {string} type
   * @param {Function} listener
   * @param {Object} [options]
   */
  addManagedListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this._listeners.push({ target, type, listener, options });
  }

  /**
   * Safe picking session initialization fallback for tactical plugins.
   */
  armPickingSession(_options = {}) {
    return null;
  }

  abortPickingSession() {}

  async uninstall() {
    for (const { target, type, listener, options } of this._listeners) {
      target.removeEventListener(type, listener, options);
    }
    this._listeners = [];
    await super.uninstall();
  }
}
