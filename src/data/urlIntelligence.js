/**
 * @module urlIntelligence
 * @description Dynamic URL Intelligence & Geospatial Entity Layer.
 *
 * Ingests any URL (such as the Philippine Bureau of Immigration contacts page
 * or any public organizational directory), parses geospatial entities (ports of entry,
 * district offices, embassies, border stations) using AI analysis and structural
 * tables, geocodes coordinates, and dynamically plots them on the 3D globe with
 * category filtering and HUD inspection.
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
  CATEGORY_COLORS,
  getCategoryColor,
  getCategoryEmoji,
  registerCategoryIcon,
  getAllCategoryMappings,
} from './urlLayerIngest.js';
import {
  getCategoryBillboardImage,
  generateAiCategoryIcon,
  getTrainBillboardImage,
  getStationBillboardImage,
} from './urlLayerIcons.js';
import { interpolateVehicleAtTime } from './trajectoryProcessor.js';
import { ingestMultipleFiles } from './multiFileIngestEngine.js';
import { OVERLAY_DIMENSION_PROFILES } from '../overlays/worldOverlayTokens.js';
import {
  PH_ISLAND_GROUPS,
  PH_ADMIN_REGIONS,
  enrichEntityWithPhilippineHierarchy,
  computePhilippineHierarchySummary,
  getPhilippineTerritorialBounds,
  applySemanticClassification,
  computeGeospatialAnalytics,
  exportEntitiesToGeoJSON,
  exportEntitiesToCSV,
  computeHaversineDistanceKm,
  computeProximityMatrix,
  simulatePhilippinePatrolTelemetry,
  evaluateStrategicReadiness,
  PhilippineOperationalSimulationEngine,
  runBackendSimulationBenchmark,
} from './philippineHierarchy.js';

/**
 * Checks if a tracked entity represents a rail/train vehicle.
 * @param {Object} vehicle
 * @returns {boolean}
 */
export function isTrainVehicle(vehicle) {
  if (!vehicle) return false;
  const idStr = String(vehicle.vehicleId || '').toLowerCase();
  const nameStr = String(vehicle.displayName || vehicle.name || '').toLowerCase();
  const typeStr = String(vehicle.vehicleType || vehicle.category || '').toLowerCase();
  const lineStr = String(vehicle.lineId || vehicle.line || '').toLowerCase();
  return (
    idStr.includes('train') ||
    idStr.includes('lrt') ||
    idStr.includes('mrt') ||
    idStr.includes('emu') ||
    nameStr.includes('train') ||
    nameStr.includes('lrt') ||
    nameStr.includes('mrt') ||
    typeStr.includes('train') ||
    typeStr.includes('rail') ||
    typeStr.includes('transit_telemetry') ||
    lineStr.includes('lrt') ||
    lineStr.includes('mrt')
  );
}

/**
 * Checks if a static entity represents a rail or transit station node.
 * @param {Object} point
 * @returns {boolean}
 */
export function isStationPoint(point) {
  if (!point) return false;
  const cat = String(point.category || '').toLowerCase();
  const name = String(point.name || '').toLowerCase();
  const id = String(point.id || '').toLowerCase();
  return (
    cat.includes('station') ||
    cat.includes('rail') ||
    cat.includes('subway') ||
    cat.includes('metro') ||
    name.includes('station') ||
    id.includes('station')
  );
}

export const URL_INTELLIGENCE_LAYER_ID = 'url-intelligence';
export const URL_INTELLIGENCE_OVERLAY_SOURCE_ID = 'url-intelligence-selected';
export const URL_INTELLIGENCE_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 24,
  collisionCapacity: 0,
  moving: false,
});

export const MAX_PINNED_CARDS = 16;
const _pinnedPointIds = new Set();
let _multiPinMode = false;

const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
});

const STORAGE_KEY = 'gev-url-intelligence-data';
const DEFAULT_URL = 'https://immigration.gov.ph/contacts/';

let _overlayHost = DEFAULT_OVERLAY_HOST;
let _viewer = null;
let _billboardCollection = null;
let _labelCollection = null;
let _polylineCollection = null;
let _selectedPointId = null;
let _clickHandler = null;
let _enabled = false;
let _loading = false;
let _error = null;
let _lastUpdate = null;
let _count = 0;
let _activeUrl = DEFAULT_URL;
let _pageTitle = 'Philippine Bureau of Immigration — Ports & Offices';
let _selectedCategory = 'All';
let _selectedIslandGroup = 'All';
let _selectedRegion = 'All';
let _showTerritorialBounds = true;
let _hierarchySummary = null;
let _categories = ['All'];
let _categoryCounts = {};
let _points = [];
let _bounds = null;
let _center = null;
let _rowControlsListener = null;
let _detectedHeaders = [];
let _sampleRows = [];
let _schemaAnalysis = null;
let _activeMappingOverrides = null;
let _recommendations = [];
let _domainIdentification = '';
let _categoryIconMappings = {};
let _distributionAnalysis = '';
let _workbookTabs = [];
let _ruleChecks = null;
let _analystComment = null;
let _simulationEngine = null;
const _pointRenderMap = new Map();

// Real-Time GPS Telemetry & Trajectory State
let _isTrajectory = false;
let _trajectories = new Map();
let _trajectoryList = [];
let _fleetMetrics = null;
let _currentTrajectoryTimeMs = null;
let _selectedVehicleId = null;
let _followingVehicleId = null;
let _isPlaying = false;
let _playbackSpeed = 10;
let _playbackTimer = null;
const _trajectoryListeners = new Set();
const _polylineRenderMap = new Map();
const _vehicleRenderMap = new Map();

// Multi-Dataset Simultaneous Ingestion & Rendering State
const _activeDatasets = new Map();
let _isMultiDatasetMode = false;

let _activeDimensionProfile = 'standard';
let _activeLeaderType = 'straight';
let _activeArrowType = 'single_point';

function updateBillboardDisplayStates() {
  if (_billboardCollection && _pointRenderMap.size > 0) {
    for (const [id, entry] of _pointRenderMap.entries()) {
      if (entry.billboard) {
        const isSelected = id === _selectedPointId;
        const isPinned = _pinnedPointIds.has(id);
        const isStation = isStationPoint(entry.point);
        if (isStation) {
          entry.billboard.image = getStationBillboardImage({
            lineId: entry.point.lineId || entry.point.line,
            color: entry.point.color,
            isSelected: isSelected || isPinned,
            isInterchange: Boolean(
              entry.point.isInterchange ||
              entry.point.name?.toLowerCase().includes('interchange') ||
              entry.point.name?.toLowerCase().includes('cubao') ||
              entry.point.name?.toLowerCase().includes('recto') ||
              entry.point.name?.toLowerCase().includes('taft')
            ),
          });
          entry.billboard.width = isSelected ? 42 : isPinned ? 36 : 32;
          entry.billboard.height = isSelected ? 42 : isPinned ? 36 : 32;
        } else {
          entry.billboard.image = getCategoryBillboardImage(entry.point.category, isSelected || isPinned);
          entry.billboard.width = isSelected ? 34 : isPinned ? 30 : 26;
          entry.billboard.height = isSelected ? 34 : isPinned ? 30 : 26;
        }
      }
    }
  }
}

function buildVehicleMockPoint(vehicle, current) {
  const isTrain = isTrainVehicle(vehicle);
  return {
    id: `vehicle-${vehicle.vehicleId}`,
    name: `${vehicle.displayName || vehicle.vehicleId.toUpperCase()} · ${isTrain ? 'Rapid Transit EMU' : 'Tactical Telemetry Unit'}`,
    category: isTrain ? 'Train' : (current.isDwell ? 'Vehicle Idle' : 'Vehicle Active'),
    color: vehicle.datasetColor || vehicle.color || (isTrain ? '#00e5ff' : '#00e5ff'),
    address: `${vehicle.datasetName ? `Dataset: ${vehicle.datasetName} | ` : ''}Corridor: ${vehicle.name || 'Metro Manila Arterial Spine'} (${vehicle.waypointCount || vehicle.waypoints?.length || 0} GPS breadcrumbs)`,
    contact: `Kinematics: Course ${current.heading}° (${current.cardinal}) | Status: ${current.isDwell ? 'STATION DWELL / IDLE' : 'IN TRANSIT'}`,
    details: `Instantaneous Speed: ${current.speedKmh} km/h | Total Odometer: ${current.cumulativeDistanceKm} km | Max Speed: ${vehicle.maxSpeedKmh} km/h`,
    hours: `Active Time Window: ${new Date(vehicle.minTimeMs).toLocaleTimeString()} – ${new Date(vehicle.maxTimeMs).toLocaleTimeString()}`,
    officer: `${isTrain ? 'Train Lead' : 'Telemetry Unit ID'}: ${vehicle.vehicleId}`,
    officerRole: isTrain ? 'Commuter Rapid Transit System' : 'Fleet Commercial Vehicle',
    specialNotes: `Dwell Stops: ${vehicle.dwellStops?.length || 0} events detected | Signal: 3D DGPS Carrier Phase Fix`,
    sourceUrl: _activeUrl,
    rawRecord: {
      'Dataset': vehicle.datasetName || 'Primary Stream',
      'Vehicle ID': vehicle.vehicleId,
      'Classification': isTrain ? 'Rapid Transit Electric Multiple Unit (EMU)' : 'Commercial Road Fleet',
      'Speed': `${current.speedKmh} km/h`,
      'Course Heading': `${current.heading}° (${current.cardinal})`,
      'Cumulative Distance': `${current.cumulativeDistanceKm} km`,
      'Detected Dwells': `${vehicle.dwellStops?.length || 0}`,
      'Sample Timestamp': current.timeIso,
    },
  };
}

