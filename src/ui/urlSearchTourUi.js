/**
 * @fileoverview UI Controller for URL Intelligence Auto-Suggest & Map Tour HUD.
 * 
 * Provides:
 * 1. Intelligent auto-suggest dropdown docked to #location-search.
 * 2. Multi-chain search rendering (Category -> Region -> Specific Point/Vehicle).
 * 3. Interactive floating Map Tour HUD with Play, Pause, Stop, Exit, Speed, and Duration controls.
 * 4. Pulsating visual ring and boundary animations on Cesium globe.
 */

import * as Cesium from 'cesium';
import urlIntelligenceLayer from '../data/urlIntelligence.js';
import {
  searchUrlIntelligence,
  highlightPulsatingTarget,
  highlightPulsatingPerimeter,
  clearAllTourHighlights,
  MapTourController,
  getCategoryIcon,
  getCategoryAccentColor,
  sanitizeBounds,
} from '../data/urlLayerTour.js';

class UrlSearchTourUi {
  constructor() {
    this.viewer = null;
    this.ui = null;
    this.tourController = null;
    this.suggestDropdown = null;
    this.tourHud = null;
    this.searchInput = null;
    this.searchWrap = null;
    this.activeSuggestionIndex = -1;
    this.currentSuggestions = [];
    this.isTourHudVisible = false;
    this._keydownHandler = null;
    this._docClickHandler = null;
  }

  /**
   * Initializes the search autocomplete and tour HUD with Cesium viewer.
   * @param {Cesium.Viewer} viewer
   * @param {Object} [uiInstance]
   */
  init(viewer, uiInstance = null) {
    this.viewer = viewer;
    this.ui = uiInstance;

    // Create Tour Controller
    this.tourController = new MapTourController(viewer, {
      onSelectCallback: (item) => {
        if (item.vehicleId) {
          urlIntelligenceLayer.selectVehicle?.(item.vehicleId, false, { isTour: true });
        } else if (item.id) {
          urlIntelligenceLayer.selectPoint?.(item.id, false, { isTour: true });
        }
      },
    });

    // Subscribe HUD to Tour Controller state changes
    this.tourController.subscribe((state) => {
      this._updateTourHud(state);
    });

    // Cache DOM references
    this.searchInput = document.getElementById('location-search');
    this.searchWrap = document.querySelector('.location-search-wrap');

    if (!this.searchInput || !this.searchWrap) {
      console.warn('[UrlSearchTourUi] Search input elements not found; delaying setup.');
      return;
    }

    this._createSuggestDropdown();
    this._createTourHud();
    this._bindSearchEvents();
    this._bindKeyboardShortcuts();

    // Listen for custom tour launch events from UI or layer chips
    window.addEventListener('gev:start-url-tour', (e) => {
      const detail = e.detail || {};
      this.startTour(detail.mode || 'all', detail);
    });

    console.log('[UrlSearchTourUi] Initialized URL Intelligence Search & Map Tour system.');
  }

  /**
   * Creates the auto-suggest dropdown DOM element.
   */
  _createSuggestDropdown() {
    if (document.getElementById('url-search-suggest-dropdown')) {
      this.suggestDropdown = document.getElementById('url-search-suggest-dropdown');
      return;
    }

    const dd = document.createElement('div');
    dd.id = 'url-search-suggest-dropdown';
    dd.className = 'url-search-suggest-dropdown';
    dd.style.display = 'none';

    // Append to document body or wrap for absolute anchoring
    this.searchWrap.appendChild(dd);
    this.suggestDropdown = dd;
  }

