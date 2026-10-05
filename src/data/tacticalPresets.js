/**
 * Tactical Presets Engine (Phase 3: Presets & Quick Filter Sets)
 * Provides pre-configured operational domain filter sets (Air Defense, Maritime Interdiction,
 * Orbital & Space, Ground & Terrestrial, Full C4ISR, Stealth Recon), custom preset saving/loading,
 * and bulk visibility operations.
 */

import { REGISTERED_LAYER_IDS } from './layerState.js';

export const DOMAIN_CATEGORIES = Object.freeze({
  AIR: 'air',
  SEA: 'sea',
  SPACE: 'space',
  GROUND: 'ground',
  ENVIRONMENTAL: 'environmental',
  INFRASTRUCTURE: 'infrastructure'
});

export const LAYER_DOMAIN_MAPPING = Object.freeze({
  flights: DOMAIN_CATEGORIES.AIR,
  military: DOMAIN_CATEGORIES.AIR,
  'military-awareness': DOMAIN_CATEGORIES.AIR,

  'ais-live-vessels': DOMAIN_CATEGORIES.SEA,
  'telegeography-submarine-cables': DOMAIN_CATEGORIES.SEA,

  satellites: DOMAIN_CATEGORIES.SPACE,
  'rocket-launches': DOMAIN_CATEGORIES.SPACE,

  'military-installations': DOMAIN_CATEGORIES.GROUND,
  cctv: DOMAIN_CATEGORIES.GROUND,
  traffic: DOMAIN_CATEGORIES.GROUND,
  bikeshare: DOMAIN_CATEGORIES.GROUND,
  rentals: DOMAIN_CATEGORIES.GROUND,

  'local-firms': DOMAIN_CATEGORIES.ENVIRONMENTAL,
  earthquakes: DOMAIN_CATEGORIES.ENVIRONMENTAL,

  'local-dams': DOMAIN_CATEGORIES.INFRASTRUCTURE,
  'local-datacenters': DOMAIN_CATEGORIES.INFRASTRUCTURE,
  radio: DOMAIN_CATEGORIES.INFRASTRUCTURE,
  unesco: DOMAIN_CATEGORIES.INFRASTRUCTURE,
  'url-intelligence': DOMAIN_CATEGORIES.INFRASTRUCTURE
});

export const OPERATIONAL_PRESETS = Object.freeze([
  {
    id: 'full_c4isr',
    label: 'Full C4ISR',
    callsign: 'ALL DOMAINS',
    description: 'Complete multi-domain situational picture enabled across all operational theaters.',
    icon: '🎯',
    activeDomains: [
      DOMAIN_CATEGORIES.AIR,
      DOMAIN_CATEGORIES.SEA,
      DOMAIN_CATEGORIES.SPACE,
      DOMAIN_CATEGORIES.GROUND,
      DOMAIN_CATEGORIES.ENVIRONMENTAL,
      DOMAIN_CATEGORIES.INFRASTRUCTURE
    ],
    layerOverrides: {}
  },
  {
    id: 'air_defense',
    label: 'Air Defense',
    callsign: 'AIR DOMAIN',
    description: 'Airspace surveillance, civil/military flights, and air defense radar installations.',
    icon: '✈️',
    activeDomains: [DOMAIN_CATEGORIES.AIR],
    layerOverrides: {
      'military-installations': true,
      'military-awareness': true
    }
  },
  {
    id: 'maritime_surface',
    label: 'Maritime Patrol',
    callsign: 'SEA DOMAIN',
    description: 'Surface vessels, AIS tracks, naval choke points, and undersea telemetry cables.',
    icon: '🚢',
    activeDomains: [DOMAIN_CATEGORIES.SEA],
    layerOverrides: {
      'military-awareness': true
    }
  },
  {
    id: 'space_surveillance',
    label: 'Space & Orbital',
    callsign: 'SPACE DOMAIN',
    description: 'Low-earth orbit satellites, reconnaissance telemetry, and space launch vectors.',
    icon: '🛰️',
    activeDomains: [DOMAIN_CATEGORIES.SPACE],
    layerOverrides: {}
  },
  {
    id: 'ground_tactical',
    label: 'Ground & Grid',
    callsign: 'TERRESTRIAL',
    description: 'Bases, ground sensors, road traffic networks, and civic infrastructure.',
    icon: '🛡️',
    activeDomains: [
      DOMAIN_CATEGORIES.GROUND,
      DOMAIN_CATEGORIES.INFRASTRUCTURE
    ],
    layerOverrides: {}
  },
  {
    id: 'stealth_recon',
    label: 'Silent Recon',
    callsign: 'MINIMAL',
    description: 'Blackout mode. Strip civilian clutter, retaining only high-priority defense assets.',
    icon: '👁️‍🗨️',
    activeDomains: [],
    layerOverrides: {
      military: true,
      'military-installations': true,
      'military-awareness': true
    }
  }
]);

