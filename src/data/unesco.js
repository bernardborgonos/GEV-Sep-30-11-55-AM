/**
 * @module unesco
 * @description Dedicated UNESCO Science, Technology & Innovation and Education Data Layer.
 *
 * Visualizes global indicators from the UNESCO Institute for Statistics (UIS):
 * - R&D Expenditure as % of GDP (SDG 9.5.1)
 * - Scientific Capacity / Researchers per million inhabitants (SDG 9.5.2)
 * - Gross Tertiary Education Enrolment Ratio (%)
 * - Government Expenditure on Education as % of GDP (SDG 1.a.2)
 *
 * Implements interactive metric switching, GPU-instanced PointPrimitives with
 * dynamic tier color coding, label annotations, and HUD overlay card inspection.
 */

import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { registerEntityContext, selectEntityContext } from './contextStore.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import {
  UNESCO_BENCHMARK_COUNTRIES,
  UNESCO_INDICATORS,
  UNESCO_INDICATOR_CONFIG,
  lookupUnescoCountry,
} from './fixtures/unescoData.js';

export const UNESCO_LAYER_ID = 'unesco';
export const UNESCO_SELECTED_OVERLAY_SOURCE_ID = 'unesco-selected';
export const UNESCO_SELECTED_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 0,
  moving: false,
});

const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
});

let _overlayHost = DEFAULT_OVERLAY_HOST;
let _viewer = null;
let _pointCollection = null;
let _labelCollection = null;
let _selectedEntity = null;
let _clickHandler = null;
let _enabled = false;
let _loading = false;
let _error = null;
let _lastUpdate = null;
let _count = 0;
let _metric = UNESCO_INDICATORS.GERD; // Default: 'gerd'
let _rowControlsListener = null;
let _selectedCountryId = null;
const _countryRenderMap = new Map();

/**
 * Build the HUD overlay entry when a country marker is clicked.
 * @param {string} countryId
 * @param {Object} country
 * @param {Cesium.Cartesian3} position
 * @returns {Object|null}
 */
export function createUnescoSelectedOverlayEntry(countryId, country, position) {
  if (!countryId || !position || !country) return null;
  const cfg = UNESCO_INDICATOR_CONFIG[_metric] || UNESCO_INDICATOR_CONFIG.gerd;
  const accent = cfg.getColor(country[_metric]);

  const gerdStr = Number.isFinite(country.gerd) ? `${country.gerd.toFixed(2)}% GDP` : '—';
  const resStr = Number.isFinite(country.researchers) ? `${Math.round(country.researchers).toLocaleString()} /M FTE` : '—';
  const tertStr = Number.isFinite(country.tertiary) ? `${country.tertiary.toFixed(1)}%` : '—';
  const eduStr = Number.isFinite(country.education) ? `${country.education.toFixed(2)}% GDP` : '—';

  return {
    id: `unesco:${countryId}`,
    position,
    variant: 'selected',
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-card',
    priority: Number.MAX_SAFE_INTEGER,
    title: `${country.name.toUpperCase()} (${country.id})`,
    details: [
      `R&D EXPENDITURE: ${gerdStr}`,
      `RESEARCHERS: ${resStr}`,
      `TERTIARY ENROLMENT: ${tertStr}`,
      `GOV EDUCATION SPEND: ${eduStr}`,
      `REGION: ${(country.region || 'GLOBAL').toUpperCase()} · UNESCO UIS`,
    ],
    accent,
    interactive: false,
    anchorRadiusPx: 12,
    minAnchorGapPx: 14,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/**
 * Clear the current country selection.
 */
function _clearSelection() {
  if (_selectedCountryId) {
    const record = _countryRenderMap.get(_selectedCountryId);
    if (record?.point) {
      record.point.show = true;
    }
  }
  if (_selectedEntity && _viewer) {
    _viewer.entities.remove(_selectedEntity);
    _selectedEntity = null;
  }
  _selectedCountryId = null;
  _overlayHost.clearSource(UNESCO_SELECTED_OVERLAY_SOURCE_ID);
  governorRequestRender('unesco-deselect');
}

/**
 * Select a country by ID (ISO-3).
 * @param {string} countryId
 */
function _selectCountry(countryId) {
  _clearSelection();
  const cleanId = String(countryId).replace(/^unesco:/, '').toUpperCase();
  const record = _countryRenderMap.get(cleanId);
  if (!record || !record.point?.position || !_viewer) return;

  _selectedCountryId = cleanId;
  record.point.show = false; // Hide base point while highlight entity is displayed

  const cfg = UNESCO_INDICATOR_CONFIG[_metric] || UNESCO_INDICATOR_CONFIG.gerd;
  const accentColor = Cesium.Color.fromCssColorString(cfg.getColor(record.country[_metric]));

  _selectedEntity = _viewer.entities.add({
    position: record.point.position,
    point: {
      pixelSize: 16,
      color: accentColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2.5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const entry = createUnescoSelectedOverlayEntry(cleanId, record.country, record.position);
  if (entry) {
    _overlayHost.setEntries(
      UNESCO_SELECTED_OVERLAY_SOURCE_ID,
      [entry],
      UNESCO_SELECTED_OVERLAY_SOURCE_OPTIONS,
    );
  }

  // Register in shared contextStore
  const contextEntity = {
    __gevContextId: `unesco:${cleanId}`,
    name: record.country.name,
    layerId: UNESCO_LAYER_ID,
    countryCode: cleanId,
    country: record.country,
    position: record.point.position,
  };
  registerEntityContext(contextEntity, {
    id: `unesco:${cleanId}`,
    name: `${record.country.name} (UNESCO STI & Education)`,
    category: 'unesco',
    layer: UNESCO_LAYER_ID,
  });
  selectEntityContext(contextEntity);

  // Dispatch custom selection event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:unesco-selected', {
        detail: {
          id: cleanId,
          country: record.country,
          metric: _metric,
        },
      }),
    );
  }

  governorRequestRender('unesco-select');
}

/**
 * Install click picking on canvas.
 * @param {Cesium.Viewer} viewer
 */
function _installClickHandler(viewer) {
  if (_clickHandler || !viewer?.scene?.canvas) return;
  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _clickHandler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (picked) {
      if (picked.id === _selectedEntity) return;
      const primitive = picked.primitive;
      if (primitive && typeof primitive.id === 'string') {
        const id = primitive.id.replace(/^unesco:/, '');
        if (_countryRenderMap.has(id)) {
          _selectCountry(id);
          return;
        }
      }
      if (typeof picked.id === 'string') {
        const id = picked.id.replace(/^unesco:/, '');
        if (_countryRenderMap.has(id)) {
          _selectCountry(id);
          return;
        }
      }
    }
    if (_selectedCountryId) _clearSelection();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', _onKeyDown);
  }
}