function syncAllOverlayEntries() {
  const entries = [];
  const renderedIds = new Set();

  // 1. Primary selected point (highest priority)
  if (_selectedPointId) {
    const rEntry = _pointRenderMap.get(_selectedPointId);
    if (rEntry) {
      const isPinned = _pinnedPointIds.has(_selectedPointId);
      const overlay = createUrlIntelligenceOverlayEntry(_selectedPointId, rEntry.point, rEntry.position, {
        selected: true,
        pinned: isPinned,
      });
      if (overlay) {
        entries.push(overlay);
        renderedIds.add(_selectedPointId);
      }
    }
  }

  // 2. All pinned points up to cohort capacity
  for (const pid of _pinnedPointIds) {
    if (renderedIds.has(pid)) continue;
    if (entries.length >= URL_INTELLIGENCE_OVERLAY_SOURCE_OPTIONS.cohortLimit) break;
    const rEntry = _pointRenderMap.get(pid);
    if (rEntry) {
      const overlay = createUrlIntelligenceOverlayEntry(pid, rEntry.point, rEntry.position, {
        selected: false,
        pinned: true,
      });
      if (overlay) {
        entries.push(overlay);
        renderedIds.add(pid);
      }
    }
  }

  // 3. Selected vehicle telemetry unit
  if (_selectedVehicleId) {
    const vehicle = _trajectories.get(_selectedVehicleId);
    if (vehicle) {
      const current = interpolateVehicleAtTime(vehicle, _currentTrajectoryTimeMs || vehicle.minTimeMs);
      const position = Cesium.Cartesian3.fromDegrees(current.lon, current.lat, 20);
      const mockPoint = buildVehicleMockPoint(vehicle, current);
      const overlay = createUrlIntelligenceOverlayEntry(`vehicle-${vehicle.vehicleId}`, mockPoint, position, {
        selected: true,
        pinned: false,
      });
      if (overlay) {
        entries.push(overlay);
      }
    }
  }

  if (entries.length === 0) {
    _overlayHost.clearSource(URL_INTELLIGENCE_OVERLAY_SOURCE_ID);
  } else {
    _overlayHost.setEntries(URL_INTELLIGENCE_OVERLAY_SOURCE_ID, entries, URL_INTELLIGENCE_OVERLAY_SOURCE_OPTIONS);
  }

  updateBillboardDisplayStates();
  governorRequestRender('url-intelligence-overlay-sync');
}

/**
 * Configure the active dimension profile for HUD details boxes.
 * Supported profiles: 'compact', 'standard', 'expanded', 'wide'.
 * @param {'compact'|'standard'|'expanded'|'wide'} profile
 */
export function setUrlDetailsBoxProfile(profile = 'standard') {
  if (OVERLAY_DIMENSION_PROFILES[profile]) {
    _activeDimensionProfile = profile;
    syncAllOverlayEntries();
  }
}

/**
 * Get the currently active dimension profile.
 * @returns {string}
 */
export function getUrlDetailsBoxProfile() {
  return _activeDimensionProfile;
}

/**
 * Configure the active leader and pointer arrowhead style.
 * @param {'straight'|'l_shape'|'diagonal_45'} leaderType
 * @param {'single_point'|'stealth'|'bead'|'none'} arrowType
 */
export function setUrlLeaderStyle(leaderType = 'straight', arrowType = 'single_point') {
  _activeLeaderType = leaderType;
  _activeArrowType = arrowType;
  syncAllOverlayEntries();
}

/**
 * Get current leader and arrow styling.
 * @returns {{leaderType: string, arrowType: string}}
 */
export function getUrlLeaderStyle() {
  return { leaderType: _activeLeaderType, arrowType: _activeArrowType };
}

/**
 * Pin an individual point onto the globe overlay deck.
 * @param {string} pointId
 */
export function pinUrlPoint(pointId) {
  if (!pointId) return;
  if (_pinnedPointIds.size >= MAX_PINNED_CARDS && !_pinnedPointIds.has(pointId)) {
    const oldest = _pinnedPointIds.values().next().value;
    _pinnedPointIds.delete(oldest);
  }
  _pinnedPointIds.add(pointId);
  syncAllOverlayEntries();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-pinned-changed', {
      detail: { pinnedIds: Array.from(_pinnedPointIds), action: 'pin', pointId },
    }));
  }
}

/**
 * Unpin an individual point from the globe overlay deck.
 * @param {string} pointId
 */
export function unpinUrlPoint(pointId) {
  if (!pointId || !_pinnedPointIds.has(pointId)) return;
  _pinnedPointIds.delete(pointId);
  syncAllOverlayEntries();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-pinned-changed', {
      detail: { pinnedIds: Array.from(_pinnedPointIds), action: 'unpin', pointId },
    }));
  }
}

/**
 * Toggle pin state of an individual point.
 * @param {string} pointId
 */
export function togglePinUrlPoint(pointId) {
  if (!pointId) return;
  if (_pinnedPointIds.has(pointId)) {
    unpinUrlPoint(pointId);
  } else {
    pinUrlPoint(pointId);
  }
}

/**
 * Clear all pinned points from the globe overlay deck.
 */
export function clearPinnedUrlPoints() {
  if (_pinnedPointIds.size === 0) return;
  _pinnedPointIds.clear();
  syncAllOverlayEntries();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-pinned-changed', {
      detail: { pinnedIds: [], action: 'clear' },
    }));
  }
}

/**
 * Get array of currently pinned entity IDs.
 * @returns {string[]}
 */
export function getPinnedUrlPoints() {
  return Array.from(_pinnedPointIds);
}

/**
 * Check if a specific point ID is pinned.
 * @param {string} pointId
 * @returns {boolean}
 */
export function isUrlPointPinned(pointId) {
  return _pinnedPointIds.has(pointId);
}

/**
 * Set multi-pin mode (clicking entities pins rather than replaces selection).
 * @param {boolean} enabled
 */
export function setMultiPinMode(enabled) {
  _multiPinMode = Boolean(enabled);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-multipin-changed', {
      detail: { enabled: _multiPinMode },
    }));
  }
}

/**
 * Check if multi-pin mode is currently active.
 * @returns {boolean}
 */
export function isMultiPinMode() {
  return _multiPinMode;
}

/**
 * Batch pin top N visible entities (optionally filtered by category).
 * @param {number} [limit=5]
 * @param {string|null} [category=null]
 * @returns {number} Count of pinned items
 */
export function pinTopEntities(limit = 5, category = null) {
  const candidates = category && category !== 'All'
    ? _points.filter((p) => p.category === category)
    : _points;
  const toPin = candidates.slice(0, Math.min(limit, MAX_PINNED_CARDS));
  for (const pt of toPin) {
    if (_pinnedPointIds.size >= MAX_PINNED_CARDS && !_pinnedPointIds.has(pt.id)) {
      break;
    }
    _pinnedPointIds.add(pt.id);
  }
  syncAllOverlayEntries();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-pinned-changed', {
      detail: { pinnedIds: Array.from(_pinnedPointIds), action: 'batch-pin', count: toPin.length },
    }));
  }
  return toPin.length;
}

/**
 * Creates HUD overlay card for a selected URL intelligence point.
 * @param {string} pointId
 * @param {Object} point
 * @param {Cesium.Cartesian3} position
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function createUrlIntelligenceOverlayEntry(pointId, point, position, options = {}) {
  if (!pointId || !position || !point) return null;
  const accent = point.color || getCategoryColor(point.category);
  const emoji = getCategoryEmoji(point.category);
  const dimensionProfile = options.dimensionProfile || _activeDimensionProfile || 'standard';
  const profileConfig = OVERLAY_DIMENSION_PROFILES[dimensionProfile] || OVERLAY_DIMENSION_PROFILES.standard;
  const leaderType = options.leaderType || _activeLeaderType || 'straight';
  const arrowType = options.arrowType || _activeArrowType || 'single_point';
  const isSelected = options.selected !== undefined ? Boolean(options.selected) : true;
  const isPinned = Boolean(options.pinned);
  const pinPrefix = isPinned ? '📌 ' : '';

  const detailsList = [
    `CATEGORY: ${emoji} ${point.category.toUpperCase()}`,
  ];

  if (point.islandGroup && point.region) {
    detailsList.push(`GEO: 🏝️ ${point.islandGroup.toUpperCase()} · 🏛️ ${point.region}`);
  } else if (point.islandGroup) {
    detailsList.push(`ISLAND: 🏝️ ${point.islandGroup.toUpperCase()}`);
  }

  if (point.operationalTier) {
    detailsList.push(`TIER: 🛡️ ${point.operationalTier.toUpperCase()}`);
  }

  // Secondary line: prioritize address, operational info, or contact
  if (point.address) {
    const cleanAddr = point.address.replace(/\n+/g, ' ').trim();
    detailsList.push(`ADDRESS: ${cleanAddr.length > 34 ? cleanAddr.slice(0, 31) + '…' : cleanAddr}`);
  } else if (point.details) {
    const cleanDetails = point.details.replace(/\n+/g, ' ').trim();
    detailsList.push(`INFO: ${cleanDetails.length > 34 ? cleanDetails.slice(0, 31) + '…' : cleanDetails}`);
  } else if (point.contact) {
    const cleanContact = point.contact.replace(/\n+/g, ' | ').trim();
    detailsList.push(`CONTACT: ${cleanContact.length > 34 ? cleanContact.slice(0, 31) + '…' : cleanContact}`);
  }

  // Tertiary line: custom ingested attribute or operating hours
  if (point.rawRecord && typeof point.rawRecord === 'object') {
    const customKeys = Object.keys(point.rawRecord).filter((k) => {
      const lower = k.toLowerCase();
      return (
        !lower.includes('name') &&
        !lower.includes('title') &&
        !lower.includes('lat') &&
        !lower.includes('lon') &&
        !lower.includes('address') &&
        !lower.includes('category')
      );
    });
    if (customKeys.length > 0) {
      const key = customKeys[0];
      const val = String(point.rawRecord[key]).replace(/\n+/g, ' ').trim();
      if (val) {
        const shortVal = val.length > 26 ? val.slice(0, 23) + '…' : val;
        detailsList.push(`${key.toUpperCase().slice(0, 14)}: ${shortVal}`);
      }
    }
  } else if (point.hours) {
    const cleanHours = point.hours.replace(/\n+/g, ' ').trim();
    detailsList.push(`HOURS: ${cleanHours.length > 34 ? cleanHours.slice(0, 31) + '…' : cleanHours}`);
  }

  // Clean source line (concise domain/dataset label rather than raw 100+ char URL)
  const rawSource = point.sourceUrl || _activeUrl || '';
  let cleanSource = 'Document Dataset';
  if (rawSource) {
    try {
      const parsed = new URL(rawSource);
      if (parsed.hostname.includes('docs.google.com')) {
        cleanSource = 'Google Docs Dataset';
      } else {
        cleanSource = parsed.hostname.replace(/^www\./, '');
      }
    } catch {
      cleanSource = rawSource.slice(0, 24);
    }
  }
  detailsList.push(`SOURCE: ${cleanSource}`);

  return {
    id: `url-intelligence:${pointId}`,
    position,
    variant: isSelected ? 'selected' : 'label',
    selected: isSelected,
    pinned: isPinned,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-card',
    priority: isSelected ? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER - 1,
    title: `${pinPrefix}${emoji} ${point.name.toUpperCase()}`,
    details: detailsList,
    accent,
    interactive: false,
    anchorRadiusPx: 14,
    minAnchorGapPx: options.minAnchorGapPx ?? (dimensionProfile === 'compact' ? 75 : 95),
    verticalOnly: true,
    placement: 'above',
    dimensionProfile,
    maxWidthPx: options.maxWidthPx ?? profileConfig.maxWidthPx,
    minWidthPx: options.minWidthPx ?? profileConfig.minWidthPx,
    leaderType,
    arrowType,
    sourceId: URL_INTELLIGENCE_OVERLAY_SOURCE_ID,
  };
}

/**
 * Select a point by ID, displaying its HUD card and notifying contextStore.
 * @param {string} pointId
 * @param {boolean} [flyTo=false]
 */
