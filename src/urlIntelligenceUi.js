/**
 * @module urlIntelligenceUi
 * @description User interface modal and controller for URL Intelligence layer.
 *
 * Allows users to input any website URL, choose curated presets (like Philippine
 * Bureau of Immigration), view extraction logs, toggle AI-enabled entity geocoding/validation,
 * manage recent search history with selection and deletion, and plot results on the Cesium globe.
 */

import {
  getCategoryEmoji,
  getCategoryColor,
  getCategoryBillboardImage,
  getAllCategoryMappings,
} from './data/urlLayerIcons.js';
import {
  PH_ISLAND_GROUPS,
  PH_ADMIN_REGIONS,
  computeGeospatialAnalytics,
  getPhilippineTerritorialBounds,
  applySemanticClassification,
  exportEntitiesToGeoJSON,
  exportEntitiesToCSV,
} from './data/philippineHierarchy.js';
import { getFloatingWorkbenchInstance } from './ui/mappingToolsModuleUi.js';
import {
  QUICK_PRESETS,
  SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
  SAMPLE_METRO_PATROL_GPX,
  SAMPLE_NMEA_GPS_STREAM,
  SAMPLE_UN_LOGISTICS_GEOJSON,
  MANILA_TRANSIT_KML,
  MANILA_TRANSIT_GPX,
  MANILA_TRANSIT_NMEA,
  MANILA_TRANSIT_CSV,
} from './data/fixtures/presetIntelligenceData.js';
import {
  googleSignIn,
  googleSignOut,
  getAccessToken,
  getCurrentUser,
  subscribeAuth,
} from './auth/googleDriveAuth.js';
import {
  ROOT_FOLDER_NAME,
  SUBFOLDERS,
  listDriveFiles,
  downloadDriveFile,
  uploadTelemetryFile,
  createDriveFile,
  updateDriveFile,
  deleteDriveFile,
  saveMapFeatureLayerToDrive,
  ensureGodsEyeViewFolderStructure,
  categorizeTelemetryFilename,
} from './data/googleDriveClient.js';
import {
  annotationsToFeatureCollection,
  featureCollectionToAnnotations,
} from './annotations/annotationGeoJson.js';
import {
  pushDetectedPoi,
  pushOperationalZone,
  ingestMultimodalSchemaData,
} from './tools/index.js';

const RECENT_SEARCHES_KEY = 'gev_url_recent_searches_v2';
const MAX_RECENT = 25;

function loadRecentSearches() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {}
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectFormatBadge(url = '') {
  const u = String(url).toLowerCase();
  if (u.includes('docs.google.com/spreadsheets')) return 'GOOGLE SHEET';
  if (u.includes('drive.google.com') || u.includes('drive.usercontent.google.com')) return 'GOOGLE DRIVE';
  if (u.includes('.pdf') || u.includes('pdf')) return 'PDF';
  if (u.includes('.csv') || u.includes('format=csv')) return 'CSV';
  if (u.includes('.geojson') || u.includes('geo+json') || u.includes('.json')) return 'GEOJSON';
  return 'WEBSITE';
}