  /**
   * Creates the floating Map Tour HUD overlay.
   */
  _createTourHud() {
    if (document.getElementById('url-layer-tour-hud')) {
      this.tourHud = document.getElementById('url-layer-tour-hud');
      return;
    }

    const hud = document.createElement('div');
    hud.id = 'url-layer-tour-hud';
    hud.className = 'url-tour-hud';
    hud.style.display = 'none';

    hud.innerHTML = `
      <div class="url-tour-hud-inner">
        <div class="url-tour-top-bar">
          <div class="url-tour-badge">
            <span class="url-tour-live-dot"></span>
            <span id="url-tour-status-label">MAP TOUR: ACTIVE</span>
          </div>
          <div class="url-tour-step-counter" id="url-tour-step-counter">Stop 1 of 12</div>
          <button type="button" class="url-tour-close-btn" id="url-tour-exit-btn" title="Exit Tour (Esc)">✕</button>
        </div>

        <div class="url-tour-chain-breadcrumb" id="url-tour-chain-breadcrumb" style="display: none;">
          <span class="url-tour-breadcrumb-icon" id="url-tour-breadcrumb-icon">🔗</span>
          <div class="url-tour-breadcrumb-path" id="url-tour-breadcrumb-path"></div>
        </div>

        <div class="url-tour-target-card">
          <span class="url-tour-target-icon" id="url-tour-target-icon">🏢</span>
          <div class="url-tour-target-meta">
            <div class="url-tour-target-title-row">
              <span class="url-tour-target-title" id="url-tour-target-title">Target Point</span>
              <span class="url-tour-target-category-badge" id="url-tour-target-category">CATEGORY</span>
            </div>
            <div class="url-tour-target-region-row" id="url-tour-target-region-row">
              <span class="url-tour-region-icon">📍</span>
              <span class="url-tour-target-region" id="url-tour-target-region">Regional Context</span>
            </div>
            <div class="url-tour-target-coords-row">
              <span class="url-tour-coords-icon">🌐</span>
              <span class="url-tour-target-coords" id="url-tour-target-coords">--°N, --°E</span>
            </div>
          </div>
          <button type="button" class="url-tour-inspect-btn" id="url-tour-inspect-btn" title="Inspect full data in dialog (pauses tour)">
            ⤢ Inspect
          </button>
        </div>

        <div class="url-tour-progress-track">
          <div class="url-tour-progress-bar" id="url-tour-dwell-bar" style="width: 100%;"></div>
        </div>

        <div class="url-tour-controls-row">
          <div class="url-tour-btn-group">
            <button type="button" class="url-tour-btn" id="url-tour-prev-btn" title="Previous stop (Left Arrow)">⏮</button>
            <button type="button" class="url-tour-btn url-tour-btn-primary" id="url-tour-play-pause-btn" title="Play/Pause (Space)">⏸ PAUSE</button>
            <button type="button" class="url-tour-btn" id="url-tour-next-btn" title="Next stop (Right Arrow)">⏭</button>
            <button type="button" class="url-tour-btn" id="url-tour-stop-btn" title="Stop tour">⏹ STOP</button>
          </div>

          <!-- Compact merged speed and dwell settings row -->
          <div class="url-tour-settings-row">
            <div class="url-tour-setting-item">
              <span class="url-tour-setting-label">SPD:</span>
              <div class="url-tour-pills" id="url-tour-speed-pills">
                <button type="button" class="url-tour-pill" data-speed="0.5">.5x</button>
                <button type="button" class="url-tour-pill active" data-speed="1">1x</button>
                <button type="button" class="url-tour-pill" data-speed="2">2x</button>
                <button type="button" class="url-tour-pill" data-speed="3">3x</button>
              </div>
            </div>

            <div class="url-tour-setting-divider"></div>

            <div class="url-tour-setting-item">
              <span class="url-tour-setting-label">DWL:</span>
              <div class="url-tour-pills" id="url-tour-duration-pills">
                <button type="button" class="url-tour-pill" data-duration="2">2s</button>
                <button type="button" class="url-tour-pill active" data-duration="4">4s</button>
                <button type="button" class="url-tour-pill" data-duration="6">6s</button>
                <button type="button" class="url-tour-pill" data-duration="10">10s</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tour Camera Transition Animation (OpenLayers View Animation inspired) -->
        <div class="url-tour-pref-section" id="url-tour-anim-section">
          <div class="url-tour-pref-label">
            <span>ANIMATION MODE</span>
            <span class="url-tour-pref-hint">VIEWPORT CENTERED</span>
          </div>
          <div class="url-tour-mode-segmented" id="url-tour-anim-mode-selector">
            <button type="button" class="url-tour-mode-seg-btn active" data-anim="swoop-orbit" title="OpenLayers-style parabolic Arc flight + 3D Orbit during dwell.">
              ✈️ Arc &amp; Orbit
            </button>
            <button type="button" class="url-tour-mode-seg-btn" data-anim="glide-lock" title="Direct smooth glide with cubic easing deceleration and locked 3D view.">
              🎯 Smooth Glide
            </button>
            <button type="button" class="url-tour-mode-seg-btn" data-anim="nadir" title="Top-down orthographic pan (classic 2D map view).">
              🛰️ Top-Down
            </button>
          </div>
        </div>

        <!-- Ultra-compact horizontal segmented Tour Detail Display Bar -->
        <div class="url-tour-pref-section" id="url-tour-pref-section">
          <div class="url-tour-pref-label">
            <span>DETAIL DISPLAY</span>
          </div>
          <div class="url-tour-mode-segmented" id="url-tour-display-mode-selector">
            <button type="button" class="url-tour-mode-seg-btn active" data-mode="cinematic" title="Unobstructed 3D globe. Keep center screen clear, essential telemetry in card only.">
              🎬 Cine
            </button>
            <button type="button" class="url-tour-mode-seg-btn" data-mode="docked" title="Dock full attributes & links into this panel below.">
              📋 Dock
            </button>
            <button type="button" class="url-tour-mode-seg-btn" data-mode="modal" title="Show center-screen modal popup at each stop.">
              🪟 Popup
            </button>
          </div>
        </div>

        <!-- Docked Drawer (active when 'Dock' mode is selected) -->
        <div class="url-tour-docked-drawer" id="url-tour-docked-drawer" style="display: none;">
          <div class="url-tour-docked-header">
            <span class="url-tour-docked-title">INGESTED ATTRIBUTES &amp; LINKS</span>
          </div>
          <div class="url-tour-docked-content" id="url-tour-docked-content">
            <div class="url-tour-docked-empty">Select a point to preview attributes.</div>
          </div>
        </div>
      </div>
    `;

    // Lower-right most placement: Attach directly to document.body so it floats fixed at bottom-right
    document.body.appendChild(hud);
    this.tourHud = hud;

    // Attach HUD control handlers
    hud.querySelector('#url-tour-exit-btn')?.addEventListener('click', () => this.exitTour());
    hud.querySelector('#url-tour-stop-btn')?.addEventListener('click', () => this.stopTour());
    hud.querySelector('#url-tour-play-pause-btn')?.addEventListener('click', () => {
      this.tourController?.togglePlay();
    });
    hud.querySelector('#url-tour-prev-btn')?.addEventListener('click', () => {
      this.tourController?.prev();
    });
    hud.querySelector('#url-tour-next-btn')?.addEventListener('click', () => {
      this.tourController?.next();
    });

    // Inspect full data button (pauses tour and opens modal on demand)
    hud.querySelector('#url-tour-inspect-btn')?.addEventListener('click', () => {
      const state = this.tourController?.getState();
      const pt = state?.currentStop?.rawRef || state?.currentStop;
      if (pt) {
        this.tourController?.pause();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gev:open-service-dialog', {
            detail: { point: pt },
          }));
        }
      }
    });

    // Speed pills
    hud.querySelectorAll('#url-tour-speed-pills .url-tour-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const sp = Number(e.currentTarget.getAttribute('data-speed'));
        if (sp) {
          this.tourController?.setSpeed(sp);
          hud.querySelectorAll('#url-tour-speed-pills .url-tour-pill').forEach((p) => p.classList.remove('active'));
          e.currentTarget.classList.add('active');
        }
      });
    });

    // Duration pills
    hud.querySelectorAll('#url-tour-duration-pills .url-tour-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const dur = Number(e.currentTarget.getAttribute('data-duration'));
        if (dur) {
          this.tourController?.setDuration(dur);
          hud.querySelectorAll('#url-tour-duration-pills .url-tour-pill').forEach((p) => p.classList.remove('active'));
          e.currentTarget.classList.add('active');
        }
      });
    });

    // Initialize preferences
    this._initAnimationModePreference();
    this._initDisplayModePreference();

    // Listen for docked details updates
    window.addEventListener('gev:render-docked-tour-details', (e) => {
      if (e?.detail?.point) {
        this._updateDockedDrawer(e.detail.point);
      }
    });
  }

  /**
   * Binds auto-suggest listeners to the #location-search input.
   */
  _bindSearchEvents() {
    if (!this.searchInput) return;

    // Trigger suggestion rendering on user typing
    this.searchInput.addEventListener('input', () => {
      this._handleSearchInput();
    });

    // Trigger on focus when field is clicked or opened
    this.searchInput.addEventListener('focus', () => {
      this._handleSearchInput();
    });

    // Close dropdown on outside click
    this._docClickHandler = (e) => {
      if (!this.searchWrap.contains(e.target) && !this.suggestDropdown.contains(e.target)) {
        this.closeSuggestions();
      }
    };
    document.addEventListener('click', this._docClickHandler);

    // Keyboard navigation within the dropdown
    this.searchInput.addEventListener('keydown', (e) => {
      if (this.suggestDropdown.style.display === 'none') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._navigateSuggestion(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._navigateSuggestion(-1);
      } else if (e.key === 'Enter') {
        const itemToSelect = this.activeSuggestionIndex >= 0
          ? this.currentSuggestions[this.activeSuggestionIndex]
          : this.currentSuggestions.find((s) => s.type === 'point' || s.type === 'vehicle' || s.type === 'multi-chain' || s.type === 'category');
        if (itemToSelect) {
          e.preventDefault();
          e.stopPropagation();
          this._selectSuggestion(itemToSelect);
        }
      } else if (e.key === 'Escape') {
        this.closeSuggestions();
      }
    });
  }

  /**
   * Binds global keyboard shortcuts when Map Tour is active.
   */
  _bindKeyboardShortcuts() {
    this._keydownHandler = (e) => {
      if (!this.isTourHudVisible) return;
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.tourController?.togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.tourController?.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.tourController?.prev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.exitTour();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  /**
   * Evaluates search query against URL Intelligence and renders suggestions.
   */
  _handleSearchInput() {
    const dataset = this._getLoadedDataset();
    const hasData = (dataset.points && dataset.points.length > 0) ||
                    (dataset.trajectoryList && dataset.trajectoryList.length > 0);

    if (!hasData) {
      this.closeSuggestions();
      return;
    }

    const query = this.searchInput.value.trim();
    const searchResult = searchUrlIntelligence(query, dataset);

    if (searchResult.totalMatches === 0) {
      this.closeSuggestions();
      return;
    }

    this._renderSuggestions(searchResult);
  }

  /**
   * Retrieves currently loaded URL Intelligence data.
   */
  _getLoadedDataset() {
    const points = urlIntelligenceLayer.getPoints?.() || [];
    const trajectories = urlIntelligenceLayer.getTrajectoryList?.() || [];
    const schema = urlIntelligenceLayer.getSchemaInfo?.() || {};
    const hud = urlIntelligenceLayer.getHudData?.() || {};

    return {
      points,
      trajectoryList: trajectories,
      categories: schema.categories || hud.categories || [],
      categoryCounts: hud.categoryCounts || {},
      isTrajectory: urlIntelligenceLayer.isTrajectory?.() || false,
      activeUrl: urlIntelligenceLayer.getActiveUrl?.() || '',
    };
  }

  /**
   * Renders structured auto-suggest results into the dropdown.
   */
  _renderSuggestions(result) {
    if (!this.suggestDropdown) return;

    this.currentSuggestions = [];
    this.activeSuggestionIndex = -1;

    let html = `
      <div class="url-suggest-header">
        <span class="url-suggest-header-title">⚡ URL INTELLIGENCE SEARCH</span>
        <span class="url-suggest-badge">${result.totalMatches} matches</span>
      </div>
      <div class="url-suggest-scrollable">
    `;

    // 1. Actions section
    if (result.actions.length > 0) {
      html += `<div class="url-suggest-section-label">COMMAND ACTIONS</div>`;
      for (const act of result.actions) {
        const itemIdx = this.currentSuggestions.length;
        this.currentSuggestions.push(act);
        html += `
          <div class="url-suggest-item url-suggest-action" data-index="${itemIdx}">
            <span class="url-suggest-icon">${act.icon}</span>
            <div class="url-suggest-text">
              <span class="url-suggest-main">${this._escapeHtml(act.label)}</span>
            </div>
            <span class="url-suggest-pill action">EXECUTE</span>
          </div>
        `;
      }
    }

    // 2. Categories with quick Tour buttons
    if (result.categories.length > 0) {
      html += `<div class="url-suggest-section-label">CATEGORIES & BOUNDARIES</div>`;
      for (const cat of result.categories) {
        const itemIdx = this.currentSuggestions.length;
        this.currentSuggestions.push(cat);
        html += `
          <div class="url-suggest-item url-suggest-category" data-index="${itemIdx}">
            <span class="url-suggest-icon">${cat.icon}</span>
            <div class="url-suggest-text">
              <span class="url-suggest-main">${this._escapeHtml(cat.name)}</span>
              <span class="url-suggest-sub">${cat.count} units in layer</span>
            </div>
            <div class="url-suggest-actions-cell">
              <button type="button" class="url-suggest-mini-tour-btn" data-tour-category="${this._escapeHtml(cat.name)}" title="Tour this category">
                ▶ TOUR
              </button>
            </div>
          </div>
        `;
      }
    }

    // 3. Multi-Chain Filters
    if (result.multiChains.length > 0) {
      html += `<div class="url-suggest-section-label">MULTI-CHAIN DRILL-DOWN</div>`;
      for (const chain of result.multiChains) {
        const itemIdx = this.currentSuggestions.length;
        this.currentSuggestions.push(chain);
        html += `
          <div class="url-suggest-item url-suggest-multichain" data-index="${itemIdx}">
            <span class="url-suggest-icon">🔗</span>
            <div class="url-suggest-text">
              <span class="url-suggest-main">${this._escapeHtml(chain.label)}</span>
              <span class="url-suggest-sub">${chain.count} items in category & region</span>
            </div>
            <button type="button" class="url-suggest-mini-tour-btn" data-tour-chain="${this._escapeHtml(chain.id)}" title="Tour this chain">
              ▶ TOUR
            </button>
          </div>
        `;
      }
    }

    // 4. Individual Points & Units
    if (result.items.length > 0) {
      html += `<div class="url-suggest-section-label">LANDMARKS & VEHICLE UNITS</div>`;
      for (const it of result.items) {
        const itemIdx = this.currentSuggestions.length;
        this.currentSuggestions.push(it);
        const sub = it.address || it.details || `${Number(it.lat).toFixed(4)}°, ${Number(it.lon).toFixed(4)}°`;
        html += `
          <div class="url-suggest-item url-suggest-point" data-index="${itemIdx}">
            <span class="url-suggest-icon">${it.icon}</span>
            <div class="url-suggest-text">
              <span class="url-suggest-main">${this._escapeHtml(it.name)}</span>
              <span class="url-suggest-sub">${this._escapeHtml(sub)}</span>
            </div>
            <span class="url-suggest-pill category">${this._escapeHtml(it.category)}</span>
          </div>
        `;
      }
    }

    html += `
      </div>
      <div class="url-suggest-footer">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>Esc Close</span>
      </div>
    `;

    this.suggestDropdown.innerHTML = html;
    this.suggestDropdown.style.display = 'flex';

    // Bind item clicks
    this.suggestDropdown.querySelectorAll('.url-suggest-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Prevent if clicking on mini-tour button
        if (e.target.closest('.url-suggest-mini-tour-btn')) return;
        const idx = Number(el.getAttribute('data-index'));
        if (!Number.isNaN(idx) && this.currentSuggestions[idx]) {
          this._selectSuggestion(this.currentSuggestions[idx]);
        }
      });
    });

    // Bind mini-tour button clicks inside categories and chains
    this.suggestDropdown.querySelectorAll('.url-suggest-mini-tour-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catName = btn.getAttribute('data-tour-category');
        const chainId = btn.getAttribute('data-tour-chain');
        if (catName) {
          this.startCategoryTour(catName);
        } else if (chainId) {
          const chainItem = this.currentSuggestions.find((s) => s.id === chainId);
          if (chainItem && chainItem.points) {
            this.startMultiChainTour(chainItem);
            this.closeSuggestions();
          }
        }
      });
    });
  }

  _navigateSuggestion(direction) {
    const items = this.suggestDropdown?.querySelectorAll('.url-suggest-item');
    if (!items || items.length === 0) return;

    items.forEach((it) => it.classList.remove('active'));

    this.activeSuggestionIndex += direction;
    if (this.activeSuggestionIndex < 0) this.activeSuggestionIndex = items.length - 1;
    if (this.activeSuggestionIndex >= items.length) this.activeSuggestionIndex = 0;

    const activeItem = items[this.activeSuggestionIndex];
    if (activeItem) {
      activeItem.classList.add('active');
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Executes selection of an auto-suggest item.
   */
  _selectSuggestion(suggestion) {
    if (!suggestion) return;

    if (suggestion.type === 'action') {
      if (suggestion.action === 'start-tour-all') {
        this.startAllTour();
      } else if (suggestion.action === 'fit-extent') {
        urlIntelligenceLayer.flyToExtent?.();
        this._highlightDatasetPerimeter();
      }
    } else if (suggestion.type === 'category') {
      this._selectCategoryFilter(suggestion.name);
    } else if (suggestion.type === 'multi-chain') {
      this._selectMultiChain(suggestion);
    } else if (suggestion.type === 'point' || suggestion.type === 'vehicle') {
      this._selectPointOrVehicle(suggestion);
    }

    this.closeSuggestions();
  }

  /**
   * Filters by category, presents a pulsating perimeter of that category, and zooms camera.
   */
  _selectCategoryFilter(categoryName) {
    urlIntelligenceLayer.setParams?.({ category: categoryName });
    const dataset = this._getLoadedDataset();
    const catPoints = dataset.points.filter((p) => p.category === categoryName);

    if (catPoints.length > 0 && this.viewer) {
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const p of catPoints) {
        const lat = Number(p.lat);
        const lon = Number(p.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
      }

      if (Number.isFinite(minLat)) {
        const safe = sanitizeBounds({ minLat, maxLat, minLon, maxLon }, 0.05);
        if (safe) {
          highlightPulsatingPerimeter(this.viewer, {
            bounds: safe,
            color: getCategoryAccentColor(categoryName),
            title: categoryName,
          });

          try {
            const rect = Cesium.Rectangle.fromDegrees(
              safe.minLon, safe.minLat, safe.maxLon, safe.maxLat
            );
            this.viewer.camera.flyTo({ destination: rect, duration: 1.8 });
          } catch (err) {
            console.warn('[UrlSearchTourUi] Cesium flyTo error:', err);
          }
        }
      }
    }
  }

  /**
   * Multi-chain filter selection & automated hierarchy tour.
   */
  _selectMultiChain(chain) {
    this.startMultiChainTour(chain);
  }

  /**
   * Launches a sequential Map Tour traversing exclusively through the sub-facilities of a composite chain.
   */
  startMultiChainTour(chain) {
    if (!chain) return;
    const points = chain.points || [];
    if (points.length === 0) return;

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }

    const safeBounds = Number.isFinite(minLat) ? sanitizeBounds({ minLat, maxLat, minLon, maxLon }, 0.04) : null;

    if (this.tourController) {
      this.tourController.startTour({
        mode: 'multi-chain',
        chainPath: chain.label,
        chainTier: chain.tier || (chain.label.split('>').length),
        chainCategory: chain.category,
        chainRegion: chain.region,
        chainSubFacility: chain.subFacility,
        items: points,
        bounds: safeBounds,
        title: `Chain: ${chain.label}`,
      });
      this.showTourHud();
    }
  }

  /**
   * Flies camera to individual point or vehicle and activates the pulsating ring.
   */
  _selectPointOrVehicle(item) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !this.viewer) return;

    // Activate temporary pulsating ring on target
    highlightPulsatingTarget(this.viewer, {
      lat,
      lon,
      color: getCategoryAccentColor(item.category),
      baseRadius: 250,
      label: item.name,
    });

    // Fly camera with guaranteed target centering
    try {
      if (
        Cesium.Cartesian3 &&
        Cesium.BoundingSphere &&
        this.viewer.camera?.flyToBoundingSphere
      ) {
        const targetPos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
        const sphere = new Cesium.BoundingSphere(targetPos, 0);
        const hpr = new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          3600
        );
        this.viewer.camera.flyToBoundingSphere(sphere, {
          offset: hpr,
          duration: 1.6,
          easingFunction: Cesium.EasingFunction?.CUBIC_IN_OUT || undefined,
          complete: () => {
            try {
              this.viewer.camera.lookAt(targetPos, hpr);
              this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            } catch {}
          },
        });
      } else if (this.viewer.camera?.flyTo) {
        const dest = Cesium.Cartesian3
          ? Cesium.Cartesian3.fromDegrees(lon, lat, 3500)
          : { x: lon, y: lat, z: 3500 };
        this.viewer.camera.flyTo({
          destination: dest,
          duration: 1.6,
        });
      }
    } catch (err) {
      console.warn('[UrlSearchTourUi] Cesium flyTo error:', err);
    }

    // Select in URL Intelligence
    if (item.type === 'vehicle' && item.vehicleId) {
      urlIntelligenceLayer.selectVehicle?.(item.vehicleId, false);
    } else if (item.id) {
      urlIntelligenceLayer.selectPoint?.(item.id, false);
    }
  }

  /**
   * Highlights full dataset perimeter with pulsating boundary.
   */
  _highlightDatasetPerimeter() {
    const dataset = this._getLoadedDataset();
    const points = dataset.points || [];
    if (points.length === 0 || !this.viewer) return;

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }

    if (Number.isFinite(minLat)) {
      const safe = sanitizeBounds({ minLat, maxLat, minLon, maxLon }, 0.05);
      if (safe) {
        highlightPulsatingPerimeter(this.viewer, {
          bounds: safe,
          color: '#00e5ff',
          title: 'All Loaded Intelligence',
        });
      }
    }
  }

  /**
   * Closes the auto-suggest dropdown.
   */
  closeSuggestions() {
    if (this.suggestDropdown) {
      this.suggestDropdown.style.display = 'none';
      this.currentSuggestions = [];
      this.activeSuggestionIndex = -1;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MAP TOUR WORKFLOWS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Starts a Map Tour of all loaded points.
   */
  startAllTour() {
    const dataset = this._getLoadedDataset();
    const items = dataset.points.length > 0 ? dataset.points : dataset.trajectoryList;

    if (!items || items.length === 0) {
      console.warn('[UrlSearchTourUi] No items available to tour.');
      return;
    }

    this.tourController?.startTour({
      mode: 'all',
      items,
      title: 'Global URL Intelligence Tour',
    });

    this.showTourHud();
    this.closeSuggestions();
  }

  /**
   * Starts a Map Tour for a specific category.
   */
  startCategoryTour(categoryName) {
    const dataset = this._getLoadedDataset();
    const items = dataset.points.filter((p) => p.category === categoryName);

    if (items.length === 0) {
      console.warn('[UrlSearchTourUi] No points found for category:', categoryName);
      return;
    }

    this.tourController?.startTour({
      mode: 'category',
      category: categoryName,
      items,
      title: `Tour: ${categoryName}`,
    });

    this.showTourHud();
    this.closeSuggestions();
  }

  /**
   * Generalized tour starter.
   */
  startTour(mode = 'all', options = {}) {
    if (mode === 'category' && options.category) {
      this.startCategoryTour(options.category);
    } else {
      this.startAllTour();
    }
  }

  /**
   * Displays the floating Tour HUD.
   */
  showTourHud() {
    if (!this.tourHud) return;
    this.tourHud.style.display = 'block';
    this.isTourHudVisible = true;
    if (typeof window !== 'undefined') {
      window.__gevTourActive = true;
      if (this.displayMode !== 'modal') {
        window.dispatchEvent(new CustomEvent('gev:close-service-dialog'));
      }
    }
  }

  /**
   * Hides the floating Tour HUD.
   */
  hideTourHud() {
    if (!this.tourHud) return;
    this.tourHud.style.display = 'none';
    this.isTourHudVisible = false;
    if (typeof window !== 'undefined') {
      window.__gevTourActive = false;
    }
  }

  /**
   * Stops the current tour without removing stops.
   */
  stopTour() {
    this.tourController?.stop();
    if (typeof window !== 'undefined') {
      window.__gevTourActive = false;
    }
  }

  /**
   * Exits and closes the tour HUD.
   */
  exitTour() {
    this.tourController?.exit();
    this.hideTourHud();
    if (typeof window !== 'undefined') {
      window.__gevTourActive = false;
    }
    if (this.viewer) {
      clearAllTourHighlights(this.viewer);
    }
  }

  /**
   * Initializes user preference for tour camera transition animation:
   * 'swoop-orbit' (Arc + 3D surveillance orbit), 'glide-lock' (Direct smooth glide), or 'nadir' (Top-down orthographic pan).
   */
  _initAnimationModePreference() {
    let anim = 'swoop-orbit';
    try {
      if (typeof localStorage !== 'undefined') {
        anim = localStorage.getItem('gev_tour_animation_mode') || 'swoop-orbit';
      }
    } catch {}
    this.animationMode = anim;

    const animBtns = this.tourHud?.querySelectorAll('#url-tour-anim-mode-selector .url-tour-mode-seg-btn');
    animBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedAnim = btn.dataset.anim;
        if (selectedAnim) {
          this.setAnimationMode(selectedAnim);
        }
      });
    });

    this.setAnimationMode(anim);
  }

  /**
   * Updates tour animation mode preference and syncs controller.
   */
  setAnimationMode(anim) {
    this.animationMode = anim;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gev_tour_animation_mode', anim);
      }
    } catch {}

    const animBtns = this.tourHud?.querySelectorAll('#url-tour-anim-mode-selector .url-tour-mode-seg-btn');
    animBtns?.forEach((btn) => {
      if (btn.dataset.anim === anim) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.tourController?.setAnimationMode(anim);
  }

  /**
   * Initializes user preference for tour detail display mode:
   * 'cinematic' (no popup), 'docked' (sidebar drawer), or 'modal' (center popup).
   */
  _initDisplayModePreference() {
    let mode = 'cinematic';
    try {
      if (typeof localStorage !== 'undefined') {
        mode = localStorage.getItem('gev_tour_display_mode') || 'cinematic';
      }
    } catch {}
    this.displayMode = mode;

    const segBtns = this.tourHud?.querySelectorAll('#url-tour-display-mode-selector .url-tour-mode-seg-btn');
    segBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedMode = btn.dataset.mode;
        if (selectedMode) {
          this.setDisplayMode(selectedMode);
        }
      });
    });

    this.setDisplayMode(mode);
  }

  /**
   * Updates display mode preference and reflects UI state immediately.
   */
  setDisplayMode(mode) {
    this.displayMode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gev_tour_display_mode', mode);
      }
    } catch {}

    // Update segmented buttons visual active state
    const segBtns = this.tourHud?.querySelectorAll('#url-tour-display-mode-selector .url-tour-mode-seg-btn');
    segBtns?.forEach((btn) => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const drawer = this.tourHud?.querySelector('#url-tour-docked-drawer');
    if (drawer) {
      drawer.style.display = mode === 'docked' ? 'block' : 'none';
    }

    if (mode === 'cinematic' || mode === 'docked') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gev:close-service-dialog'));
      }
    } else if (mode === 'modal') {
      const state = this.tourController?.getState();
      const pt = state?.currentStop?.rawRef || state?.currentStop;
      if (state && state.status === 'playing' && pt && !state.currentStop?.isPerimeter) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gev:open-service-dialog', {
            detail: { point: pt },
          }));
        }
      }
    }
  }

  /**
   * Renders the attributes and hyperlinks inside the docked sidebar drawer.
   */
  _updateDockedDrawer(point) {
    const drawer = this.tourHud?.querySelector('#url-tour-docked-drawer');
    const content = this.tourHud?.querySelector('#url-tour-docked-content');
    if (!drawer || !content) return;

    if (!point || point.isPerimeter) {
      content.innerHTML = '<div class="url-tour-docked-empty">Overview perimeter in progress. Next stop will render facility attributes.</div>';
      return;
    }

    const raw = point.rawRecord || point.rawRef?.rawRecord || {
      Name: point.name || point.title,
      Category: point.category,
      Address: point.address,
      Contact: point.contact,
      Details: point.details,
    };

    let html = '';

    // Links section if any
    const links = Array.isArray(point.capturedHyperlinks)
      ? point.capturedHyperlinks
      : Array.isArray(point.rawRef?.capturedHyperlinks)
        ? point.rawRef.capturedHyperlinks
        : [];

    if (links.length > 0) {
      html += `
        <div class="url-tour-docked-section-label">LINKS (${links.length})</div>
        <div class="url-tour-docked-links">
      `;
      for (const l of links) {
        const urlStr = typeof l === 'string' ? l : (l.url || '');
        html += `
          <div class="url-tour-docked-link-row">
            <span class="url-tour-docked-link-url" title="${this._escapeHtml(urlStr)}">${this._escapeHtml(urlStr)}</span>
            <a href="${this._escapeHtml(urlStr)}" target="_blank" rel="noopener noreferrer" class="url-tour-docked-link-btn">↗ Open</a>
          </div>
        `;
      }
      html += `</div>`;
    }

    // Attributes table
    html += `
      <div class="url-tour-docked-section-label">ATTRIBUTES</div>
      <div class="url-tour-docked-table-wrap">
        <table class="url-tour-docked-table">
          <tbody>
    `;
    const entries = Object.entries(raw);
    if (entries.length > 0) {
      for (const [k, v] of entries) {
        html += `
          <tr>
            <td class="url-tour-docked-key">${this._escapeHtml(k)}</td>
            <td class="url-tour-docked-val">${this._escapeHtml(String(v ?? '—'))}</td>
          </tr>
        `;
      }
    } else {
      html += `<tr><td colspan="2" class="url-tour-docked-empty">No extra attributes</td></tr>`;
    }
    html += `
          </tbody>
        </table>
      </div>
    `;

    content.innerHTML = html;
  }

  /**
   * Synchronizes Tour HUD elements with controller state.
   */
  _updateTourHud(state) {
    if (!this.tourHud) return;

    if (state.status === 'idle') {
      this.hideTourHud();
      return;
    }

    // Status label & badge
    const statusLabel = this.tourHud.querySelector('#url-tour-status-label');
    const playPauseBtn = this.tourHud.querySelector('#url-tour-play-pause-btn');

    if (statusLabel) {
      statusLabel.textContent = `MAP TOUR: ${state.status.toUpperCase()}`;
    }

    if (playPauseBtn) {
      if (state.status === 'playing') {
        playPauseBtn.textContent = '⏸ PAUSE';
        playPauseBtn.classList.remove('paused');
      } else {
        playPauseBtn.textContent = '▶ PLAY';
        playPauseBtn.classList.add('paused');
      }
    }

    // Stop counter
    const stepCounter = this.tourHud.querySelector('#url-tour-step-counter');
    if (stepCounter) {
      stepCounter.textContent = `Stop ${state.currentIndex + 1} of ${state.totalStops}`;
    }

    // Multi-chain hierarchy breadcrumb
    const breadcrumbEl = this.tourHud.querySelector('#url-tour-chain-breadcrumb');
    const breadcrumbPathEl = this.tourHud.querySelector('#url-tour-breadcrumb-path');
    const breadcrumbIconEl = this.tourHud.querySelector('#url-tour-breadcrumb-icon');

    if (state.chainPath && breadcrumbEl && breadcrumbPathEl) {
      breadcrumbEl.style.display = 'flex';
      if (breadcrumbIconEl) {
        breadcrumbIconEl.textContent = state.chainTier === 3 ? '🏢' : '🔗';
      }
      const parts = state.chainPath.split(/\s*>\s*/);
      const isOverview = state.currentStop?.isPerimeter;
      const crumbsHtml = parts.map((part, idx) => {
        let cls = 'url-tour-crumb';
        if (!isOverview && idx === parts.length - 1) {
          cls += ' active';
        } else if (isOverview) {
          cls += ' in-scope';
        }
        return `<span class="${cls}">${this._escapeHtml(part.trim())}</span>`;
      }).join('<span class="url-tour-crumb-sep">›</span>');

      breadcrumbPathEl.innerHTML = crumbsHtml;
    } else if (breadcrumbEl) {
      breadcrumbEl.style.display = 'none';
    }

    // Target information card
    const stop = state.currentStop;
    const titleEl = this.tourHud.querySelector('#url-tour-target-title');
    const iconEl = this.tourHud.querySelector('#url-tour-target-icon');
    const catEl = this.tourHud.querySelector('#url-tour-target-category');
    const regEl = this.tourHud.querySelector('#url-tour-target-region');
    const coordsEl = this.tourHud.querySelector('#url-tour-target-coords');

    if (stop) {
      if (titleEl) titleEl.textContent = stop.title || 'Target';
      if (iconEl) iconEl.textContent = stop.icon || (stop.isPerimeter ? '🗺️' : '📍');
      if (catEl) {
        catEl.textContent = stop.category || (stop.isPerimeter ? 'PERIMETER' : 'POI');
      }
      if (regEl) {
        regEl.textContent = stop.address || stop.details || (stop.isPerimeter ? 'Regional Boundary Overview' : 'Target Facility');
      }
      if (coordsEl) {
        if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
          const latStr = `${Math.abs(Number(stop.lat)).toFixed(4)}°${Number(stop.lat) >= 0 ? 'N' : 'S'}`;
          const lonStr = `${Math.abs(Number(stop.lon)).toFixed(4)}°${Number(stop.lon) >= 0 ? 'E' : 'W'}`;
          coordsEl.textContent = `${latStr}, ${lonStr}`;
        } else if (stop.bounds) {
          coordsEl.textContent = 'EXTENT BOUNDS';
        } else {
          coordsEl.textContent = 'COORDINATES LOCKED';
        }
      }

      // Reflect stop into docked drawer or center modal based on display mode preference
      if (this.displayMode === 'docked') {
        this._updateDockedDrawer(stop.rawRef || stop);
      } else if (this.displayMode === 'modal' && state.status === 'playing' && !stop.isPerimeter) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gev:open-service-dialog', {
            detail: { point: stop.rawRef || stop },
          }));
        }
      }
    }

    // Dwell progress bar countdown
    const dwellBar = this.tourHud.querySelector('#url-tour-dwell-bar');
    if (dwellBar && state.dwellDurationSec > 0) {
      const pct = (state.dwellRemainingSec / state.dwellDurationSec) * 100;
      dwellBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }
  }

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const urlSearchTourUi = new UrlSearchTourUi();
export default urlSearchTourUi;