export function selectUrlPoint(pointId, flyTo = false, options = {}) {
  _selectedPointId = pointId;

  if (!pointId) {
    syncAllOverlayEntries();
    selectEntityContext(null);
    governorRequestRender('url-intelligence-deselected');
    return;
  }

  const entry = _pointRenderMap.get(pointId);
  if (!entry) return;

  syncAllOverlayEntries();

  registerEntityContext({
    id: `url-intelligence:${pointId}`,
    type: 'url-intelligence',
    name: entry.point.name,
    category: entry.point.category,
    address: entry.point.address,
    contact: entry.point.contact,
    hours: entry.point.hours || '',
    officer: entry.point.officer || '',
    officerRole: entry.point.officerRole || '',
    specialNotes: entry.point.specialNotes || '',
    decomposed: entry.point.decomposed,
    position: entry.position,
    sourceUrl: entry.point.sourceUrl,
  });
  selectEntityContext(`url-intelligence:${pointId}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-point-selected', {
      detail: {
        pointId,
        point: entry.point,
        isTour: Boolean(options?.isTour),
      },
    }));
  }

  if (flyTo && _viewer) {
    const carto = Cesium.Cartographic.fromCartesian(entry.position);
    _viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, Math.max(carto.height + 25000, 30000)),
      duration: 1.5,
    });
  }

  governorRequestRender('url-intelligence-selected');
}

/**
 * Select an individual vehicle unit by vehicle ID for tactical HUD display and track highlight.
 * @param {string|null} vehicleId
 * @param {boolean} [flyTo=false]
 */
export function selectVehicle(vehicleId, flyTo = false, options = {}) {
  _selectedVehicleId = vehicleId;
  const vehicle = _trajectories.get(vehicleId);

  if (!vehicle) {
    if (!vehicleId) {
      _selectedPointId = null;
      syncAllOverlayEntries();
      selectEntityContext(null);
      // Reset polyline widths
      for (const [, polyline] of _polylineRenderMap.entries()) {
        polyline.width = 2.5;
      }
      for (const [, vEntry] of _vehicleRenderMap.entries()) {
        vEntry.billboard.width = 24;
        vEntry.billboard.height = 24;
      }
      governorRequestRender('vehicle-deselected');
      notifyTrajectoryChange();
    }
    return;
  }

  // Highlight selected vehicle's polyline, restore others
  for (const [vId, polyline] of _polylineRenderMap.entries()) {
    polyline.width = vId === vehicleId ? 5.5 : 2.5;
  }

  // Highlight billboard size
  for (const [vId, vEntry] of _vehicleRenderMap.entries()) {
    const isSelected = vId === vehicleId;
    const isTrain = isTrainVehicle(vEntry.vehicle);
    vEntry.billboard.width = isTrain ? (isSelected ? 42 : 32) : (isSelected ? 34 : 24);
    vEntry.billboard.height = isTrain ? (isSelected ? 42 : 32) : (isSelected ? 34 : 24);
    if (isTrain) {
      vEntry.billboard.image = getTrainBillboardImage({
        lineId: vEntry.vehicle.lineId || vEntry.vehicle.line,
        color: vEntry.vehicle.datasetColor || vEntry.vehicle.color,
        isDwell: vEntry.current?.isDwell,
        isSelected,
        speedKmh: vEntry.current?.speedKmh || 0,
      });
    }
  }

  const current = interpolateVehicleAtTime(vehicle, _currentTrajectoryTimeMs || vehicle.minTimeMs);
  const position = Cesium.Cartesian3.fromDegrees(current.lon, current.lat, 20);
  const mockPoint = buildVehicleMockPoint(vehicle, current);

  syncAllOverlayEntries();

  registerEntityContext({
    id: `url-intelligence:vehicle:${vehicle.vehicleId}`,
    type: 'url-intelligence',
    name: mockPoint.name,
    category: mockPoint.category,
    address: mockPoint.address,
    contact: mockPoint.contact,
    details: mockPoint.details,
    position,
    sourceUrl: _activeUrl,
  });
  selectEntityContext(`url-intelligence:vehicle:${vehicle.vehicleId}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gev:url-vehicle-selected', {
      detail: {
        vehicleId: vehicle.vehicleId,
        vehicle,
        current,
        point: mockPoint,
      },
    }));
    window.dispatchEvent(new CustomEvent('gev:url-point-selected', {
      detail: {
        pointId: `vehicle-${vehicle.vehicleId}`,
        point: mockPoint,
        isTour: Boolean(options?.isTour),
      },
    }));
  }

  if (flyTo && _viewer?.camera) {
    _viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(current.lon, current.lat, 2500),
      duration: 1.2,
    });
  }

  notifyTrajectoryChange();
  governorRequestRender('vehicle-selected');
}

/**
 * Set the current timeline scrubber timestamp for trajectory playback.
 * @param {number} timeMs
 */
export function setTrajectoryScrubberTime(timeMs) {
  if (!_fleetMetrics) return;
  const clamped = Math.max(_fleetMetrics.minTimeMs, Math.min(_fleetMetrics.maxTimeMs, timeMs));
  _currentTrajectoryTimeMs = clamped;

  for (const [vehicleId, vEntry] of _vehicleRenderMap.entries()) {
    const current = interpolateVehicleAtTime(vEntry.vehicle, clamped);
    vEntry.current = current;
    const pos = Cesium.Cartesian3.fromDegrees(current.lon, current.lat, 15);
    vEntry.billboard.position = pos;
    vEntry.label.position = pos;
    const datasetTag = vEntry.vehicle.datasetName ? `[${vEntry.vehicle.datasetName}] ` : '';
    const isTrain = isTrainVehicle(vEntry.vehicle);
    const vehicleEmoji = isTrain ? '🚆' : '🚙';
    vEntry.label.text = `${datasetTag}${vehicleEmoji} ${vEntry.vehicle.displayName || vehicleId} [${current.speedKmh} km/h · ${current.cardinal}]`;
    const isSelected = vehicleId === _selectedVehicleId;

    if (isTrain) {
      vEntry.billboard.image = getTrainBillboardImage({
        lineId: vEntry.vehicle.lineId || vEntry.vehicle.line,
        color: vEntry.vehicle.datasetColor || vEntry.vehicle.color,
        isDwell: current.isDwell,
        isSelected,
        speedKmh: current.speedKmh,
      });
      vEntry.billboard.width = isSelected ? 42 : 32;
      vEntry.billboard.height = isSelected ? 42 : 32;
    } else {
      vEntry.billboard.image = getCategoryBillboardImage(current.isDwell ? 'Vehicle Idle' : 'Vehicle Active', isSelected);
    }

    if (isSelected) {
      const mockPoint = buildVehicleMockPoint(vEntry.vehicle, current);
      const overlay = createUrlIntelligenceOverlayEntry(`vehicle-${vehicleId}`, mockPoint, pos);
      if (overlay) {
        _overlayHost.setEntries(URL_INTELLIGENCE_OVERLAY_SOURCE_ID, [overlay]);
      }
    }
  }

  if (_followingVehicleId && _viewer?.camera) {
    const following = _vehicleRenderMap.get(_followingVehicleId);
    if (following) {
      _viewer.camera.lookAt(
        Cesium.Cartesian3.fromDegrees(following.current.lon, following.current.lat, 0),
        new Cesium.HeadingPitchRange(_viewer.camera.heading, _viewer.camera.pitch, 3000)
      );
      _viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  }

  notifyTrajectoryChange();
  governorRequestRender('trajectory-scrubbed');
}

/**
 * Start temporal trajectory playback.
 * @param {number|null} [speedMultiplier=null]
 */
export function playTrajectory(speedMultiplier = null) {
  if (speedMultiplier) _playbackSpeed = speedMultiplier;
  if (_isPlaying) return;
  if (!_fleetMetrics) return;
  _isPlaying = true;

  const intervalMs = 100;
  _playbackTimer = setInterval(() => {
    if (!_currentTrajectoryTimeMs || !_fleetMetrics) return;
    const timeDelta = intervalMs * _playbackSpeed * 10;
    let nextTime = _currentTrajectoryTimeMs + timeDelta;
    if (nextTime > _fleetMetrics.maxTimeMs) {
      nextTime = _fleetMetrics.minTimeMs;
    }
    setTrajectoryScrubberTime(nextTime);
  }, intervalMs);
  notifyTrajectoryChange();
  if (typeof _rowControlsListener === 'function') _rowControlsListener();
}

/**
 * Pause temporal trajectory playback.
 */
export function pauseTrajectory() {
  _isPlaying = false;
  if (_playbackTimer) {
    clearInterval(_playbackTimer);
    _playbackTimer = null;
  }
  notifyTrajectoryChange();
  if (typeof _rowControlsListener === 'function') _rowControlsListener();
}

/**
 * Toggle trajectory playback state between playing and paused.
 */
export function toggleTrajectoryPlayback() {
  if (_isPlaying) pauseTrajectory();
  else playTrajectory();
}

/**
 * Set camera lock to continuously follow a specific vehicle unit.
 * @param {string} vehicleId
 */
export function followVehicle(vehicleId) {
  _followingVehicleId = vehicleId;
  if (vehicleId) {
    selectVehicle(vehicleId, true);
  }
  notifyTrajectoryChange();
  if (typeof _rowControlsListener === 'function') _rowControlsListener();
}

/**
 * Release camera follow lock.
 */
export function unfollowVehicle() {
  _followingVehicleId = null;
  notifyTrajectoryChange();
  if (typeof _rowControlsListener === 'function') _rowControlsListener();
}

function notifyChange() {
  if (typeof _rowControlsListener === 'function') {
    try {
      _rowControlsListener();
    } catch {}
  }
  notifyTrajectoryChange();
}

function notifyTrajectoryChange() {
  const state = getTrajectoryState();
  for (const listener of _trajectoryListeners) {
    try {
      listener(state);
    } catch {}
  }
}

/**
 * Subscribe to trajectory state and timeline scrubber changes.
 * @param {Function} listener
 * @returns {Function} Unsubscribe function
 */
export function onTrajectoryUpdate(listener) {
  _trajectoryListeners.add(listener);
  return () => _trajectoryListeners.delete(listener);
}

/**
 * Retrieve current trajectory playback and kinematics state.
 * @returns {Object}
 */
export function getTrajectoryState() {
  return {
    isTrajectory: _isTrajectory,
    currentTimeMs: _currentTrajectoryTimeMs,
    minTimeMs: _fleetMetrics?.minTimeMs || 0,
    maxTimeMs: _fleetMetrics?.maxTimeMs || 0,
    isPlaying: _isPlaying,
    playbackSpeed: _playbackSpeed,
    selectedVehicleId: _selectedVehicleId,
    followingVehicleId: _followingVehicleId,
    fleetMetrics: _fleetMetrics,
    trajectoryList: _trajectoryList,
  };
}

/**
 * Fly camera to encompass all current points and vehicle trajectories in the active dataset.
 */
export function flyToLayerExtent() {
  if (!_viewer) return;
  const hasPoints = _points && _points.length > 0;
  const hasTraj = _trajectoryList && _trajectoryList.length > 0;
  if (!hasPoints && !hasTraj) return;

  if (_bounds && Number.isFinite(_bounds.minLat)) {
    const rectangle = Cesium.Rectangle.fromDegrees(
      _bounds.minLon - 0.25,
      _bounds.minLat - 0.25,
      _bounds.maxLon + 0.25,
      _bounds.maxLat + 0.25
    );
    _viewer.camera.flyTo({
      destination: rectangle,
      duration: 2.0,
    });
  } else if (_center && Number.isFinite(_center.lat)) {
    _viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(_center.lon, _center.lat, 1_500_000),
      duration: 2.0,
    });
  }
}

