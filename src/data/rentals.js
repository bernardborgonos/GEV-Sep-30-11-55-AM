/**
 * @module rentals
 * @description Short-term rental (Airbnb) geospatial layer with tactical HUD inspection.
 *
 * Visualizes short-term residential accommodation listings with pricing, room types,
 * ratings, and host information. Uses GPU-instanced PointPrimitives with Level of Detail (LOD)
 * distance gating and tactical HUD card overlay on selection.
 */

import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import BUNDLED_RENTALS from './fixtures/rentalsData.js';

export const RENTALS_SELECTED_OVERLAY_SOURCE_ID = 'rentals-selected';
export const RENTALS_SELECTED_OVERLAY_SOURCE_OPTIONS = Object.freeze({
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

// --- Altitude / Display Thresholds ---
const ACTIVATION_ALTITUDE_M = 65000;
const POINT_HEIGHT_OFFSET_M = 4.0;
const POLL_INTERVAL_MS = 120000;
const CAMERA_DEBOUNCE_MS = 400;

// --- Color Palette ---
const COLOR_ENTIRE_HOME = Cesium.Color.fromCssColorString('#FF5A5F'); // Airbnb coral
const COLOR_PRIVATE_ROOM = Cesium.Color.fromCssColorString('#00A699'); // Airbnb teal
const COLOR_OTHER = Cesium.Color.fromCssColorString('#FC642D'); // Warm amber
const COLOR_OUTLINE = Cesium.Color.BLACK.withAlpha(0.65);

// --- Internal State ---
let _viewer = null;
let _pointCollection = null;
let _enabled = false;
let _loading = false;
let _lastUpdate = null;
let _error = null;
let _count = 0;
let _clickHandler = null;
let _selectedKey = null;
let _selectedEntity = null;
let _cameraDebounceTimer = null;
let _cameraChangedAttached = false;
let _filterType = 'all'; // 'all' | 'entire' | 'private'
let _rowControlsListener = null;

/** @type {Map<string, Object>} Map of rental id -> listing record */
let _rentalRenderMap = new Map();

/**
 * Determine point color by room type.
 * @param {string} roomType
 * @returns {Cesium.Color}
 */
export function getRentalColor(roomType) {
  const norm = String(roomType || '').toLowerCase();
  if (norm.includes('entire')) return COLOR_ENTIRE_HOME;
  if (norm.includes('private')) return COLOR_PRIVATE_ROOM;
  return COLOR_OTHER;
}

/**
 * Format selection label lines for the HUD card.
 * @param {Object} listing
 * @returns {string}
 */
export function buildRentalSelectionLabel(listing) {
  const title = listing.name || 'Short-Term Rental';
  const price = Number.isFinite(listing.price) ? `$${listing.price}/night` : 'Price on request';
  const roomType = listing.room_type || 'Entire home';
  const rating = Number.isFinite(listing.rating) ? `⭐ ${listing.rating.toFixed(2)}` : '';
  const reviews = Number.isFinite(listing.reviews_count) ? `(${listing.reviews_count} reviews)` : '';
  const accommodates = Number.isFinite(listing.accommodates) ? `👥 Up to ${listing.accommodates} guests` : '';
  const bedrooms = Number.isFinite(listing.bedrooms) ? `🛏️ ${listing.bedrooms} bed${listing.bedrooms > 1 ? 's' : ''}` : '';
  const host = listing.host_name ? `Host: ${listing.host_name}${listing.host_is_superhost ? ' 🎖️ Superhost' : ''}` : '';

  const line2 = [price, roomType, rating, reviews].filter(Boolean).join(' · ');
  const line3 = [accommodates, bedrooms, host].filter(Boolean).join(' · ');

  return [title, line2, line3].filter(Boolean).join('\n');
}

/**
 * Build the HUD overlay entry when a listing is clicked.
 * @param {string} key
 * @param {Object} record
 * @returns {Object|null}
 */
export function createRentalsSelectedOverlayEntry(key, record) {
  const position = record?.point?.position || record?.position;
  if (!key || !position) return null;
  const listing = record.listing || record;
  const [title, ...details] = buildRentalSelectionLabel(listing).split('\n');

  return {
    id: String(key),
    position,
    variant: 'selected',
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-card',
    priority: Number.MAX_SAFE_INTEGER,
    title,
    details,
    accent: '#FF5A5F',
    interactive: false,
    anchorRadiusPx: 9,
    minAnchorGapPx: 12,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/**
 * Clear the current rental selection.
 */
function _clearSelection() {
  if (_selectedKey) {
    const record = _rentalRenderMap.get(_selectedKey);
    if (record?.point) {
      record.point.show = true;
    }
  }
  if (_selectedEntity && _viewer) {
    _viewer.entities.remove(_selectedEntity);
    _selectedEntity = null;
  }
  _selectedKey = null;
  _overlayHost.clearSource(RENTALS_SELECTED_OVERLAY_SOURCE_ID);
  governorRequestRender('rentals-deselect');
}

/**
 * Select a rental station by ID.
 * @param {string} key
 */
function _selectRental(key) {
  _clearSelection();
  const record = _rentalRenderMap.get(key);
  if (!record || !record.point?.position || !_viewer) return;

  _selectedKey = key;
  record.point.show = false; // Hide base point while highlight entity is displayed

  _selectedEntity = _viewer.entities.add({
    position: record.point.position,
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString('#FF5A5F'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const entry = createRentalsSelectedOverlayEntry(key, record);
  if (entry) {
    _overlayHost.setEntries(
      RENTALS_SELECTED_OVERLAY_SOURCE_ID,
      [entry],
      RENTALS_SELECTED_OVERLAY_SOURCE_OPTIONS,
    );
  }
  governorRequestRender('rentals-select');
}

/**
 * Handle screen clicks for rental picking.
 * @param {Cesium.Viewer} viewer
 */
function _installClickHandler(viewer) {
  if (_clickHandler) return;
  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _clickHandler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (picked) {
      if (picked.id === _selectedEntity) return;
      const primitive = picked.primitive;
      if (primitive && typeof primitive.id === 'string' && _rentalRenderMap.has(primitive.id)) {
        _selectRental(primitive.id);
        return;
      }
      if (typeof picked.id === 'string' && _rentalRenderMap.has(picked.id)) {
        _selectRental(picked.id);
        return;
      }
    }
    if (_selectedKey) _clearSelection();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.addEventListener('keydown', _onKeyDown);
}

function _onKeyDown(e) {
  if (e.key === 'Escape' && _selectedKey) {
    _clearSelection();
  }
}

/**
 * Fetch rental listings from the proxy or fallback dataset.
 * @returns {Promise<Array<Object>>}
 */
async function fetchRentalListings() {
  try {
    const response = await fetch('/api/rentals');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.listings) && data.listings.length > 0) {
        return data.listings;
      }
    }
  } catch (err) {
    // Quiet fallback to bundled data
  }
  return BUNDLED_RENTALS;
}

/**
 * Re-render point primitives from listings.
 * @param {Array<Object>} listings
 */
function renderListings(listings) {
  if (!_pointCollection || !_viewer) return;

  _pointCollection.removeAll();
  _rentalRenderMap.clear();

  const filtered = listings.filter((l) => {
    if (_filterType === 'entire') return String(l.room_type || '').toLowerCase().includes('entire');
    if (_filterType === 'private') return String(l.room_type || '').toLowerCase().includes('private');
    return true;
  });

  const distanceCondition = new Cesium.DistanceDisplayCondition(0.0, ACTIVATION_ALTITUDE_M);
  const scaleByDistance = new Cesium.NearFarScalar(1000.0, 1.3, ACTIVATION_ALTITUDE_M, 0.7);

  for (const listing of filtered) {
    if (!Number.isFinite(listing.latitude) || !Number.isFinite(listing.longitude)) continue;

    const position = Cesium.Cartesian3.fromDegrees(
      listing.longitude,
      listing.latitude,
      POINT_HEIGHT_OFFSET_M,
    );

    const point = _pointCollection.add({
      position,
      pixelSize: 8,
      color: getRentalColor(listing.room_type),
      outlineColor: COLOR_OUTLINE,
      outlineWidth: 1.5,
      distanceDisplayCondition: distanceCondition,
      scaleByDistance,
      id: listing.id,
    });

    _rentalRenderMap.set(listing.id, {
      id: listing.id,
      listing,
      point,
      position,
    });
  }

  _count = _rentalRenderMap.size;
  _lastUpdate = Date.now();
  governorRequestRender('rentals-rendered');
}

/**
 * Main load and update routine.
 */
async function loadRentals() {
  if (!_enabled) return;
  _loading = true;
  _error = null;
  try {
    const listings = await fetchRentalListings();
    if (!_enabled) return;
    renderListings(listings);
  } catch (err) {
    _error = 'Failed to load rental data';
  } finally {
    _loading = false;
  }
}

/**
 * Short-term rentals layer module implementing the standard dataManager layer interface.
 */
const rentalsLayer = {
  id: 'rentals',
  name: 'Short-Term Rentals',
  icon: '🏠',
  source: 'Inside Airbnb',
  updateInterval: POLL_INTERVAL_MS,

  init(viewer) {
    _viewer = viewer;
    _pointCollection = new Cesium.PointPrimitiveCollection({
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    });
    viewer.scene.primitives.add(_pointCollection);
    _pointCollection.show = false;

    _enabled = false;
    _loading = false;
    _lastUpdate = null;
    _error = null;
    _count = 0;
    _selectedKey = null;
    _selectedEntity = null;
    _rentalRenderMap.clear();

    _overlayHost.setVisible(RENTALS_SELECTED_OVERLAY_SOURCE_ID, false);
    _installClickHandler(viewer);
  },

  enable(viewer) {
    _enabled = true;
    _error = null;
    if (_pointCollection) _pointCollection.show = true;
    _overlayHost.setVisible(RENTALS_SELECTED_OVERLAY_SOURCE_ID, true);
    _installClickHandler(viewer);
    registerPickOwner('rentals', (pickedId) => _rentalRenderMap.has(pickedId));

    if (!_cameraChangedAttached) {
      viewer.camera.changed.addEventListener(this._onCameraChanged);
      _cameraChangedAttached = true;
    }

    void loadRentals();
  },

  _onCameraChanged() {
    if (!_enabled) return;
    clearTimeout(_cameraDebounceTimer);
    _cameraDebounceTimer = setTimeout(() => {
      governorRequestRender('rentals-camera');
    }, CAMERA_DEBOUNCE_MS);
  },

  disable(viewer) {
    _enabled = false;
    clearTimeout(_cameraDebounceTimer);
    _clearSelection();
    if (_pointCollection) _pointCollection.show = false;
    _overlayHost.setVisible(RENTALS_SELECTED_OVERLAY_SOURCE_ID, false);
    unregisterPickOwner('rentals');

    if (_cameraChangedAttached && viewer?.camera) {
      viewer.camera.changed.removeEventListener(this._onCameraChanged);
      _cameraChangedAttached = false;
    }
    governorRequestRender('rentals-disabled');
  },

  async update() {
    if (!_enabled) return;
    await loadRentals();
  },

  getStats() {
    return {
      count: _count,
      lastUpdate: _lastUpdate,
      loading: _loading,
      loadingLabel: _loading ? 'fetching rentals...' : undefined,
      error: _error || undefined,
    };
  },

  setParams(params) {
    if (!params || typeof params !== 'object') return false;
    let changed = false;
    if (typeof params.roomType === 'string' && params.roomType !== _filterType) {
      _filterType = params.roomType;
      changed = true;
    }
    if (changed && _enabled) {
      void loadRentals();
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
    }
    return true;
  },

  getParams() {
    return {
      roomType: _filterType,
    };
  },

  getRowControls() {
    return {
      chips: [
        {
          id: 'all',
          label: 'All',
          active: _filterType === 'all',
          params: { roomType: 'all' },
        },
        {
          id: 'entire',
          label: 'Entire Home',
          active: _filterType === 'entire',
          params: { roomType: 'entire' },
        },
        {
          id: 'private',
          label: 'Private Room',
          active: _filterType === 'private',
          params: { roomType: 'private' },
        },
      ],
      legend: [
        { label: 'Entire Home', color: '#FF5A5F' },
        { label: 'Private Room', color: '#00A699' },
      ],
    };
  },

  setRowControlsListener(listener) {
    _rowControlsListener = listener;
  },

  getDetectableObjects(options = {}) {
    if (!_enabled || _rentalRenderMap.size === 0) return [];
    const maxCount = options.maxCount || 40;
    const candidates = [];
    for (const record of _rentalRenderMap.values()) {
      if (!record.point?.position) continue;
      candidates.push({
        position: record.point.position,
        id: record.id,
        type: 'rental',
        label: record.listing.name,
        skipLabel: false,
      });
      if (candidates.length >= maxCount) break;
    }
    return candidates;
  },

  destroy(viewer) {
    this.disable(viewer);
    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    if (_pointCollection && viewer?.scene?.primitives) {
      viewer.scene.primitives.remove(_pointCollection);
      _pointCollection = null;
    }
    _rentalRenderMap.clear();
    _viewer = null;
  },
};

// Seams for unit tests
export function _setRentalsOverlayHostForTest(host) {
  _overlayHost = host || DEFAULT_OVERLAY_HOST;
}

export function _setRentalsSelectionStateForTest({ viewer, key, record, overlayHost } = {}) {
  if (overlayHost) _overlayHost = overlayHost;
  if (viewer) _viewer = viewer;
  if (key && record) {
    _rentalRenderMap.set(key, record);
  }
}

export function _selectRentalForTest(key) {
  _selectRental(key);
}

export function _clearSelectionForTest() {
  _clearSelection();
}

export default rentalsLayer;