function _onKeyDown(e) {
  if (e.key === 'Escape' && _selectedCountryId) {
    _clearSelection();
  }
}

/**
 * Fetch country metrics from proxy or fallback benchmark.
 * @returns {Promise<Array<Object>>}
 */
async function fetchUnescoData() {
  try {
    const response = await fetch('/api/unesco/indicators?geoUnit=all');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.countries) && data.countries.length > 0) {
        return data.countries;
      }
    }
  } catch {
    // Network / dev-mode fallback to local benchmark fixture
  }
  return UNESCO_BENCHMARK_COUNTRIES;
}

/**
 * Re-render Cesium primitives for all tracked countries.
 * @param {Array<Object>} countries
 */
function renderCountries(countries) {
  if (!_pointCollection || !_labelCollection || !_viewer) return;

  _pointCollection.removeAll();
  _labelCollection.removeAll();
  _countryRenderMap.clear();

  const cfg = UNESCO_INDICATOR_CONFIG[_metric] || UNESCO_INDICATOR_CONFIG.gerd;
  const labelDistanceCondition = new Cesium.DistanceDisplayCondition(0.0, 18_000_000.0);
  const pointScaleByDistance = new Cesium.NearFarScalar(1_000_000.0, 1.25, 25_000_000.0, 0.7);

  for (const country of countries) {
    if (!Number.isFinite(country.lat) || !Number.isFinite(country.lon)) continue;

    const position = Cesium.Cartesian3.fromDegrees(country.lon, country.lat, 1000.0);
    const val = country[_metric];
    const hexColor = cfg.getColor(val);
    const cesiumColor = Cesium.Color.fromCssColorString(hexColor);

    const point = _pointCollection.add({
      position,
      pixelSize: 11,
      color: cesiumColor,
      outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
      outlineWidth: 2.0,
      scaleByDistance: pointScaleByDistance,
      id: `unesco:${country.id}`,
    });

    const valFormatted = cfg.format(val);
    const label = _labelCollection.add({
      position,
      text: `${country.id} ${valFormatted}`,
      font: 'bold 11px monospace',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3.5,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -12),
      distanceDisplayCondition: labelDistanceCondition,
      id: `unesco:${country.id}`,
    });

    _countryRenderMap.set(country.id, {
      id: country.id,
      country,
      point,
      label,
      position,
    });
  }

  _count = _countryRenderMap.size;
  _lastUpdate = Date.now();
  governorRequestRender('unesco-rendered');
}

/**
 * Main load and update routine.
 */
async function loadUnescoLayer() {
  if (!_enabled) return;
  _loading = true;
  _error = null;
  try {
    const countries = await fetchUnescoData();
    if (!_enabled) return;
    renderCountries(countries);
  } catch (err) {
    _error = err?.message || 'Failed to load UNESCO dataset';
  } finally {
    _loading = false;
  }
}