/**
 * Fly camera to encompass a major Philippine Island Group (Luzon, Visayas, Mindanao).
 * @param {string} islandGroupName
 */
export function flyToIslandGroup(islandGroupName) {
  if (!_viewer) return;
  const group = PH_ISLAND_GROUPS[islandGroupName];
  if (!group || !group.bounds) return;
  const rectangle = Cesium.Rectangle.fromDegrees(
    group.bounds.minLon - 0.4,
    group.bounds.minLat - 0.4,
    group.bounds.maxLon + 0.4,
    group.bounds.maxLat + 0.4
  );
  _viewer.camera.flyTo({
    destination: rectangle,
    duration: 1.8,
  });
}

/**
 * Fly camera to encompass an Administrative Region.
 * @param {string} regionCode
 */
export function flyToRegion(regionCode) {
  if (!_viewer) return;
  const reg = PH_ADMIN_REGIONS[regionCode];
  if (!reg || !reg.bounds) return;
  const rectangle = Cesium.Rectangle.fromDegrees(
    reg.bounds.minLon - 0.25,
    reg.bounds.minLat - 0.25,
    reg.bounds.maxLon + 0.25,
    reg.bounds.maxLat + 0.25
  );
  _viewer.camera.flyTo({
    destination: rectangle,
    duration: 1.5,
  });
}

/**
 * Fetch and ingest a URL from the proxy backend.
 * @param {string} url
 * @param {boolean} [forceRefresh=false]
 * @param {Object} [options={}]
 * @returns {Promise<Object>}
 */
export async function ingestUrl(url, forceRefresh = false, options = {}) {
  _loading = true;
  _error = null;
  const target = (url || DEFAULT_URL).trim();
  _activeUrl = target;

  if (typeof _rowControlsListener === 'function') _rowControlsListener();

  try {
    const encoded = encodeURIComponent(target);
    const refreshParam = forceRefresh ? '&refresh=1' : '';
    const aiAssistParam = options.aiAssist === false ? '&aiAssist=false' : '&aiAssist=true';
    const overrideParam = options.mappingOverrides ? `&mappingOverrides=${encodeURIComponent(JSON.stringify(options.mappingOverrides))}` : '';
    const tabParam = options.sheetTab ? `&sheetTab=${encodeURIComponent(options.sheetTab)}` : '';
    const allTabsParam = options.deepScrapeAllTabs ? `&deepScrapeAllTabs=true` : '';
    const nextPageParam = options.scrapeNextPages ? `&scrapeNextPages=true` : '';
    const res = await fetch(`/api/url-layer/ingest?url=${encoded}${refreshParam}${aiAssistParam}${overrideParam}${tabParam}${allTabsParam}${nextPageParam}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}: Failed to analyze URL`);
    }

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.points)) {
      throw new Error(data.error || 'No mappable points discovered at URL');
    }

    _pageTitle = data.title || target;
    _points = data.points;
    _categories = data.categories || ['All'];
    _categoryCounts = data.categoryCounts || {};
    _bounds = data.bounds;
    _center = data.center;
    _selectedCategory = 'All';
    _selectedIslandGroup = 'All';
    _selectedRegion = 'All';
    _hierarchySummary = data.hierarchySummary || computePhilippineHierarchySummary(_points);
    _detectedHeaders = Array.isArray(data.detectedHeaders) ? data.detectedHeaders : [];
    _sampleRows = Array.isArray(data.sampleRows) ? data.sampleRows : [];
    _schemaAnalysis = data.schemaAnalysis || null;
    _activeMappingOverrides = options.mappingOverrides || null;
    _recommendations = Array.isArray(data.recommendations) ? data.recommendations : (data.schemaAnalysis?.actionableRecommendations || []);
    _domainIdentification = data.domainIdentification || data.schemaAnalysis?.domainIdentification || '';
    _categoryIconMappings = data.categoryIconMappings || data.schemaAnalysis?.categoryIconMappings || {};
    _distributionAnalysis = data.distributionAnalysis || data.schemaAnalysis?.distributionAnalysis || '';
    _workbookTabs = Array.isArray(data.workbookTabs) ? data.workbookTabs : [];
    _ruleChecks = data.ruleChecks || null;
    _analystComment = data.analystComment || null;

    // Ingest GPS telemetry / vehicle trajectories if present
    _isTrajectory = Boolean(data.isTrajectory);
    _trajectories = new Map();
    if (data.trajectories) {
      if (data.trajectories instanceof Map) {
        _trajectories = data.trajectories;
      } else if (typeof data.trajectories === 'object') {
        for (const [k, v] of Object.entries(data.trajectories)) {
          if (v) _trajectories.set(k, v);
        }
      }
    }
    _trajectoryList = Array.isArray(data.trajectoryList)
      ? data.trajectoryList
      : Array.from(_trajectories.values());
    if (_trajectories.size === 0 && _trajectoryList.length > 0) {
      for (const v of _trajectoryList) {
        if (v && v.vehicleId) {
          _trajectories.set(v.vehicleId, v);
        }
      }
    }
    if (_isTrajectory && _trajectoryList.length > 0) {
      _categories = ['All', 'Fleet Active', 'Fleet Idle'];
      _categoryCounts = {
        'Fleet Active': _trajectoryList.filter((v) => (v.avgSpeedKmh || 0) >= 3).length,
        'Fleet Idle': _trajectoryList.filter((v) => (v.avgSpeedKmh || 0) < 3).length,
      };
    }
    _fleetMetrics = data.fleetMetrics || null;
    _currentTrajectoryTimeMs = _fleetMetrics ? _fleetMetrics.minTimeMs : null;
    _selectedVehicleId = null;
    _followingVehicleId = null;
    pauseTrajectory();

    // Dynamically register category icons in icon registry
    if (_categoryIconMappings && typeof _categoryIconMappings === 'object') {
      for (const [cat, info] of Object.entries(_categoryIconMappings)) {
        registerCategoryIcon(cat, info);
      }
    }

    // Persist to local storage for instant offline / reload recall
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          url: _activeUrl,
          title: _pageTitle,
          points: _points,
          categories: _categories,
          categoryCounts: _categoryCounts,
          bounds: _bounds,
          center: _center,
          detectedHeaders: _detectedHeaders,
          sampleRows: _sampleRows,
          schemaAnalysis: _schemaAnalysis,
          mappingOverrides: _activeMappingOverrides,
          recommendations: _recommendations,
          domainIdentification: _domainIdentification,
          categoryIconMappings: _categoryIconMappings,
          distributionAnalysis: _distributionAnalysis,
          workbookTabs: _workbookTabs,
          ruleChecks: _ruleChecks,
          analystComment: _analystComment,
          isTrajectory: _isTrajectory,
          trajectoryList: _trajectoryList,
          fleetMetrics: _fleetMetrics,
          timestamp: Date.now(),
        }));
      }
    } catch {
      // Quota or incognito error tolerated
    }

    if (_enabled) {
      renderPoints();
      flyToLayerExtent();
    }

    _lastUpdate = Date.now();
    _count = _points.length;
    return data;
  } catch (err) {
    _error = err.message || 'URL ingestion failed';
    throw err;
  } finally {
    _loading = false;
    if (typeof _rowControlsListener === 'function') _rowControlsListener();
    governorRequestRender('url-intelligence-loaded');
  }
}

/**
 * Load cached data from local storage if available.
 */