export const CUSTOM_PRESETS_STORAGE_KEY = 'godsEyeView.tacticalPresets.custom';

/**
 * Extracts layer IDs reliably from DataManager regardless of whether it exposes
 * getAll(), layers Map, or layers Array.
 * @param {Object} dataManager
 * @returns {Array<string>}
 */
export function getAvailableLayerIds(dataManager) {
  if (!dataManager) return REGISTERED_LAYER_IDS;
  if (typeof dataManager.getAll === 'function') {
    return dataManager.getAll().map((l) => l.id);
  }
  if (dataManager.layers instanceof Map) {
    return Array.from(dataManager.layers.keys());
  }
  if (Array.isArray(dataManager.layers)) {
    return dataManager.layers.map((l) => (typeof l === 'string' ? l : l.id));
  }
  return REGISTERED_LAYER_IDS;
}

/**
 * Checks if a layer is currently enabled in DataManager.
 * @param {Object} dataManager
 * @param {string} layerId
 * @returns {boolean}
 */
export function isLayerEnabled(dataManager, layerId) {
  if (!dataManager || !layerId) return false;
  if (typeof dataManager.isEnabled === 'function') {
    return Boolean(dataManager.isEnabled(layerId));
  }
  if (typeof dataManager.isEffectivelyEnabled === 'function') {
    return Boolean(dataManager.isEffectivelyEnabled(layerId));
  }
  if (dataManager.layers instanceof Map) {
    const entry = dataManager.layers.get(layerId);
    return Boolean(entry?.enabled);
  }
  if (Array.isArray(dataManager.layers)) {
    const entry = dataManager.layers.find((l) => l.id === layerId);
    return Boolean(entry?.enabled);
  }
  return false;
}

/**
 * Sets layer visibility state on DataManager.
 * @param {Object} dataManager
 * @param {string} layerId
 * @param {boolean} shouldEnable
 * @param {string} origin
 */
export function setLayerState(dataManager, layerId, shouldEnable, origin = 'tactical-preset') {
  if (!dataManager || !layerId) return;
  const target = Boolean(shouldEnable);
  if (typeof dataManager.setEnabled === 'function') {
    dataManager.setEnabled(layerId, target, { origin });
  } else if (typeof dataManager.setLayerEnabled === 'function') {
    dataManager.setLayerEnabled(layerId, target, { origin });
  } else if (dataManager.layers instanceof Map) {
    const entry = dataManager.layers.get(layerId);
    if (entry) entry.enabled = target;
  } else if (Array.isArray(dataManager.layers)) {
    const entry = dataManager.layers.find((l) => l.id === layerId);
    if (entry) entry.enabled = target;
  }
}

/**
 * Calculates layer visibility map given a preset configuration and available layer IDs.
 * @param {Object} preset - Preset definition
 * @param {Array<string>} availableLayerIds - Array of registered layer IDs
 * @returns {Record<string, boolean>} Object with layerId -> boolean
 */
export function calculatePresetLayerVisibility(preset, availableLayerIds = REGISTERED_LAYER_IDS) {
  if (!preset) return {};
  const activeDomains = new Set(preset.activeDomains || []);
  const overrides = preset.layerOverrides || {};

  const result = {};
  for (const layerId of availableLayerIds) {
    if (typeof overrides[layerId] === 'boolean') {
      result[layerId] = overrides[layerId];
      continue;
    }

    const domain = LAYER_DOMAIN_MAPPING[layerId];
    if (domain) {
      result[layerId] = activeDomains.has(domain);
    } else {
      result[layerId] = activeDomains.size === Object.values(DOMAIN_CATEGORIES).length;
    }
  }

  return result;
}

/**
 * Filter layers by single domain (Solo mode)
 * @param {string} targetDomain
 * @param {Array<string>} availableLayerIds
 * @returns {Record<string, boolean>}
 */
export function calculateDomainSoloVisibility(targetDomain, availableLayerIds = REGISTERED_LAYER_IDS) {
  const result = {};
  for (const layerId of availableLayerIds) {
    const domain = LAYER_DOMAIN_MAPPING[layerId];
    result[layerId] = domain === targetDomain;
  }
  return result;
}

/**
 * Inverts current visibility state for all layers
 * @param {Record<string, boolean>} currentVisibility
 * @returns {Record<string, boolean>}
 */
export function invertVisibility(currentVisibility = {}) {
  const inverted = {};
  for (const [key, value] of Object.entries(currentVisibility)) {
    inverted[key] = !value;
  }
  return inverted;
}

