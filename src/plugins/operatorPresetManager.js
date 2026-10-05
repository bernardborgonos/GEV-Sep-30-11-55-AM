/**
 * @module src/plugins/operatorPresetManager.js
 * @description Persistent Operator Preset and Dynamic Addon Storage Manager.
 *
 * Saves, restores, and manages operator workbench configurations across sessions:
 * - Active tool selection and styling (colors, stroke widths, labels)
 * - Measurement units (Nautical, Metric, Imperial) and active readout modes
 * - Geometric shape parameters (radius, opacity, watchdog alerts)
 * - Dynamically installed external addon specifications
 */

export const GEV_MAP_TOOLS_PRESET_KEY = 'gev_map_tools_preset_v1';
export const GEV_MAP_TOOLS_INSTALLED_ADDONS_KEY = 'gev_map_tools_installed_addons_v1';

export const DEFAULT_OPERATOR_PRESET = Object.freeze({
  activePluginId: 'drawing',
  drawing: {
    selectedColor: '#00e5ff',
    strokeWidth: 3,
    activeMode: 'idle',
    currentLabel: 'Tactical Trace',
  },
  measurements: {
    unit: 'nm',
    activeType: 'distance',
  },
  shape: {
    activeType: 'polygon',
    radiusKm: 25,
    fillOpacity: 25,
    color: '#00e5ff',
    breachAlertEnabled: true,
  },
  lastUpdated: null,
});

/**
 * Loads saved operator preset from localStorage or returns default values.
 * @returns {Object}
 */
export function loadOperatorPreset() {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_OPERATOR_PRESET };
  }

  try {
    const raw = localStorage.getItem(GEV_MAP_TOOLS_PRESET_KEY);
    if (!raw) return { ...DEFAULT_OPERATOR_PRESET };

    const parsed = JSON.parse(raw);
    return {
      activePluginId: parsed.activePluginId || DEFAULT_OPERATOR_PRESET.activePluginId,
      drawing: {
        ...DEFAULT_OPERATOR_PRESET.drawing,
        ...(parsed.drawing || {}),
      },
      measurements: {
        ...DEFAULT_OPERATOR_PRESET.measurements,
        ...(parsed.measurements || {}),
      },
      shape: {
        ...DEFAULT_OPERATOR_PRESET.shape,
        ...(parsed.shape || {}),
      },
      lastUpdated: parsed.lastUpdated || null,
    };
  } catch (err) {
    console.warn('[OperatorPresetManager] Failed to load preset, reverting to defaults:', err);
    return { ...DEFAULT_OPERATOR_PRESET };
  }
}

/**
 * Saves operator preset to localStorage.
 * @param {Object} presetUpdates
 * @returns {Object} Full updated preset
 */
export function saveOperatorPreset(presetUpdates = {}) {
  const current = loadOperatorPreset();
  const updated = {
    ...current,
    ...presetUpdates,
    drawing: {
      ...current.drawing,
      ...(presetUpdates.drawing || {}),
    },
    measurements: {
      ...current.measurements,
      ...(presetUpdates.measurements || {}),
    },
    shape: {
      ...current.shape,
      ...(presetUpdates.shape || {}),
    },
    lastUpdated: new Date().toISOString(),
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(GEV_MAP_TOOLS_PRESET_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[OperatorPresetManager] Failed to save preset:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:map-tools-preset-changed', {
        detail: { preset: updated },
      })
    );
  }

  return updated;
}

/**
 * Resets operator presets back to factory defaults.
 * @returns {Object}
 */
export function resetOperatorPreset() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(GEV_MAP_TOOLS_PRESET_KEY);
    } catch (err) {
      console.warn('[OperatorPresetManager] Failed to reset preset:', err);
    }
  }

  const defaults = { ...DEFAULT_OPERATOR_PRESET, lastUpdated: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:map-tools-preset-changed', {
        detail: { preset: defaults },
      })
    );
  }
  return defaults;
}

/**
 * Retrieves the list of dynamically installed external addon manifests.
 * @returns {Array<Object>}
 */
export function getSavedInstalledAddons() {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(GEV_MAP_TOOLS_INSTALLED_ADDONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[OperatorPresetManager] Failed to read installed addons:', err);
    return [];
  }
}

/**
 * Saves the list of dynamically installed external addon manifests.
 * @param {Array<Object>} manifests
 */
export function saveInstalledAddons(manifests) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(GEV_MAP_TOOLS_INSTALLED_ADDONS_KEY, JSON.stringify(manifests || []));
  } catch (err) {
    console.warn('[OperatorPresetManager] Failed to persist installed addons:', err);
  }
}