function loadCachedData() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.points) && parsed.points.length > 0) {
          _activeUrl = parsed.url || DEFAULT_URL;
          _pageTitle = parsed.title || 'Cached URL Layer';
          _points = parsed.points;
          _categories = parsed.categories || ['All'];
          _categoryCounts = parsed.categoryCounts || {};
          _hierarchySummary = parsed.hierarchySummary || computePhilippineHierarchySummary(_points);
          _bounds = parsed.bounds;
          _center = parsed.center;
          _count = _points.length;
          _detectedHeaders = Array.isArray(parsed.detectedHeaders) ? parsed.detectedHeaders : [];
          _sampleRows = Array.isArray(parsed.sampleRows) ? parsed.sampleRows : [];
          _schemaAnalysis = parsed.schemaAnalysis || null;
          _activeMappingOverrides = parsed.mappingOverrides || null;
          _recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
          _domainIdentification = parsed.domainIdentification || '';
          _categoryIconMappings = parsed.categoryIconMappings || {};
          _distributionAnalysis = parsed.distributionAnalysis || '';
          _workbookTabs = Array.isArray(parsed.workbookTabs) ? parsed.workbookTabs : [];
          _ruleChecks = parsed.ruleChecks || null;
          _analystComment = parsed.analystComment || null;
          _isTrajectory = Boolean(parsed.isTrajectory);
          _trajectoryList = Array.isArray(parsed.trajectoryList) ? parsed.trajectoryList : [];
          _trajectories = new Map();
          for (const v of _trajectoryList) {
            _trajectories.set(v.vehicleId, v);
          }
          _fleetMetrics = parsed.fleetMetrics || null;
          _currentTrajectoryTimeMs = _fleetMetrics ? _fleetMetrics.minTimeMs : null;

          if (_categoryIconMappings && typeof _categoryIconMappings === 'object') {
            for (const [cat, info] of Object.entries(_categoryIconMappings)) {
              registerCategoryIcon(cat, info);
            }
          }
          _lastUpdate = parsed.timestamp || Date.now();
          return true;
        }
      }
    }
  } catch {
    // Tolerated
  }
  return false;
}

/**
 * Render multi-entity GPS telemetry trajectories and dynamic moving vehicles.
 */
function renderTrajectoryLayer() {
  const filteredVehicles = _selectedCategory === 'All'
    ? _trajectoryList
    : _trajectoryList.filter((v) => {
        if (v.datasetName && v.datasetName.toLowerCase() === _selectedCategory.toLowerCase()) {
          return true;
        }
        const isIdle = (v.avgSpeedKmh || 0) < 3;
        const cat = isIdle ? 'Vehicle Idle' : 'Vehicle Active';
        return cat.toLowerCase() === _selectedCategory.toLowerCase();
      });

  const currentTime = _currentTrajectoryTimeMs || _fleetMetrics?.minTimeMs || Date.now();

  for (const vehicle of filteredVehicles) {
    if (!vehicle.waypoints || vehicle.waypoints.length === 0) continue;

    // Polyline coordinates
    const flatCoords = [];
    for (const wp of vehicle.waypoints) {
      flatCoords.push(wp.lon, wp.lat, 12);
    }

    if (flatCoords.length >= 6 && _polylineCollection) {
      const positions = Cesium.Cartesian3.fromDegreesArrayHeights(flatCoords);
      const isSelected = vehicle.vehicleId === _selectedVehicleId;
      const polyColor = vehicle.datasetColor || vehicle.color || '#00e5ff';
      const polyline = _polylineCollection.add({
        positions,
        width: isSelected ? 5.5 : 2.5,
        material: Cesium.Material.fromType('Color', {
          color: Cesium.Color.fromCssColorString(polyColor).withAlpha(0.85),
        }),
        id: `url-intelligence:vehicle:${vehicle.vehicleId}`,
      });
      _polylineRenderMap.set(vehicle.vehicleId, polyline);
    }

    // Vehicle active location marker
    const current = interpolateVehicleAtTime(vehicle, currentTime);
    const position = Cesium.Cartesian3.fromDegrees(current.lon, current.lat, 15);
    const isSelected = vehicle.vehicleId === _selectedVehicleId;
    const isTrain = isTrainVehicle(vehicle);
    const vehicleEmoji = isTrain ? '🚆' : '🚙';

    let billboardImage;
    if (isTrain) {
      billboardImage = getTrainBillboardImage({
        lineId: vehicle.lineId || vehicle.line,
        color: vehicle.datasetColor || vehicle.color,
        isDwell: current.isDwell,
        isSelected,
        speedKmh: current.speedKmh,
      });
    } else {
      const categoryName = current.isDwell ? 'Vehicle Idle' : 'Vehicle Active';
      billboardImage = getCategoryBillboardImage(categoryName, isSelected);
    }

    const billboard = _billboardCollection.add({
      position,
      image: billboardImage,
      width: isTrain ? (isSelected ? 42 : 32) : (isSelected ? 34 : 24),
      height: isTrain ? (isSelected ? 42 : 32) : (isSelected ? 34 : 24),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      id: `url-intelligence:vehicle:${vehicle.vehicleId}`,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 5_000_000, 0.4),
    });

    const datasetTag = vehicle.datasetName ? `[${vehicle.datasetName}] ` : '';
    const label = _labelCollection.add({
      position,
      text: `${datasetTag}${vehicleEmoji} ${vehicle.displayName || vehicle.vehicleId} [${current.speedKmh} km/h · ${current.cardinal}]`,
      font: '10px "JetBrains Mono", monospace',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -30),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_500_000),
      id: `url-intelligence:vehicle:${vehicle.vehicleId}`,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    _vehicleRenderMap.set(vehicle.vehicleId, {
      vehicle,
      billboard,
      label,
      current,
    });
  }

  _count = (_trajectoryList?.length || 0) + (_points?.length || 0);
  governorRequestRender('url-intelligence-trajectories-rendered');
}

/**
 * Phase 3: Renders glowing holographic territorial bounding corridors and aerial label badges.
 * @param {number} filteredCount
 */
function renderTerritorialBounds(filteredCount = 0) {
  if (!_polylineCollection || !_labelCollection || !_showTerritorialBounds) return;
  if (_selectedIslandGroup === 'All' && _selectedRegion === 'All') return;
  if (typeof Cesium === 'undefined' || !Cesium.Cartesian3) return;

  const targetId = _selectedRegion !== 'All' ? _selectedRegion : _selectedIslandGroup;
  const boundsMeta = getPhilippineTerritorialBounds(targetId);
  if (!boundsMeta || !boundsMeta.polygonCoords) return;

  const flatCoords = [];
  for (const [lon, lat] of boundsMeta.polygonCoords) {
    flatCoords.push(lon, lat, 200);
  }

  if (flatCoords.length >= 6) {
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(flatCoords);
    _polylineCollection.add({
      positions,
      width: 3.5,
      material: Cesium.Material.fromType('Color', {
        color: Cesium.Color.fromCssColorString(boundsMeta.color || '#00e5ff').withAlpha(0.85),
      }),
      id: `url-intelligence:territorial-boundary:${boundsMeta.code}`,
    });

    const topLat = boundsMeta.bounds.maxLat;
    const centerLon = (boundsMeta.bounds.minLon + boundsMeta.bounds.maxLon) / 2;
    const labelPos = Cesium.Cartesian3.fromDegrees(centerLon, topLat, 1200);
    _labelCollection.add({
      position: labelPos,
      text: `[ 🌐 ${boundsMeta.fullName.toUpperCase()} · ${filteredCount} PLOTTED ]`,
      font: 'bold 12px "JetBrains Mono", monospace',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.fromCssColorString(boundsMeta.color || '#00e5ff'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10_000_000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: `url-intelligence:territorial-label:${boundsMeta.code}`,
    });
  }
}

/**
 * Render all active points and vehicle trajectories to Cesium primitives as vector billboards & polylines.
 */
function renderPoints() {
  if (!_billboardCollection || !_labelCollection) return;

  _billboardCollection.removeAll();
  _labelCollection.removeAll();
  _pointRenderMap.clear();

  if (_polylineCollection) {
    _polylineCollection.removeAll();
  }
  _polylineRenderMap.clear();
  _vehicleRenderMap.clear();

  if (_isTrajectory && _trajectories && _trajectories.size > 0) {
    renderTrajectoryLayer();
    // Do not return early if we also have static points (e.g. from multi-dataset ingestion)
    if (!_points || _points.length === 0) {
      return;
    }
  }

  const filteredPoints = _points.filter((p) => {
    if (_selectedCategory !== 'All') {
      const matchCat = p.category && p.category.toLowerCase() === _selectedCategory.toLowerCase();
      const matchDataset = p.datasetName && p.datasetName.toLowerCase() === _selectedCategory.toLowerCase();
      if (!matchCat && !matchDataset) return false;
    }
    if (_selectedIslandGroup !== 'All') {
      if (!p.islandGroup || p.islandGroup.toLowerCase() !== _selectedIslandGroup.toLowerCase()) {
        return false;
      }
    }
    if (_selectedRegion !== 'All') {
      if (!p.region || p.region.toLowerCase() !== _selectedRegion.toLowerCase()) {
        return false;
      }
    }
    return true;
  });

  for (const point of filteredPoints) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;

    const position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 150);
    const isSelected = _selectedPointId === point.id;
    const isStation = isStationPoint(point);

    let billboardImage;
    if (isStation) {
      billboardImage = getStationBillboardImage({
        lineId: point.lineId || point.line,
        color: point.color,
        isSelected,
        isInterchange: Boolean(
          point.isInterchange ||
          point.name?.toLowerCase().includes('interchange') ||
          point.name?.toLowerCase().includes('cubao') ||
          point.name?.toLowerCase().includes('recto') ||
          point.name?.toLowerCase().includes('taft')
        ),
      });
    } else {
      billboardImage = getCategoryBillboardImage(point.category, isSelected);
    }

    const primitive = _billboardCollection.add({
      position,
      image: billboardImage,
      width: isStation ? (isSelected ? 42 : 32) : (isSelected ? 34 : 26),
      height: isStation ? (isSelected ? 42 : 32) : (isSelected ? 34 : 26),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      id: `url-intelligence:${point.id}`,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(500, 1.15, 6_000_000, 0.45),
    });

    const iconEmoji = isStation ? '🚉' : getCategoryEmoji(point.category);
    const shortName = point.name.length > 26 ? `${point.name.slice(0, 25)}…` : point.name;
    const datasetTag = point.datasetName ? `[${point.datasetName}] ` : '';

    const label = _labelCollection.add({
      position,
      text: `${datasetTag}${iconEmoji} ${shortName}`,
      font: '10px "JetBrains Mono", monospace',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -30),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_200_000),
      id: `url-intelligence:${point.id}`,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    _pointRenderMap.set(point.id, {
      id: point.id,
      point,
      billboard: primitive,
      primitive,
      label,
      position,
    });
  }

  // Phase 3: Render 3D Territorial Boundary Corridors & Aerial Labels on Cesium Globe
  renderTerritorialBounds(filteredPoints.length);

  _count = (_trajectoryList?.length || 0) + filteredPoints.length;
  updateBillboardDisplayStates();
  syncAllOverlayEntries();
  governorRequestRender('url-intelligence-rendered');
}