/**
 * Validates a custom preset object
 * @param {any} customPreset
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCustomPreset(customPreset) {
  const errors = [];
  if (!customPreset || typeof customPreset !== 'object') {
    return { valid: false, errors: ['Preset must be a valid non-null object'] };
  }

  if (typeof customPreset.id !== 'string' || !customPreset.id.trim()) {
    errors.push('Preset must have a non-empty string "id"');
  }

  if (typeof customPreset.label !== 'string' || !customPreset.label.trim()) {
    errors.push('Preset must have a non-empty string "label"');
  }

  if (customPreset.activeDomains && !Array.isArray(customPreset.activeDomains)) {
    errors.push('"activeDomains" must be an array of strings');
  }

  if (customPreset.layerOverrides && typeof customPreset.layerOverrides !== 'object') {
    errors.push('"layerOverrides" must be a key-value object');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Reads custom presets from localStorage safely.
 * @param {Storage} [storage=localStorage]
 * @returns {Array<Object>}
 */
export function loadCustomPresets(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => validateCustomPreset(item).valid);
  } catch {
    return [];
  }
}

/**
 * Persists a custom preset to localStorage.
 * @param {Object} preset
 * @param {Storage} [storage=localStorage]
 * @returns {boolean}
 */
export function saveCustomPreset(preset, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const validation = validateCustomPreset(preset);
  if (!validation.valid || !storage) return false;
  try {
    const current = loadCustomPresets(storage);
    const existingIndex = current.findIndex((p) => p.id === preset.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...preset, updatedAt: new Date().toISOString() };
    } else {
      current.push({ ...preset, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    storage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a custom preset from localStorage by ID.
 * @param {string} presetId
 * @param {Storage} [storage=localStorage]
 * @returns {boolean}
 */
export function deleteCustomPreset(presetId, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!presetId || !storage) return false;
  try {
    const current = loadCustomPresets(storage);
    const filtered = current.filter((p) => p.id !== presetId);
    storage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies a preset to a DataManager instance.
 * @param {Object} preset
 * @param {Object} dataManager
 * @returns {number} count of layers changed
 */
export function applyPresetToDataManager(preset, dataManager) {
  if (!preset || !dataManager) return 0;
  const layerIds = getAvailableLayerIds(dataManager);
  const visibilityMap = calculatePresetLayerVisibility(preset, layerIds);
  let changedCount = 0;

  for (const [layerId, shouldEnable] of Object.entries(visibilityMap)) {
    const currentEnabled = isLayerEnabled(dataManager, layerId);
    if (currentEnabled !== shouldEnable) {
      setLayerState(dataManager, layerId, shouldEnable, 'tactical-preset');
      changedCount++;
    }
  }

  return changedCount;
}

/**
 * Applies single domain solo to DataManager.
 * @param {string} domain
 * @param {Object} dataManager
 * @returns {number} count of layers changed
 */
export function applyDomainSoloToDataManager(domain, dataManager) {
  if (!domain || !dataManager) return 0;
  const layerIds = getAvailableLayerIds(dataManager);
  const soloMap = calculateDomainSoloVisibility(domain, layerIds);
  let changedCount = 0;

  for (const [layerId, shouldEnable] of Object.entries(soloMap)) {
    const currentEnabled = isLayerEnabled(dataManager, layerId);
    if (currentEnabled !== shouldEnable) {
      setLayerState(dataManager, layerId, shouldEnable, 'tactical-solo');
      changedCount++;
    }
  }

  return changedCount;
}

/**
 * Inverts all layers on DataManager.
 * @param {Object} dataManager
 * @returns {number} count of layers changed
 */
export function applyInvertToDataManager(dataManager) {
  if (!dataManager) return 0;
  const layerIds = getAvailableLayerIds(dataManager);
  let changedCount = 0;

  for (const layerId of layerIds) {
    const currentEnabled = isLayerEnabled(dataManager, layerId);
    setLayerState(dataManager, layerId, !currentEnabled, 'tactical-invert');
    changedCount++;
  }

  return changedCount;
}

/**
 * Bulk toggles all layers on or off.
 * @param {boolean} enableAll
 * @param {Object} dataManager
 * @returns {number} count of layers changed
 */
export function applyBulkStateToDataManager(enableAll, dataManager) {
  if (!dataManager) return 0;
  const layerIds = getAvailableLayerIds(dataManager);
  let changedCount = 0;

  for (const layerId of layerIds) {
    const currentEnabled = isLayerEnabled(dataManager, layerId);
    if (currentEnabled !== Boolean(enableAll)) {
      setLayerState(dataManager, layerId, Boolean(enableAll), 'tactical-bulk');
      changedCount++;
    }
  }

  return changedCount;
}