const unescoLayer = {
  id: UNESCO_LAYER_ID,
  name: 'UNESCO Science & Education',
  icon: '🏛️',
  source: 'UNESCO UIS',
  updateInterval: 3_600_000,
  statsRefreshInterval: 5_000,

  init(viewer) {
    _viewer = viewer;
    if (viewer?.scene?.primitives) {
      if (!_pointCollection) {
        _pointCollection = new Cesium.PointPrimitiveCollection();
        viewer.scene.primitives.add(_pointCollection);
      }
      if (!_labelCollection) {
        _labelCollection = new Cesium.LabelCollection();
        viewer.scene.primitives.add(_labelCollection);
      }
    }
  },

  enable(viewer) {
    _enabled = true;
    this.init(viewer);
    _overlayHost.setVisible(UNESCO_SELECTED_OVERLAY_SOURCE_ID, true);

    if (_pointCollection) _pointCollection.show = true;
    if (_labelCollection) _labelCollection.show = true;

    registerPickOwner(UNESCO_LAYER_ID, (pickedId) => {
      const clean = String(pickedId || '').replace(/^unesco:/, '');
      return _countryRenderMap.has(clean);
    });

    _installClickHandler(viewer);
    void loadUnescoLayer();
  },

  disable(viewer) {
    _enabled = false;
    _clearSelection();
    _overlayHost.clearSource(UNESCO_SELECTED_OVERLAY_SOURCE_ID);
    _overlayHost.setVisible(UNESCO_SELECTED_OVERLAY_SOURCE_ID, false);

    if (_pointCollection) _pointCollection.show = false;
    if (_labelCollection) _labelCollection.show = false;

    unregisterPickOwner(UNESCO_LAYER_ID);

    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', _onKeyDown);
    }
    governorRequestRender('unesco-disable');
  },

  async update(viewer) {
    if (!_enabled) return;
    await loadUnescoLayer();
  },

  getStats() {
    const cfg = UNESCO_INDICATOR_CONFIG[_metric] || UNESCO_INDICATOR_CONFIG.gerd;
    return {
      count: _count,
      lastUpdate: _lastUpdate,
      error: _error,
      loading: _loading,
      metric: cfg.label,
    };
  },

  getParams() {
    return {
      metric: _metric,
    };
  },

  setParams(params) {
    if (!params || typeof params !== 'object') return false;
    let changed = false;
    if (typeof params.metric === 'string' && UNESCO_INDICATOR_CONFIG[params.metric]) {
      if (params.metric !== _metric) {
        _metric = params.metric;
        changed = true;
      }
    }
    if (changed && _enabled) {
      void loadUnescoLayer();
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
    }
    return true;
  },

  getRowControls() {
    const currentCfg = UNESCO_INDICATOR_CONFIG[_metric] || UNESCO_INDICATOR_CONFIG.gerd;
    return {
      chips: [
        {
          id: 'gerd',
          label: 'R&D Spend',
          active: _metric === UNESCO_INDICATORS.GERD,
          params: { metric: UNESCO_INDICATORS.GERD },
        },
        {
          id: 'researchers',
          label: 'Researchers',
          active: _metric === UNESCO_INDICATORS.RESEARCHERS,
          params: { metric: UNESCO_INDICATORS.RESEARCHERS },
        },
        {
          id: 'tertiary',
          label: 'Tertiary Ed',
          active: _metric === UNESCO_INDICATORS.TERTIARY,
          params: { metric: UNESCO_INDICATORS.TERTIARY },
        },
        {
          id: 'education',
          label: 'Gov Ed Spend',
          active: _metric === UNESCO_INDICATORS.EDUCATION,
          params: { metric: UNESCO_INDICATORS.EDUCATION },
        },
      ],
      legend: currentCfg.tiers,
    };
  },

  setRowControlsListener(listener) {
    _rowControlsListener = listener;
  },

  getAnalystRecords(options = {}) {
    if (!_enabled || _countryRenderMap.size === 0) return [];
    const maxCount = options.maxCount || 100;
    const records = [];
    for (const record of _countryRenderMap.values()) {
      records.push({
        id: record.id,
        name: record.country.name,
        region: record.country.region,
        gerd: record.country.gerd,
        researchers: record.country.researchers,
        tertiary: record.country.tertiary,
        education: record.country.education,
      });
      if (records.length >= maxCount) break;
    }
    return records;
  },

  selectCountry(countryId) {
    _selectCountry(countryId);
  },

  clearSelection() {
    _clearSelection();
  },

  destroy(viewer) {
    this.disable(viewer);
    if (_pointCollection && viewer?.scene?.primitives) {
      viewer.scene.primitives.remove(_pointCollection);
      _pointCollection = null;
    }
    if (_labelCollection && viewer?.scene?.primitives) {
      viewer.scene.primitives.remove(_labelCollection);
      _labelCollection = null;
    }
    _countryRenderMap.clear();
    _viewer = null;
  },

  setOverlayHostForTesting(host) {
    _overlayHost = host || DEFAULT_OVERLAY_HOST;
  },
};

export default unescoLayer;