/**
 * Setup mouse and key event handlers.
 * @param {Cesium.Viewer} viewer
 */
function _installClickHandler(viewer) {
  if (!viewer?.canvas) return;
  if (_clickHandler) {
    _clickHandler.destroy();
  }

  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  _clickHandler.setInputAction((click) => {
    if (!_enabled) return;
    const picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && typeof picked.id === 'string' && picked.id.startsWith('url-intelligence:')) {
      if (picked.id.startsWith('url-intelligence:vehicle:')) {
        const vehicleId = picked.id.replace('url-intelligence:vehicle:', '');
        selectVehicle(vehicleId, false);
      } else {
        const cleanId = picked.id.replace('url-intelligence:', '');
        if (_multiPinMode) {
          togglePinUrlPoint(cleanId);
        } else {
          selectUrlPoint(cleanId, false);
        }
      }
    } else {
      if (_isTrajectory && _selectedVehicleId) {
        selectVehicle(null);
      } else if (!_multiPinMode) {
        selectUrlPoint(null);
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', _onKeyDown);
  }
}

function _onKeyDown(event) {
  if (event.key === 'Escape') {
    if (_selectedVehicleId) {
      selectVehicle(null);
    } else if (_selectedPointId) {
      selectUrlPoint(null);
    } else if (_pinnedPointIds.size > 0 && event.shiftKey) {
      clearPinnedUrlPoints();
    }
  }
}

/**
 * Simultaneously ingests and renders multiple files (CSV, GPX, NMEA, GeoJSON).
 * @param {Array<{ name: string, content: string }|File>} files
 * @returns {Promise<Object>} Ingestion result with datasets, points, trajectories, bounds
 */
export async function ingestFilesSimultaneously(files = []) {
  _loading = true;
  _error = null;

  try {
    const normalizedFiles = await Promise.all(
      files.map(async (f, idx) => {
        if (typeof f.text === 'function') {
          const content = await f.text();
          return { name: f.name, content, index: idx };
        }
        return { name: f.name || `file_${idx + 1}`, content: f.content || '', index: idx };
      })
    );

    const result = await ingestMultipleFiles(normalizedFiles);

    _activeDatasets.clear();
    for (const ds of result.datasets) {
      _activeDatasets.set(ds.datasetId, ds);
    }
    _isMultiDatasetMode = true;

    _points = result.combinedPoints || [];
    _bounds = result.combinedBounds || null;
    _center = result.combinedCenter || null;
    _pageTitle = `Simultaneous Multi-Dataset (${result.datasets.length} Files)`;

    // Process combined trajectories
    _trajectories = new Map();
    _trajectoryList = result.combinedTrajectories || [];
    for (const tr of _trajectoryList) {
      _trajectories.set(tr.vehicleId, tr);
    }
    _isTrajectory = _trajectoryList.length > 0;

    // Synchronize fleet metrics across all active trajectories
    if (_isTrajectory) {
      let minTime = Infinity;
      let maxTime = -Infinity;
      let totalPoints = 0;

      for (const v of _trajectoryList) {
        totalPoints += v.pointCount || (v.waypoints?.length || 0);
        const vMin = v.timeRangeMs?.start || (v.waypoints && v.waypoints[0]?.timeMs);
        const vMax = v.timeRangeMs?.end || (v.waypoints && v.waypoints[v.waypoints.length - 1]?.timeMs);
        if (Number.isFinite(vMin) && vMin < minTime) minTime = vMin;
        if (Number.isFinite(vMax) && vMax > maxTime) maxTime = vMax;
      }

      if (Number.isFinite(minTime) && Number.isFinite(maxTime)) {
        _fleetMetrics = {
          vehicleCount: _trajectoryList.length,
          totalWaypoints: totalPoints,
          minTimeMs: minTime,
          maxTimeMs: maxTime,
          durationMs: maxTime - minTime,
        };
        _currentTrajectoryTimeMs = minTime;
      } else {
        _fleetMetrics = null;
        _currentTrajectoryTimeMs = Date.now();
      }

      _categories = ['All', ...result.datasets.map((d) => d.name)];
      _categoryCounts = {
        All: _points.length + _trajectoryList.length,
      };
      for (const d of result.datasets) {
        _categoryCounts[d.name] = (d.points?.length || 0) + (d.trajectories?.length || 0);
      }
    } else {
      _categories = ['All', ...result.datasets.map((d) => d.name)];
      _categoryCounts = {
        All: _points.length,
      };
      for (const d of result.datasets) {
        _categoryCounts[d.name] = d.points?.length || 0;
      }
    }

    if (_enabled) {
      renderPoints();
      flyToLayerExtent();
    }

    notifyChange();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gev:multi-dataset-loaded', {
        detail: {
          datasets: result.datasets,
          summary: result.summary,
        },
      }));
    }

    return result;
  } catch (err) {
    _error = err.message || 'Failed to ingest multiple files';
    console.error('[urlIntelligence] ingestFilesSimultaneously error:', err);
    throw err;
  } finally {
    _loading = false;
    governorRequestRender('url-intelligence-multi-file-loaded');
  }
}

export function getActiveDatasets() {
  return Array.from(_activeDatasets.values());
}

export function isMultiDatasetMode() {
  return _isMultiDatasetMode;
}

export function removeDataset(datasetId) {
  if (!_activeDatasets.has(datasetId)) return;
  _activeDatasets.delete(datasetId);

  const remaining = Array.from(_activeDatasets.values());
  _points = remaining.flatMap((d) => d.points || []);
  _trajectoryList = remaining.flatMap((d) => d.trajectories || []);
  _trajectories = new Map();
  for (const tr of _trajectoryList) {
    _trajectories.set(tr.vehicleId, tr);
  }
  _isTrajectory = _trajectoryList.length > 0;

  if (remaining.length === 0) {
    _isMultiDatasetMode = false;
  }

  if (_enabled) {
    renderPoints();
  }
  notifyChange();
}

export function clearAllDatasets() {
  _activeDatasets.clear();
  _isMultiDatasetMode = false;
  _points = [];
  _trajectories.clear();
  _trajectoryList = [];
  _isTrajectory = false;
  if (_enabled) {
    renderPoints();
  }
  notifyChange();
}

export function renderSelectedDatasets(datasetIds) {
  const allowed = new Set(datasetIds);
  const selected = Array.from(_activeDatasets.values()).filter((d) => allowed.has(d.datasetId));
  _points = selected.flatMap((d) => d.points || []);
  _trajectoryList = selected.flatMap((d) => d.trajectories || []);
  _trajectories = new Map();
  for (const tr of _trajectoryList) {
    _trajectories.set(tr.vehicleId, tr);
  }
  _isTrajectory = _trajectoryList.length > 0;
  _isMultiDatasetMode = selected.length > 1;
  if (_enabled) {
    renderPoints();
  }
  notifyChange();
  return selected;
}

/**
 * The URL Intelligence Data Layer definition adhering to DataLayerManager specs.
 */