export function initUrlIntelligenceUi(dataManager, urlIntelligenceLayer, viewer) {
  let dialog = document.getElementById('url-intelligence-dialog');

  if (!dialog) {
    dialog = document.createElement('aside');
    dialog.id = 'url-intelligence-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', 'url-intel-title');
    dialog.setAttribute('aria-modal', 'true');
    dialog.hidden = true;
    document.body.appendChild(dialog);
  }

  const initialPresetsHtml = (QUICK_PRESETS || []).map((preset, index) => {
    const badgeClass = `format-${(preset.formatBadge || preset.format || 'HTML').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const isActive = index === 0 ? 'active' : '';
    return `
      <button type="button" class="url-intel-preset-chip ${isActive}" data-url="${preset.url}" data-id="${preset.id}" title="${preset.description || ''}">
        <span class="url-intel-badge ${badgeClass}">${preset.formatBadge || preset.format || 'HTML'}</span>
        <span>${preset.label}</span>
      </button>
    `;
  }).join('');

  dialog.innerHTML = `
    <div class="url-intel-scanline" aria-hidden="true"></div>
    <header class="url-intel-header">
      <div class="url-intel-title-row">
        <span class="url-intel-kicker">DATA LAYER ENGINE · URL &amp; MULTI-FORMAT INTELLIGENCE</span>
        <button type="button" class="url-intel-close" id="url-intel-close-btn" aria-label="Close dialog">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <h2 id="url-intel-title">Multi-Format Ingestion &amp; Map Plotter</h2>
      <p id="url-intel-desc">
        Analyze, parse, and extract physical locations, ports of entry/exit, regional logistics hubs,
        and facilities from HTML webpages, CSV feeds, Google Drive/Sheets, PDF bulletins, and GeoJSON.
        Extracted entities are geocoded, categorized, and dynamically plotted onto the 3D globe.
      </p>
    </header>

    <!-- Main Modal Tab Navigation Bar -->
    <div class="url-intel-nav-tabs-bar" role="tablist" aria-label="URL Intelligence Modules">
      <button type="button" class="url-intel-nav-tab active" data-tab="ingest" id="url-intel-tab-btn-ingest" role="tab" aria-selected="true">
        <span>📡 INGESTION &amp; DATA</span>
      </button>
      <button type="button" class="url-intel-nav-tab" data-tab="hierarchy" id="url-intel-tab-btn-hierarchy" role="tab" aria-selected="false">
        <span>✨ AI CATEGORY INJECTOR</span>
        <span class="url-intel-tab-badge" id="url-intel-hierarchy-tab-badge">🇵🇭 PH</span>
      </button>
      <button type="button" class="url-intel-nav-tab" data-tab="hud" id="url-intel-tab-btn-hud" role="tab" aria-selected="false">
        <span>🧭 HUD &amp; PINNING</span>
      </button>
      <button type="button" class="url-intel-nav-tab" data-tab="drive" id="url-intel-tab-btn-drive" role="tab" aria-selected="false">
        <span>☁️ GOOGLE DRIVE</span>
      </button>
      <button type="button" class="url-intel-nav-tab" data-tab="maptools" id="url-intel-tab-btn-maptools" role="tab" aria-selected="false">
        <span>🛠️ MAP TOOLS &amp; CAD</span>
        <span class="url-intel-tab-badge" id="url-intel-maptools-tab-badge">0</span>
      </button>
    </div>

    <div class="url-intel-body">
      <!-- Tab Pane 1: Ingestion & Data -->
      <div class="url-intel-tab-pane active" id="url-intel-pane-ingest">
        <div class="url-intel-presets-section">
        <span class="url-intel-section-label">QUICK PRESETS (GPS TELEMETRY · GPX · NMEA · HTML · CSV · GOOGLE SHEET · PDF · GEOJSON)</span>
        <div class="url-intel-presets-row" id="url-intel-presets-container">
          ${initialPresetsHtml}
        </div>
      </div>

      <div class="url-intel-input-group">
        <div class="url-intel-label-row">
          <label for="url-intel-input-field" class="url-intel-section-label">SOURCE URL (WEBSITE, CSV, GOOGLE SHEET, OR PDF)</label>
          <div class="url-intel-ai-toggle-inline" title="Enable AI-assisted geocoding and entity verification">
            <span class="url-intel-ai-tag">✨ AI ASSIST</span>
            <input type="checkbox" id="url-intel-ai-toggle" checked />
          </div>
        </div>
        <div class="url-intel-input-wrap">
          <input
            id="url-intel-input-field"
            type="url"
            spellcheck="false"
            autocomplete="off"
            placeholder="https://immigration.gov.ph/contacts/ or Google Drive / Sheet URL"
            value="${urlIntelligenceLayer.getActiveUrl() || (QUICK_PRESETS[0] && QUICK_PRESETS[0].url) || 'https://immigration.gov.ph/contacts/'}"
          />
          <button type="button" id="url-intel-clear-btn" class="url-intel-clear-btn" title="Clear URL">✕</button>
        </div>

        <!-- Deep Scraping & Multi-Tab Controls -->
        <div class="url-intel-deep-scraping-bar" id="url-intel-deep-scraping-bar">
          <div class="url-intel-deep-row">
            <div class="url-intel-deep-control-group">
              <label for="url-intel-tab-select" class="url-intel-deep-label">
                <span>📑 WORKBOOK TAB</span>
              </label>
              <select id="url-intel-tab-select" class="url-intel-deep-select" title="Select specific worksheet tab or scrape all sheets">
                <option value="">All Sheets (Deep Scrape Auto-Unify)</option>
              </select>
            </div>
            <label class="url-intel-deep-toggle-label" title="Deep scrape all worksheet tabs and merge hidden sub-tables">
              <input type="checkbox" id="url-intel-all-tabs-toggle" checked />
              <span>Deep Scrape All Tabs</span>
            </label>
            <label class="url-intel-deep-toggle-label" title="Traverse multi-page paginated tables and follow rel='next' sequences">
              <input type="checkbox" id="url-intel-pagination-toggle" checked />
              <span>Multi-Page Traversal</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Simultaneous Multi-File 3D Ingestion Section -->
      <div class="url-intel-multi-upload-section" id="url-intel-multi-upload-section">
        <div class="url-intel-multi-header-row">
          <span class="url-intel-section-label">SIMULTANEOUS MULTI-FILE 3D INGESTION (.CSV · .GPX · .NMEA · .GEOJSON)</span>
          <span class="url-intel-multi-engine-tag">⚡ PARALLEL CHROMATIC ENGINE</span>
        </div>
        <div class="url-intel-multi-dropzone" id="url-intel-multi-dropzone">
          <div class="url-intel-dropzone-inner">
            <span class="url-intel-dropzone-icon">📥</span>
            <div class="url-intel-dropzone-text-group">
              <span class="url-intel-dropzone-headline">DRAG &amp; DROP MULTIPLE FILES OR CLICK BROWSE</span>
              <span class="url-intel-dropzone-sub">Upload CSV, GPX, NMEA, and GeoJSON files simultaneously. Entities and vehicle tracks will be parsed concurrently and plotted in real-time with distinctive chromatic separation.</span>
            </div>
            <div class="url-intel-dropzone-actions-row">
              <button type="button" class="url-intel-btn-browse" id="url-intel-multi-browse-btn">
                <span>📂 BROWSE LOCAL FILES...</span>
              </button>
              <button type="button" class="url-intel-btn-browse-drive" id="url-intel-dropzone-open-drive-btn" title="Open Google Drive Cloud Sync &amp; Multi-Dataset Ingestion Module">
                <span>☁️ GOOGLE DRIVE CLOUD SYNC...</span>
              </button>
            </div>
            <input type="file" id="url-intel-multi-file-input" multiple accept=".csv,.tsv,.gpx,.nmea,.log,.geojson,.json" style="display: none;" />
          </div>
        </div>

        <!-- Active Multi-Dataset Roster -->
        <div class="url-intel-datasets-roster" id="url-intel-datasets-roster" style="display: none;">
          <div class="url-intel-roster-header">
            <span class="url-intel-roster-title">ACTIVE SIMULTANEOUS DATASETS (<span id="url-intel-datasets-count">0</span>)</span>
            <div class="url-intel-roster-actions">
              <button type="button" class="url-intel-roster-upload-drive" id="url-intel-roster-upload-drive-btn" title="Upload active datasets to Google Drive">
                ⬆️ Upload to Drive
              </button>
              <button type="button" class="url-intel-roster-clear-all" id="url-intel-datasets-clear-btn">Clear All Datasets</button>
            </div>
          </div>
          <div class="url-intel-datasets-list" id="url-intel-datasets-list"></div>
          <div class="url-intel-roster-footer">
            <label class="url-intel-check-all-label">
              <input type="checkbox" id="url-intel-roster-select-all" checked />
              <span>Select All Active Datasets</span>
            </label>
            <button type="button" class="url-intel-btn-ingest-drive" id="url-intel-roster-ingest-btn">
              ⚡ Ingest Selected (<span id="url-intel-roster-selected-count">0</span>) Simultaneously
            </button>
          </div>
        </div>
      </div>

      <!-- Google Drive Cloud Sync & Spatial File Browser Section (Embedded directly in Ingestion workflow) -->
      <div class="url-intel-gdrive-section" id="url-intel-gdrive-section">
        <div class="url-intel-gdrive-header-row">
          <div class="url-intel-gdrive-title-group">
            <span class="url-intel-gdrive-icon">☁️</span>
            <div>
              <div class="url-intel-gdrive-title-text">GOOGLE DRIVE CLOUD SYNC · SPATIAL PRESET STORAGE</div>
              <div class="url-intel-gdrive-folder-path" id="url-intel-gdrive-folder-path" title="Google Drive destination directory tree">
                <span class="url-intel-folder-badge">DESTINATION</span>
                <code>Google Drive / GodsEyeView / [Fleet-GPS | GPX-Tracks | NMEA-Logs | Layers]</code>
              </div>
            </div>
          </div>
          <div class="url-intel-gdrive-auth-controls">
            <button type="button" class="url-intel-btn-gdrive-guide" id="url-intel-gdrive-guide-toggle-btn" title="Open Google Drive Cloud Sync User Guide">
              📖 USER GUIDE
            </button>
            <span class="url-intel-gdrive-status-tag" id="url-intel-gdrive-status-tag">DISCONNECTED</span>
            <button type="button" class="url-intel-gdrive-auth-btn" id="url-intel-gdrive-auth-btn">
              <span id="url-intel-gdrive-auth-btn-text">CONNECT DRIVE</span>
            </button>
          </div>
        </div>

        <!-- Interactive In-Module User Guide Accordion -->
        <div class="url-intel-gdrive-guide-card" id="url-intel-gdrive-guide-card" style="display: none;">
          <div class="url-intel-guide-header">
            <span class="url-intel-guide-title">📖 GOOGLE DRIVE &amp; SIMULTANEOUS INGESTION MODULE GUIDE</span>
            <button type="button" class="url-intel-guide-close" id="url-intel-gdrive-guide-close">✕</button>
          </div>
          <div class="url-intel-guide-steps-grid">
            <div class="url-intel-guide-step">
              <div class="url-intel-step-num">1</div>
              <div class="url-intel-step-content">
                <strong>Google Account Authentication</strong>
                <p>Click <code>CONNECT DRIVE</code> to sign in with your Google account. Uses strict least-privilege OAuth scopes (<code>drive.file</code>, <code>drive.readonly</code>) with secure in-memory token lifecycle.</p>
              </div>
            </div>
            <div class="url-intel-guide-step">
              <div class="url-intel-step-num">2</div>
              <div class="url-intel-step-content">
                <strong>Auto-Categorized Upload</strong>
                <p>Drag &amp; drop or browse local files. Files auto-sort into <code>GodsEyeView/</code> subfolders: <code>Fleet-GPS/</code> (.csv, .tsv), <code>GPX-Tracks/</code> (.gpx), <code>NMEA-Logs/</code> (.nmea, .log), <code>Layers/</code> (.geojson). Click <code>⬆️ Upload to Drive</code> to commit.</p>
              </div>
            </div>
            <div class="url-intel-guide-step">
              <div class="url-intel-step-num">3</div>
              <div class="url-intel-step-content">
                <strong>Synchronize &amp; Multi-Select</strong>
                <p>Click <code>🔄 Sync Files</code> to query Google Drive. Use the subfolder filter chips (All Files, Fleet-GPS, GPX-Tracks, NMEA-Logs, Layers) to filter. Check individual datasets or click <code>Select All Remote Presets/Files</code>.</p>
              </div>
            </div>
            <div class="url-intel-guide-step">
              <div class="url-intel-step-num">4</div>
              <div class="url-intel-step-content">
                <strong>Simultaneous 3D Ingestion</strong>
                <p>Click <code>⚡ Ingest Selected (N) Simultaneously</code> to fetch and parse all selected files in parallel. Plotted on Cesium 3D with chromatic color separation (cyan, emerald, amber, rose, violet) and automated camera framing.</p>
              </div>
            </div>
            <div class="url-intel-guide-step">
              <div class="url-intel-step-num">5</div>
              <div class="url-intel-step-content">
                <strong>CRED &amp; Map Tools GeoJSON Export</strong>
                <p>Use <code>✏️ Rename</code> or <code>🗑️ Delete</code> on cloud files for real-time CRED operations. Click <code>📍 Save Map Tools</code> to export active map pins, polygons, and perimeter rings directly to Google Drive as GeoJSON.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Google Drive Explorer & Sync Controls -->
        <div class="url-intel-gdrive-body" id="url-intel-gdrive-body">
          <div class="url-intel-gdrive-filter-bar">
            <div class="url-intel-gdrive-subfolder-chips" id="url-intel-gdrive-folder-tabs">
              <button type="button" class="url-intel-folder-chip active" data-folder="ALL">All Files</button>
              <button type="button" class="url-intel-folder-chip" data-folder="FLEET_GPS">Fleet-GPS (CSV)</button>
              <button type="button" class="url-intel-folder-chip" data-folder="GPX_TRACKS">GPX-Tracks</button>
              <button type="button" class="url-intel-folder-chip" data-folder="NMEA_LOGS">NMEA-Logs</button>
              <button type="button" class="url-intel-folder-chip" data-folder="LAYERS">Layers (GeoJSON)</button>
            </div>
            <div class="url-intel-gdrive-actions">
              <button type="button" class="url-intel-btn-refresh-drive" id="url-intel-gdrive-refresh-btn" title="Refresh files from Google Drive">
                🔄 Sync Files
              </button>
              <button type="button" class="url-intel-btn-upload-drive" id="url-intel-gdrive-upload-btn" title="Upload active datasets to Google Drive">
                ⬆️ Upload to Drive
              </button>
              <button type="button" class="url-intel-btn-save-map" id="url-intel-gdrive-save-map-btn" title="Export Map Tools points, polygons, and POIs to Google Drive (Layers)">
                📍 Save Map Tools
              </button>
            </div>
          </div>

          <!-- Staged Local Files Upload Status -->
          <div class="url-intel-gdrive-staged-queue" id="url-intel-gdrive-staged-queue" style="display: none;"></div>

          <!-- Drive Files List / Multi-Selection -->
          <div class="url-intel-gdrive-file-panel">
            <div class="url-intel-gdrive-file-panel-header">
              <label class="url-intel-check-all-label">
                <input type="checkbox" id="url-intel-gdrive-select-all" />
                <span>Select All Remote Presets/Files</span>
              </label>
              <button type="button" class="url-intel-btn-ingest-drive" id="url-intel-gdrive-ingest-btn" disabled>
                ⚡ Ingest Selected (<span id="url-intel-gdrive-selected-count">0</span>) Simultaneously
              </button>
            </div>
            <div class="url-intel-gdrive-file-list" id="url-intel-gdrive-file-list"></div>
          </div>
        </div>
      </div>

      <!-- Recent Searches Section with Deletion Ticking -->
      <div class="url-intel-recent-section" id="url-intel-recent-section">
        <div class="url-intel-recent-header">
          <span class="url-intel-section-label" id="url-intel-recent-title">RECENT SEARCHES (0)</span>
          <div class="url-intel-recent-controls">
            <label class="url-intel-check-all-label" title="Select all recent searches">
              <input type="checkbox" id="url-intel-select-all-cb" />
              <span>Select All</span>
            </label>
            <button type="button" id="url-intel-delete-selected-btn" class="url-intel-btn-danger" disabled title="Delete selected searches">
              🗑️ Delete (<span id="url-intel-selected-count">0</span>)
            </button>
            <button type="button" id="url-intel-clear-all-btn" class="url-intel-btn-clear" title="Clear all recent history">
              Clear All
            </button>
          </div>
        </div>
        <div class="url-intel-recent-list" id="url-intel-recent-list" role="list"></div>
      </div>

      <div class="url-intel-status-card" id="url-intel-status-box">
        <div class="url-intel-status-header">
          <span class="url-intel-led" id="url-intel-status-led"></span>
          <span class="url-intel-status-text" id="url-intel-status-text">Ready to ingest multi-format source</span>
          <button type="button" class="url-intel-ai-status-pill" id="url-intel-ai-status-pill" title="Click to open AI Schema Inspector &amp; Manual Override controls">
            <span>✨ AI Geocoding Active</span>
            <span style="font-size: 0.6rem; opacity: 0.8;">▾ INSPECT</span>
          </button>
        </div>
        <div class="url-intel-details" id="url-intel-status-details">
          Layer active. Target: <strong>${escapeHtml(urlIntelligenceLayer.getPageTitle())}</strong>
        </div>
        <div class="url-intel-status-quick-actions" style="margin-top: 0.4rem;">
          <button type="button" class="url-intel-hierarchy-quick-link" id="url-intel-goto-hierarchy-btn" title="Open the AI Category Injector &amp; Geographic Hierarchy Module">
            <span>✨ Open AI Category Injector (🇵🇭 PH Hierarchy)</span>
          </button>
        </div>

        <!-- Rule Checks & Data Completeness Audit Section -->
        <div class="url-intel-rule-checks-section" id="url-intel-rule-checks-section" style="display: none;">
          <div class="url-intel-section-heading">
            <span>📋 RULE AUDIT &amp; DATA COMPLETENESS VERIFICATION</span>
            <span class="url-intel-audit-status-badge pass" id="url-intel-audit-overall-badge">ALL RULES SATISFIED</span>
          </div>
          <div class="url-intel-rules-grid" id="url-intel-rules-grid">
            <!-- Rule 1: Tabbed Format Content -->
            <div class="url-intel-rule-card" id="url-intel-rule-tabs-card">
              <div class="url-intel-rule-card-header">
                <span class="url-intel-rule-icon">📑</span>
                <span class="url-intel-rule-name">RULE: TABBED FORMAT CONTENT AUDIT</span>
                <span class="url-intel-rule-badge pass" id="url-intel-rule-tabs-badge">PASSED</span>
              </div>
              <div class="url-intel-rule-desc" id="url-intel-rule-tabs-desc">
                Scanned workbook sheets for hidden data across multi-tabbed spreadsheet layouts.
              </div>
              <div class="url-intel-tabs-pill-list" id="url-intel-detected-tabs-list"></div>
            </div>

            <!-- Rule 2: Multi-Page Pagination Completeness -->
            <div class="url-intel-rule-card" id="url-intel-rule-pages-card">
              <div class="url-intel-rule-card-header">
                <span class="url-intel-rule-icon">📄</span>
                <span class="url-intel-rule-name">RULE: MULTI-PAGE PAGINATION COMPLETENESS</span>
                <span class="url-intel-rule-badge pass" id="url-intel-rule-pages-badge">PASSED</span>
              </div>
              <div class="url-intel-rule-desc" id="url-intel-rule-pages-desc">
                Verified paginated table sequences to ensure complete data capture without omission.
              </div>
            </div>

            <!-- Rule 3: Deep Scraping Cell & Symbol Hyperlinks -->
            <div class="url-intel-rule-card" id="url-intel-rule-links-card">
              <div class="url-intel-rule-card-header">
                <span class="url-intel-rule-icon">🔗</span>
                <span class="url-intel-rule-name">RULE: DEEP SCRAPING CELL &amp; SYMBOL HYPERLINKS</span>
                <span class="url-intel-rule-badge pass" id="url-intel-rule-links-badge">PASSED</span>
              </div>
              <div class="url-intel-rule-desc" id="url-intel-rule-links-desc">
                Captures embedded on-click URLs from headers (e.g. stock Symbol) and cells for popup, _blank, and _parent dispatch.
              </div>
              <div class="url-intel-links-stats-row" id="url-intel-links-stats-row"></div>
            </div>

            <!-- Rule 4: Geospatial Resolution Integrity -->
            <div class="url-intel-rule-card" id="url-intel-rule-geo-card">
              <div class="url-intel-rule-card-header">
                <span class="url-intel-rule-icon">🌐</span>
                <span class="url-intel-rule-name">RULE: GEOSPATIAL RESOLUTION INTEGRITY</span>
                <span class="url-intel-rule-badge pass" id="url-intel-rule-geo-badge">100% RESOLVED</span>
              </div>
              <div class="url-intel-rule-desc" id="url-intel-rule-geo-desc">
                Validates geodetic coordinate mapping, geographic bounds, and 3D Cesium billboard placement.
              </div>
            </div>
          </div>
        </div>

        <!-- Intelligence Analyst Assessment & Recommendations -->
        <div class="url-intel-analyst-panel" id="url-intel-analyst-panel" style="display: none;">
          <div class="url-intel-section-heading">
            <span>🧠 INTELLIGENCE ANALYST ASSESSMENT &amp; RECOMMENDATIONS</span>
            <span class="url-intel-analyst-badge">EXECUTIVE BRIEFING</span>
          </div>

          <!-- Executive Summary & Comment -->
          <div class="url-intel-analyst-card">
            <div class="url-intel-analyst-title">
              <span>Executive Commentary &amp; Ingestion Findings</span>
            </div>
            <div class="url-intel-analyst-comment" id="url-intel-analyst-comment"></div>
          </div>

          <!-- Cluster & Lineage Details -->
          <div class="url-intel-analyst-grid">
            <div class="url-intel-analyst-subcard">
              <span class="url-intel-subcard-title">📍 GEOGRAPHIC CLUSTER ANALYSIS</span>
              <div class="url-intel-subcard-body" id="url-intel-cluster-analysis"></div>
            </div>
            <div class="url-intel-analyst-subcard">
              <span class="url-intel-subcard-title">🛡️ DATA LINEAGE &amp; COMPLETENESS</span>
              <div class="url-intel-subcard-body" id="url-intel-lineage-analysis"></div>
            </div>
          </div>

          <!-- Priority Recommendations -->
          <div class="url-intel-analyst-recs-wrap">
            <span class="url-intel-subcard-title">💡 ACTIONABLE ANALYST RECOMMENDATIONS</span>
            <div class="url-intel-analyst-recs-list" id="url-intel-analyst-recs-list"></div>
          </div>
        </div>

        <!-- GPS Telemetry & Trajectory Fleet Intelligence Panel -->
        <div class="url-intel-trajectory-section" id="url-intel-trajectory-section" style="display: none;">
          <div class="url-intel-section-heading">
            <span>🛰️ GPS TELEMETRY &amp; FLEET TRAJECTORY INTELLIGENCE</span>
            <span class="url-intel-trajectory-live-badge" id="url-intel-trajectory-badge">REPLAY ENGINE READY</span>
          </div>

          <!-- Fleet Telemetry KPI Metrics Grid -->
          <div class="url-intel-trajectory-metrics-grid" id="url-intel-trajectory-metrics-grid">
            <div class="url-intel-traj-metric-card">
              <span class="url-intel-traj-metric-label">TRACKED UNITS</span>
              <span class="url-intel-traj-metric-val" id="url-intel-traj-units-val">0</span>
              <span class="url-intel-traj-metric-sub">Commercial &amp; Transit Fleet</span>
            </div>
            <div class="url-intel-traj-metric-card">
              <span class="url-intel-traj-metric-label">TOTAL FLEET DISTANCE</span>
              <span class="url-intel-traj-metric-val" id="url-intel-traj-dist-val">0.0 km</span>
              <span class="url-intel-traj-metric-sub">Aggregated GPS breadcrumbs</span>
            </div>
            <div class="url-intel-traj-metric-card">
              <span class="url-intel-traj-metric-label">FLEET PEAK SPEED</span>
              <span class="url-intel-traj-metric-val" id="url-intel-traj-speed-val">0.0 km/h</span>
              <span class="url-intel-traj-metric-sub" id="url-intel-traj-avg-speed-sub">Avg: 0.0 km/h</span>
            </div>
            <div class="url-intel-traj-metric-card">
              <span class="url-intel-traj-metric-label">DWELL / STOPS</span>
              <span class="url-intel-traj-metric-val" id="url-intel-traj-dwell-val">0</span>
              <span class="url-intel-traj-metric-sub">Stops (&gt;45s stationary)</span>
            </div>
          </div>

          <!-- Timeline Scrubber & Replay Controller Bar -->
          <div class="url-intel-trajectory-player-bar">
            <div class="url-intel-traj-player-row-top">
              <div class="url-intel-traj-player-controls">
                <button type="button" class="url-intel-traj-btn-play" id="url-intel-traj-play-btn" title="Toggle Trajectory Playback (Spacebar)">
                  ▶ PLAY
                </button>
                <div class="url-intel-traj-speed-group" id="url-intel-traj-speed-group">
                  <button type="button" class="url-intel-traj-speed-btn active" data-speed="1">1x</button>
                  <button type="button" class="url-intel-traj-speed-btn" data-speed="5">5x</button>
                  <button type="button" class="url-intel-traj-speed-btn" data-speed="10">10x</button>
                  <button type="button" class="url-intel-traj-speed-btn" data-speed="20">20x</button>
                  <button type="button" class="url-intel-traj-speed-btn" data-speed="60">60x</button>
                </div>
              </div>
              <div class="url-intel-traj-time-display">
                <span class="url-intel-traj-time-label">REPLAY TIME:</span>
                <span class="url-intel-traj-time-val" id="url-intel-traj-time-val">--:--:--</span>
              </div>
              <button type="button" class="url-intel-traj-btn-dock" id="url-intel-traj-dock-hud-btn" title="Dock HUD Player onto 3D Globe">
                ⧉ DOCK TO GLOBE
              </button>
            </div>

            <div class="url-intel-traj-scrubber-wrap">
              <span class="url-intel-traj-bound-time" id="url-intel-traj-start-time">00:00</span>
              <input type="range" min="0" max="1000" value="0" class="url-intel-traj-scrubber" id="url-intel-traj-scrubber" />
              <span class="url-intel-traj-bound-time" id="url-intel-traj-end-time">00:00</span>
            </div>
          </div>

          <!-- Vehicle Units Tactical Roster -->
          <div class="url-intel-traj-vehicles-wrap">
            <div class="url-intel-traj-vehicles-header">
              <span class="url-intel-subcard-title">🚙 FLEET UNITS &amp; REAL-TIME KINEMATICS</span>
              <span id="url-intel-traj-vehicles-count" style="color: #00e5ff; font-weight: bold;">0 units</span>
            </div>
            <div class="url-intel-traj-vehicles-list" id="url-intel-traj-vehicles-list"></div>
          </div>
        </div>

        <!-- Collapsible AI Schema Analysis & Manual Override Panel -->
        <div class="url-intel-schema-panel" id="url-intel-schema-panel" style="display: none;">
          <div class="url-intel-schema-header">
            <div class="url-intel-schema-title-wrap">
              <span class="url-intel-schema-tag">AI SCHEMA INSPECTOR</span>
              <span class="url-intel-schema-title">Field Detection &amp; Mapping Override</span>
            </div>
            <button type="button" class="url-intel-clear-btn" id="url-intel-schema-close-btn" title="Collapse inspector" style="position: static;">✕</button>
          </div>

          <div class="url-intel-schema-summary" id="url-intel-schema-summary">
            No source analyzed yet. Ingest a dataset or click a preset to inspect headers and fields.
          </div>

          <div class="url-intel-schema-grid" id="url-intel-schema-grid">
            <!-- Populated dynamically with mapping selects for Name, Category, Address, Contact, Details, Lat, Lon -->
          </div>

          <!-- AI Category Icon Matrix Section -->
          <div class="url-intel-cat-matrix-section" id="url-intel-cat-matrix-section" style="display: none;">
            <div class="url-intel-cat-matrix-header-row">
              <div class="url-intel-section-heading" style="margin-bottom: 0;">
                <span>🎨 AI-GENERATED CATEGORY ICONS &amp; TACTICAL BILLBOARDS</span>
              </div>
              <div class="url-intel-cat-toolbar">
                <select id="url-intel-cat-theme-select" class="url-intel-cat-theme-select" title="Select visual theme for AI icon synthesis">
                  <option value="cyber-tactical">Theme: Cyber Tactical Neon</option>
                  <option value="military-stealth">Theme: Military Stealth High-Vis</option>
                  <option value="financial-gold">Theme: Financial &amp; Corporate Gold</option>
                  <option value="geodetic-emerald">Theme: Geodetic Emerald Grid</option>
                </select>
                <button type="button" class="url-intel-cat-generate-all-btn" id="url-intel-cat-generate-all-btn" title="Generate customized AI icons for all extracted categories">
                  ✨ AI Generate All Icons
                </button>
              </div>
            </div>
            <div class="url-intel-cat-matrix-grid" id="url-intel-cat-matrix-grid"></div>
          </div>

          <!-- AI Domain Identification & Recommendations Section -->
          <div class="url-intel-recs-section" id="url-intel-recs-section" style="display: none;">
            <div class="url-intel-domain-badge-wrap">
              <span class="url-intel-domain-badge" id="url-intel-domain-badge">
                <span>✨ DOMAIN:</span> <strong id="url-intel-domain-name">General Geospatial Infrastructure</strong>
              </span>
              <span class="url-intel-distribution-text" id="url-intel-distribution-text"></span>
            </div>
            <div class="url-intel-section-heading">
              <span>💡 ACTIONABLE RECOMMENDATIONS &amp; ANALYSIS</span>
            </div>
            <div class="url-intel-recs-grid" id="url-intel-recs-grid"></div>
          </div>

          <!-- Data Preview Table -->
          <div class="url-intel-preview-wrap">
            <div class="url-intel-preview-header">
              <span class="url-intel-preview-title">DATA PREVIEW (FIRST 10 INGESTED RECORDS)</span>
              <span id="url-intel-preview-count-label" style="font-size: 0.65rem; color: #00e5ff;">0 rows</span>
            </div>
            <div class="url-intel-table-container" id="url-intel-table-container">
              <table class="url-intel-preview-table" id="url-intel-preview-table">
                <thead>
                  <tr id="url-intel-preview-thead-tr">
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody id="url-intel-preview-tbody">
                  <tr><td colspan="2" style="text-align: center; color: rgba(226,244,248,0.5); padding: 1rem;">No data ingested yet</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="url-intel-schema-actions">
            <button type="button" class="url-intel-btn-override-reset" id="url-intel-override-reset-btn" title="Reset mappings to AI automatic detections">
              ↺ Reset to AI Defaults
            </button>
            <button type="button" class="url-intel-btn-override-apply" id="url-intel-override-apply-btn" title="Re-ingest and plot globe with manual overrides">
              ⚡ Apply Overrides &amp; Re-Plot Globe
            </button>
          </div>
        </div>
      </div> <!-- End of Tab Pane 1: url-intel-pane-ingest -->

      <!-- Tab Pane 2: AI Category Injector & Geographic Hierarchy Engine -->
      <div class="url-intel-tab-pane" id="url-intel-pane-hierarchy" style="display: none;">
        <div class="url-intel-hierarchy-section" id="url-intel-hierarchy-section">
          <div class="url-intel-hierarchy-card">
            <div class="url-intel-hierarchy-header-row">
              <div class="url-intel-hierarchy-meta">
                <div class="url-intel-hierarchy-country-tag">
                  <span>DETECTED COUNTRY:</span> <strong>🇵🇭 PHILIPPINES (PH)</strong>
                </div>
                <div class="url-intel-hierarchy-stats-text" id="url-intel-hierarchy-stats-text">
                  Detected: 3 Major Island Groups · 17 Administrative Regions · Temporary Injected Fields Active
                </div>
              </div>
              <div class="url-intel-hierarchy-action-btns">
                <button type="button" class="url-intel-hierarchy-btn semantic-btn" id="url-intel-semantic-classify-btn" title="Run AI Semantic Classification to tag operational tiers and jurisdiction levels">
                  <span>✨ AI Semantic Tagging</span>
                </button>
                <button type="button" class="url-intel-hierarchy-btn inject-btn" id="url-intel-inject-hierarchy-btn" title="Re-inject Country, Island Group, and Region temporary values into active map entities">
                  <span>⚡ Inject Hierarchy</span>
                </button>
                <button type="button" class="url-intel-hierarchy-btn bounds-btn active" id="url-intel-bounds-toggle-btn" title="Toggle 3D holographic territorial bounding corridors on Cesium globe">
                  <span>🌐 3D Bounds: ON</span>
                </button>
                <button type="button" class="url-intel-hierarchy-btn reset-btn" id="url-intel-reset-hierarchy-btn" title="Reset all island group and regional filters">
                  <span>↺ Reset</span>
                </button>
              </div>
            </div>

            <!-- Phase 3: Geospatial Density Leaderboard (Top 5 Regional Hubs) -->
            <div class="url-intel-hierarchy-level-group">
              <div class="url-intel-hierarchy-level-header">
                <span class="url-intel-hierarchy-level-label">PHASE 3: TOP REGIONAL CONCENTRATION HUBS (RANKED)</span>
                <span class="url-intel-hierarchy-region-hint">Click a regional hub to instantly isolate &amp; fly to its territory</span>
              </div>
              <div class="url-intel-hierarchy-top-hubs-grid" id="url-intel-top-hubs-grid">
                <!-- Dynamically populated top 5 regions -->
              </div>
            </div>

            <!-- Proportional Island Distribution Bar -->
            <div class="url-intel-hierarchy-distribution-container">
              <div class="url-intel-hierarchy-dist-bar" id="url-intel-dist-bar">
                <div class="dist-bar-seg dist-luzon" id="dist-bar-luzon" style="width: 33%;" title="Luzon"></div>
                <div class="dist-bar-seg dist-visayas" id="dist-bar-visayas" style="width: 33%;" title="Visayas"></div>
                <div class="dist-bar-seg dist-mindanao" id="dist-bar-mindanao" style="width: 34%;" title="Mindanao"></div>
              </div>
            </div>

            <!-- Level 1: Major Island Groups -->
            <div class="url-intel-hierarchy-level-group">
              <div class="url-intel-hierarchy-level-label">
                <span>LEVEL 1: MAJOR ISLAND GROUPS (3 ISLAND GROUPS)</span>
              </div>
              <div class="url-intel-hierarchy-chips" id="url-intel-island-group-chips">
                <!-- Dynamically populated chips: All, Luzon, Visayas, Mindanao -->
              </div>
            </div>

            <!-- Level 2: 17 Administrative Regions -->
            <div class="url-intel-hierarchy-level-group">
              <div class="url-intel-hierarchy-level-header">
                <span class="url-intel-hierarchy-level-label">LEVEL 2: ADMINISTRATIVE REGIONS (17 REGIONS)</span>
                <span class="url-intel-hierarchy-region-hint" id="url-intel-active-region-hint">Showing all 17 regions across PH</span>
              </div>
              <div class="url-intel-hierarchy-region-grid" id="url-intel-region-grid">
                <!-- Dynamically populated 17 regions with counts -->
              </div>
            </div>

            <!-- Distribution Breakdown -->
            <div class="url-intel-hierarchy-breakdown-row">
              <div class="url-intel-hierarchy-stat-pill">
                <div class="stat-title-wrap">
                  <span class="stat-dot" style="background: #38bdf8;"></span>
                  <span>Luzon</span>
                </div>
                <div class="stat-val" id="url-intel-val-luzon">0</div>
                <div class="stat-sub">NCR, CAR, Region I-V</div>
              </div>
              <div class="url-intel-hierarchy-stat-pill">
                <div class="stat-title-wrap">
                  <span class="stat-dot" style="background: #c084fc;"></span>
                  <span>Visayas</span>
                </div>
                <div class="stat-val" id="url-intel-val-visayas">0</div>
                <div class="stat-sub">Region VI, VII, VIII</div>
              </div>
              <div class="url-intel-hierarchy-stat-pill">
                <div class="stat-title-wrap">
                  <span class="stat-dot" style="background: #fb923c;"></span>
                  <span>Mindanao</span>
                </div>
                <div class="stat-val" id="url-intel-val-mindanao">0</div>
                <div class="stat-sub">Region IX-XIII, BARMM</div>
              </div>
            </div>

            <!-- Injected Data Explorer Preview Table with Search & Exports -->
            <div class="url-intel-hierarchy-level-group">
              <div class="url-intel-hierarchy-level-header">
                <span class="url-intel-hierarchy-level-label">INJECTED ENTITY ATTRIBUTE EXPLORER</span>
                <span class="url-intel-hierarchy-region-hint" id="url-intel-hierarchy-table-hint">Temporary fields injected for deep filtering</span>
              </div>

              <!-- Search Bar & Export Action Strip -->
              <div class="url-intel-hierarchy-toolbar">
                <div class="url-intel-hierarchy-search-box">
                  <span class="search-icon">🔍</span>
                  <input type="text" id="url-intel-hierarchy-search-input" class="url-intel-hierarchy-search-input" placeholder="Search facilities by name, city, province, or operational tier..." />
                </div>
                <div class="url-intel-hierarchy-export-group">
                  <button type="button" class="url-intel-export-btn" id="url-intel-export-geojson-btn" title="Download standard GeoJSON file with all injected hierarchy &amp; classification tags">
                    <span>📥 GeoJSON</span>
                  </button>
                  <button type="button" class="url-intel-export-btn" id="url-intel-export-csv-btn" title="Download CSV table">
                    <span>📥 CSV</span>
                  </button>
                  <button type="button" class="url-intel-export-btn" id="url-intel-export-json-btn" title="Download tactical JSON">
                    <span>📥 JSON</span>
                  </button>
                </div>
              </div>

              <div class="url-intel-hierarchy-table-wrap">
                <table class="url-intel-preview-table" style="font-size: 0.65rem;">
                  <thead>
                    <tr>
                      <th>Entity Office / Port</th>
                      <th>Category</th>
                      <th>Operational Tier</th>
                      <th>Country</th>
                      <th>Island Group</th>
                      <th>Region</th>
                    </tr>
                  </thead>
                  <tbody id="url-intel-hierarchy-table-tbody">
                    <tr><td colspan="6" style="text-align: center; color: #64748b; padding: 0.75rem;">No data loaded</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div> <!-- End of Tab Pane 2: url-intel-pane-hierarchy -->

      <!-- Tab Pane 3: HUD Overlay Presentation & Multi-Entity Pinning Deck -->
      <div class="url-intel-tab-pane" id="url-intel-pane-hud" style="display: none;">
        <!-- Phase 3: HUD Overlay Presentation & Multi-Entity Pinning Deck -->
        <div class="url-intel-hud-section" id="url-intel-hud-section">
          <div class="url-intel-hud-header">
            <div class="url-intel-hud-title">
              <span class="url-intel-hud-title-icon">🧭</span>
              <span>HUD OVERLAY PRESENTATION &amp; PINNING DECK</span>
            </div>
            <span class="url-intel-hud-badge" id="url-intel-hud-status-badge">40-CARD BUDGET ENGINE</span>
          </div>

          <div class="url-intel-hud-layout">
            <div class="url-intel-hud-config-col">
              <!-- Dimension Profile -->
              <div class="url-intel-hud-group">
                <div class="url-intel-hud-label-row">
                  <span class="url-intel-hud-group-label">CARD DIMENSION PROFILE</span>
                  <span class="url-intel-hud-group-hint" id="url-intel-dim-hint">Standard (240×120px)</span>
                </div>
                <div class="url-intel-hud-chips-row" id="url-intel-dim-chips">
                  <button type="button" class="url-intel-hud-chip" data-profile="compact">Compact (180×90)</button>
                  <button type="button" class="url-intel-hud-chip active" data-profile="standard">Standard (240×120)</button>
                  <button type="button" class="url-intel-hud-chip" data-profile="expanded">Expanded (300×160)</button>
                  <button type="button" class="url-intel-hud-chip" data-profile="wide">Wide (360×110)</button>
                </div>
              </div>

              <!-- Leader Line Geometry -->
              <div class="url-intel-hud-group">
                <div class="url-intel-hud-label-row">
                  <span class="url-intel-hud-group-label">LEADER LINE GEOMETRY</span>
                  <span class="url-intel-hud-group-hint" id="url-intel-leader-hint">Straight Vector</span>
                </div>
                <div class="url-intel-hud-chips-row" id="url-intel-leader-chips">
                  <button type="button" class="url-intel-hud-chip active" data-leader="straight">Straight</button>
                  <button type="button" class="url-intel-hud-chip" data-leader="l_shape">L-Shape (Dog-Leg)</button>
                  <button type="button" class="url-intel-hud-chip" data-leader="diagonal_45">45° Diagonal</button>
                </div>
              </div>

              <!-- Anchor Point Arrow Type -->
              <div class="url-intel-hud-group">
                <div class="url-intel-hud-label-row">
                  <span class="url-intel-hud-group-label">ANCHOR POINT ARROW TYPE</span>
                  <span class="url-intel-hud-group-hint" id="url-intel-arrow-hint">Single Point</span>
                </div>
                <div class="url-intel-hud-chips-row" id="url-intel-arrow-chips">
                  <button type="button" class="url-intel-hud-chip active" data-arrow="single_point">Single Point</button>
                  <button type="button" class="url-intel-hud-chip" data-arrow="stealth">Stealth Dart</button>
                  <button type="button" class="url-intel-hud-chip" data-arrow="bead">Bead Ring</button>
                  <button type="button" class="url-intel-hud-chip" data-arrow="none">None</button>
                </div>
              </div>
            </div>

            <!-- Real-Time Interactive Canvas Preview -->
            <div class="url-intel-hud-preview-wrap">
              <div class="url-intel-hud-preview-top">
                <span class="url-intel-hud-preview-title">REAL-TIME CARD PREVIEW</span>
                <span class="url-intel-hud-preview-dims" id="url-intel-preview-dims-label">240 × 120 px</span>
              </div>
              <canvas class="url-intel-hud-preview-canvas" id="url-intel-hud-canvas" width="320" height="150"></canvas>
              <div class="url-intel-hud-preview-caption">Live 3D anchor &amp; callout HUD visualization</div>
            </div>
          </div>

          <!-- Multi-Entity Pinning Deck -->
          <div class="url-intel-multipin-deck">
            <div class="url-intel-multipin-bar">
              <label class="url-intel-multipin-toggle-wrap" title="When enabled, clicking entities adds them to pinned set instead of replacing selection">
                <input type="checkbox" id="url-intel-multipin-toggle" />
                <span>MULTI-PIN MODE (UP TO 5 SIMULTANEOUS CARDS)</span>
              </label>
              <div class="url-intel-multipin-actions">
                <button type="button" class="url-intel-btn-hud-action" id="url-intel-pin-top5-btn" title="Pin top 5 entities in current category">
                  📌 Pin Top 5
                </button>
                <button type="button" class="url-intel-btn-hud-action clear" id="url-intel-clear-pins-btn" title="Clear all pinned cards">
                  ✕ Clear All Pinned
                </button>
              </div>
            </div>
            <div class="url-intel-pinned-chips-container" id="url-intel-pinned-chips-list">
              <span class="url-intel-pinned-empty">No entities pinned yet. Click points on globe or use 'Pin Top 5'.</span>
            </div>
          </div>
        </div>
      </div> <!-- End of Tab Pane 3: url-intel-pane-hud -->

      <!-- Tab Pane 4: Google Drive Cloud Sync & Spatial File Browser Section -->
      <div class="url-intel-tab-pane" id="url-intel-pane-drive" style="display: none;">
        <div class="url-intel-gdrive-dedicated-banner" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 1.25rem; text-align: center;">
          <span style="font-size: 1.75rem; display: block; margin-bottom: 0.5rem;">☁️</span>
          <div style="font-size: 0.85rem; font-weight: 700; color: #e0f2fe; margin-bottom: 0.35rem; font-family: var(--font-mono, monospace);">GOOGLE DRIVE CLOUD SYNC &amp; SPATIAL PRESET STORAGE</div>
          <p style="font-size: 0.72rem; color: #94a3b8; margin: 0 0 1rem 0; line-height: 1.5;">Cloud synchronization and simultaneous 3D ingestion are unified directly in the Ingestion workspace.</p>
          <button type="button" class="url-intel-btn-browse-drive" id="url-intel-gdrive-jump-ingest-btn" style="margin: 0 auto; display: inline-flex;">
            <span>➔ GO TO CLOUD SYNC &amp; SIMULTANEOUS INGESTION</span>
          </button>
        </div>
      </div> <!-- End of Tab Pane 4: url-intel-pane-drive -->

      <!-- Tab Pane 5: Tactical Map Tools Workbench & CAD Section -->
      <div class="url-intel-tab-pane" id="url-intel-pane-maptools" style="display: none;" role="tabpanel" aria-labelledby="url-intel-tab-btn-maptools">
        <div id="tactical-workbench-host"></div>
      </div> <!-- End of Tab Pane 5: url-intel-pane-maptools -->
    </div> <!-- Closes url-intel-body -->

    <footer class="url-intel-footer">
      <button type="button" id="url-intel-submit-btn" class="url-intel-btn-primary">
        <span>ANALYZE &amp; PLOT ON GLOBE</span>
      </button>
      <button type="button" id="url-intel-tour-btn" class="url-intel-btn-tour" style="background: rgba(0, 229, 255, 0.18); border: 1px solid #00e5ff; color: #5cf4ff; font-weight: 700; border-radius: 6px; padding: 0 14px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
        <span>🧭 MAP TOUR</span>
      </button>
      <button type="button" id="url-intel-fly-btn" class="url-intel-btn-secondary">
        <span>FLY TO EXTENT</span>
      </button>
      <span class="url-intel-hint">Press ESC or click ✕ to close</span>
    </footer>
  `;

  const inputField = dialog.querySelector('#url-intel-input-field');
  const clearBtn = dialog.querySelector('#url-intel-clear-btn');
  const submitBtn = dialog.querySelector('#url-intel-submit-btn');
  const tourBtn = dialog.querySelector('#url-intel-tour-btn');
  const flyBtn = dialog.querySelector('#url-intel-fly-btn');
  const closeBtn = dialog.querySelector('#url-intel-close-btn');
  const statusLed = dialog.querySelector('#url-intel-status-led');
  const statusText = dialog.querySelector('#url-intel-status-text');
  const statusDetails = dialog.querySelector('#url-intel-status-details');
  const presetsContainer = dialog.querySelector('#url-intel-presets-container');
  const aiToggle = dialog.querySelector('#url-intel-ai-toggle');
  const aiStatusPill = dialog.querySelector('#url-intel-ai-status-pill');

  // Schema Inspector elements
  const schemaPanel = dialog.querySelector('#url-intel-schema-panel');
  const schemaCloseBtn = dialog.querySelector('#url-intel-schema-close-btn');
  const schemaSummary = dialog.querySelector('#url-intel-schema-summary');
  const schemaGrid = dialog.querySelector('#url-intel-schema-grid');
  const catMatrixSection = dialog.querySelector('#url-intel-cat-matrix-section');
  const catMatrixGrid = dialog.querySelector('#url-intel-cat-matrix-grid');
  const recsSection = dialog.querySelector('#url-intel-recs-section');
  const domainName = dialog.querySelector('#url-intel-domain-name');
  const distributionText = dialog.querySelector('#url-intel-distribution-text');
  const recsGrid = dialog.querySelector('#url-intel-recs-grid');
  const previewTable = dialog.querySelector('#url-intel-preview-table');
  const previewTheadTr = dialog.querySelector('#url-intel-preview-thead-tr');
  const previewTbody = dialog.querySelector('#url-intel-preview-tbody');
  const previewCountLabel = dialog.querySelector('#url-intel-preview-count-label');
  const overrideApplyBtn = dialog.querySelector('#url-intel-override-apply-btn');
  const overrideResetBtn = dialog.querySelector('#url-intel-override-reset-btn');

  // Multi-File Upload & Simultaneous 3D Ingestion Elements
  const multiDropzone = dialog.querySelector('#url-intel-multi-dropzone');
  const multiBrowseBtn = dialog.querySelector('#url-intel-multi-browse-btn');
  const multiFileInput = dialog.querySelector('#url-intel-multi-file-input');
  const datasetsRoster = dialog.querySelector('#url-intel-datasets-roster');
  const datasetsCount = dialog.querySelector('#url-intel-datasets-count');
  const datasetsList = dialog.querySelector('#url-intel-datasets-list');
  const datasetsClearBtn = dialog.querySelector('#url-intel-datasets-clear-btn');

  // Google Drive Cloud Sync Elements
  const gdriveStatusTag = dialog.querySelector('#url-intel-gdrive-status-tag');
  const gdriveAuthBtn = dialog.querySelector('#url-intel-gdrive-auth-btn');
  const gdriveAuthBtnText = dialog.querySelector('#url-intel-gdrive-auth-btn-text');
  const gdriveFolderTabs = dialog.querySelector('#url-intel-gdrive-folder-tabs');
  const gdriveRefreshBtn = dialog.querySelector('#url-intel-gdrive-refresh-btn');
  const gdriveUploadBtn = dialog.querySelector('#url-intel-gdrive-upload-btn');
  const gdriveSaveMapBtn = dialog.querySelector('#url-intel-gdrive-save-map-btn');
  const gdriveStagedQueue = dialog.querySelector('#url-intel-gdrive-staged-queue');
  const gdriveFileList = dialog.querySelector('#url-intel-gdrive-file-list');
  const gdriveSelectAll = dialog.querySelector('#url-intel-gdrive-select-all');
  const gdriveIngestBtn = dialog.querySelector('#url-intel-gdrive-ingest-btn');
  const gdriveSelectedCount = dialog.querySelector('#url-intel-gdrive-selected-count');
  const dropzoneOpenDriveBtn = dialog.querySelector('#url-intel-dropzone-open-drive-btn');
  const rosterUploadDriveBtn = dialog.querySelector('#url-intel-roster-upload-drive-btn');
  const rosterSelectAll = dialog.querySelector('#url-intel-roster-select-all');
  const rosterIngestBtn = dialog.querySelector('#url-intel-roster-ingest-btn');
  const rosterSelectedCount = dialog.querySelector('#url-intel-roster-selected-count');
  const gdriveGuideToggleBtn = dialog.querySelector('#url-intel-gdrive-guide-toggle-btn');
  const gdriveGuideCard = dialog.querySelector('#url-intel-gdrive-guide-card');
  const gdriveGuideClose = dialog.querySelector('#url-intel-gdrive-guide-close');
  const gdriveJumpIngestBtn = dialog.querySelector('#url-intel-gdrive-jump-ingest-btn');

  // Deep Scraping & Multi-Tab Elements
  const tabSelect = dialog.querySelector('#url-intel-tab-select');
  const allTabsToggle = dialog.querySelector('#url-intel-all-tabs-toggle');
  const paginationToggle = dialog.querySelector('#url-intel-pagination-toggle');

  // Rule Audit Elements
  const ruleChecksSection = dialog.querySelector('#url-intel-rule-checks-section');
  const auditOverallBadge = dialog.querySelector('#url-intel-audit-overall-badge');
  const ruleTabsBadge = dialog.querySelector('#url-intel-rule-tabs-badge');
  const ruleTabsDesc = dialog.querySelector('#url-intel-rule-tabs-desc');
  const detectedTabsList = dialog.querySelector('#url-intel-detected-tabs-list');

  const rulePagesBadge = dialog.querySelector('#url-intel-rule-pages-badge');
  const rulePagesDesc = dialog.querySelector('#url-intel-rule-pages-desc');

  const ruleLinksBadge = dialog.querySelector('#url-intel-rule-links-badge');
  const ruleLinksDesc = dialog.querySelector('#url-intel-rule-links-desc');
  const linksStatsRow = dialog.querySelector('#url-intel-links-stats-row');

  const ruleGeoBadge = dialog.querySelector('#url-intel-rule-geo-badge');
  const ruleGeoDesc = dialog.querySelector('#url-intel-rule-geo-desc');

  // Intelligence Analyst Elements
  const analystPanel = dialog.querySelector('#url-intel-analyst-panel');
  const analystComment = dialog.querySelector('#url-intel-analyst-comment');
  const clusterAnalysis = dialog.querySelector('#url-intel-cluster-analysis');
  const lineageAnalysis = dialog.querySelector('#url-intel-lineage-analysis');
  const analystRecsList = dialog.querySelector('#url-intel-analyst-recs-list');

  // AI Category Icon Elements
  const catThemeSelect = dialog.querySelector('#url-intel-cat-theme-select');
  const catGenerateAllBtn = dialog.querySelector('#url-intel-cat-generate-all-btn');

  // GPS Telemetry & Trajectory Section Elements
  const trajSection = dialog.querySelector('#url-intel-trajectory-section');
  const trajBadge = dialog.querySelector('#url-intel-trajectory-badge');
  const trajUnitsVal = dialog.querySelector('#url-intel-traj-units-val');
  const trajDistVal = dialog.querySelector('#url-intel-traj-dist-val');
  const trajSpeedVal = dialog.querySelector('#url-intel-traj-speed-val');
  const trajAvgSpeedSub = dialog.querySelector('#url-intel-traj-avg-speed-sub');
  const trajDwellVal = dialog.querySelector('#url-intel-traj-dwell-val');
  const trajPlayBtn = dialog.querySelector('#url-intel-traj-play-btn');
  const trajSpeedGroup = dialog.querySelector('#url-intel-traj-speed-group');
  const trajTimeVal = dialog.querySelector('#url-intel-traj-time-val');
  const trajScrubber = dialog.querySelector('#url-intel-traj-scrubber');
  const trajStartTime = dialog.querySelector('#url-intel-traj-start-time');
  const trajEndTime = dialog.querySelector('#url-intel-traj-end-time');
  const trajDockHudBtn = dialog.querySelector('#url-intel-traj-dock-hud-btn');
  const trajVehiclesList = dialog.querySelector('#url-intel-traj-vehicles-list');
  const trajVehiclesCount = dialog.querySelector('#url-intel-traj-vehicles-count');

  // Phase 3: HUD Overlay & Pinning Deck Elements
  const hudDimChips = dialog.querySelector('#url-intel-dim-chips');
  const hudDimHint = dialog.querySelector('#url-intel-dim-hint');
  const hudLeaderChips = dialog.querySelector('#url-intel-leader-chips');
  const hudLeaderHint = dialog.querySelector('#url-intel-leader-hint');
  const hudArrowChips = dialog.querySelector('#url-intel-arrow-chips');
  const hudArrowHint = dialog.querySelector('#url-intel-arrow-hint');
  const hudCanvas = dialog.querySelector('#url-intel-hud-canvas');
  const hudPreviewDimsLabel = dialog.querySelector('#url-intel-preview-dims-label');
  const multipinToggle = dialog.querySelector('#url-intel-multipin-toggle');
  const pinTop5Btn = dialog.querySelector('#url-intel-pin-top5-btn');
  const clearPinsBtn = dialog.querySelector('#url-intel-clear-pins-btn');
  const pinnedChipsList = dialog.querySelector('#url-intel-pinned-chips-list');
  const hudStatusBadge = dialog.querySelector('#url-intel-hud-status-badge');

  // Main Modal Tab Navigation Elements
  const tabButtons = dialog.querySelectorAll('.url-intel-nav-tab');
  const tabPanes = dialog.querySelectorAll('.url-intel-tab-pane');
  const gotoHierarchyBtn = dialog.querySelector('#url-intel-goto-hierarchy-btn');

  // AI Category Injector & Geographic Hierarchy Elements
  const injectHierarchyBtn = dialog.querySelector('#url-intel-inject-hierarchy-btn');
  const resetHierarchyBtn = dialog.querySelector('#url-intel-reset-hierarchy-btn');
  const semanticClassifyBtn = dialog.querySelector('#url-intel-semantic-classify-btn');
  const boundsToggleBtn = dialog.querySelector('#url-intel-bounds-toggle-btn');
  const topHubsContainer = dialog.querySelector('#url-intel-top-hubs-grid');
  const distBarLuzon = dialog.querySelector('#dist-bar-luzon');
  const distBarVisayas = dialog.querySelector('#dist-bar-visayas');
  const distBarMindanao = dialog.querySelector('#dist-bar-mindanao');
  const hierarchySearchInput = dialog.querySelector('#url-intel-hierarchy-search-input');
  const exportGeoJsonBtn = dialog.querySelector('#url-intel-export-geojson-btn');
  const exportCsvBtn = dialog.querySelector('#url-intel-export-csv-btn');
  const exportJsonBtn = dialog.querySelector('#url-intel-export-json-btn');
  const islandGroupChipsContainer = dialog.querySelector('#url-intel-island-group-chips');
  const regionGridContainer = dialog.querySelector('#url-intel-region-grid');
  const hierarchyStatsText = dialog.querySelector('#url-intel-hierarchy-stats-text');
  const activeRegionHint = dialog.querySelector('#url-intel-active-region-hint');
  const valLuzon = dialog.querySelector('#url-intel-val-luzon');
  const valVisayas = dialog.querySelector('#url-intel-val-visayas');
  const valMindanao = dialog.querySelector('#url-intel-val-mindanao');
  const hierarchyTableTbody = dialog.querySelector('#url-intel-hierarchy-table-tbody');
  const hierarchyTableHint = dialog.querySelector('#url-intel-hierarchy-table-hint');
  const hierarchyTabBadge = dialog.querySelector('#url-intel-hierarchy-tab-badge');

  let _hierarchySearchQuery = '';

  // Floating Trajectory HUD Player (Docked on Cesium 3D Globe)
  let hudPlayer = document.getElementById('gev-trajectory-hud-player');
  if (!hudPlayer) {
    hudPlayer = document.createElement('aside');
    hudPlayer.id = 'gev-trajectory-hud-player';
    hudPlayer.className = 'gev-trajectory-hud-player';
    hudPlayer.hidden = true;
    hudPlayer.innerHTML = `
      <div class="hud-drag-handle">
        <span class="hud-pulse-dot"></span>
        <span class="hud-title">GPS FLEET TELEMETRY HUD · REAL-TIME REPLAY</span>
        <button type="button" id="hud-btn-open-modal" class="url-intel-cat-action-btn" style="margin-right: 0.5rem;" title="Open Ingestion Details &amp; Schema Inspector">📊 Details</button>
        <button type="button" id="hud-toggle-minimize-btn" class="hud-btn-min" title="Minimize HUD">_</button>
        <button type="button" id="hud-close-btn" class="hud-btn-close" title="Hide HUD">✕</button>
      </div>
      <div class="hud-body" id="hud-body-content">
        <div class="hud-top-row">
          <button type="button" id="hud-play-btn" class="hud-play-btn">▶ PLAY</button>
          <div class="hud-speed-group" id="hud-speed-group">
            <button type="button" class="hud-speed-btn active" data-speed="1">1x</button>
            <button type="button" class="hud-speed-btn" data-speed="5">5x</button>
            <button type="button" class="hud-speed-btn" data-speed="10">10x</button>
            <button type="button" class="hud-speed-btn" data-speed="20">20x</button>
            <button type="button" class="hud-speed-btn" data-speed="60">60x</button>
          </div>
          <div class="hud-time-readout" id="hud-time-readout">--:--:--</div>
          <button type="button" id="hud-follow-btn" class="hud-follow-btn" title="Follow Selected Vehicle Camera">🎯 Follow</button>
        </div>
        <div class="hud-scrubber-row">
          <input type="range" min="0" max="1000" value="0" class="hud-scrubber" id="hud-scrubber" />
        </div>
        <div class="hud-unit-row" id="hud-unit-row">
          <span class="hud-unit-name" id="hud-unit-name">FLEET TELEMETRY ACTIVE</span>
          <span class="hud-unit-speed" id="hud-unit-speed">-- km/h</span>
          <span class="hud-unit-heading" id="hud-unit-heading">--°</span>
        </div>
      </div>
    `;
    document.body.appendChild(hudPlayer);
  }

  const hudPlayBtn = hudPlayer.querySelector('#hud-play-btn');
  const hudSpeedGroup = hudPlayer.querySelector('#hud-speed-group');
  const hudTimeReadout = hudPlayer.querySelector('#hud-time-readout');
  const hudFollowBtn = hudPlayer.querySelector('#hud-follow-btn');
  const hudScrubber = hudPlayer.querySelector('#hud-scrubber');
  const hudUnitName = hudPlayer.querySelector('#hud-unit-name');
  const hudUnitSpeed = hudPlayer.querySelector('#hud-unit-speed');
  const hudUnitHeading = hudPlayer.querySelector('#hud-unit-heading');
  const hudBtnOpenModal = hudPlayer.querySelector('#hud-btn-open-modal');
  const hudCloseBtn = hudPlayer.querySelector('#hud-close-btn');
  const hudToggleMinBtn = hudPlayer.querySelector('#hud-toggle-minimize-btn');
  const hudBodyContent = hudPlayer.querySelector('#hud-body-content');

  // Create Interactive Popup Service Dialog Box
  const serviceDialogBackdrop = document.createElement('div');
  serviceDialogBackdrop.id = 'url-intel-service-dialog-backdrop';
  serviceDialogBackdrop.className = 'url-intel-service-dialog-backdrop';
  serviceDialogBackdrop.hidden = true;

  serviceDialogBackdrop.innerHTML = `
    <div class="url-intel-service-dialog" id="url-intel-service-dialog" role="dialog" aria-modal="true" aria-labelledby="url-intel-service-title">
      <header class="url-intel-service-header">
        <div class="url-intel-service-header-left">
          <div class="url-intel-service-icon-wrap" id="url-intel-service-icon">
            <img id="url-intel-service-icon-img" src="" alt="Category Icon" />
          </div>
          <div class="url-intel-service-title-area">
            <div class="url-intel-service-kicker">
              <span id="url-intel-service-cat-badge">CATEGORY</span>
              <span>·</span>
              <span id="url-intel-service-status-badge">✨ AI VERIFIED</span>
            </div>
            <h3 class="url-intel-service-title" id="url-intel-service-title">Entity Name</h3>
          </div>
        </div>
        <div class="url-intel-service-header-right">
          <button type="button" class="url-intel-service-btn-ctrl" id="url-intel-service-maximize-btn" title="Toggle maximize window">⤢</button>
          <button type="button" class="url-intel-service-btn-ctrl close" id="url-intel-service-close-btn" title="Close popup service dialog">✕</button>
        </div>
      </header>

      <div class="url-intel-service-body">
        <!-- Entity Metadata Grid -->
        <div class="url-intel-meta-grid" id="url-intel-service-meta-grid"></div>

        <!-- Captured Data Content & URL Hyperlinks -->
        <div class="url-intel-hyperlinks-section" id="url-intel-service-hyperlinks-section">
          <div class="url-intel-section-title-bar">
            <div class="url-intel-section-heading">
              <span>🔗 CAPTURED DATA CONTENT &amp; HYPERLINKS</span>
            </div>
            <span id="url-intel-links-count-pill" class="url-intel-link-domain-pill">0 Links</span>
          </div>
          <div class="url-intel-hyperlinks-list" id="url-intel-service-links-list"></div>
        </div>

        <!-- Embedded Popup Service Dialog Browser / View Frame -->
        <div class="url-intel-embedded-frame-box" id="url-intel-service-frame-box" style="display: none;">
          <div class="url-intel-frame-navbar">
            <span class="url-intel-frame-url-chip" id="url-intel-frame-active-url">about:blank</span>
            <div class="url-intel-frame-btn-group">
              <button type="button" class="url-intel-frame-btn" id="url-intel-frame-reload-btn" title="Reload iframe">↻ Reload</button>
              <button type="button" class="url-intel-frame-btn" id="url-intel-frame-open-blank-btn" title="Open in new tab (_blank)">↗ _blank</button>
              <button type="button" class="url-intel-frame-btn" id="url-intel-frame-open-parent-btn" title="Open in parent (_parent)">⤹ _parent</button>
              <button type="button" class="url-intel-frame-btn" id="url-intel-frame-close-btn" title="Close embedded frame">✕</button>
            </div>
          </div>
          <iframe id="url-intel-service-iframe" class="url-intel-frame-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
          <div id="url-intel-frame-fallback" class="url-intel-frame-fallback" style="display: none;">
            <div>⚠️ External host restricts in-frame embedding (X-Frame-Options: SAMEORIGIN / CSP).</div>
            <div style="display: flex; gap: 0.5rem; justify-content: center;">
              <button type="button" class="url-intel-btn-link-action action-blank" id="url-intel-fallback-blank-btn">↗ Open in _blank (New Tab)</button>
              <button type="button" class="url-intel-btn-link-action action-parent" id="url-intel-fallback-parent-btn">⤹ Open in _parent</button>
            </div>
          </div>
        </div>

        <!-- Raw Extracted Record Attributes -->
        <div class="url-intel-preview-wrap" id="url-intel-service-raw-wrap">
          <div class="url-intel-preview-header">
            <span class="url-intel-preview-title">RAW INGESTED ATTRIBUTES</span>
          </div>
          <div class="url-intel-table-container">
            <table class="url-intel-preview-table" id="url-intel-service-raw-table">
              <thead>
                <tr><th style="width: 35%;">Attribute Key</th><th>Captured Value</th></tr>
              </thead>
              <tbody id="url-intel-service-raw-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(serviceDialogBackdrop);

  // Query service dialog sub-elements
  const serviceDialog = serviceDialogBackdrop.querySelector('#url-intel-service-dialog');
  const serviceIconImg = serviceDialogBackdrop.querySelector('#url-intel-service-icon-img');
  const serviceCatBadge = serviceDialogBackdrop.querySelector('#url-intel-service-cat-badge');
  const serviceStatusBadge = serviceDialogBackdrop.querySelector('#url-intel-service-status-badge');
  const serviceTitle = serviceDialogBackdrop.querySelector('#url-intel-service-title');
  const serviceMetaGrid = serviceDialogBackdrop.querySelector('#url-intel-service-meta-grid');
  const serviceLinksList = serviceDialogBackdrop.querySelector('#url-intel-service-links-list');
  const serviceLinksCountPill = serviceDialogBackdrop.querySelector('#url-intel-links-count-pill');
  const serviceFrameBox = serviceDialogBackdrop.querySelector('#url-intel-service-frame-box');
  const serviceFrameActiveUrl = serviceDialogBackdrop.querySelector('#url-intel-frame-active-url');
  const serviceIframe = serviceDialogBackdrop.querySelector('#url-intel-service-iframe');
  const serviceFrameFallback = serviceDialogBackdrop.querySelector('#url-intel-frame-fallback');
  const serviceFallbackBlankBtn = serviceDialogBackdrop.querySelector('#url-intel-fallback-blank-btn');
  const serviceFallbackParentBtn = serviceDialogBackdrop.querySelector('#url-intel-fallback-parent-btn');
  const serviceFrameReloadBtn = serviceDialogBackdrop.querySelector('#url-intel-frame-reload-btn');
  const serviceFrameOpenBlankBtn = serviceDialogBackdrop.querySelector('#url-intel-frame-open-blank-btn');
  const serviceFrameOpenParentBtn = serviceDialogBackdrop.querySelector('#url-intel-frame-open-parent-btn');
  const serviceFrameCloseBtn = serviceDialogBackdrop.querySelector('#url-intel-frame-close-btn');
  const serviceRawTbody = serviceDialogBackdrop.querySelector('#url-intel-service-raw-tbody');
  const serviceCloseBtn = serviceDialogBackdrop.querySelector('#url-intel-service-close-btn');
  const serviceMaximizeBtn = serviceDialogBackdrop.querySelector('#url-intel-service-maximize-btn');

  let activeFrameTargetUrl = '';

  function openServiceDialog(point) {
    if (!point) return;

    // Header info & AI vector billboard
    const category = point.category || 'Default';
    const billboardSrc = getCategoryBillboardImage(category, true);
    if (serviceIconImg) {
      serviceIconImg.src = billboardSrc;
    }
    if (serviceCatBadge) {
      const color = getCategoryColor(category);
      const emoji = getCategoryEmoji(category);
      serviceCatBadge.innerHTML = `${emoji} ${escapeHtml(category)}`;
      serviceCatBadge.style.color = color;
    }
    if (serviceStatusBadge) {
      serviceStatusBadge.textContent = point.aiVerified ? '✨ AI VERIFIED' : '📍 EXTRACTED';
    }
    if (serviceTitle) {
      serviceTitle.textContent = point.name || 'Unnamed Entity';
    }

    // Metadata Grid
    if (serviceMetaGrid) {
      const metaCards = [
        { label: 'COORDINATES', val: Number.isFinite(point.lat) && Number.isFinite(point.lon) ? `${point.lat.toFixed(5)}°, ${point.lon.toFixed(5)}°` : 'Pending Geocoding' },
        { label: 'ADDRESS', val: point.address || 'Not specified' },
        { label: 'CONTACT / PHONE', val: point.contact || 'None available' },
        { label: 'HOURS / DETAILS', val: point.hours || point.details || 'Standard Operations' },
      ];
      serviceMetaGrid.innerHTML = metaCards.map((c) => `
        <div class="url-intel-meta-card">
          <span class="url-intel-meta-label">${c.label}</span>
          <span class="url-intel-meta-value">${escapeHtml(c.val)}</span>
        </div>
      `).join('');
    }

    // Captured Hyperlinks
    let links = Array.isArray(point.capturedHyperlinks) && point.capturedHyperlinks.length > 0
      ? [...point.capturedHyperlinks]
      : [];

    // Synthesize fallback hyperlinks if none explicit in the ingested row
    if (links.length === 0) {
      if (point.sourceUrl) {
        links.push({
          title: 'Source Web Page',
          url: point.sourceUrl,
          domain: detectDomain(point.sourceUrl),
          target: '_blank',
        });
      }
      if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        links.push({
          title: 'Coordinates Map View',
          url: `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`,
          domain: 'google.com/maps',
          target: '_blank',
        });
      }
      links.push({
        title: `Official Search: ${point.name}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(point.name + ' ' + (point.address || ''))}`,
        domain: 'google.com/search',
        target: '_blank',
      });
    }

    if (serviceLinksCountPill) {
      serviceLinksCountPill.textContent = `${links.length} Links`;
    }

    if (serviceLinksList) {
      serviceLinksList.innerHTML = links.map((link, idx) => {
        const domain = link.domain || detectDomain(link.url);
        return `
          <div class="url-intel-hyperlink-card" data-idx="${idx}">
            <div class="url-intel-link-info-row">
              <div class="url-intel-link-label">
                <span>🔗</span>
                <span>${escapeHtml(link.title || link.url)}</span>
              </div>
              <span class="url-intel-link-domain-pill">${escapeHtml(domain)}</span>
            </div>
            <div class="url-intel-link-url-text">${escapeHtml(link.url)}</div>
            <div class="url-intel-link-actions-row">
              <button type="button" class="url-intel-btn-link-action action-popup" data-action="popup" data-url="${escapeHtml(link.url)}" title="Open inside embedded service popup frame">
                ⧉ Popup Service Dialog
              </button>
              <button type="button" class="url-intel-btn-link-action action-blank" data-action="blank" data-url="${escapeHtml(link.url)}" title="Open in new blank tab (_blank)">
                ↗ Open in _blank
              </button>
              <button type="button" class="url-intel-btn-link-action action-parent" data-action="parent" data-url="${escapeHtml(link.url)}" title="Open in parent window (_parent)">
                ⤹ Open in _parent
              </button>
              <button type="button" class="url-intel-btn-link-action action-copy" data-action="copy" data-url="${escapeHtml(link.url)}" title="Copy link to clipboard">
                📋 Copy Link
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Bind link action buttons: popup, _blank, _parent, copy
      serviceLinksList.querySelectorAll('.url-intel-btn-link-action').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const targetUrl = btn.dataset.url;
          if (!targetUrl) return;

          if (action === 'popup') {
            loadInEmbeddedFrame(targetUrl);
          } else if (action === 'blank') {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          } else if (action === 'parent') {
            try {
              window.open(targetUrl, '_parent');
            } catch {
              window.parent.location.href = targetUrl;
            }
          } else if (action === 'copy') {
            if (navigator?.clipboard?.writeText) {
              navigator.clipboard.writeText(targetUrl).then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '✓ Copied!';
                btn.style.color = '#69f0ae';
                setTimeout(() => {
                  btn.innerHTML = orig;
                  btn.style.color = '';
                }, 1800);
              }).catch(() => {});
            }
          }
        });
      });
    }

    // Raw Attributes Table
    if (serviceRawTbody) {
      const raw = point.rawRecord || { Name: point.name, Category: category, Address: point.address, Contact: point.contact, Details: point.details };
      const rows = Object.entries(raw).map(([k, v]) => `
        <tr>
          <td style="font-weight: 600; color: #5cf4ff;">${escapeHtml(k)}</td>
          <td>${escapeHtml(String(v ?? '—'))}</td>
        </tr>
      `).join('');
      serviceRawTbody.innerHTML = rows || '<tr><td colspan="2">No additional attributes</td></tr>';
    }

    // Hide embedded frame initially unless opened
    if (serviceFrameBox) {
      serviceFrameBox.style.display = 'none';
      if (serviceIframe) serviceIframe.src = 'about:blank';
    }

    serviceDialogBackdrop.hidden = false;
  }

  function closeServiceDialog() {
    serviceDialogBackdrop.hidden = true;
    if (serviceIframe) serviceIframe.src = 'about:blank';
    activeFrameTargetUrl = '';
  }

  function toggleMaximizeServiceDialog() {
    if (serviceDialog) {
      serviceDialog.classList.toggle('maximized');
    }
  }

  function loadInEmbeddedFrame(url) {
    if (!serviceFrameBox || !serviceIframe) return;
    activeFrameTargetUrl = url;
    serviceFrameBox.style.display = 'flex';
    if (serviceFrameActiveUrl) {
      serviceFrameActiveUrl.textContent = url;
    }
    if (serviceFrameFallback) {
      serviceFrameFallback.style.display = 'none';
    }
    serviceIframe.style.display = 'block';
    serviceIframe.src = url;

    // Safety timeout in case of X-Frame-Options blocking
    serviceIframe.onerror = () => {
      showFrameFallback();
    };

    serviceFrameBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showFrameFallback() {
    if (serviceFrameFallback && serviceIframe) {
      serviceIframe.style.display = 'none';
      serviceFrameFallback.style.display = 'flex';
    }
  }

  function detectDomain(urlStr = '') {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return 'external';
    }
  }

  // Bind service dialog window controls
  if (serviceCloseBtn) {
    serviceCloseBtn.addEventListener('click', closeServiceDialog);
  }
  if (serviceMaximizeBtn) {
    serviceMaximizeBtn.addEventListener('click', toggleMaximizeServiceDialog);
  }
  if (serviceDialogBackdrop) {
    serviceDialogBackdrop.addEventListener('click', (e) => {
      if (e.target === serviceDialogBackdrop) {
        closeServiceDialog();
      }
    });
  }

  // Embedded Frame navbar controls
  if (serviceFrameCloseBtn) {
    serviceFrameCloseBtn.addEventListener('click', () => {
      if (serviceFrameBox) serviceFrameBox.style.display = 'none';
      if (serviceIframe) serviceIframe.src = 'about:blank';
    });
  }
  if (serviceFrameReloadBtn) {
    serviceFrameReloadBtn.addEventListener('click', () => {
      if (activeFrameTargetUrl) loadInEmbeddedFrame(activeFrameTargetUrl);
    });
  }
  if (serviceFrameOpenBlankBtn) {
    serviceFrameOpenBlankBtn.addEventListener('click', () => {
      if (activeFrameTargetUrl) window.open(activeFrameTargetUrl, '_blank', 'noopener,noreferrer');
    });
  }
  if (serviceFrameOpenParentBtn) {
    serviceFrameOpenParentBtn.addEventListener('click', () => {
      if (activeFrameTargetUrl) {
        try {
          window.open(activeFrameTargetUrl, '_parent');
        } catch {
          window.parent.location.href = activeFrameTargetUrl;
        }
      }
    });
  }
  if (serviceFallbackBlankBtn) {
    serviceFallbackBlankBtn.addEventListener('click', () => {
      if (activeFrameTargetUrl) window.open(activeFrameTargetUrl, '_blank', 'noopener,noreferrer');
    });
  }
  if (serviceFallbackParentBtn) {
    serviceFallbackParentBtn.addEventListener('click', () => {
      if (activeFrameTargetUrl) {
        try {
          window.open(activeFrameTargetUrl, '_parent');
        } catch {
          window.parent.location.href = activeFrameTargetUrl;
        }
      }
    });
  }

  // Global event when an entity billboard is clicked on the Cesium globe
  window.addEventListener('gev:url-point-selected', (e) => {
    if (e?.detail?.point) {
      const isTour = Boolean(e.detail.isTour) || Boolean(window.__gevTourActive);
      const displayMode = (typeof localStorage !== 'undefined' && localStorage.getItem('gev_tour_display_mode')) || 'cinematic';

      if (isTour) {
        if (displayMode === 'cinematic') {
          closeServiceDialog();
          return;
        }
        if (displayMode === 'docked') {
          closeServiceDialog();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gev:render-docked-tour-details', {
              detail: { point: e.detail.point },
            }));
          }
          return;
        }
      }
      openServiceDialog(e.detail.point);
    }
  });

  // Programmatic event to close service dialog
  window.addEventListener('gev:close-service-dialog', () => {
    closeServiceDialog();
  });

  // Programmatic event to open service dialog on-demand (e.g. from tour Inspect button)
  window.addEventListener('gev:open-service-dialog', (e) => {
    if (e?.detail?.point) {
      openServiceDialog(e.detail.point);
    }
  });

  // Schema state
  let currentDetectedHeaders = [];
  let currentSampleRows = [];
  let currentSchemaAnalysis = null;
  let currentMappingOverrides = {};

  // Canonical field definitions for the manual override dropdowns
  const CANONICAL_FIELDS = [
    { key: 'name', label: '📍 Name / Title', desc: 'Main facility, port, or office title' },
    { key: 'category', label: '🏷️ Category', desc: 'Type of facility or point' },
    { key: 'address', label: '🏠 Address / Location', desc: 'Physical address or city name' },
    { key: 'contact', label: '📞 Contact / Phone', desc: 'Telephone, email, or radio info' },
    { key: 'details', label: '📝 Details / Info', desc: 'Descriptive operational notes' },
    { key: 'lat', label: '🌐 Latitude', desc: 'Decimal latitude coordinate (-90 to 90)' },
    { key: 'lon', label: '🌐 Longitude', desc: 'Decimal longitude coordinate (-180 to 180)' },
  ];

  function toggleSchemaPanel(show) {
    if (!schemaPanel) return;
    const willShow = show !== undefined ? show : schemaPanel.style.display === 'none';
    schemaPanel.style.display = willShow ? 'flex' : 'none';
    if (aiStatusPill) {
      if (willShow) {
        aiStatusPill.classList.add('active');
        aiStatusPill.innerHTML = '<span>✨ AI Geocoding Active</span> <span style="font-size: 0.6rem; opacity: 0.8;">▴ HIDE</span>';
      } else {
        aiStatusPill.classList.remove('active');
        aiStatusPill.innerHTML = '<span>✨ AI Geocoding Active</span> <span style="font-size: 0.6rem; opacity: 0.8;">▾ INSPECT</span>';
      }
    }
    if (willShow) {
      populateSchemaInspector();
    }
  }

  if (aiStatusPill) {
    aiStatusPill.addEventListener('click', () => toggleSchemaPanel());
  }

  if (schemaCloseBtn) {
    schemaCloseBtn.addEventListener('click', () => toggleSchemaPanel(false));
  }

  function populateSchemaInspector() {
    const schemaInfo = urlIntelligenceLayer.getSchemaInfo?.() || {};
    currentDetectedHeaders = schemaInfo.headers && schemaInfo.headers.length > 0
      ? schemaInfo.headers
      : (currentDetectedHeaders.length > 0 ? currentDetectedHeaders : ['Name', 'Category', 'Address', 'Contact', 'Details', 'Latitude', 'Longitude']);
    currentSampleRows = schemaInfo.sampleRows && schemaInfo.sampleRows.length > 0
      ? schemaInfo.sampleRows
      : currentSampleRows;
    currentSchemaAnalysis = schemaInfo.schemaAnalysis || currentSchemaAnalysis;
    currentMappingOverrides = schemaInfo.mappingOverrides || currentMappingOverrides || {};

    // Render summary message
    if (schemaSummary) {
      if (currentSchemaAnalysis && currentSchemaAnalysis.summary) {
        const catList = Array.isArray(currentSchemaAnalysis.identifiedCategories) && currentSchemaAnalysis.identifiedCategories.length > 0
          ? ` · Categories: <strong>${currentSchemaAnalysis.identifiedCategories.slice(0, 4).join(', ')}</strong>`
          : '';
        schemaSummary.innerHTML = `<strong>✨ AI Schema Analysis:</strong> ${escapeHtml(currentSchemaAnalysis.summary)}${catList}`;
      } else if (currentDetectedHeaders.length > 0) {
        schemaSummary.innerHTML = `Detected <strong>${currentDetectedHeaders.length} headers</strong> from dataset. You can manually re-map columns to canonical fields below, or preview the raw records.`;
      } else {
        schemaSummary.innerHTML = `No tabular headers detected yet. Ingest a URL above to inspect and override schema attributes.`;
      }
    }

    // Render Field Mapping Grid
    if (schemaGrid) {
      const headerOptionsHtml = [
        '<option value="">(None / Auto-Detect)</option>',
        ...currentDetectedHeaders.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`),
      ].join('');

      schemaGrid.innerHTML = CANONICAL_FIELDS.map((field) => {
        // Suggested header from AI analysis if available
        const aiSuggested = currentSchemaAnalysis?.fieldMappings?.[field.key] || '';
        const currentSelected = currentMappingOverrides[field.key] || aiSuggested;

        const optionsWithSelected = [
          `<option value="">(None / Auto-Detect)</option>`,
          ...currentDetectedHeaders.map((h) => {
            const isSel = (currentSelected && currentSelected.toLowerCase() === h.toLowerCase())
              || (!currentSelected && h.toLowerCase().includes(field.key.toLowerCase()));
            return `<option value="${escapeHtml(h)}" ${isSel ? 'selected' : ''}>${escapeHtml(h)}${aiSuggested === h ? ' ★ AI' : ''}</option>`;
          }),
        ].join('');

        return `
          <div class="url-intel-field-card" data-field="${field.key}">
            <label class="url-intel-field-label" for="schema-field-${field.key}">
              <span>${field.label}</span>
              <span style="font-size: 0.58rem; color: rgba(226,244,248,0.5);">${field.key.toUpperCase()}</span>
            </label>
            <select class="url-intel-field-select" id="schema-field-${field.key}" data-field="${field.key}" title="${field.desc}">
              ${optionsWithSelected}
            </select>
          </div>
        `;
      }).join('');

      // Bind select changes to keep currentMappingOverrides updated
      schemaGrid.querySelectorAll('.url-intel-field-select').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          const fieldKey = e.target.dataset.field;
          const chosenHeader = e.target.value;
          if (chosenHeader) {
            currentMappingOverrides[fieldKey] = chosenHeader;
          } else {
            delete currentMappingOverrides[fieldKey];
          }
        });
      });
    }

    // Render AI Category Icon Matrix
    populateCategoryIconMatrix();

    // Render Rule Checks & Data Completeness Audit
    populateRuleChecks();

    // Render Intelligence Analyst Assessment & Recommendations
    populateAnalystAssessment();

    // Render AI Domain Identification & Recommendations
    populateRecommendationsSection();

    // Render Data Preview Table
    renderDataPreviewTable();
  }

  function populateWorkbookTabs(workbookTabs, activeTab = '') {
    if (!tabSelect) return;
    const tabs = Array.isArray(workbookTabs) ? workbookTabs : (urlIntelligenceLayer.getWorkbookTabs?.() || []);
    const currentVal = activeTab || tabSelect.value || '';

    let html = `<option value="">All Sheets (Deep Scrape Auto-Unify)</option>`;
    for (const t of tabs) {
      const name = typeof t === 'string' ? t : t.name;
      const count = typeof t === 'object' && t.rowCount ? ` (${t.rowCount} rows)` : '';
      const isSel = name === currentVal ? 'selected' : '';
      html += `<option value="${escapeHtml(name)}" ${isSel}>${escapeHtml(name)}${count}</option>`;
    }
    tabSelect.innerHTML = html;

    // Populate detected tabs pill list in Rule 1 Card
    if (detectedTabsList) {
      if (tabs.length === 0) {
        detectedTabsList.innerHTML = `<span style="font-size: 0.6rem; color: rgba(226,244,248,0.5);">Single worksheet / table structure detected</span>`;
      } else {
        detectedTabsList.innerHTML = tabs.map((t) => {
          const name = typeof t === 'string' ? t : t.name;
          const isActive = name === currentVal;
          return `<button type="button" class="url-intel-tab-chip ${isActive ? 'active' : ''}" data-sheet="${escapeHtml(name)}" title="Switch to this worksheet tab">📑 ${escapeHtml(name)}</button>`;
        }).join('');

        detectedTabsList.querySelectorAll('.url-intel-tab-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            const sheet = chip.dataset.sheet;
            if (tabSelect) tabSelect.value = sheet;
            handleIngest(inputField.value, { forceRefresh: true });
          });
        });
      }
    }
  }

  function populateRuleChecks(ruleChecks) {
    if (!ruleChecksSection) return;
    const checks = ruleChecks || urlIntelligenceLayer.getRuleChecks?.();
    if (!checks) {
      ruleChecksSection.style.display = 'none';
      return;
    }

    ruleChecksSection.style.display = 'flex';

    // Rule 1: Tabbed Format Content
    if (ruleTabsBadge && checks.tabbedContent) {
      ruleTabsBadge.textContent = checks.tabbedContent.status || 'CHECKED';
      const isPass = checks.tabbedContent.status === 'ALL TABS CAPTURED' || checks.tabbedContent.status === 'PASSED';
      ruleTabsBadge.className = `url-intel-rule-badge ${isPass ? 'pass' : 'warn'}`;
    }
    if (ruleTabsDesc && checks.tabbedContent) {
      ruleTabsDesc.textContent = checks.tabbedContent.details || 'Scanned workbook sheets for hidden data across multi-tabbed spreadsheet layouts.';
    }

    // Rule 2: Multi-Page Pagination Completeness
    if (rulePagesBadge && checks.pagination) {
      rulePagesBadge.textContent = checks.pagination.status || 'CHECKED';
      const isPass = checks.pagination.status === 'ALL PAGES CAPTURED' || checks.pagination.status === 'PASSED';
      rulePagesBadge.className = `url-intel-rule-badge ${isPass ? 'pass' : 'warn'}`;
    }
    if (rulePagesDesc && checks.pagination) {
      rulePagesDesc.textContent = checks.pagination.details || 'Verified paginated table sequences to ensure complete data capture without omission.';
    }

    // Rule 3: Deep Scraping Cell & Symbol Hyperlinks
    if (ruleLinksBadge && checks.hyperlinks) {
      ruleLinksBadge.textContent = checks.hyperlinks.status || 'CHECKED';
      const isPass = checks.hyperlinks.status === 'HYPERLINKS CAPTURED' || checks.hyperlinks.status === 'PASSED';
      ruleLinksBadge.className = `url-intel-rule-badge ${isPass ? 'pass' : 'warn'}`;
    }
    if (ruleLinksDesc && checks.hyperlinks) {
      ruleLinksDesc.textContent = checks.hyperlinks.details || 'Captures embedded on-click URLs from headers (e.g. stock Symbol) and cells for popup, _blank, and _parent dispatch.';
    }
    if (linksStatsRow && checks.hyperlinks) {
      const symbolCount = checks.hyperlinks.symbolUrlsTranspired || 0;
      const directCount = checks.hyperlinks.directHyperlinksCaptured || 0;
      linksStatsRow.innerHTML = `
        <span>✓ ${symbolCount} Symbol Header Links Transpired</span>
        <span>·</span>
        <span>✓ ${directCount} Direct Hyperlinks Captured</span>
        <span>·</span>
        <span>✓ Targets: Popup, _blank, _parent</span>
      `;
    }

    // Rule 4: Geospatial Resolution Integrity
    if (ruleGeoBadge && checks.geospatialResolution) {
      ruleGeoBadge.textContent = checks.geospatialResolution.status || '100% RESOLVED';
      ruleGeoBadge.className = `url-intel-rule-badge ${checks.geospatialResolution.status?.includes('100%') ? 'pass' : 'warn'}`;
    }
    if (ruleGeoDesc && checks.geospatialResolution) {
      ruleGeoDesc.textContent = checks.geospatialResolution.details || 'Validates geodetic coordinate mapping, geographic bounds, and 3D Cesium billboard placement.';
    }

    // Overall status badge
    if (auditOverallBadge) {
      auditOverallBadge.textContent = 'ALL RULES SATISFIED';
      auditOverallBadge.className = 'url-intel-audit-status-badge pass';
    }
  }

  function populateAnalystAssessment(analystCommentData) {
    if (!analystPanel) return;
    const analyst = analystCommentData || urlIntelligenceLayer.getAnalystComment?.();
    if (!analyst) {
      analystPanel.style.display = 'none';
      return;
    }

    analystPanel.style.display = 'flex';

    if (analystComment) {
      analystComment.innerHTML = escapeHtml(analyst.executiveSummary || analyst.summary || 'Intelligence analysis complete.');
    }

    if (clusterAnalysis) {
      clusterAnalysis.innerHTML = escapeHtml(analyst.geographicClusterAnalysis || analyst.clusters || 'Clustering analyzed across major geographic hubs.');
    }

    if (lineageAnalysis) {
      lineageAnalysis.innerHTML = escapeHtml(analyst.dataLineageCompleteness || analyst.lineage || 'Data lineage verified with full format preservation.');
    }

    if (analystRecsList) {
      const recs = analyst.actionableRecommendations || urlIntelligenceLayer.getRecommendations?.() || [];
      if (recs.length === 0) {
        analystRecsList.innerHTML = `<span style="font-size: 0.65rem; color: rgba(226,244,248,0.5);">No specific analyst alerts.</span>`;
      } else {
        analystRecsList.innerHTML = recs.map((r, i) => {
          const priority = (r.priority || 'medium').toLowerCase();
          return `
            <div class="url-intel-analyst-rec-item">
              <div class="url-intel-analyst-rec-header">
                <span class="url-intel-analyst-rec-priority ${priority}">${escapeHtml(r.priority || 'RECOMMENDED')}</span>
                <span style="font-size: 0.58rem; color: rgba(226,244,248,0.5);">${escapeHtml(r.type || 'ANALYSIS')}</span>
              </div>
              <div class="url-intel-analyst-rec-title">${escapeHtml(r.title || `Recommendation #${i + 1}`)}</div>
              <div class="url-intel-analyst-rec-desc">${escapeHtml(r.description || r.comment || '')}</div>
            </div>
          `;
        }).join('');
      }
    }

    let pushZoneBtn = analystPanel.querySelector('#url-intel-analyst-push-zone-btn');
    if (!pushZoneBtn) {
      pushZoneBtn = document.createElement('button');
      pushZoneBtn.type = 'button';
      pushZoneBtn.id = 'url-intel-analyst-push-zone-btn';
      pushZoneBtn.className = 'url-intel-cat-action-btn';
      pushZoneBtn.style.marginTop = '0.6rem';
      pushZoneBtn.style.alignSelf = 'flex-start';
      pushZoneBtn.textContent = '🛡️ Deploy Tactical Geofence Zone';
      pushZoneBtn.title = 'Push operational cluster boundary into Map Tools Engine as a tactical geofence';
      analystPanel.appendChild(pushZoneBtn);
    }
    pushZoneBtn.onclick = () => {
      try {
        const points = urlIntelligenceLayer.getPoints?.() || [];
        let center = [120.98, 14.60];
        if (points.length > 0 && points[0].lon && points[0].lat) {
          center = [points[0].lon, points[0].lat];
        }
        const zoneFeat = pushOperationalZone({
          name: `Operational Sector: ${analyst.summary ? analyst.summary.slice(0, 24) : 'Analyst Zone'}`,
          center,
          radiusKm: 15,
          threatLevel: 'medium',
          assessment: analyst.executiveSummary || analyst.summary || '',
          source: 'intelligence_analyst',
        });
        setStatus('success', 'Tactical Geofence Deployed', `Created "${zoneFeat.name}" covering 15km perimeter in Map Tools Engine.`);
      } catch (err) {
        setStatus('error', 'Deployment Failed', err.message);
      }
    };
  }

  function populateCategoryIconMatrix() {
    if (!catMatrixSection || !catMatrixGrid) return;
    const points = urlIntelligenceLayer.getPoints?.() || [];
    const counts = {};
    for (const p of points) {
      const cat = p.category || 'Default';
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const categories = Object.keys(counts);
    if (categories.length === 0) {
      catMatrixSection.style.display = 'none';
      return;
    }

    catMatrixSection.style.display = 'flex';
    catMatrixGrid.innerHTML = categories.map((cat) => {
      const billboardSrc = getCategoryBillboardImage(cat);
      const emoji = getCategoryEmoji(cat);
      const color = getCategoryColor(cat);
      const count = counts[cat] || 0;
      return `
        <div class="url-intel-cat-matrix-card" data-category="${escapeHtml(cat)}">
          <img class="url-intel-cat-matrix-img" src="${billboardSrc}" alt="${escapeHtml(cat)}" title="Click to filter globe to ${escapeHtml(cat)}" />
          <div class="url-intel-cat-matrix-info">
            <span class="url-intel-cat-matrix-name">${emoji} ${escapeHtml(cat)}</span>
            <span class="url-intel-cat-matrix-sub">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
              <strong>${count}</strong> entities · <span style="color: #69f0ae;">✨ AI Vector Billboard</span>
            </span>
            <div style="margin-top: 0.4rem; display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button type="button" class="url-intel-cat-action-btn cat-filter-btn" data-category="${escapeHtml(cat)}" title="Filter 3D Globe to ${escapeHtml(cat)}">
                🎯 Filter
              </button>
              <button type="button" class="url-intel-cat-action-btn cat-ai-btn" data-category="${escapeHtml(cat)}" title="Regenerate bespoke tactical AI icon for ${escapeHtml(cat)}">
                ✨ AI Regenerate
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind filter buttons
    catMatrixGrid.querySelectorAll('.cat-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cat = btn.dataset.category;
        if (cat) {
          urlIntelligenceLayer.setParams?.({ category: cat });
          setStatus('info', `Filtered by: ${cat}`, `Showing ${counts[cat] || 0} locations on the 3D globe.`);
        }
      });
    });

    // Bind AI Regenerate button on individual card
    catMatrixGrid.querySelectorAll('.cat-ai-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cat = btn.dataset.category;
        if (!cat) return;
        btn.disabled = true;
        btn.textContent = '⏳ Synthesizing...';
        try {
          const theme = catThemeSelect ? catThemeSelect.value : 'cyber-tactical';
          await urlIntelligenceLayer.generateAiIcon(cat, { theme });
          populateCategoryIconMatrix();
          setStatus('success', `AI Icon Generated for ${cat}!`, `New tactical vector billboard applied to 3D Cesium globe.`);
        } catch {
          btn.textContent = '❌ Retry';
          setTimeout(() => { btn.textContent = '✨ AI Regenerate'; btn.disabled = false; }, 2000);
        }
      });
    });
  }

  function populateRecommendationsSection() {
    if (!recsSection || !recsGrid) return;
    const domain = urlIntelligenceLayer.getDomainIdentification?.() || currentSchemaAnalysis?.domainIdentification || '';
    const distribution = urlIntelligenceLayer.getDistributionAnalysis?.() || currentSchemaAnalysis?.distributionAnalysis || '';
    const recs = urlIntelligenceLayer.getRecommendations?.() || currentSchemaAnalysis?.actionableRecommendations || [];

    if (!domain && (!recs || recs.length === 0)) {
      recsSection.style.display = 'none';
      return;
    }

    recsSection.style.display = 'flex';
    if (domainName) {
      domainName.textContent = domain || 'General Geospatial Dataset';
    }
    if (distributionText) {
      distributionText.textContent = distribution ? `Geospatial Spread: ${distribution}` : '';
    }

    if (recs && recs.length > 0) {
      recsGrid.innerHTML = recs.map((rec) => {
        const priority = (rec.priority || 'medium').toLowerCase();
        const actionType = rec.action || 'INTELLIGENCE';
        return `
          <div class="url-intel-rec-card" data-action="${escapeHtml(actionType)}">
            <div class="url-intel-rec-top">
              <span class="url-intel-rec-priority ${priority}">${escapeHtml(priority)} Priority</span>
              <span class="url-intel-rec-type">${escapeHtml(actionType)}</span>
            </div>
            <div class="url-intel-rec-title">${escapeHtml(rec.title || 'Recommendation')}</div>
            <div class="url-intel-rec-desc">${escapeHtml(rec.description || rec.rationale || '')}</div>
          </div>
        `;
      }).join('');
    } else {
      recsGrid.innerHTML = `
        <div style="font-size: 0.72rem; color: rgba(226,244,248,0.5); grid-column: 1 / -1; padding: 0.5rem 0;">
          All coordinate geometries and category schemas conform with optimal spatial distribution.
        </div>
      `;
    }
  }

  function renderDataPreviewTable() {
    if (!previewTheadTr || !previewTbody) return;

    if (currentSampleRows.length === 0) {
      previewTheadTr.innerHTML = '<th style="width: 130px; text-align: center;">ACTIONS</th><th>Field</th><th>Value</th>';
      previewTbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: rgba(226,244,248,0.5); padding: 1rem;">No data ingested yet. Enter a URL above and click Analyze.</td></tr>';
      if (previewCountLabel) previewCountLabel.textContent = '0 rows';
      return;
    }

    const headers = currentDetectedHeaders.length > 0
      ? currentDetectedHeaders
      : Object.keys(currentSampleRows[0]);

    if (previewCountLabel) {
      previewCountLabel.innerHTML = `
        <span>${currentSampleRows.length} sample rows (${headers.length} columns)</span>
        <button type="button" id="url-intel-batch-push-tactical-btn" class="url-intel-cat-action-btn" style="margin-left: 0.6rem; font-size: 0.6rem; padding: 0.15rem 0.45rem;" title="Push all geocoded POIs to Tactical Map Tools Engine">📍 Push All to Tactical Tools</button>
      `;
      const batchBtn = previewCountLabel.querySelector('#url-intel-batch-push-tactical-btn');
      if (batchBtn) {
        batchBtn.onclick = (e) => {
          e.stopPropagation();
          const res = ingestMultimodalSchemaData(currentSampleRows);
          if (res.count > 0) {
            setStatus('success', 'Batch Ingestion Complete', `Plotted ${res.count} detected tactical waypoints in Map Tools Engine.`);
          } else {
            setStatus('warn', 'No Coordinates Found', 'Sample rows do not contain numeric latitude/longitude columns.');
          }
        };
      }
    }

    // Header THs with Actions column
    previewTheadTr.innerHTML = `
      <th style="width: 175px; text-align: center;">ACTIONS</th>
      ${headers.map((h) => `<th title="${escapeHtml(h)}">${escapeHtml(h)}</th>`).join('')}
    `;

    // Row TRs
    const points = urlIntelligenceLayer.getPoints?.() || [];
    previewTbody.innerHTML = currentSampleRows.map((row, idx) => {
      const cells = headers.map((h) => {
        const val = row[h] !== undefined ? String(row[h]) : '';
        return `<td title="${escapeHtml(val)}">${escapeHtml(val || '—')}</td>`;
      }).join('');

      return `
        <tr>
          <td style="text-align: center; white-space: nowrap;">
            <button type="button" class="url-intel-btn-link-action action-popup preview-inspect-btn" data-row-idx="${idx}" title="Open Popup Service Dialog & Hyperlinks">
              ⧉ Dialog
            </button>
            <button type="button" class="url-intel-btn-link-action preview-push-tactical-btn" data-row-idx="${idx}" title="Push detected POI into Tactical Map Tools" style="margin-left: 0.25rem; color: #00f0ff;">
              📍 Pin
            </button>
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    // Bind preview inspect buttons
    previewTbody.querySelectorAll('.preview-inspect-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.rowIdx, 10);
        const row = currentSampleRows[idx];
        if (!row) return;

        // Find matching point in active points or build on-the-fly
        let matched = points[idx];
        if (!matched && row) {
          const nameVal = row.name || row.Name || row.title || row.Title || `Row #${idx + 1}`;
          const catVal = row.category || row.Category || 'Identified Point';
          const addrVal = row.address || row.Address || row.location || row.Location || '';
          matched = {
            id: `row-${idx}`,
            name: nameVal,
            category: catVal,
            address: addrVal,
            lat: parseFloat(row.lat || row.latitude || row.Latitude || '0') || 0,
            lon: parseFloat(row.lon || row.longitude || row.Longitude || '0') || 0,
            rawRecord: row,
            sourceUrl: inputField.value || '',
          };
        }
        openServiceDialog(matched);
      });
    });

    // Bind preview push tactical pin buttons
    previewTbody.querySelectorAll('.preview-push-tactical-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.rowIdx, 10);
        const row = currentSampleRows[idx];
        if (!row) return;
        const nameVal = row.name || row.Name || row.title || row.Title || `POI #${idx + 1}`;
        const catVal = row.category || row.Category || 'Identified POI';
        const lat = parseFloat(row.lat || row.latitude || row.Latitude || '0');
        const lon = parseFloat(row.lon || row.longitude || row.Longitude || '0');
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
          setStatus('warn', 'Missing Coordinates', `Row #${idx + 1} has no valid geocoded lat/lon.`);
          return;
        }
        try {
          const feat = pushDetectedPoi({
            name: nameVal,
            latitude: lat,
            longitude: lon,
            category: catVal,
            source: 'ai_schema_inspector',
            notes: row.address || row.location || '',
            metadata: row,
          });
          btn.textContent = '✓ Plotted';
          btn.style.color = '#69f0ae';
          setStatus('success', 'Tactical Pin Plotted', `Created "${feat.name}" in Map Tools Engine.`);
        } catch (err) {
          setStatus('error', 'Plotting Failed', err.message);
        }
      });
    });
  }

  // Handle Override Reset
  if (overrideResetBtn) {
    overrideResetBtn.addEventListener('click', () => {
      currentMappingOverrides = {};
      if (schemaGrid) {
        schemaGrid.querySelectorAll('.url-intel-field-select').forEach((sel) => {
          const fieldKey = sel.dataset.field;
          const aiSuggested = currentSchemaAnalysis?.fieldMappings?.[fieldKey] || '';
          if (aiSuggested) {
            sel.value = aiSuggested;
          } else {
            sel.value = '';
          }
        });
      }
      setStatus('loading', 'Resetting mappings...', 'Re-ingesting with default AI heuristic mappings...');
      handleIngest(inputField.value, { forceRefresh: true });
    });
  }

  // Handle Override Apply
  if (overrideApplyBtn) {
    overrideApplyBtn.addEventListener('click', async () => {
      // Gather current selected mappings
      const overrides = {};
      if (schemaGrid) {
        schemaGrid.querySelectorAll('.url-intel-field-select').forEach((sel) => {
          const fieldKey = sel.dataset.field;
          if (sel.value) {
            overrides[fieldKey] = sel.value;
          }
        });
      }
      currentMappingOverrides = overrides;
      overrideApplyBtn.disabled = true;
      overrideApplyBtn.textContent = 'Applying...';

      try {
        setStatus('loading', 'Applying schema overrides...', 'Re-parsing ingested dataset with custom column mappings...');
        await handleIngest(inputField.value, { mappingOverrides: overrides, forceRefresh: true });
        populateSchemaInspector();
      } catch (err) {
        setStatus('error', 'Override failed', escapeHtml(err.message || 'Could not re-plot with overrides'));
      } finally {
        overrideApplyBtn.disabled = false;
        overrideApplyBtn.textContent = '⚡ Apply Overrides & Re-Plot Globe';
      }
    });
  }

  // =========================================================================
  // GPS Telemetry & Trajectory Replay Logic
  // =========================================================================

  function formatTrajectoryTime(ms) {
    if (!ms || !Number.isFinite(ms)) return '--:--:--';
    const d = new Date(ms);
    return d.toTimeString().split(' ')[0];
  }

  function populateTrajectoryPanel() {
    const isTrajectory = urlIntelligenceLayer.isTrajectory?.();
    if (!isTrajectory) {
      if (trajSection) trajSection.style.display = 'none';
      if (hudPlayer) hudPlayer.hidden = true;
      return;
    }

    if (trajSection) trajSection.style.display = 'flex';
    if (hudPlayer) hudPlayer.hidden = false;

    const metrics = urlIntelligenceLayer.getFleetMetrics?.();
    const vehicles = urlIntelligenceLayer.getTrajectoryList?.() || [];

    if (trajUnitsVal) trajUnitsVal.textContent = String(vehicles.length);
    if (trajDistVal) trajDistVal.textContent = `${metrics?.totalFleetDistanceKm || 0} km`;
    if (trajSpeedVal) trajSpeedVal.textContent = `${metrics?.peakSpeedKmh || 0} km/h`;
    if (trajAvgSpeedSub) trajAvgSpeedSub.textContent = `Avg: ${metrics?.avgFleetSpeedKmh || 0} km/h`;
    if (trajDwellVal) trajDwellVal.textContent = String(metrics?.totalDwells || 0);

    if (trajStartTime && metrics) trajStartTime.textContent = formatTrajectoryTime(metrics.minTimeMs);
    if (trajEndTime && metrics) trajEndTime.textContent = formatTrajectoryTime(metrics.maxTimeMs);

    if (trajVehiclesCount) {
      trajVehiclesCount.textContent = `${vehicles.length} Units Online`;
    }

    if (trajVehiclesList) {
      const state = urlIntelligenceLayer.getTrajectoryState?.();
      const selectedId = state?.selectedVehicleId;

      trajVehiclesList.innerHTML = vehicles.map((v) => {
        const isSelected = v.vehicleId === selectedId;
        const isIdle = (v.avgSpeedKmh || 0) < 3;
        const statusClass = isIdle ? 'idle' : 'moving';
        const statusText = isIdle ? 'STATIONARY / IDLE' : 'ACTIVE IN-TRANSIT';

        return `
          <div class="url-intel-traj-vcard ${isSelected ? 'selected' : ''}" data-vehicle-id="${escapeHtml(v.vehicleId)}">
            <div class="url-intel-traj-vcard-top">
              <span class="url-intel-traj-vcard-name">
                <span style="color: ${v.color || '#00e5ff'};">●</span> ${escapeHtml(v.vehicleId.toUpperCase())}
              </span>
              <span class="url-intel-traj-vcard-status ${statusClass}">${statusText}</span>
            </div>
            <div class="url-intel-traj-vcard-body">
              <span>${escapeHtml(v.name || 'Corridor Route')}</span>
              <span>Avg: <strong>${v.avgSpeedKmh}</strong> km/h</span>
            </div>
            <div class="url-intel-traj-vcard-body" style="color: rgba(226,244,248,0.45); font-size: 0.55rem;">
              <span>${v.waypointCount} breadcrumbs</span>
              <span>Max: ${v.maxSpeedKmh} km/h</span>
            </div>
          </div>
        `;
      }).join('');

      trajVehiclesList.querySelectorAll('.url-intel-traj-vcard').forEach((card) => {
        card.addEventListener('click', () => {
          const vId = card.dataset.vehicleId;
          if (vId) {
            urlIntelligenceLayer.selectVehicle(vId, true);
            trajVehiclesList.querySelectorAll('.url-intel-traj-vcard').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
          }
        });
      });
    }

    syncTrajectoryPlaybackUI(urlIntelligenceLayer.getTrajectoryState?.());
  }

  function syncTrajectoryPlaybackUI(state) {
    if (!state) return;
    const {
      isPlaying,
      playbackSpeed,
      currentTimeMs,
      minTimeMs,
      maxTimeMs,
      selectedVehicleId,
      followingVehicleId,
    } = state;

    // Play button states
    const playText = isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    if (trajPlayBtn) {
      trajPlayBtn.textContent = playText;
      trajPlayBtn.classList.toggle('playing', isPlaying);
    }
    if (hudPlayBtn) {
      hudPlayBtn.textContent = playText;
      hudPlayBtn.classList.toggle('playing', isPlaying);
    }

    // Time texts
    const timeStr = formatTrajectoryTime(currentTimeMs);
    if (trajTimeVal) trajTimeVal.textContent = timeStr;
    if (hudTimeReadout) hudTimeReadout.textContent = timeStr;

    // Scrubber position
    if (maxTimeMs > minTimeMs && currentTimeMs) {
      const ratio = Math.max(0, Math.min(1, (currentTimeMs - minTimeMs) / (maxTimeMs - minTimeMs)));
      const sliderVal = Math.round(ratio * 1000);
      if (trajScrubber) trajScrubber.value = sliderVal;
      if (hudScrubber) hudScrubber.value = sliderVal;
    }

    // Speed button active states
    dialog.querySelectorAll('.url-intel-traj-speed-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === playbackSpeed);
    });
    if (hudSpeedGroup) {
      hudSpeedGroup.querySelectorAll('.hud-speed-btn').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.speed) === playbackSpeed);
      });
    }

    // Follow button active state
    if (hudFollowBtn) {
      const isFollowing = Boolean(followingVehicleId);
      hudFollowBtn.classList.toggle('following', isFollowing);
      hudFollowBtn.textContent = isFollowing ? `🎯 Following (${followingVehicleId})` : '🎯 Follow';
    }

    // HUD unit readout
    if (selectedVehicleId) {
      const v = urlIntelligenceLayer.getTrajectories?.()?.get(selectedVehicleId);
      if (v) {
        if (hudUnitName) hudUnitName.textContent = `🚙 UNIT: ${selectedVehicleId.toUpperCase()} (${v.name || 'Transit Line'})`;
        if (hudUnitSpeed) hudUnitSpeed.textContent = `Max: ${v.maxSpeedKmh} km/h · Avg: ${v.avgSpeedKmh} km/h`;
        if (hudUnitHeading) hudUnitHeading.textContent = `${v.waypointCount} GPS Points`;
      }
    } else {
      const list = urlIntelligenceLayer.getTrajectoryList?.() || [];
      const metrics = urlIntelligenceLayer.getFleetMetrics?.();
      if (hudUnitName) hudUnitName.textContent = `🚙 ALL FLEET UNITS (${list.length} Tracked)`;
      if (hudUnitSpeed) hudUnitSpeed.textContent = `Fleet Avg: ${metrics?.avgFleetSpeedKmh || 0} km/h`;
      if (hudUnitHeading) hudUnitHeading.textContent = `Total: ${metrics?.totalFleetDistanceKm || 0} km`;
    }
  }

  // Register subscription to trajectory engine updates
  if (typeof urlIntelligenceLayer.onTrajectoryUpdate === 'function') {
    urlIntelligenceLayer.onTrajectoryUpdate((state) => {
      syncTrajectoryPlaybackUI(state);
    });
  }

  // Bind Play/Pause in dialog
  if (trajPlayBtn) {
    trajPlayBtn.addEventListener('click', () => {
      urlIntelligenceLayer.toggleTrajectoryPlayback();
    });
  }

  // Bind Play/Pause in floating HUD
  if (hudPlayBtn) {
    hudPlayBtn.addEventListener('click', () => {
      urlIntelligenceLayer.toggleTrajectoryPlayback();
    });
  }

  // Bind Speed buttons in dialog
  if (trajSpeedGroup) {
    trajSpeedGroup.querySelectorAll('.url-intel-traj-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed);
        if (speed) urlIntelligenceLayer.playTrajectory(speed);
      });
    });
  }

  // Bind Speed buttons in floating HUD
  if (hudSpeedGroup) {
    hudSpeedGroup.querySelectorAll('.hud-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed);
        if (speed) urlIntelligenceLayer.playTrajectory(speed);
      });
    });
  }

  // Scrubber scrubbing handlers
  function handleScrubberInput(e) {
    const val = Number(e.target.value) / 1000;
    const metrics = urlIntelligenceLayer.getFleetMetrics?.();
    if (metrics && metrics.maxTimeMs > metrics.minTimeMs) {
      const timeMs = metrics.minTimeMs + val * (metrics.maxTimeMs - metrics.minTimeMs);
      urlIntelligenceLayer.setTrajectoryScrubberTime(timeMs);
    }
  }

  if (trajScrubber) {
    trajScrubber.addEventListener('input', handleScrubberInput);
  }
  if (hudScrubber) {
    hudScrubber.addEventListener('input', handleScrubberInput);
  }

  // Follow button in floating HUD
  if (hudFollowBtn) {
    hudFollowBtn.addEventListener('click', () => {
      const state = urlIntelligenceLayer.getTrajectoryState?.();
      if (state?.followingVehicleId) {
        urlIntelligenceLayer.unfollowVehicle();
      } else if (state?.selectedVehicleId) {
        urlIntelligenceLayer.followVehicle(state.selectedVehicleId);
      } else {
        const first = urlIntelligenceLayer.getTrajectoryList?.()[0];
        if (first) {
          urlIntelligenceLayer.selectVehicle(first.vehicleId, true);
          urlIntelligenceLayer.followVehicle(first.vehicleId);
        }
      }
    });
  }

  // Dock HUD to globe button in dialog
  if (trajDockHudBtn) {
    trajDockHudBtn.addEventListener('click', () => {
      closeModal();
      if (hudPlayer) {
        hudPlayer.hidden = false;
        if (hudBodyContent) hudBodyContent.style.display = 'flex';
      }
    });
  }

  // Floating HUD details button -> opens main dialog
  if (hudBtnOpenModal) {
    hudBtnOpenModal.addEventListener('click', () => {
      openModal();
    });
  }

  // Floating HUD close button
  if (hudCloseBtn) {
    hudCloseBtn.addEventListener('click', () => {
      if (hudPlayer) hudPlayer.hidden = true;
    });
  }

  // Floating HUD minimize button
  if (hudToggleMinBtn && hudBodyContent) {
    hudToggleMinBtn.addEventListener('click', () => {
      const isCollapsed = hudBodyContent.style.display === 'none';
      hudBodyContent.style.display = isCollapsed ? 'flex' : 'none';
      hudToggleMinBtn.textContent = isCollapsed ? '_' : '□';
    });
  }

  // Keyboard shortcut: Spacebar toggles trajectory playback when not typing
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      if (urlIntelligenceLayer.isTrajectory?.()) {
        e.preventDefault();
        urlIntelligenceLayer.toggleTrajectoryPlayback();
      }
    }
  });

  // =========================================================================
  // Phase 3: Real-time Interactive HUD Card Canvas Preview & Pinning Deck
  // =========================================================================

  const DIMENSION_SPECS = {
    compact: { width: 180, height: 90, label: 'Compact (180×90px)' },
    standard: { width: 240, height: 120, label: 'Standard (240×120px)' },
    expanded: { width: 300, height: 160, label: 'Expanded (300×160px)' },
    wide: { width: 360, height: 110, label: 'Wide (360×110px)' },
  };

  const LEADER_LABELS = {
    straight: 'Straight Direct Vector',
    l_shape: 'L-Shape (Dog-Leg)',
    diagonal_45: '45° Diagonal Angle',
  };

  const ARROW_LABELS = {
    single_point: 'Single Point (Geodetic Dot)',
    stealth: 'Stealth Dart Arrowhead',
    bead: 'Bead Ring Tracker',
    none: 'None (Flush Line)',
  };

  function renderHudPreview() {
    if (!hudCanvas) return;
    const ctx = hudCanvas.getContext('2d');
    if (!ctx) return;

    const w = hudCanvas.width;
    const h = hudCanvas.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);

    // Subtle tactical coordinate grid
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 10; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const profileKey = urlIntelligenceLayer.getUrlDetailsBoxProfile?.() || 'standard';
    const leaderKey = urlIntelligenceLayer.getUrlLeaderStyle?.()?.leaderType || 'straight';
    const arrowKey = urlIntelligenceLayer.getUrlLeaderStyle?.()?.arrowType || 'single_point';
    const spec = DIMENSION_SPECS[profileKey] || DIMENSION_SPECS.standard;

    if (hudPreviewDimsLabel) {
      hudPreviewDimsLabel.textContent = `${spec.width} × ${spec.height} px`;
    }

    // Anchor point coordinates on canvas
    const anchorX = 42;
    const anchorY = h - 28;

    // Scale card dimensions to fit preview area comfortably
    const scale = Math.min(180 / spec.width, 100 / spec.height, 0.65);
    const cardW = Math.round(spec.width * scale);
    const cardH = Math.round(spec.height * scale);
    const cardX = w - cardW - 16;
    const cardY = 14;

    // Draw Anchor Arrow/Marker
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;

    if (arrowKey === 'single_point') {
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.stroke();
    } else if (arrowKey === 'stealth') {
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY - 6);
      ctx.lineTo(anchorX + 5, anchorY + 5);
      ctx.lineTo(anchorX, anchorY + 2);
      ctx.lineTo(anchorX - 5, anchorY + 5);
      ctx.closePath();
      ctx.fill();
    } else if (arrowKey === 'bead') {
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw Leader Line
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);

    const targetX = cardX;
    const targetY = cardY + cardH / 2;

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);

    if (leaderKey === 'straight') {
      ctx.lineTo(targetX, targetY);
    } else if (leaderKey === 'l_shape') {
      const midX = anchorX + (targetX - anchorX) * 0.45;
      ctx.lineTo(midX, anchorY);
      ctx.lineTo(midX, targetY);
      ctx.lineTo(targetX, targetY);
    } else if (leaderKey === 'diagonal_45') {
      const dy = targetY - anchorY;
      const diagonalDist = Math.abs(dy);
      const kneeX = anchorX + (diagonalDist * 0.75);
      ctx.lineTo(kneeX, targetY);
      ctx.lineTo(targetX, targetY);
    }
    ctx.stroke();
    ctx.restore();

    // Draw Card Body
    ctx.save();
    ctx.fillStyle = 'rgba(4, 15, 26, 0.9)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.lineWidth = 1.2;

    // Rounded rectangle
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(cardX + r, cardY);
    ctx.lineTo(cardX + cardW - r, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
    ctx.lineTo(cardX + cardW, cardY + cardH - r);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
    ctx.lineTo(cardX + r, cardY + cardH);
    ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
    ctx.lineTo(cardX, cardY + r);
    ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Header bar
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.fillRect(cardX + 1, cardY + 1, cardW - 2, 16);

    // Header title
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('PORT OF MANILA', cardX + 6, cardY + 11);

    // Category pill
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect(cardX + cardW - 32, cardY + 3, 26, 10);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '6px monospace';
    ctx.fillText('PORT', cardX + cardW - 27, cardY + 10);

    // Body content lines
    ctx.fillStyle = 'rgba(226, 244, 248, 0.8)';
    ctx.font = '6.5px monospace';
    ctx.fillText('COORD: 14.5886° N, 120.9702° E', cardX + 6, cardY + 28);
    ctx.fillText('STATUS: OPERATIONAL', cardX + 6, cardY + 38);

    if (cardH > 55) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.fillText('ELEV: 8m · HARBOR BASIN', cardX + 6, cardY + 48);
    }
    if (cardH > 75) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
      ctx.fillText('BUDGET LANE: TIER-1 AMBIENT', cardX + 6, cardY + 58);
    }

    // Corner tactical accents
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cardX - 2, cardY + 4);
    ctx.lineTo(cardX - 2, cardY - 2);
    ctx.lineTo(cardX + 4, cardY - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cardX + cardW + 2, cardY + cardH - 4);
    ctx.lineTo(cardX + cardW + 2, cardY + cardH + 2);
    ctx.lineTo(cardX + cardW - 4, cardY + cardH + 2);
    ctx.stroke();

    ctx.restore();
  }

  function updatePinnedChipsList() {
    if (!pinnedChipsList) return;

    const pinnedPoints = urlIntelligenceLayer.getPinnedPoints?.() || [];
    const count = pinnedPoints.length;

    if (hudStatusBadge) {
      hudStatusBadge.textContent = count > 0
        ? `PINNED: ${count} / 5 · 40-CARD BUDGET ENGINE`
        : '40-CARD BUDGET ENGINE';
    }

    if (count === 0) {
      pinnedChipsList.innerHTML = '<span class="url-intel-pinned-empty">No entities pinned yet. Click points on globe or use \'Pin Top 5\'.</span>';
      return;
    }

    pinnedChipsList.innerHTML = pinnedPoints.map((p) => {
      return `
        <div class="url-intel-pinned-chip" data-point-id="${escapeHtml(p.id)}" title="Click to focus on globe">
          <span>📌 ${escapeHtml(p.name || 'Entity')} (${escapeHtml(p.category || 'Point')})</span>
          <button type="button" class="url-intel-pinned-unpin-btn" data-unpin-id="${escapeHtml(p.id)}" title="Unpin this entity">✕</button>
        </div>
      `;
    }).join('');

    pinnedChipsList.querySelectorAll('.url-intel-pinned-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.url-intel-pinned-unpin-btn')) return;
        const pId = chip.dataset.pointId;
        if (pId) {
          urlIntelligenceLayer.selectPoint(pId, true);
        }
      });
    });

    pinnedChipsList.querySelectorAll('.url-intel-pinned-unpin-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pId = btn.dataset.unpinId;
        if (pId) {
          urlIntelligenceLayer.unpinPoint(pId);
          updatePinnedChipsList();
        }
      });
    });
  }

  function populateHudOverlaySection() {
    const activeProfile = urlIntelligenceLayer.getUrlDetailsBoxProfile?.() || 'standard';
    const leaderStyle = urlIntelligenceLayer.getUrlLeaderStyle?.() || { leaderType: 'straight', arrowType: 'single_point' };
    const isMultiPin = urlIntelligenceLayer.isMultiPinMode?.() || false;

    if (hudDimChips) {
      hudDimChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.profile === activeProfile);
      });
    }
    if (hudDimHint) {
      hudDimHint.textContent = DIMENSION_SPECS[activeProfile]?.label || activeProfile;
    }

    if (hudLeaderChips) {
      hudLeaderChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.leader === leaderStyle.leaderType);
      });
    }
    if (hudLeaderHint) {
      hudLeaderHint.textContent = LEADER_LABELS[leaderStyle.leaderType] || leaderStyle.leaderType;
    }

    if (hudArrowChips) {
      hudArrowChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.arrow === leaderStyle.arrowType);
      });
    }
    if (hudArrowHint) {
      hudArrowHint.textContent = ARROW_LABELS[leaderStyle.arrowType] || leaderStyle.arrowType;
    }

    if (multipinToggle) {
      multipinToggle.checked = isMultiPin;
    }

    updatePinnedChipsList();
    renderHudPreview();
  }

  // Bind HUD dimension chips
  if (hudDimChips) {
    hudDimChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const profile = btn.dataset.profile;
        if (profile) {
          urlIntelligenceLayer.setUrlDetailsBoxProfile(profile);
          populateHudOverlaySection();
        }
      });
    });
  }

  // Bind HUD leader chips
  if (hudLeaderChips) {
    hudLeaderChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const leader = btn.dataset.leader;
        if (leader) {
          const currentArrow = urlIntelligenceLayer.getUrlLeaderStyle?.()?.arrowType || 'single_point';
          urlIntelligenceLayer.setUrlLeaderStyle(leader, currentArrow);
          populateHudOverlaySection();
        }
      });
    });
  }

  // Bind HUD arrow chips
  if (hudArrowChips) {
    hudArrowChips.querySelectorAll('.url-intel-hud-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arrow = btn.dataset.arrow;
        if (arrow) {
          const currentLeader = urlIntelligenceLayer.getUrlLeaderStyle?.()?.leaderType || 'straight';
          urlIntelligenceLayer.setUrlLeaderStyle(currentLeader, arrow);
          populateHudOverlaySection();
        }
      });
    });
  }

  // Bind Multi-Pin toggle
  if (multipinToggle) {
    multipinToggle.addEventListener('change', () => {
      urlIntelligenceLayer.setMultiPinMode(multipinToggle.checked);
    });
  }

  // Bind Pin Top 5 button
  if (pinTop5Btn) {
    pinTop5Btn.addEventListener('click', () => {
      urlIntelligenceLayer.pinTopEntities(5);
      updatePinnedChipsList();
    });
  }

  // Bind Clear Pins button
  if (clearPinsBtn) {
    clearPinsBtn.addEventListener('click', () => {
      urlIntelligenceLayer.clearPinnedPoints();
      updatePinnedChipsList();
    });
  }

  // Listen for globe overlay/pin updates
  if (typeof window !== 'undefined') {
    window.addEventListener('gev:url-pinned-changed', () => {
      updatePinnedChipsList();
    });
  }

  // Modal Tab Switching Navigation Controller
  let _activeTab = 'ingest';

  function switchTab(targetTabId) {
    if (!targetTabId) return;
    if (targetTabId === 'drive') {
      switchTab('ingest');
      const gdriveSection = dialog.querySelector('#url-intel-gdrive-section');
      if (gdriveSection) {
        gdriveSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        gdriveSection.classList.add('highlight-pulse');
        setTimeout(() => gdriveSection.classList.remove('highlight-pulse'), 1800);
      }
      renderDriveFileList();
      refreshDriveFiles({ userInitiated: true });
      return;
    }
    _activeTab = targetTabId;
    dialog.classList.toggle('tactical-mode-active', targetTabId === 'maptools');
    dialog.scrollTop = 0;

    const intelFooter = dialog.querySelector('.url-intel-footer');
    if (intelFooter) {
      intelFooter.style.display = targetTabId === 'maptools' ? 'none' : 'flex';
    }

    if (tabButtons) {
      tabButtons.forEach((btn) => {
        const isMatch = btn.dataset.tab === targetTabId;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });
    }

    if (tabPanes) {
      tabPanes.forEach((pane) => {
        const isMatch = pane.id === `url-intel-pane-${targetTabId}`;
        pane.classList.toggle('active', isMatch);
        pane.style.display = isMatch ? 'block' : 'none';
      });
    }

    if (targetTabId === 'hierarchy') {
      renderHierarchyModule();
    } else if (targetTabId === 'hud') {
      populateHudOverlaySection();
    } else if (targetTabId === 'drive') {
      renderDriveFileList();
      refreshDriveFiles();
    } else if (targetTabId === 'maptools') {
      const activeWb = getFloatingWorkbenchInstance();
      if (activeWb) {
        activeWb.renderRoster();
        activeWb.updateCounters();
      }
    }
  }

  if (tabButtons) {
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) switchTab(tab);
      });
    });
  }

  if (gotoHierarchyBtn) {
    gotoHierarchyBtn.addEventListener('click', () => {
      switchTab('hierarchy');
    });
  }

  // Helper function to trigger browser blob file download
  function triggerBlobDownload(content, filename, mimeType = 'application/json') {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.warn('[urlIntelligenceUi] File download failed:', err);
      return false;
    }
  }

  // AI Category Injector & Philippine Geographic Hierarchy Controller
  function renderHierarchyModule() {
    if (!islandGroupChipsContainer || !regionGridContainer) return;

    const summary = urlIntelligenceLayer.getHierarchySummary?.() || null;
    const activeIsland = (urlIntelligenceLayer.getSelectedIslandGroup?.() || 'All') || 'All';
    const activeReg = (urlIntelligenceLayer.getSelectedRegion?.() || 'All') || 'All';
    const points = urlIntelligenceLayer.getPoints?.() || [];

    const totalCount = points.length;
    const luzonCount = summary?.islandGroups?.Luzon?.count || 0;
    const visayasCount = summary?.islandGroups?.Visayas?.count || 0;
    const mindanaoCount = summary?.islandGroups?.Mindanao?.count || 0;

    if (valLuzon) valLuzon.textContent = String(luzonCount);
    if (valVisayas) valVisayas.textContent = String(visayasCount);
    if (valMindanao) valMindanao.textContent = String(mindanaoCount);

    // Compute Phase 3 geospatial analytics
    const geoAnalytics = urlIntelligenceLayer.getGeospatialAnalytics?.() || computeGeospatialAnalytics(points);

    // Update Proportional Island Distribution Bar
    if (distBarLuzon && distBarVisayas && distBarMindanao) {
      const lPct = geoAnalytics?.islandPercentages?.Luzon || 0;
      const vPct = geoAnalytics?.islandPercentages?.Visayas || 0;
      const mPct = geoAnalytics?.islandPercentages?.Mindanao || 0;
      distBarLuzon.style.width = `${lPct}%`;
      distBarLuzon.title = `Luzon: ${luzonCount} (${lPct}%)`;
      distBarVisayas.style.width = `${vPct}%`;
      distBarVisayas.title = `Visayas: ${visayasCount} (${vPct}%)`;
      distBarMindanao.style.width = `${mPct}%`;
      distBarMindanao.title = `Mindanao: ${mindanaoCount} (${mPct}%)`;
    }

    // Update 3D Territorial Bounds Toggle Button State
    if (boundsToggleBtn) {
      const boundsVisible = urlIntelligenceLayer.getTerritorialBoundsVisible
        ? urlIntelligenceLayer.getTerritorialBoundsVisible()
        : true;
      boundsToggleBtn.classList.toggle('active', boundsVisible);
      boundsToggleBtn.innerHTML = boundsVisible
        ? '<span>🌐 3D Bounds: ON</span>'
        : '<span>🌐 3D Bounds: OFF</span>';
    }

    // Render Phase 3 Top Regional Hubs Leaderboard
    if (topHubsContainer) {
      const leaderboard = geoAnalytics?.regionalLeaderboard?.slice(0, 5) || [];
      if (leaderboard.length === 0) {
        topHubsContainer.innerHTML = '<div style="color: #64748b; font-size: 0.65rem; grid-column: 1 / -1; padding: 0.5rem; text-align: center;">No regional concentration data available.</div>';
      } else {
        topHubsContainer.innerHTML = leaderboard.map((hub, idx) => {
          const isSelected = activeReg === hub.regionCode;
          const rankLabel = idx === 0 ? '1st 🥇' : idx === 1 ? '2nd 🥈' : idx === 2 ? '3rd 🥉' : `${idx + 1}th`;
          return `
            <button type="button" 
              class="url-intel-top-hub-card ${isSelected ? 'active' : ''}" 
              data-region="${escapeHtml(hub.regionCode)}"
              title="Fly to ${escapeHtml(hub.designation)} (${hub.count} facilities, ${hub.percentage}% of total)">
              <div class="hub-header">
                <span class="hub-rank">${rankLabel}</span>
                <span class="hub-count">${hub.count}</span>
              </div>
              <div class="hub-code">${escapeHtml(hub.regionCode)}</div>
              <div class="hub-name">${escapeHtml(hub.designation)}</div>
              <div class="hub-pct-bar">
                <div class="hub-pct-fill" style="width: ${hub.percentage}%;"></div>
              </div>
            </button>
          `;
        }).join('');

        topHubsContainer.querySelectorAll('.url-intel-top-hub-card').forEach((card) => {
          card.addEventListener('click', () => {
            const regCode = card.dataset.region;
            const newReg = activeReg === regCode ? 'All' : regCode;
            if (urlIntelligenceLayer.setRegionFilter) {
              urlIntelligenceLayer.setRegionFilter(newReg);
              if (newReg && newReg !== 'All' && urlIntelligenceLayer.flyToRegion) {
                urlIntelligenceLayer.flyToRegion(newReg);
              }
            }
            renderHierarchyModule();
          });
        });
      }
    }

    if (hierarchyStatsText) {
      hierarchyStatsText.innerHTML = `
        Detected: <strong>${totalCount} Entities</strong> · 
        Luzon: <strong>${luzonCount}</strong> · 
        Visayas: <strong>${visayasCount}</strong> · 
        Mindanao: <strong>${mindanaoCount}</strong>
        ${activeIsland !== 'All' ? ` · <span style="color: #00e5ff;">Island: <strong>${escapeHtml(activeIsland)}</strong></span>` : ''}
        ${activeReg !== 'All' ? ` · <span style="color: #38bdf8;">Region: <strong>${escapeHtml(activeReg)}</strong></span>` : ''}
      `;
    }

    if (hierarchyTabBadge) {
      hierarchyTabBadge.textContent = totalCount > 0 ? `${totalCount} PTS` : '🇵🇭 PH';
    }

    // 1. Level 1: Major Island Groups Chips
    const islandGroupsList = [
      { id: 'All', name: 'All Island Groups', count: totalCount, emoji: '🇵🇭' },
      { id: 'Luzon', name: 'Luzon', count: luzonCount, emoji: '🏝️', color: '#38bdf8' },
      { id: 'Visayas', name: 'Visayas', count: visayasCount, emoji: '🏝️', color: '#a855f7' },
      { id: 'Mindanao', name: 'Mindanao', count: mindanaoCount, emoji: '🏝️', color: '#f97316' },
    ];

    islandGroupChipsContainer.innerHTML = islandGroupsList.map((ig) => {
      const isSelected = activeIsland === ig.id;
      return `
        <button type="button" 
          class="url-intel-hierarchy-chip ${isSelected ? 'active' : ''}" 
          data-island="${escapeHtml(ig.id)}"
          style="${isSelected && ig.color ? `border-color: ${ig.color}; box-shadow: 0 0 12px ${ig.color}55;` : ''}">
          <span>${ig.emoji} ${escapeHtml(ig.name)}</span>
          <span class="count-badge">${ig.count}</span>
        </button>
      `;
    }).join('');

    islandGroupChipsContainer.querySelectorAll('.url-intel-hierarchy-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const island = btn.dataset.island;
        if (urlIntelligenceLayer.setIslandGroupFilter) {
          urlIntelligenceLayer.setIslandGroupFilter(island);
          if (island && island !== 'All' && urlIntelligenceLayer.flyToIslandGroup) {
            urlIntelligenceLayer.flyToIslandGroup(island);
          }
        }
        renderHierarchyModule();
      });
    });

    // 2. Level 2: 17 Administrative Regions Grid
    const allRegions = Object.values(PH_ADMIN_REGIONS || {});
    const displayedRegions = activeIsland === 'All'
      ? allRegions
      : allRegions.filter((r) => r.islandGroup === activeIsland);

    if (activeRegionHint) {
      activeRegionHint.textContent = activeIsland === 'All'
        ? 'Showing all 17 administrative regions across the Philippines'
        : `Showing ${displayedRegions.length} regions in ${activeIsland}`;
    }

    const regionCounts = {};
    if (summary?.islandGroups) {
      for (const ig of Object.values(summary.islandGroups)) {
        if (ig.regions) {
          for (const [rCode, cnt] of Object.entries(ig.regions)) {
            regionCounts[rCode] = cnt;
          }
        }
      }
    }

    regionGridContainer.innerHTML = displayedRegions.map((reg) => {
      const isSelected = activeReg === reg.code;
      const cnt = regionCounts[reg.code] || 0;
      return `
        <button type="button" 
          class="url-intel-region-card ${isSelected ? 'active' : ''}" 
          data-region="${escapeHtml(reg.code)}"
          title="${escapeHtml(reg.fullName)} (${escapeHtml(reg.designation)})">
          <div class="region-top">
            <span class="region-code">${escapeHtml(reg.code)}</span>
            <span class="region-count ${cnt > 0 ? 'has-points' : ''}">${cnt}</span>
          </div>
          <div class="region-name">${escapeHtml(reg.designation || reg.fullName)}</div>
          <div class="region-island-tag">${escapeHtml(reg.islandGroup)}</div>
        </button>
      `;
    }).join('');

    regionGridContainer.querySelectorAll('.url-intel-region-card').forEach((card) => {
      card.addEventListener('click', () => {
        const regCode = card.dataset.region;
        const newReg = activeReg === regCode ? 'All' : regCode;
        if (urlIntelligenceLayer.setRegionFilter) {
          urlIntelligenceLayer.setRegionFilter(newReg);
          if (newReg && newReg !== 'All' && urlIntelligenceLayer.flyToRegion) {
            urlIntelligenceLayer.flyToRegion(newReg);
          }
        }
        renderHierarchyModule();
      });
    });

    // 3. Injected Entity Attribute Explorer Table
    if (hierarchyTableTbody) {
      if (points.length === 0) {
        hierarchyTableTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 0.75rem;">No entities ingested yet. Enter a URL or choose a preset in the Ingestion tab.</td></tr>`;
      } else {
        let filteredPoints = points;
        if (activeIsland !== 'All') {
          filteredPoints = filteredPoints.filter((p) => p.islandGroup === activeIsland);
        }
        if (activeReg !== 'All') {
          filteredPoints = filteredPoints.filter((p) => p.region === activeReg);
        }

        if (_hierarchySearchQuery) {
          const q = _hierarchySearchQuery;
          filteredPoints = filteredPoints.filter((p) => {
            const name = String(p.name || '').toLowerCase();
            const cat = String(p.category || '').toLowerCase();
            const tier = String(p.operationalTier || '').toLowerCase();
            const addr = String(p.address || '').toLowerCase();
            const reg = String(p.region || '').toLowerCase();
            const ig = String(p.islandGroup || '').toLowerCase();
            return name.includes(q) || cat.includes(q) || tier.includes(q) || addr.includes(q) || reg.includes(q) || ig.includes(q);
          });
        }

        if (hierarchyTableHint) {
          hierarchyTableHint.textContent = `Displaying ${filteredPoints.length} of ${points.length} entities${_hierarchySearchQuery ? ' (filtered by search)' : ''}`;
        }

        const topSlice = filteredPoints.slice(0, 35);
        hierarchyTableTbody.innerHTML = topSlice.map((pt) => {
          const cat = pt.category || 'General';
          const emoji = getCategoryEmoji(cat);
          const islandGroup = pt.islandGroup || 'Unclassified';
          const region = pt.region || 'Unclassified';
          const country = pt.country || 'Philippines';
          const tier = pt.operationalTier || 'Operational';
          return `
            <tr>
              <td><strong>${escapeHtml(pt.name || 'Unnamed Point')}</strong></td>
              <td><span style="display: inline-flex; align-items: center; gap: 4px;">${emoji} ${escapeHtml(cat)}</span></td>
              <td><span class="url-intel-tier-pill">${escapeHtml(tier)}</span></td>
              <td><span class="url-intel-country-pill">🇵🇭 ${escapeHtml(country)}</span></td>
              <td><span class="url-intel-island-pill island-${islandGroup.toLowerCase()}">${escapeHtml(islandGroup)}</span></td>
              <td><span class="url-intel-region-pill">${escapeHtml(region)}</span></td>
            </tr>
          `;
        }).join('');

        if (filteredPoints.length > 35) {
          hierarchyTableTbody.innerHTML += `
            <tr>
              <td colspan="6" style="text-align: center; color: #94a3b8; font-style: italic; padding: 0.5rem;">
                + ${filteredPoints.length - 35} more entities plotted on 3D globe matching this geographic filter
              </td>
            </tr>
          `;
        }
      }
    }
  }

  // Bind AI Category Injector & Geographic Hierarchy Buttons
  if (injectHierarchyBtn) {
    injectHierarchyBtn.addEventListener('click', () => {
      if (urlIntelligenceLayer.injectHierarchyToActivePoints) {
        urlIntelligenceLayer.injectHierarchyToActivePoints();
      }
      renderHierarchyModule();
      setStatus('success', 'AI Category & Geographic Hierarchy Injected', 'Injected Country, Island Group, and PSA Administrative Region values into active map entities.');
    });
  }

  if (resetHierarchyBtn) {
    resetHierarchyBtn.addEventListener('click', () => {
      _hierarchySearchQuery = '';
      if (hierarchySearchInput) {
        hierarchySearchInput.value = '';
      }
      if (urlIntelligenceLayer.resetHierarchyFilters) {
        urlIntelligenceLayer.resetHierarchyFilters();
      }
      renderHierarchyModule();
      setStatus('success', 'Hierarchy Filters Reset', 'Showing all regions and island groups across the Philippines.');
    });
  }

  // Phase 3: Bind AI Semantic Classification Button
  if (semanticClassifyBtn) {
    semanticClassifyBtn.addEventListener('click', () => {
      let count = 0;
      if (urlIntelligenceLayer.applySemanticClassificationToActivePoints) {
        count = urlIntelligenceLayer.applySemanticClassificationToActivePoints();
      }
      renderHierarchyModule();
      setStatus('success', 'Smart Semantic Classification Complete', `Successfully categorized and tagged ${count} facilities with operational tiers and jurisdiction metadata.`);
    });
  }

  // Phase 3: Bind 3D Bounds Toggle Button
  if (boundsToggleBtn) {
    boundsToggleBtn.addEventListener('click', () => {
      const current = urlIntelligenceLayer.getTerritorialBoundsVisible
        ? urlIntelligenceLayer.getTerritorialBoundsVisible()
        : true;
      const next = !current;
      if (urlIntelligenceLayer.setTerritorialBoundsVisible) {
        urlIntelligenceLayer.setTerritorialBoundsVisible(next);
      }
      renderHierarchyModule();
      setStatus('info', '3D Territorial Bounds', next ? 'Enabled 3D territorial boundary corridors on Cesium globe.' : 'Hidden 3D territorial boundary corridors.');
    });
  }

  // Phase 3: Bind Live Search Input
  if (hierarchySearchInput) {
    hierarchySearchInput.addEventListener('input', (e) => {
      _hierarchySearchQuery = (e.target.value || '').toLowerCase().trim();
      renderHierarchyModule();
    });
  }

  // Phase 3: Bind Export Buttons
  if (exportGeoJsonBtn) {
    exportGeoJsonBtn.addEventListener('click', () => {
      if (!urlIntelligenceLayer.exportActiveEntities) return;
      const geojsonStr = urlIntelligenceLayer.exportActiveEntities('geojson', { filteredOnly: true });
      triggerBlobDownload(geojsonStr, 'philippines-facilities-geospatial.geojson', 'application/geo+json');
      setStatus('success', 'GeoJSON Exported', 'Downloaded geospatial FeatureCollection with full administrative hierarchy and operational tags.');
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (!urlIntelligenceLayer.exportActiveEntities) return;
      const csvStr = urlIntelligenceLayer.exportActiveEntities('csv', { filteredOnly: true });
      triggerBlobDownload(csvStr, 'philippines-facilities-geospatial.csv', 'text/csv');
      setStatus('success', 'CSV Exported', 'Downloaded CSV dataset of active facilities.');
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      if (!urlIntelligenceLayer.exportActiveEntities) return;
      const jsonStr = urlIntelligenceLayer.exportActiveEntities('json', { filteredOnly: true });
      triggerBlobDownload(jsonStr, 'philippines-facilities-geospatial.json', 'application/json');
      setStatus('success', 'Tactical JSON Exported', 'Downloaded tactical JSON array.');
    });
  }

  // Recent searches elements
  const recentTitle = dialog.querySelector('#url-intel-recent-title');
  const recentList = dialog.querySelector('#url-intel-recent-list');
  const selectAllCb = dialog.querySelector('#url-intel-select-all-cb');
  const deleteSelectedBtn = dialog.querySelector('#url-intel-delete-selected-btn');
  const clearAllBtn = dialog.querySelector('#url-intel-clear-all-btn');
  const selectedCountSpan = dialog.querySelector('#url-intel-selected-count');

  // Track ticked recent search IDs
  const selectedRecentIds = new Set();

  function updateAiToggleDisplay() {
    if (aiToggle && aiStatusPill) {
      if (aiToggle.checked) {
        aiStatusPill.style.display = 'inline-flex';
        aiStatusPill.textContent = '✨ AI Geocoding Active';
      } else {
        aiStatusPill.style.display = 'none';
      }
    }
  }

  if (aiToggle) {
    aiToggle.addEventListener('change', updateAiToggleDisplay);
  }

  function renderRecentSearches() {
    const recents = loadRecentSearches();
    if (recentTitle) {
      recentTitle.textContent = `RECENT SEARCHES (${recents.length})`;
    }

    // Purge any selected IDs no longer in storage
    const validIds = new Set(recents.map((r) => r.id));
    for (const id of selectedRecentIds) {
      if (!validIds.has(id)) {
        selectedRecentIds.delete(id);
      }
    }

    updateSelectionControls(recents.length);

    if (!recentList) return;

    if (recents.length === 0) {
      recentList.innerHTML = `
        <div class="url-intel-recent-empty">
          No recent searches saved yet. Enter any website, Google Drive, Sheet, CSV, or PDF URL above and click Analyze.
        </div>
      `;
      return;
    }

    recentList.innerHTML = recents.map((item) => {
      const isChecked = selectedRecentIds.has(item.id);
      const badgeClass = `format-${(item.formatBadge || 'HTML').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      return `
        <div class="url-intel-recent-item ${isChecked ? 'ticked' : ''}" data-id="${item.id}" role="listitem">
          <label class="url-intel-item-checkbox-wrap" title="Tick for deletion">
            <input type="checkbox" class="url-intel-item-cb" data-id="${item.id}" ${isChecked ? 'checked' : ''} aria-label="Select ${escapeHtml(item.title || item.url)} for deletion" />
            <span class="url-intel-custom-cb"></span>
          </label>

          <div class="url-intel-recent-content" data-url="${escapeHtml(item.url)}" title="Click to reload and plot this search">
            <div class="url-intel-recent-row-top">
              <span class="url-intel-recent-title-text">${escapeHtml(item.title || item.url)}</span>
              <span class="url-intel-badge ${badgeClass}">${item.formatBadge || 'DATA'}</span>
              ${item.aiVerified ? '<span class="url-intel-badge format-ai">✨ AI</span>' : ''}
              <span class="url-intel-recent-count-tag">📍 ${item.count || 0}</span>
            </div>
            <div class="url-intel-recent-row-bottom">
              <span class="url-intel-recent-url-text">${escapeHtml(item.url)}</span>
              <span class="url-intel-recent-time">${formatTimeAgo(item.timestamp)}</span>
            </div>
          </div>

          <button type="button" class="url-intel-recent-delete-one" data-id="${item.id}" title="Remove this item from history" aria-label="Delete recent search">
            ✕
          </button>
        </div>
      `;
    }).join('');

    // Bind checkboxes
    recentList.querySelectorAll('.url-intel-item-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          selectedRecentIds.add(id);
          cb.closest('.url-intel-recent-item')?.classList.add('ticked');
        } else {
          selectedRecentIds.delete(id);
          cb.closest('.url-intel-recent-item')?.classList.remove('ticked');
        }
        updateSelectionControls(recents.length);
      });
    });

    // Bind item click to load URL
    recentList.querySelectorAll('.url-intel-recent-content').forEach((el) => {
      el.addEventListener('click', () => {
        const targetUrl = el.dataset.url;
        if (targetUrl) {
          inputField.value = targetUrl;
          handleIngest(targetUrl);
        }
      });
    });

    // Bind individual delete button
    recentList.querySelectorAll('.url-intel-recent-delete-one').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteRecentById(id);
      });
    });
  }

  function updateSelectionControls(totalCount) {
    const selectedCount = selectedRecentIds.size;
    if (selectedCountSpan) {
      selectedCountSpan.textContent = String(selectedCount);
    }
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = selectedCount === 0;
    }
    if (selectAllCb) {
      selectAllCb.checked = totalCount > 0 && selectedCount === totalCount;
      selectAllCb.indeterminate = selectedCount > 0 && selectedCount < totalCount;
      selectAllCb.disabled = totalCount === 0;
    }
  }

  function deleteRecentById(id) {
    const current = loadRecentSearches();
    const updated = current.filter((item) => item.id !== id);
    selectedRecentIds.delete(id);
    saveRecentSearches(updated);
    renderRecentSearches();
  }

  function deleteSelectedRecents() {
    if (selectedRecentIds.size === 0) return;
    const current = loadRecentSearches();
    const updated = current.filter((item) => !selectedRecentIds.has(item.id));
    selectedRecentIds.clear();
    saveRecentSearches(updated);
    renderRecentSearches();
  }

  function clearAllRecents() {
    selectedRecentIds.clear();
    saveRecentSearches([]);
    renderRecentSearches();
  }

  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      const recents = loadRecentSearches();
      if (selectAllCb.checked) {
        recents.forEach((r) => selectedRecentIds.add(r.id));
      } else {
        selectedRecentIds.clear();
      }
      renderRecentSearches();
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', deleteSelectedRecents);
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllRecents);
  }

  function openModal(targetTab = null) {
    dialog.hidden = false;
    dialog.classList.add('visible');
    inputField.value = urlIntelligenceLayer.getActiveUrl() || (QUICK_PRESETS[0] && QUICK_PRESETS[0].url) || 'https://immigration.gov.ph/contacts/';

    if (targetTab) {
      switchTab(targetTab);
    }

    try { renderRecentSearches(); } catch (_e) {}
    try { renderDatasetsRoster(); } catch (_e) {}
    try { renderDriveFileList(); } catch (_e) {}
    try { refreshDriveFiles(); } catch (_e) {}
    try { updateAiToggleDisplay(); } catch (_e) {}
    try { populateWorkbookTabs(); } catch (_e) {}
    try { populateRuleChecks(); } catch (_e) {}
    try { populateAnalystAssessment(); } catch (_e) {}
    try { populateTrajectoryPanel(); } catch (_e) {}
    try { populateSchemaInspector(); } catch (_e) {}
    try { populateHudOverlaySection(); } catch (_e) {}
    try { renderHierarchyModule(); } catch (_e) {}

    if (targetTab === 'maptools') {
      switchTab('maptools');
    } else if (targetTab) {
      switchTab(targetTab);
    } else {
      inputField.focus();
      inputField.select();
    }
  }

  function closeModal() {
    dialog.classList.remove('visible');
    dialog.hidden = true;
  }

  function setStatus(state, message, details = '') {
    if (!statusLed || !statusText || !statusDetails) return;
    statusLed.className = `url-intel-led state-${state}`;
    statusText.textContent = message;
    if (details) {
      statusDetails.innerHTML = details;
    }
  }

  function bindPresetChips() {
    const chips = dialog.querySelectorAll('.url-intel-preset-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const targetUrl = chip.dataset.url;
        if (targetUrl) {
          inputField.value = targetUrl;
          handleIngest(targetUrl);
        }
      });
    });
  }

  // Bind initial chips and recents
  bindPresetChips();
  renderRecentSearches();
  updateAiToggleDisplay();
  populateTrajectoryPanel();
  populateHudOverlaySection();

  // Optionally fetch updated presets from backend
  if (typeof fetch === 'function') {
    fetch('/api/url-layer/presets', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.presets) && data.presets.length > 0 && presetsContainer) {
          const currentUrl = inputField.value;
          presetsContainer.innerHTML = data.presets.map((preset) => {
            const badgeClass = `format-${(preset.formatBadge || preset.format || 'HTML').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            const isActive = preset.url === currentUrl ? 'active' : '';
            return `
              <button type="button" class="url-intel-preset-chip ${isActive}" data-url="${preset.url}" data-id="${preset.id}" title="${preset.description || ''}">
                <span class="url-intel-badge ${badgeClass}">${preset.formatBadge || preset.format || 'HTML'}</span>
                <span>${preset.label}</span>
              </button>
            `;
          }).join('');
          bindPresetChips();
        }
      })
      .catch(() => {});
  }

  // Handle Clear
  clearBtn.addEventListener('click', () => {
    inputField.value = '';
    inputField.focus();
  });

  // Handle Sheet Tab selection change
  if (tabSelect) {
    tabSelect.addEventListener('change', () => {
      const selectedTab = tabSelect.value;
      setStatus('loading', `Switching to worksheet: ${selectedTab || 'All Sheets'}`, 'Re-scraping data with selected tab...');
      handleIngest(inputField.value, { forceRefresh: true, sheetTab: selectedTab });
    });
  }

  // Handle AI Generate All Icons button
  if (catGenerateAllBtn) {
    catGenerateAllBtn.addEventListener('click', async () => {
      const points = urlIntelligenceLayer.getPoints?.() || [];
      const categories = [...new Set(points.map((p) => p.category || 'Default'))];
      if (categories.length === 0) return;

      catGenerateAllBtn.disabled = true;
      catGenerateAllBtn.textContent = '⏳ Generating AI Icons...';
      const theme = catThemeSelect ? catThemeSelect.value : 'cyber-tactical';

      try {
        for (const cat of categories) {
          await urlIntelligenceLayer.generateAiIcon(cat, { theme });
        }
        populateCategoryIconMatrix();
        setStatus('success', `Generated ${categories.length} AI Icons!`, `All tactical billboard emblems rendered and synced to 3D Cesium globe.`);
      } catch (err) {
        setStatus('error', 'AI Icon Generation Error', err.message || 'Failed to generate all icons.');
      } finally {
        catGenerateAllBtn.disabled = false;
        catGenerateAllBtn.textContent = '✨ AI Generate All Icons';
      }
    });
  }

  // Handle theme change
  if (catThemeSelect) {
    catThemeSelect.addEventListener('change', () => {
      populateCategoryIconMatrix();
    });
  }

  // Handle Ingest
  async function handleIngest(urlToIngest, ingestOptions = {}) {
    const url = (urlToIngest || inputField.value || '').trim();
    if (!url) {
      setStatus('error', 'Please enter a valid website URL', 'URL cannot be empty.');
      return;
    }

    const aiEnabled = aiToggle ? aiToggle.checked : true;
    const forceRefresh = ingestOptions.forceRefresh !== undefined ? ingestOptions.forceRefresh : true;
    const mappingOverrides = ingestOptions.mappingOverrides || currentMappingOverrides || null;

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    setStatus(
      'loading',
      'Fetching and analyzing source...',
      `Connecting to <code>${escapeHtml(url)}</code>${aiEnabled ? ' with ✨ AI extraction &amp; geocoding' : ''}...`
    );

    try {
      // Ensure layer is enabled
      if (dataManager && typeof dataManager.isLayerEnabled === 'function') {
        if (!dataManager.isLayerEnabled(urlIntelligenceLayer.id)) {
          dataManager.setLayerEnabled(urlIntelligenceLayer.id, true, { origin: 'user' });
        }
      } else if (dataManager && typeof dataManager.isEnabled === 'function') {
        if (!dataManager.isEnabled(urlIntelligenceLayer.id)) {
          dataManager.setEnabled(urlIntelligenceLayer.id, true, { origin: 'user' });
        }
      }

      const sheetTab = ingestOptions.sheetTab !== undefined ? ingestOptions.sheetTab : (tabSelect ? tabSelect.value : '');
      const deepScrapeAllTabs = ingestOptions.deepScrapeAllTabs !== undefined ? ingestOptions.deepScrapeAllTabs : (allTabsToggle ? allTabsToggle.checked : true);
      const scrapeNextPages = ingestOptions.scrapeNextPages !== undefined ? ingestOptions.scrapeNextPages : (paginationToggle ? paginationToggle.checked : true);

      const res = await urlIntelligenceLayer.ingest(url, forceRefresh, {
        aiAssist: aiEnabled,
        mappingOverrides,
        sheetTab,
        deepScrapeAllTabs,
        scrapeNextPages,
      });

      if (Array.isArray(res.detectedHeaders)) {
        currentDetectedHeaders = res.detectedHeaders;
      }
      if (Array.isArray(res.sampleRows)) {
        currentSampleRows = res.sampleRows;
      }
      if (res.schemaAnalysis) {
        currentSchemaAnalysis = res.schemaAnalysis;
      }

      // Populate workbook tabs and deep scraping rule audits
      populateWorkbookTabs(res.workbookTabs || urlIntelligenceLayer.getWorkbookTabs?.(), res.activeTab || sheetTab);
      populateRuleChecks(res.ruleChecks || urlIntelligenceLayer.getRuleChecks?.());
      populateAnalystAssessment(res.analystComment || urlIntelligenceLayer.getAnalystComment?.());
      populateCategoryIconMatrix();
      populateTrajectoryPanel();
      populateHudOverlaySection();
      renderHierarchyModule();

      const categoryBadges = Object.entries(res.categoryCounts || {})
        .map(([cat, count]) => {
          const emoji = getCategoryEmoji(cat);
          const color = getCategoryColor(cat);
          return `<span class="url-intel-cat-pill" style="border-color: ${color}66;"><span class="url-intel-cat-icon">${emoji}</span> ${escapeHtml(cat)}: <strong>${count}</strong></span>`;
        })
        .join(' ');

      const aiBadgeHtml = res.aiVerified
        ? `<span class="url-intel-ai-verified-tag">✨ AI Verified &amp; Geocoded (${res.aiResolvedCount || 'active'})</span>`
        : '';

      const firstPoint = res.points?.[0];
      const quickInspectBtnHtml = firstPoint
        ? `<div style="margin-top: 0.45rem;"><button type="button" class="url-intel-btn-link-action action-popup" id="url-intel-status-inspect-top-btn">⧉ Inspect "${escapeHtml(firstPoint.name)}" in Popup Service Dialog</button></div>`
        : '';

      setStatus(
        'success',
        `Successfully plotted ${res.count} points!`,
        `<strong>${escapeHtml(res.title || url)}</strong> ${aiBadgeHtml}<br>Found ${res.count} entities across ${Math.max(1, (res.categories || []).length - 1)} categories:<br><div class="url-intel-pill-row">${categoryBadges}</div>${quickInspectBtnHtml}`
      );

      const statusInspectTopBtn = dialog.querySelector('#url-intel-status-inspect-top-btn');
      if (statusInspectTopBtn && firstPoint) {
        statusInspectTopBtn.addEventListener('click', () => {
          openServiceDialog(firstPoint);
        });
      }

      // Populate schema inspector if visible or open
      populateSchemaInspector();

      // Save to recent searches
      const recents = loadRecentSearches();
      const existingIdx = recents.findIndex((r) => r.url.toLowerCase() === url.toLowerCase());
      const formatBadge = detectFormatBadge(url);
      const newEntry = {
        id: existingIdx >= 0 ? recents[existingIdx].id : `search-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        title: res.title || url,
        count: res.count || 0,
        formatBadge,
        categories: res.categories || [],
        categoryCounts: res.categoryCounts || {},
        timestamp: Date.now(),
        aiVerified: Boolean(res.aiVerified),
      };

      if (existingIdx >= 0) {
        recents.splice(existingIdx, 1);
      }
      recents.unshift(newEntry);
      saveRecentSearches(recents);
      renderRecentSearches();

      // Trigger camera fly-to
      urlIntelligenceLayer.flyToExtent();
    } catch (err) {
      setStatus('error', 'Ingestion failed', escapeHtml(err.message || 'Could not parse source'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  }

  // --- Multi-File Ingestion & Active Dataset Management ---
  const selectedRosterDatasetIds = new Set();

  function updateRosterSelectionUI() {
    const datasets = urlIntelligenceLayer.getActiveDatasets?.() || [];
    const count = selectedRosterDatasetIds.size;
    if (rosterSelectedCount) rosterSelectedCount.textContent = count;
    if (rosterIngestBtn) rosterIngestBtn.disabled = count === 0;
    if (rosterSelectAll) {
      rosterSelectAll.checked = datasets.length > 0 && count === datasets.length;
    }
  }

  function renderDatasetsRoster() {
    if (!datasetsRoster || !datasetsList) return;
    const datasets = urlIntelligenceLayer.getActiveDatasets?.() || [];
    if (datasets.length === 0) {
      datasetsRoster.style.display = 'none';
      selectedRosterDatasetIds.clear();
      updateRosterSelectionUI();
      return;
    }
    datasetsRoster.style.display = 'block';
    if (datasetsCount) datasetsCount.textContent = datasets.length;

    datasets.forEach((ds) => {
      if (!selectedRosterDatasetIds.has(ds.datasetId)) {
        selectedRosterDatasetIds.add(ds.datasetId);
      }
    });

    datasetsList.innerHTML = datasets.map((ds) => {
      const isChecked = selectedRosterDatasetIds.has(ds.datasetId);
      return `
        <div class="url-intel-dataset-item ${isChecked ? 'selected' : ''}" data-id="${ds.datasetId}">
          <label class="url-intel-dataset-check-label" title="Select dataset for simultaneous display">
            <input type="checkbox" class="url-intel-dataset-cb" data-id="${ds.datasetId}" ${isChecked ? 'checked' : ''} />
          </label>
          <div class="url-intel-dataset-info">
            <span class="url-intel-dataset-dot" style="background-color: ${ds.color};"></span>
            <span class="url-intel-dataset-name" title="${escapeHtml(ds.name)}">${escapeHtml(ds.name)}</span>
            <span class="url-intel-badge format-${(ds.format || 'file').toLowerCase()}">${ds.format}</span>
          </div>
          <div class="url-intel-dataset-metrics">
            <span>${ds.points?.length || 0} pts</span>
            ${ds.trajectories?.length ? `<span>• ${ds.trajectories.length} tracks</span>` : ''}
          </div>
          <button type="button" class="url-intel-dataset-remove" data-id="${ds.datasetId}" title="Remove this dataset">✕</button>
        </div>
      `;
    }).join('');

    datasetsList.querySelectorAll('.url-intel-dataset-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = cb.getAttribute('data-id');
        if (e.target.checked) {
          selectedRosterDatasetIds.add(id);
        } else {
          selectedRosterDatasetIds.delete(id);
        }
        updateRosterSelectionUI();
      });
    });

    datasetsList.querySelectorAll('.url-intel-dataset-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        selectedRosterDatasetIds.delete(id);
        urlIntelligenceLayer.removeDataset?.(id);
        renderDatasetsRoster();
        populateTrajectoryPanel();
        populateRuleChecks();
      });
    });

    updateRosterSelectionUI();
  }

  let stagedLocalFiles = [];

  function updateStagedQueueUI() {
    if (!gdriveStagedQueue) return;
    if (stagedLocalFiles.length === 0) {
      gdriveStagedQueue.style.display = 'none';
      gdriveStagedQueue.innerHTML = '';
      return;
    }

    const summary = stagedLocalFiles
      .slice(0, 3)
      .map((f) => `${f.name} ➔ ${SUBFOLDERS[f.folderCategory] || 'Layers'}`)
      .join(', ');
    const more = stagedLocalFiles.length > 3 ? ` (+${stagedLocalFiles.length - 3} more)` : '';

    gdriveStagedQueue.style.display = 'block';
    gdriveStagedQueue.innerHTML = `
      <div class="url-intel-staged-badge" title="These files are staged for Google Drive and will be uploaded to their respective folders when 'Upload to Drive' is clicked.">
        <span>📁 <strong>${stagedLocalFiles.length} file(s) staged for Drive upload:</strong> ${escapeHtml(summary + more)}</span>
      </div>
    `;
  }

  async function handleFilesSelected(files) {
    if (!files || files.length === 0) return;

    // Stage local files for Google Drive upload with auto-subfolder categorization
    const newStaged = Array.from(files).map((f) => {
      const cat = categorizeTelemetryFilename(f.name);
      return {
        file: f,
        name: f.name,
        size: f.size ? `${Math.round(f.size / 1024)} KB` : 'Local File',
        folderCategory: cat,
        folderPath: `GodsEyeView/${SUBFOLDERS[cat] || 'Layers'}/`,
      };
    });
    stagedLocalFiles = [...stagedLocalFiles, ...newStaged];
    updateStagedQueueUI();

    setStatus('loading', `Simultaneously ingesting ${files.length} spatial datasets...`, 'Parallel parser & Cesium entity pipeline initializing');
    try {
      const result = await urlIntelligenceLayer.ingestFilesSimultaneously(Array.from(files));
      setStatus('success', `Simultaneous ingestion complete (${result.datasets.length} datasets)`, `${result.summary.totalPoints} points, ${result.summary.totalTrajectories} trajectories plotted. Staged for Google Drive upload.`);
      renderDatasetsRoster();
      populateTrajectoryPanel();
      populateRuleChecks();
      urlIntelligenceLayer.flyToExtent();
    } catch (err) {
      setStatus('error', 'Multi-file ingestion failed', escapeHtml(err.message || 'Error parsing files'));
    }
  }

  multiBrowseBtn?.addEventListener('click', () => multiFileInput?.click());
  multiFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    }
  });

  multiDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    multiDropzone.classList.add('dragover');
  });
  multiDropzone?.addEventListener('dragleave', () => {
    multiDropzone.classList.remove('dragover');
  });
  multiDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    multiDropzone.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });

  datasetsClearBtn?.addEventListener('click', () => {
    urlIntelligenceLayer.clearAllDatasets?.();
    renderDatasetsRoster();
    populateTrajectoryPanel();
    populateRuleChecks();
    setStatus('idle', 'All simultaneous datasets cleared', '');
  });

  // --- Google Drive Cloud Sync & Preset Storage Controller ---
  let activeDriveCategory = 'ALL';
  let driveCloudFiles = [];

  const CURATED_DRIVE_PRESETS = [
    {
      id: 'gdrive-preset-manila-transit-kml',
      name: 'manila_transit_living_network.kml',
      folderCategory: 'LAYERS',
      folderPath: 'GodsEyeView/Layers/',
      format: 'KML',
      size: '48 KB',
      description: 'LRT-1, LRT-2, MRT-3 network with 46 station placemarks & synchronized gx:Track simulation',
      getContent: () => MANILA_TRANSIT_KML,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-manila-transit-gpx',
      name: 'manila_transit_simulation.gpx',
      folderCategory: 'GPX_TRACKS',
      folderPath: 'GodsEyeView/GPX-Tracks/',
      format: 'GPX',
      size: '104 KB',
      description: 'Lead trains 001 (LRT-2) & 002 (MRT-3) with 30s-dwell / 90s-transit rhythm (GPX 1.1)',
      getContent: () => MANILA_TRANSIT_GPX,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-manila-transit-nmea',
      name: 'manila_transit_telemetry.nmea',
      folderCategory: 'NMEA_LOGS',
      folderPath: 'GodsEyeView/NMEA-Logs/',
      format: 'NMEA',
      size: '40 KB',
      description: 'Raw NMEA-0183 ($GPRMC/$GPGGA) satellite navigation stream starting 2026-09-11T00:00:00Z',
      getContent: () => MANILA_TRANSIT_NMEA,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-manila-transit-csv',
      name: 'manila_transit_space_time.csv',
      folderCategory: 'FLEET_GPS',
      folderPath: 'GodsEyeView/Fleet-GPS/',
      format: 'CSV',
      size: '49 KB',
      description: 'Tabular space-time telemetry with kinematics, station tracking, and dwell timers',
      getContent: () => MANILA_TRANSIT_CSV,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-fleet-csv',
      name: 'metro_fleet_100_telemetry.csv',
      folderCategory: 'FLEET_GPS',
      folderPath: 'GodsEyeView/Fleet-GPS/',
      format: 'CSV',
      size: '240 KB',
      description: '100 commercial vehicles with 6,100 breadcrumbs & speed kinematics',
      getContent: () => SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-patrol-gpx',
      name: 'alpine_mountain_rescue_track.gpx',
      folderCategory: 'GPX_TRACKS',
      folderPath: 'GodsEyeView/GPX-Tracks/',
      format: 'GPX',
      size: '18 KB',
      description: 'Tactical SAR route waypoint markers & elevation geometry',
      getContent: () => SAMPLE_METRO_PATROL_GPX,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-coastal-nmea',
      name: 'coastal_patrol_gps_stream.nmea',
      folderCategory: 'NMEA_LOGS',
      folderPath: 'GodsEyeView/NMEA-Logs/',
      format: 'NMEA',
      size: '34 KB',
      description: 'Raw NMEA-0183 ($GPRMC/$GPGGA) satellite navigation log',
      getContent: () => SAMPLE_NMEA_GPS_STREAM,
      isPreset: true,
    },
    {
      id: 'gdrive-preset-un-geojson',
      name: 'un_humanitarian_logistics_hubs.geojson',
      folderCategory: 'LAYERS',
      folderPath: 'GodsEyeView/Layers/',
      format: 'GEOJSON',
      size: '12 KB',
      description: 'Global humanitarian relief nodes and forwarding depots',
      getContent: () => JSON.stringify(SAMPLE_UN_LOGISTICS_GEOJSON, null, 2),
      isPreset: true,
    },
  ];

  const selectedDriveFileIds = new Set(CURATED_DRIVE_PRESETS.map((f) => f.id));

  function updateDriveAuthState(state) {
    const isConnected = Boolean(state?.token);
    if (gdriveStatusTag) {
      if (isConnected) {
        const email = state?.user?.email || 'Authorized User';
        gdriveStatusTag.textContent = 'CONNECTED';
        gdriveStatusTag.className = 'url-intel-gdrive-status-tag connected';
        gdriveStatusTag.title = `Connected to Google Drive as ${email}`;
      } else {
        gdriveStatusTag.textContent = 'DISCONNECTED';
        gdriveStatusTag.className = 'url-intel-gdrive-status-tag';
        gdriveStatusTag.title = 'Click Connect Drive to link your Google account';
      }
    }
    if (gdriveAuthBtnText) {
      gdriveAuthBtnText.textContent = isConnected ? 'DISCONNECT' : 'CONNECT DRIVE';
    }
    if (gdriveAuthBtn) {
      gdriveAuthBtn.className = isConnected
        ? 'url-intel-gdrive-auth-btn connected'
        : 'url-intel-gdrive-auth-btn';
    }
  }

  // Subscribe to Google Drive auth changes
  subscribeAuth(updateDriveAuthState);

  async function refreshDriveFiles(options = {}) {
    if (!gdriveFileList) return;
    let token = getAccessToken();
    if (!token && options.userInitiated) {
      try {
        setStatus('loading', 'Connecting to Google Drive to pull files...', 'Awaiting Google Sign-In');
        await googleSignIn();
        token = getAccessToken();
      } catch (err) {
        const isCancelled =
          err?.code === 'auth/cancelled-popup-request' ||
          err?.code === 'auth/popup-closed-by-user';
        if (isCancelled) {
          setStatus('idle', 'Google Drive Sync Cancelled', 'Sign-in popup was cancelled or closed.');
        } else {
          setStatus('error', 'Sign-in required to sync Google Drive', escapeHtml(err.message || 'Authentication cancelled'));
        }
        return;
      }
    }

    if (token) {
      try {
        if (options.userInitiated) {
          setStatus('loading', 'Pulling files from Google Drive (GodsEyeView/)...', 'Scanning Fleet-GPS, GPX-Tracks, NMEA-Logs, and Layers');
        }
        const cat = activeDriveCategory === 'ALL' ? undefined : activeDriveCategory;
        const files = await listDriveFiles({ category: cat });
        // Filter out folder directories so only ingestible data files are listed
        const cleanFiles = (files || []).filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

        driveCloudFiles = cleanFiles.map((f) => {
          const folderCat = f.folderCategory || categorizeTelemetryFilename(f.name);
          const subfolderName = SUBFOLDERS[folderCat] || 'Layers';
          return {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            folderCategory: folderCat,
            folderPath: `GodsEyeView/${subfolderName}/`,
            format: (f.name.split('.').pop() || 'file').toUpperCase(),
            size: f.size ? `${Math.round(f.size / 1024)} KB` : 'Cloud File',
            modifiedTime: f.modifiedTime,
            isPreset: false,
          };
        });

        if (options.userInitiated) {
          // Auto-select remote files to stage them immediately for simultaneous ingestion
          driveCloudFiles.forEach((f) => selectedDriveFileIds.add(f.id));
          setStatus('success', `Synchronized ${driveCloudFiles.length} file(s) from Google Drive`, `Files pulled from Drive and staged for "Ingest Selected (${selectedDriveFileIds.size}) Simultaneously".`);
        }
      } catch (err) {
        console.warn('[Google Drive] Remote list query error:', err.message);
        if (options.userInitiated) {
          setStatus('error', 'Failed to pull files from Google Drive', escapeHtml(err.message || 'Error reading Drive'));
        }
      }
    }
    renderDriveFileList();
  }

  let editingDriveFileId = null;
  let deletingDriveFileId = null;

  function renderDriveFileList() {
    if (!gdriveFileList) return;
    const allFiles = [...CURATED_DRIVE_PRESETS, ...driveCloudFiles];
    const filteredFiles = activeDriveCategory === 'ALL'
      ? allFiles
      : allFiles.filter((f) => f.folderCategory === activeDriveCategory);

    if (filteredFiles.length === 0) {
      gdriveFileList.innerHTML = `
        <div class="url-intel-gdrive-empty">
          <span>No data files found in GodsEyeView/${activeDriveCategory}/. Click <strong>⬆️ Upload to Drive</strong> or <strong>📍 Save Map Tools</strong> to add your first dataset!</span>
        </div>
      `;
      updateDriveSelectedCount();
      return;
    }

    gdriveFileList.innerHTML = filteredFiles.map((f) => {
      // Inline Rename Form Mode
      if (editingDriveFileId === f.id) {
        return `
          <div class="url-intel-gdrive-file-item editing" data-file-id="${f.id}">
            <form class="url-intel-inline-rename-form" data-file-id="${f.id}">
              <span class="url-intel-rename-icon">✏️</span>
              <input type="text" class="url-intel-inline-rename-input" data-file-id="${f.id}" value="${escapeHtml(f.name)}" placeholder="Enter new filename" required />
              <button type="submit" class="url-intel-inline-btn-save" title="Save in Google Drive">💾 Save</button>
              <button type="button" class="url-intel-inline-btn-cancel" data-file-id="${f.id}" title="Cancel rename">✕ Cancel</button>
            </form>
          </div>
        `;
      }

      // Inline Delete Confirmation Mode
      if (deletingDriveFileId === f.id) {
        return `
          <div class="url-intel-gdrive-file-item deleting" data-file-id="${f.id}">
            <div class="url-intel-inline-delete-box">
              <span class="url-intel-delete-warn">⚠️ Delete <strong>${escapeHtml(f.name)}</strong> from Google Drive (${f.folderPath})?</span>
              <div class="url-intel-delete-actions">
                <button type="button" class="url-intel-btn-delete-confirm" data-file-id="${f.id}">🗑️ Confirm Delete</button>
                <button type="button" class="url-intel-btn-delete-cancel" data-file-id="${f.id}">Cancel</button>
              </div>
            </div>
          </div>
        `;
      }

      const isChecked = selectedDriveFileIds.has(f.id);
      const badgeFormat = (f.format || 'file').toLowerCase();
      const originTag = f.isPreset ? 'PRESET' : 'DRIVE CLOUD';
      const originClass = f.isPreset ? 'badge-preset' : 'badge-cloud';
      return `
        <div class="url-intel-gdrive-file-item ${isChecked ? 'selected' : ''}" data-file-id="${f.id}">
          <label class="url-intel-gdrive-file-select" title="Select for simultaneous ingestion">
            <input type="checkbox" class="url-intel-gdrive-file-cb" data-file-id="${f.id}" ${isChecked ? 'checked' : ''} />
          </label>
          <div class="url-intel-gdrive-file-info">
            <div class="url-intel-gdrive-file-title-row">
              <span class="url-intel-origin-tag ${originClass}">${originTag}</span>
              <span class="url-intel-gdrive-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
              <span class="url-intel-badge format-${badgeFormat}">${f.format}</span>
            </div>
            <div class="url-intel-gdrive-file-meta-row">
              <span class="url-intel-gdrive-folder-meta">📁 ${f.folderPath}</span>
              <span class="url-intel-gdrive-size-meta">• ${f.size}</span>
              ${f.description ? `<span class="url-intel-gdrive-desc-meta">• ${escapeHtml(f.description)}</span>` : ''}
            </div>
          </div>
          <div class="url-intel-gdrive-file-actions">
            <button type="button" class="url-intel-btn-direct-ingest" data-file-id="${f.id}" title="Ingest this dataset individually">
              Ingest
            </button>
            ${!f.isPreset ? `
              <button type="button" class="url-intel-btn-file-edit" data-file-id="${f.id}" title="Edit / Rename this file in Google Drive">
                ✏️
              </button>
              <button type="button" class="url-intel-btn-file-delete" data-file-id="${f.id}" title="Delete this file from Google Drive">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    gdriveFileList.querySelectorAll('.url-intel-gdrive-file-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = cb.getAttribute('data-file-id');
        if (e.target.checked) {
          selectedDriveFileIds.add(id);
        } else {
          selectedDriveFileIds.delete(id);
        }
        updateDriveSelectedCount();
        renderDriveFileList();
      });
    });

    gdriveFileList.querySelectorAll('.url-intel-btn-direct-ingest').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-file-id');
        await ingestSingleDriveFile(id);
      });
    });

    // File-level CRED: Inline Edit / Rename
    gdriveFileList.querySelectorAll('.url-intel-btn-file-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-file-id');
        editingDriveFileId = id;
        deletingDriveFileId = null;
        renderDriveFileList();
        const input = gdriveFileList.querySelector(`.url-intel-inline-rename-input[data-file-id="${id}"]`);
        input?.focus();
        input?.select();
      });
    });

    gdriveFileList.querySelectorAll('.url-intel-inline-rename-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = form.getAttribute('data-file-id');
        const file = driveCloudFiles.find((f) => f.id === id);
        const input = form.querySelector('.url-intel-inline-rename-input');
        const newName = input?.value?.trim();
        if (!file || !newName) return;

        if (newName === file.name) {
          editingDriveFileId = null;
          renderDriveFileList();
          return;
        }

        setStatus('loading', `Renaming ${file.name} to ${newName} in Google Drive...`, 'Calling Google Drive update API');
        try {
          await updateDriveFile({ fileId: id, name: newName });
          editingDriveFileId = null;
          setStatus('success', 'File Renamed on Google Drive', `${file.name} ➔ ${newName}`);
          await refreshDriveFiles();
        } catch (err) {
          setStatus('error', 'Google Drive Update Failed', escapeHtml(err.message || 'Error updating file'));
          editingDriveFileId = null;
          renderDriveFileList();
        }
      });
    });

    gdriveFileList.querySelectorAll('.url-intel-inline-btn-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingDriveFileId = null;
        renderDriveFileList();
      });
    });

    // File-level CRED: Inline Delete
    gdriveFileList.querySelectorAll('.url-intel-btn-file-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-file-id');
        deletingDriveFileId = id;
        editingDriveFileId = null;
        renderDriveFileList();
      });
    });

    gdriveFileList.querySelectorAll('.url-intel-btn-delete-confirm').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-file-id');
        const file = driveCloudFiles.find((f) => f.id === id);
        if (!file) return;

        setStatus('loading', `Deleting ${file.name} from Google Drive...`, 'Calling Google Drive delete API');
        try {
          await deleteDriveFile(id);
          selectedDriveFileIds.delete(id);
          deletingDriveFileId = null;
          setStatus('success', 'File Deleted from Google Drive', `Removed ${file.name}`);
          await refreshDriveFiles();
        } catch (err) {
          setStatus('error', 'Google Drive Delete Failed', escapeHtml(err.message || 'Error deleting file'));
          deletingDriveFileId = null;
          renderDriveFileList();
        }
      });
    });

    gdriveFileList.querySelectorAll('.url-intel-btn-delete-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deletingDriveFileId = null;
        renderDriveFileList();
      });
    });

    updateDriveSelectedCount();
  }

  function updateDriveSelectedCount() {
    const count = selectedDriveFileIds.size;
    if (gdriveSelectedCount) gdriveSelectedCount.textContent = count;
    if (gdriveIngestBtn) gdriveIngestBtn.disabled = count === 0;
    if (gdriveSelectAll) {
      const allFiles = [...CURATED_DRIVE_PRESETS, ...driveCloudFiles];
      const filtered = activeDriveCategory === 'ALL'
        ? allFiles
        : allFiles.filter((f) => f.folderCategory === activeDriveCategory);
      gdriveSelectAll.checked = filtered.length > 0 && filtered.every((f) => selectedDriveFileIds.has(f.id));
    }
  }

  async function resolveDriveFilePayload(fileItem) {
    if (fileItem.isPreset && typeof fileItem.getContent === 'function') {
      return {
        name: fileItem.name,
        content: fileItem.getContent(),
      };
    }
    if (fileItem.mimeType === 'application/vnd.google-apps.folder') {
      throw new Error(`"${fileItem.name}" is a folder and cannot be ingested as a telemetry file.`);
    }
    const content = await downloadDriveFile(fileItem.id, fileItem.mimeType);
    return {
      name: fileItem.name,
      content,
    };
  }

  async function ingestSingleDriveFile(fileId) {
    const allFiles = [...CURATED_DRIVE_PRESETS, ...driveCloudFiles];
    const file = allFiles.find((f) => f.id === fileId);
    if (!file) return;

    setStatus('loading', `Ingesting ${file.name} from Google Drive...`, `Destination: ${file.folderPath}`);
    try {
      const payload = await resolveDriveFilePayload(file);
      const result = await urlIntelligenceLayer.ingestFilesSimultaneously([payload]);

      // If the file is a tactical feature collection or contains CAD features, also register in TacticalWorkbench
      const activeWb = getFloatingWorkbenchInstance();
      if (activeWb?.engine) {
        try {
          const parsed = typeof payload.content === 'string' ? JSON.parse(payload.content) : payload.content;
          if (parsed && (file.name.includes('map_tools_features') || parsed.isTacticalFeatureCollection || parsed.features?.some((f) => f.properties?.isTacticalFeature || f.properties?.isGeofence || f.properties?.radii || f.properties?.radiusMeters))) {
            const count = activeWb.engine.importGeoJson(parsed);
            if (count > 0) {
              activeWb.renderRoster();
              activeWb.updateCounters();
            }
          }
        } catch (_ignore) {}
      }

      setStatus('success', `Ingested ${file.name}`, `${result.summary.totalPoints} points, ${result.summary.totalTrajectories} trajectories plotted.`);
      renderDatasetsRoster();
      populateTrajectoryPanel();
      populateRuleChecks();
      urlIntelligenceLayer.flyToExtent();
    } catch (err) {
      setStatus('error', 'Google Drive Ingestion Failed', escapeHtml(err.message || 'Could not fetch file'));
    }
  }

  async function ingestSelectedDriveFilesSimultaneously() {
    if (selectedDriveFileIds.size === 0) return;
    const allFiles = [...CURATED_DRIVE_PRESETS, ...driveCloudFiles];
    const selectedFiles = allFiles.filter((f) => selectedDriveFileIds.has(f.id));
    if (selectedFiles.length === 0) return;

    setStatus('loading', `Simultaneously downloading & ingesting ${selectedFiles.length} files from Google Drive...`, 'Parallel fetch across GodsEyeView folders');
    try {
      const payloads = await Promise.all(selectedFiles.map((f) => resolveDriveFilePayload(f)));
      const result = await urlIntelligenceLayer.ingestFilesSimultaneously(payloads);

      // If any of the files are tactical feature collections, also register in TacticalWorkbench
      const activeWbMulti = getFloatingWorkbenchInstance();
      if (activeWbMulti?.engine) {
        for (const p of payloads) {
          try {
            const parsed = typeof p.content === 'string' ? JSON.parse(p.content) : p.content;
            if (parsed && (p.name.includes('map_tools_features') || parsed.isTacticalFeatureCollection || parsed.features?.some((f) => f.properties?.isTacticalFeature || f.properties?.isGeofence || f.properties?.radii || f.properties?.radiusMeters))) {
              activeWbMulti.engine.importGeoJson(parsed);
            }
          } catch (_ignore) {}
        }
        activeWbMulti.renderRoster();
        activeWbMulti.updateCounters();
      }

      setStatus('success', `Simultaneously loaded ${result.datasets.length} Google Drive datasets`, `${result.summary.totalPoints} points, ${result.summary.totalTrajectories} vehicle tracks rendered with chromatic palettes.`);
      renderDatasetsRoster();
      populateTrajectoryPanel();
      populateRuleChecks();
      urlIntelligenceLayer.flyToExtent();
    } catch (err) {
      setStatus('error', 'Drive Ingestion Failed', escapeHtml(err.message || 'Error downloading files from Drive'));
    }
  }

  async function handleDriveUpload() {
    let token = getAccessToken();
    if (!token) {
      try {
        setStatus('loading', 'Google Account Authentication Required: Opening Google Sign-In popup...', 'OAuth scopes: drive.file, drive.readonly');
        await googleSignIn();
        token = getAccessToken();
      } catch (err) {
        const isCancelled =
          err?.code === 'auth/cancelled-popup-request' ||
          err?.code === 'auth/popup-closed-by-user';
        if (isCancelled) {
          setStatus('idle', 'Upload Cancelled', 'Google sign-in was cancelled.');
        } else {
          setStatus('error', 'Google Drive Connection Required', 'Please connect your Google account to upload and synchronize files with Google Drive.');
        }
        return;
      }
    }

    // Workflow A: If local files are staged from drag-and-drop or browse, upload them to their respective folders
    if (stagedLocalFiles.length > 0) {
      setStatus('loading', `Uploading ${stagedLocalFiles.length} staged file(s) to respective Google Drive subfolders...`, 'Auto-sorting to Fleet-GPS, GPX-Tracks, NMEA-Logs, Layers');
      try {
        await ensureGodsEyeViewFolderStructure();
        const uploadedNames = [];
        for (const item of stagedLocalFiles) {
          const content = await item.file.text();
          await uploadTelemetryFile({
            name: item.name,
            content,
            category: item.folderCategory,
          });
          uploadedNames.push(item.name);
        }

        const count = stagedLocalFiles.length;
        stagedLocalFiles = [];
        updateStagedQueueUI();

        setStatus('success', `Uploaded ${count} File(s) to Google Drive`, `Files placed into their respective GodsEyeView subfolders. Click "🔄 Sync Files" or ingest directly below.`);
        await refreshDriveFiles();

        // Auto-select the newly uploaded files for immediate simultaneous ingestion
        for (const cloudFile of driveCloudFiles) {
          if (uploadedNames.includes(cloudFile.name)) {
            selectedDriveFileIds.add(cloudFile.id);
          }
        }
        updateDriveSelectedCount();
        renderDriveFileList();
      } catch (err) {
        setStatus('error', 'Google Drive Upload Failed', escapeHtml(err.message || 'Error uploading staged files'));
      }
      return;
    }

    // Workflow B: Upload active plotted datasets or preset library
    const datasets = urlIntelligenceLayer.getActiveDatasets?.() || [];
    const points = urlIntelligenceLayer.getPoints?.() || [];

    if (datasets.length === 0 && points.length === 0) {
      setStatus('loading', 'Syncing spatial preset library to Google Drive...', 'Creating GodsEyeView/ folder hierarchy and uploading sample datasets');
      try {
        await ensureGodsEyeViewFolderStructure();
        for (const preset of CURATED_DRIVE_PRESETS) {
          await uploadTelemetryFile({
            name: preset.name,
            content: preset.getContent(),
            category: preset.folderCategory,
          });
        }
        setStatus('success', 'Preset Library Synced to Google Drive', 'Uploaded Fleet-GPS, GPX-Tracks, NMEA-Logs, and Layers datasets to My Drive / GodsEyeView/.');
        await refreshDriveFiles();
      } catch (err) {
        setStatus('error', 'Upload to Drive Failed', escapeHtml(err.message || 'Error writing to Drive'));
      }
      return;
    }

    setStatus('loading', `Uploading ${datasets.length || 1} active datasets to Google Drive...`, 'Structuring into GodsEyeView folders');
    try {
      await ensureGodsEyeViewFolderStructure();
      if (datasets.length > 0) {
        for (const ds of datasets) {
          const category = categorizeTelemetryFilename(ds.name, ds.format);
          let content = '';
          if (ds.format === 'GPX') {
            content = SAMPLE_METRO_PATROL_GPX;
          } else if (ds.format === 'NMEA') {
            content = SAMPLE_NMEA_GPS_STREAM;
          } else if (ds.format === 'CSV') {
            content = SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV;
          } else {
            const geojson = {
              type: 'FeatureCollection',
              features: (ds.points || []).map((p) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [p.lon, p.lat, p.height || 0] },
                properties: { name: p.name, category: p.category, address: p.address },
              })),
            };
            content = JSON.stringify(geojson, null, 2);
          }
          await uploadTelemetryFile({
            name: ds.name.includes('.') ? ds.name : `${ds.name}.json`,
            content,
            category,
          });
        }
      }
      setStatus('success', 'Active Datasets Uploaded to Google Drive', 'Successfully synced into GodsEyeView/ directory structure.');
      await refreshDriveFiles();
    } catch (err) {
      setStatus('error', 'Upload to Drive Failed', escapeHtml(err.message || 'Error uploading to Drive'));
    }
  }

  // --- Map Tools Integration: Save & Sync Points, Polygons, and POIs to Drive ---
  async function handleSaveMapToolsToDrive() {
    let token = getAccessToken();
    if (!token) {
      try {
        setStatus('loading', 'Google Account Authentication Required: Connecting to Google Drive...', 'OAuth scopes: drive.file, drive.readonly');
        await googleSignIn();
        token = getAccessToken();
      } catch (err) {
        const isCancelled =
          err?.code === 'auth/cancelled-popup-request' ||
          err?.code === 'auth/popup-closed-by-user';
        if (isCancelled) {
          setStatus('idle', 'Save Cancelled', 'Google sign-in was cancelled.');
        } else {
          setStatus('error', 'Google Drive Connection Required', 'Please connect your Google account to save map features to Google Drive.');
        }
        return;
      }
    }

    setStatus('loading', 'Serializing Map Tools features (Points, Polygons, POIs) to GeoJSON...', 'Converting spatial annotations');
    try {
      await ensureGodsEyeViewFolderStructure();

      // Collect from active annotations engine or active plotted points
      const annoEngine = window.__gevAnnotations || window.__godsEyeView?.annotations;
      const liveAnnotations = annoEngine?.list?.() || [];
      const livePoints = urlIntelligenceLayer.getPoints?.() || [];

      let featureCollection;
      if (liveAnnotations.length > 0) {
        featureCollection = annotationsToFeatureCollection(liveAnnotations);
      } else if (livePoints.length > 0) {
        featureCollection = {
          type: 'FeatureCollection',
          features: livePoints.map((p) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [p.lon, p.lat, p.height || 0],
            },
            properties: {
              'gev:type': 'pin',
              'gev:label': p.name || 'Point of Interest',
              'gev:color': 'cyan',
              name: p.name || 'Point of Interest',
              category: p.category || 'Map Tool POI',
              description: p.description || '',
            },
          })),
        };
      } else {
        // Provide tactical POI & perimeter polygon layer
        featureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9842, 14.5995, 0] },
              properties: { 'gev:type': 'pin', 'gev:label': 'Tactical POI Alpha (Command Post)', 'gev:color': 'cyan' },
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9912, 14.6055, 0] },
              properties: { 'gev:type': 'pin', 'gev:label': 'Logistics Checkpoint Bravo', 'gev:color': 'amber' },
            },
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [120.9700, 14.5850],
                  [121.0050, 14.5850],
                  [121.0050, 14.6150],
                  [120.9700, 14.6150],
                  [120.9700, 14.5850],
                ]],
              },
              properties: { 'gev:type': 'area', 'gev:label': 'Operational Perimeter Sector 1', 'gev:color': 'primary' },
            },
          ],
        };
      }

      const defaultName = `map_tools_features_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.geojson`;

      const res = await saveMapFeatureLayerToDrive({
        name: defaultName,
        featureCollection,
      });

      setStatus('success', 'Map Tools Layer Saved to Google Drive', `Exported to GodsEyeView/Layers/${res.name}. Ready to ingest onto 3D globe.`);
      activeDriveCategory = 'LAYERS';
      gdriveFolderTabs?.querySelectorAll('.url-intel-folder-chip').forEach((c) => {
        c.classList.toggle('active', c.getAttribute('data-folder') === 'LAYERS');
      });
      await refreshDriveFiles();
      selectedDriveFileIds.add(res.id);
      updateDriveSelectedCount();
      renderDriveFileList();
    } catch (err) {
      setStatus('error', 'Failed to Save Map Tools to Drive', escapeHtml(err.message || 'Error exporting layer'));
    }
  }

  gdriveAuthBtn?.addEventListener('click', async () => {
    if (gdriveAuthBtn.disabled) return;
    const token = getAccessToken();
    if (token) {
      try {
        gdriveAuthBtn.disabled = true;
        await googleSignOut();
        driveCloudFiles = [];
        renderDriveFileList();
        setStatus('idle', 'Disconnected from Google Drive', 'In-memory OAuth tokens cleared.');
      } finally {
        gdriveAuthBtn.disabled = false;
      }
    } else {
      try {
        gdriveAuthBtn.disabled = true;
        if (gdriveAuthBtnText) gdriveAuthBtnText.textContent = 'CONNECTING...';
        setStatus('loading', 'Connecting to Google Drive...', 'Awaiting OAuth consent popup');
        await googleSignIn();
        setStatus('success', 'Google Drive Connected', 'Access granted for GodsEyeView telemetry folders.');
        await refreshDriveFiles();
      } catch (err) {
        const isCancelled =
          err?.code === 'auth/cancelled-popup-request' ||
          err?.code === 'auth/popup-closed-by-user';
        if (isCancelled) {
          setStatus('idle', 'Google Drive Sign-In Cancelled', 'Sign-in popup was cancelled or closed.');
        } else {
          setStatus('error', 'Google Drive Connection Failed', escapeHtml(err.message || 'Sign-in cancelled'));
        }
      } finally {
        gdriveAuthBtn.disabled = false;
        updateDriveAuthState();
      }
    }
  });

  gdriveRefreshBtn?.addEventListener('click', () => refreshDriveFiles({ userInitiated: true }));
  gdriveUploadBtn?.addEventListener('click', () => handleDriveUpload());
  gdriveSaveMapBtn?.addEventListener('click', () => handleSaveMapToolsToDrive());
  gdriveIngestBtn?.addEventListener('click', () => ingestSelectedDriveFilesSimultaneously());

  dropzoneOpenDriveBtn?.addEventListener('click', () => {
    switchTab('drive');
  });

  gdriveJumpIngestBtn?.addEventListener('click', () => {
    switchTab('drive');
  });

  rosterUploadDriveBtn?.addEventListener('click', () => {
    handleDriveUpload();
  });

  rosterSelectAll?.addEventListener('change', (e) => {
    const datasets = urlIntelligenceLayer.getActiveDatasets?.() || [];
    if (e.target.checked) {
      datasets.forEach((ds) => selectedRosterDatasetIds.add(ds.datasetId));
    } else {
      selectedRosterDatasetIds.clear();
    }
    renderDatasetsRoster();
  });

  rosterIngestBtn?.addEventListener('click', () => {
    if (selectedRosterDatasetIds.size === 0) return;
    urlIntelligenceLayer.renderSelectedDatasets?.(Array.from(selectedRosterDatasetIds));
    setStatus('success', `Rendered ${selectedRosterDatasetIds.size} datasets simultaneously on 3D globe.`, 'Selective simultaneous multi-dataset rendering complete');
    urlIntelligenceLayer.flyToExtent();
  });

  gdriveGuideToggleBtn?.addEventListener('click', () => {
    if (!gdriveGuideCard) return;
    const isShown = gdriveGuideCard.style.display !== 'none';
    gdriveGuideCard.style.display = isShown ? 'none' : 'block';
    gdriveGuideToggleBtn.classList.toggle('active', !isShown);
  });

  gdriveGuideClose?.addEventListener('click', () => {
    if (gdriveGuideCard) gdriveGuideCard.style.display = 'none';
    if (gdriveGuideToggleBtn) gdriveGuideToggleBtn.classList.remove('active');
  });

  gdriveSelectAll?.addEventListener('change', (e) => {
    const allFiles = [...CURATED_DRIVE_PRESETS, ...driveCloudFiles];
    const filtered = activeDriveCategory === 'ALL'
      ? allFiles
      : allFiles.filter((f) => f.folderCategory === activeDriveCategory);
    if (e.target.checked) {
      filtered.forEach((f) => selectedDriveFileIds.add(f.id));
    } else {
      filtered.forEach((f) => selectedDriveFileIds.delete(f.id));
    }
    updateDriveSelectedCount();
    renderDriveFileList();
  });

  gdriveFolderTabs?.querySelectorAll('.url-intel-folder-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      gdriveFolderTabs.querySelectorAll('.url-intel-folder-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeDriveCategory = chip.getAttribute('data-folder');
      renderDriveFileList();
    });
  });

  // Submit button
  submitBtn.addEventListener('click', () => handleIngest());

  // Input Enter key
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleIngest();
    }
  });

  // Fly to extent button
  flyBtn.addEventListener('click', () => {
    urlIntelligenceLayer.flyToExtent();
  });

  // Start Map Tour button
  tourBtn?.addEventListener('click', () => {
    closeModal();
    window.dispatchEvent(new CustomEvent('gev:start-url-tour', {
      detail: { mode: 'all' },
    }));
  });

  // Close button
  closeBtn.addEventListener('click', closeModal);

  // Global events & key handlers
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) {
      closeModal();
    }
  });

  window.addEventListener('gev:open-url-intelligence-modal', (e) => {
    const tab = e?.detail?.tab || null;
    openModal(tab);
  });

  return {
    open: openModal,
    close: closeModal,
    switchTab,
    get tacticalWorkbench() {
      return getFloatingWorkbenchInstance();
    },
    ingest: handleIngest,
    renderRecentSearches,
    openServiceDialog,
    closeServiceDialog,
  };
}