const urlIntelligenceLayer = {
  id: URL_INTELLIGENCE_LAYER_ID,
  name: 'URL Intelligence',
  icon: '🌐',
  source: 'Web / Gemini AI',
  updateInterval: 3_600_000,
  statsRefreshInterval: 5_000,

  init(viewer) {
    _viewer = viewer;
    if (viewer?.scene?.primitives) {
      if (!_billboardCollection) {
        _billboardCollection = new Cesium.BillboardCollection();
        viewer.scene.primitives.add(_billboardCollection);
      }
      if (!_labelCollection) {
        _labelCollection = new Cesium.LabelCollection();
        viewer.scene.primitives.add(_labelCollection);
      }
      if (!_polylineCollection) {
        _polylineCollection = new Cesium.PolylineCollection();
        viewer.scene.primitives.add(_polylineCollection);
      }
    }
  },

  enable(viewer) {
    _enabled = true;
    this.init(viewer);
    _overlayHost.setVisible(URL_INTELLIGENCE_OVERLAY_SOURCE_ID, true);

    if (_billboardCollection) _billboardCollection.show = true;
    if (_labelCollection) _labelCollection.show = true;
    if (_polylineCollection) _polylineCollection.show = true;

    registerPickOwner(URL_INTELLIGENCE_LAYER_ID, (pickedId) => {
      const idStr = String(pickedId || '');
      if (idStr.startsWith('url-intelligence:vehicle:')) {
        const vId = idStr.replace('url-intelligence:vehicle:', '');
        return _trajectories.has(vId) || _vehicleRenderMap.has(vId);
      }
      const clean = idStr.replace(/^url-intelligence:/, '');
      return _pointRenderMap.has(clean);
    });

    _installClickHandler(viewer);

    // If we have points or trajectories in memory or cache, render them immediately
    if (_points.length > 0 || (_isTrajectory && _trajectoryList.length > 0)) {
      renderPoints();
    } else if (loadCachedData()) {
      renderPoints();
    } else {
      // First boot: auto-ingest default Philippine Immigration contacts
      void ingestUrl(_activeUrl);
    }
  },

  disable(viewer) {
    _enabled = false;
    pauseTrajectory();
    if (_selectedVehicleId) selectVehicle(null);
    if (_selectedPointId) selectUrlPoint(null);
    _overlayHost.clearSource(URL_INTELLIGENCE_OVERLAY_SOURCE_ID);
    _overlayHost.setVisible(URL_INTELLIGENCE_OVERLAY_SOURCE_ID, false);

    if (_billboardCollection) _billboardCollection.show = false;
    if (_labelCollection) _labelCollection.show = false;
    if (_polylineCollection) _polylineCollection.show = false;

    unregisterPickOwner(URL_INTELLIGENCE_LAYER_ID);

    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', _onKeyDown);
    }
    governorRequestRender('url-intelligence-disable');
  },

  async update(viewer) {
    if (!_enabled) return;
    if (_points.length === 0 && !_isTrajectory) {
      await ingestUrl(_activeUrl);
    }
  },

  getStats() {
    return {
      count: _count,
      totalDiscovered: _points.length,
      category: _selectedCategory,
      title: _pageTitle,
      url: _activeUrl,
      lastUpdate: _lastUpdate,
      loading: _loading,
      error: _error,
      isTrajectory: _isTrajectory,
      fleetVehicles: _trajectoryList.length,
      fleetMetrics: _fleetMetrics,
      isPlaying: _isPlaying,
      playbackSpeed: _playbackSpeed,
      pinnedCount: _pinnedPointIds.size,
      dimensionProfile: _activeDimensionProfile,
      leaderType: _activeLeaderType,
      arrowType: _activeArrowType,
      multiPinMode: _multiPinMode,
    };
  },

  getParams() {
    return {
      category: _selectedCategory,
      url: _activeUrl,
      dimensionProfile: _activeDimensionProfile,
      leaderType: _activeLeaderType,
      arrowType: _activeArrowType,
      multiPinMode: _multiPinMode,
      pinnedCount: _pinnedPointIds.size,
    };
  },

  setParams(params) {
    if (!params || typeof params !== 'object') return false;
    let changed = false;

    if (params.action === 'fly-extent') {
      flyToLayerExtent();
      return true;
    }
    if (params.action === 'start-tour') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gev:start-url-tour', {
          detail: {
            mode: _selectedCategory && _selectedCategory !== 'All' ? 'category' : 'all',
            category: _selectedCategory !== 'All' ? _selectedCategory : null,
          },
        }));
      }
      return true;
    }
    if (params.action === 'open-url-modal') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gev:open-url-intelligence-modal'));
      }
      return true;
    }
    if (params.action === 'toggle-trajectory-playback') {
      toggleTrajectoryPlayback();
      return true;
    }
    if (params.action === 'cycle-trajectory-speed') {
      const speeds = [1, 5, 10, 20, 60];
      const idx = speeds.indexOf(_playbackSpeed);
      const nextSpeed = speeds[(idx + 1) % speeds.length];
      playTrajectory(nextSpeed);
      return true;
    }
    if (params.action === 'unfollow-vehicle') {
      unfollowVehicle();
      return true;
    }
    if (params.action === 'clear-pinned') {
      clearPinnedUrlPoints();
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }
    if (params.action === 'pin-top-entities') {
      pinTopEntities(5, _selectedCategory);
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }
    if (params.action === 'cycle-dimension-profile') {
      const profiles = ['compact', 'standard', 'expanded', 'wide'];
      const curIdx = profiles.indexOf(_activeDimensionProfile);
      const nextProfile = profiles[(curIdx + 1) % profiles.length];
      setUrlDetailsBoxProfile(nextProfile);
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }
    if (params.action === 'cycle-leader-style') {
      const styles = ['straight', 'l_shape', 'diagonal_45'];
      const curIdx = styles.indexOf(_activeLeaderType);
      const nextStyle = styles[(curIdx + 1) % styles.length];
      setUrlLeaderStyle(nextStyle, _activeArrowType);
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }
    if (params.action === 'cycle-arrow-type') {
      const arrows = ['single_point', 'stealth', 'bead', 'none'];
      const curIdx = arrows.indexOf(_activeArrowType);
      const nextArrow = arrows[(curIdx + 1) % arrows.length];
      setUrlLeaderStyle(_activeLeaderType, nextArrow);
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }
    if (params.action === 'toggle-multi-pin') {
      setMultiPinMode(!_multiPinMode);
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
      return true;
    }

    if (typeof params.category === 'string') {
      if (params.category !== _selectedCategory) {
        _selectedCategory = params.category;
        changed = true;
      }
    }

    if (typeof params.islandGroup === 'string') {
      if (params.islandGroup !== _selectedIslandGroup) {
        _selectedIslandGroup = params.islandGroup;
        changed = true;
      }
    }

    if (typeof params.region === 'string') {
      if (params.region !== _selectedRegion) {
        _selectedRegion = params.region;
        changed = true;
      }
    }

    if (typeof params.showTerritorialBounds === 'boolean') {
      if (params.showTerritorialBounds !== _showTerritorialBounds) {
        _showTerritorialBounds = params.showTerritorialBounds;
        changed = true;
      }
    }

    if (params.action === 'apply-semantic-classification') {
      for (const pt of _points) {
        applySemanticClassification(pt);
      }
      changed = true;
    }

    if (params.action === 'inject-hierarchy') {
      for (const pt of _points) {
        enrichEntityWithPhilippineHierarchy(pt);
      }
      _hierarchySummary = computePhilippineHierarchySummary(_points);
      changed = true;
    }

    if (params.action === 'reset-hierarchy-filters') {
      _selectedIslandGroup = 'All';
      _selectedRegion = 'All';
      changed = true;
    }

    if (params.action === 'fly-island-group' && params.target) {
      flyToIslandGroup(params.target);
      return true;
    }

    if (params.action === 'fly-region' && params.target) {
      flyToRegion(params.target);
      return true;
    }

    if (typeof params.dimensionProfile === 'string') {
      setUrlDetailsBoxProfile(params.dimensionProfile);
    }
    if (typeof params.leaderType === 'string' || typeof params.arrowType === 'string') {
      setUrlLeaderStyle(params.leaderType || _activeLeaderType, params.arrowType || _activeArrowType);
    }

    if (typeof params.url === 'string' && params.url.trim() && params.url !== _activeUrl) {
      void ingestUrl(params.url);
      return true;
    }

    if (changed && _enabled) {
      renderPoints();
      if (typeof _rowControlsListener === 'function') {
        _rowControlsListener();
      }
    }
    return true;
  },

  getRowControls() {
    const chips = [];

    if (_isTrajectory) {
      chips.push(
        {
          id: 'action-trajectory-play-toggle',
          label: _isPlaying ? '⏸ PAUSE' : '▶ PLAY REPLAY',
          active: _isPlaying,
          params: { action: 'toggle-trajectory-playback' },
        },
        {
          id: 'action-trajectory-speed',
          label: `⚡ ${_playbackSpeed}x SPEED`,
          active: false,
          params: { action: 'cycle-trajectory-speed' },
        }
      );
      if (_followingVehicleId) {
        chips.push({
          id: 'action-trajectory-unfollow',
          label: `🎯 UNFOLLOW (${_followingVehicleId})`,
          active: true,
          params: { action: 'unfollow-vehicle' },
        });
      }
    }

    chips.push({
      id: 'category-all',
      label: _isTrajectory ? `🚙 ALL UNITS (${_trajectoryList.length})` : `🌐 ALL (${_points.length})`,
      active: _selectedCategory === 'All' && _selectedIslandGroup === 'All' && _selectedRegion === 'All',
      params: { category: 'All', islandGroup: 'All', region: 'All' },
    });

    for (const cat of _categories) {
      if (cat === 'All') continue;
      const count = _categoryCounts[cat] || 0;
      const emoji = getCategoryEmoji(cat);
      chips.push({
        id: `category-${cat.toLowerCase().replace(/\s+/g, '-')}`,
        label: `${emoji} ${cat.toUpperCase()} (${count})`,
        active: _selectedCategory === cat,
        params: { category: cat },
      });
    }

    // Island group quick filter chips if Philippine points exist
    if (_hierarchySummary && _hierarchySummary.philippinesCount > 0) {
      for (const ig of ['Luzon', 'Visayas', 'Mindanao']) {
        const count = _hierarchySummary.islandGroups[ig] || 0;
        if (count > 0) {
          chips.push({
            id: `hierarchy-island-${ig.toLowerCase()}`,
            label: `🏝️ ${ig.toUpperCase()} (${count})`,
            active: _selectedIslandGroup === ig,
            title: `Filter map to ${ig} Island Group`,
            params: {
              islandGroup: _selectedIslandGroup === ig ? 'All' : ig,
            },
          });
        }
      }
    }

    // Pinning controls
    if (_pinnedPointIds.size > 0) {
      chips.push({
        id: 'action-clear-pinned',
        label: `📌 PINNED (${_pinnedPointIds.size}) · CLEAR`,
        active: true,
        title: 'Clear all pinned HUD overlay cards',
        params: { action: 'clear-pinned' },
      });
    } else if (_points.length > 0) {
      chips.push({
        id: 'action-pin-top-5',
        label: '📌 PIN TOP 5',
        active: false,
        title: 'Pin top 5 entities simultaneously on the globe',
        params: { action: 'pin-top-entities' },
      });
    }

    chips.push({
      id: 'action-dimension-profile',
      label: `📐 ${_activeDimensionProfile.toUpperCase()}`,
      active: false,
      title: `Cycle card dimension profile (Current: ${_activeDimensionProfile})`,
      params: { action: 'cycle-dimension-profile' },
    });

    chips.push({
      id: 'action-leader-style',
      label: `⚡ ${_activeLeaderType.toUpperCase()}`,
      active: false,
      title: `Cycle leader line geometry (Current: ${_activeLeaderType})`,
      params: { action: 'cycle-leader-style' },
    });

    chips.push({
      id: 'action-fly-extent',
      label: '🎯 FLY TO EXTENT',
      active: false,
      title: 'Fly globe camera to encompass all points',
      params: { action: 'fly-extent' },
    });

    chips.push({
      id: 'action-tour-data',
      label: '🧭 MAP TOUR',
      active: false,
      title: 'Start automated tour of all loaded data points & boundaries',
      params: { action: 'start-tour' },
    });

    chips.push({
      id: 'action-analyze-url',
      label: '⚡ ANALYZE NEW URL',
      active: false,
      title: 'Analyze and extract points from another URL',
      params: { action: 'open-url-modal' },
    });

    const legend = _isTrajectory
      ? [
          {
            label: '🚙 ACTIVE UNITS',
            count: _trajectoryList.filter((v) => (v.avgSpeedKmh || 0) >= 3).length,
            color: '#00e5ff',
          },
          {
            label: '🛑 IDLE / DWELL',
            count: _trajectoryList.filter((v) => (v.avgSpeedKmh || 0) < 3).length,
            color: '#fbbf24',
          },
        ]
      : Object.entries(_categoryCounts).map(([cat, count]) => ({
          label: `${getCategoryEmoji(cat)} ${cat}`,
          count,
          color: getCategoryColor(cat),
        }));

    return { chips, legend };
  },

  onRowControlsChange(listener) {
    _rowControlsListener = listener;
  },

  getHudData() {
    return {
      title: 'URL INTELLIGENCE LAYER',
      url: _activeUrl,
      pageTitle: _pageTitle,
      activeCategory: _selectedCategory,
      plottedCount: _count,
      totalDiscovered: _points.length,
      categories: _categories,
      selectedPoint: _selectedPointId ? _pointRenderMap.get(_selectedPointId)?.point : null,
      selectedVehicle: _selectedVehicleId ? _trajectories.get(_selectedVehicleId) : null,
      pinnedPoints: Array.from(_pinnedPointIds).map((id) => _pointRenderMap.get(id)?.point).filter(Boolean),
      pinnedCount: _pinnedPointIds.size,
      dimensionProfile: _activeDimensionProfile,
      leaderType: _activeLeaderType,
      arrowType: _activeArrowType,
      multiPinMode: _multiPinMode,
      isTrajectory: _isTrajectory,
      fleetMetrics: _fleetMetrics,
      detectedHeaders: _detectedHeaders,
      sampleRows: _sampleRows,
      schemaAnalysis: _schemaAnalysis,
      mappingOverrides: _activeMappingOverrides,
      recommendations: _recommendations,
      domainIdentification: _domainIdentification,
      categoryIconMappings: _categoryIconMappings,
      distributionAnalysis: _distributionAnalysis,
    };
  },

  getSchemaInfo() {
    return {
      url: _activeUrl,
      pageTitle: _pageTitle,
      headers: _detectedHeaders,
      sampleRows: _sampleRows,
      schemaAnalysis: _schemaAnalysis,
      mappingOverrides: _activeMappingOverrides,
      pointsCount: _points.length,
      categories: _categories,
      recommendations: _recommendations,
      domainIdentification: _domainIdentification,
      categoryIconMappings: _categoryIconMappings,
      distributionAnalysis: _distributionAnalysis,
      workbookTabs: _workbookTabs,
      ruleChecks: _ruleChecks,
      analystComment: _analystComment,
      isTrajectory: _isTrajectory,
      fleetMetrics: _fleetMetrics,
      trajectoryList: _trajectoryList,
    };
  },

  /**
   * Directly programmatic API for external controllers.
   */
  ingest: ingestUrl,
  flyToExtent: flyToLayerExtent,
  selectPoint: selectUrlPoint,
  selectVehicle,
  followVehicle,
  unfollowVehicle,
  pinPoint: pinUrlPoint,
  unpinPoint: unpinUrlPoint,
  togglePinPoint: togglePinUrlPoint,
  clearPinnedPoints: clearPinnedUrlPoints,
  getPinnedPoints: getPinnedUrlPoints,
  isPointPinned: isUrlPointPinned,
  setMultiPinMode,
  isMultiPinMode,
  pinTopEntities,
  setUrlDetailsBoxProfile,
  getUrlDetailsBoxProfile,
  setUrlLeaderStyle,
  getUrlLeaderStyle,
  setTrajectoryScrubberTime,
  playTrajectory,
  pauseTrajectory,
  toggleTrajectoryPlayback,
  onTrajectoryUpdate,
  getTrajectoryState,
  isTrajectory: () => _isTrajectory,
  getTrajectories: () => _trajectories,
  getTrajectoryList: () => _trajectoryList,
  getFleetMetrics: () => _fleetMetrics,
  getActiveUrl: () => _activeUrl,
  getPageTitle: () => _pageTitle,
  getPoints: () => _points,
  getDetectedHeaders: () => _detectedHeaders,
  getSampleRows: () => _sampleRows,
  getSchemaAnalysis: () => _schemaAnalysis,
  getMappingOverrides: () => _activeMappingOverrides,
  getRecommendations: () => _recommendations,
  getDomainIdentification: () => _domainIdentification,
  getCategoryIconMappings: () => _categoryIconMappings,
  getDistributionAnalysis: () => _distributionAnalysis,
  getWorkbookTabs: () => _workbookTabs,
  getRuleChecks: () => _ruleChecks,
  getAnalystComment: () => _analystComment,
  getSelectedPoint: () => _selectedPointId ? _pointRenderMap.get(_selectedPointId)?.point : null,
  getCurrentDataset: () => ({
    points: _points,
    trajectories: _trajectories,
    trajectoryList: _trajectoryList,
    categories: _categories,
    categoryCounts: _categoryCounts,
    bounds: _bounds,
    center: _center,
    activeUrl: _activeUrl,
    pageTitle: _pageTitle,
    isTrajectory: _isTrajectory,
    activeCategory: _selectedCategory,
    pinnedPoints: Array.from(_pinnedPointIds),
    dimensionProfile: _activeDimensionProfile,
    leaderType: _activeLeaderType,
    arrowType: _activeArrowType,
  }),
  getHierarchySummary: () => _hierarchySummary || computePhilippineHierarchySummary(_points),
  getSelectedIslandGroup: () => _selectedIslandGroup,
  getSelectedRegion: () => _selectedRegion,
  getTerritorialBoundsVisible: () => _showTerritorialBounds,
  setTerritorialBoundsVisible: (visible) => {
    urlIntelligenceLayer.setParams({ showTerritorialBounds: Boolean(visible) });
  },
  getGeospatialAnalytics: () => computeGeospatialAnalytics(_points),
  getFilteredPoints: () => {
    return _points.filter((p) => {
      if (_selectedCategory !== 'All') {
        const matchCat = p.category && p.category.toLowerCase() === _selectedCategory.toLowerCase();
        const matchDataset = p.datasetName && p.datasetName.toLowerCase() === _selectedCategory.toLowerCase();
        if (!matchCat && !matchDataset) return false;
      }
      if (_selectedIslandGroup !== 'All') {
        if (!p.islandGroup || p.islandGroup.toLowerCase() !== _selectedIslandGroup.toLowerCase()) {
          return false;
        }
      }
      if (_selectedRegion !== 'All') {
        if (!p.region || p.region.toLowerCase() !== _selectedRegion.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  },
  applySemanticClassificationToActivePoints: () => {
    let count = 0;
    for (const pt of _points) {
      applySemanticClassification(pt);
      count++;
    }
    renderPoints();
    notifyChange();
    return count;
  },
  exportActiveEntities: (format = 'geojson', options = {}) => {
    const targets = options.filteredOnly ? urlIntelligenceLayer.getFilteredPoints() : _points;
    if (format === 'csv') {
      return exportEntitiesToCSV(targets);
    }
    if (format === 'json') {
      return JSON.stringify(targets, null, 2);
    }
    return exportEntitiesToGeoJSON(targets, options);
  },
  flyToIslandGroup,
  flyToRegion,
  setIslandGroupFilter: (group) => {
    urlIntelligenceLayer.setParams({ islandGroup: group });
  },
  setRegionFilter: (reg) => {
    urlIntelligenceLayer.setParams({ region: reg });
  },
  injectHierarchyToActivePoints: () => {
    urlIntelligenceLayer.setParams({ action: 'inject-hierarchy' });
  },
  resetHierarchyFilters: () => {
    urlIntelligenceLayer.setParams({ action: 'reset-hierarchy-filters' });
  },
  updateCategoryIcon(category, iconData) {
    registerCategoryIcon(category, iconData);
    if (!_categoryIconMappings) {
      _categoryIconMappings = {};
    }
    _categoryIconMappings[category] = {
      ...(_categoryIconMappings[category] || {}),
      ...iconData,
    };
    renderPoints();
    notifyChange();
    if (typeof saveToCache === 'function') {
      try { saveToCache(); } catch {}
    }
  },
  async generateAiIcon(category, options = {}) {
    const iconData = await generateAiCategoryIcon(category, options);
    this.updateCategoryIcon(category, iconData);
    return iconData;
  },
  remapWithOverrides: async (overrides) => {
    return ingestUrl(_activeUrl, true, { mappingOverrides: overrides });
  },
  ingestFilesSimultaneously,
  getActiveDatasets,
  renderSelectedDatasets,
  removeDataset,
  clearAllDatasets,
  isMultiDatasetMode,
  // Phase 4: Operational Simulation & Proximity Engine
  getSimulationEngine: () => {
    if (!_simulationEngine) {
      _simulationEngine = new PhilippineOperationalSimulationEngine();
      _simulationEngine.initialize(_points);
    }
    return _simulationEngine;
  },
  startOperationalSimulation: (options = {}) => {
    const eng = urlIntelligenceLayer.getSimulationEngine();
    eng.start();
    notifyChange();
    return eng.getTelemetry();
  },
  pauseOperationalSimulation: () => {
    if (_simulationEngine) {
      _simulationEngine.pause();
      notifyChange();
    }
  },
  stepOperationalSimulation: (dt = 1.0) => {
    const eng = urlIntelligenceLayer.getSimulationEngine();
    const result = eng.step(dt);
    notifyChange();
    return result;
  },
  resetOperationalSimulation: () => {
    if (_simulationEngine) {
      _simulationEngine.reset();
      notifyChange();
    }
  },
  getSimulationTelemetry: () => {
    const eng = urlIntelligenceLayer.getSimulationEngine();
    return eng.getTelemetry();
  },
  getProximityMatrix: () => {
    return computeProximityMatrix(_points);
  },
  runBackendSimulationBenchmark: (iterations = 100) => {
    return runBackendSimulationBenchmark(_points, iterations);
  },
  injectSimulationIncident: (incident) => {
    const eng = urlIntelligenceLayer.getSimulationEngine();
    eng.injectIncident(incident);
    notifyChange();
    return eng.getTelemetry();
  },
};

export { urlIntelligenceLayer };
export default urlIntelligenceLayer;
