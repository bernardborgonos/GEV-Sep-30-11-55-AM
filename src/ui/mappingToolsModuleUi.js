/**
 * @module src/ui/mappingToolsModuleUi.js
 * @description Floating Service Dialog controller for Tactical Map Tools & Geofence Workbench.
 * Provides autonomous draggable floating viewport dialog for ACTIVE TOOL CONTROLS,
 * dynamic tool-switching between Drawing, Measurement, Shape, Satellite, Radar, MGRS, and Weather,
 * and an inline interactive help guide drawer.
 */

import { TacticalWorkbenchUi } from './tacticalWorkbenchUi.js';
import { getSharedMapToolsEngine, MAP_TOOLS_EVENTS } from '../tools/mapToolsEngine.js';
import { getSharedGeofenceEngine } from '../tools/geofenceEngine.js';
import { setShaperMode, SHAPER_MODES } from './shaperCadToolbar.js';
import { sharedPluginRegistry, PLUGIN_TAB_METADATA } from '../plugins/mapToolsPluginRegistry.js';
import { renderToolHelpGuideHtml, TOOL_HELP_GUIDES } from './mappingToolsHelpGuides.js';

export const WINDOW_STATES = Object.freeze({
  NORMAL: 'normal',
  MAXIMIZED: 'maximized',
  MINIMIZED: 'minimized',
});

let _activeWorkbenchInstance = null;
let _dialogInitialized = false;
let _currentState = WINDOW_STATES.NORMAL;
let _normalPosition = { top: 72, left: 80 };
let _isDragging = false;
let _dragOffset = { x: 0, y: 0 };
let _helpDrawerOpen = false;

/**
 * Returns the currently active workbench instance if mounted.
 * @returns {TacticalWorkbenchUi|null}
 */
export function getFloatingWorkbenchInstance() {
  return _activeWorkbenchInstance;
}

// Alias for backwards compatibility
export const getSidebarWorkbenchInstance = getFloatingWorkbenchInstance;

/**
 * Returns current window state ('normal' | 'maximized' | 'minimized').
 * @returns {string}
 */
export function getFloatingDialogState() {
  return _currentState;
}

/**
 * Sets the floating service dialog window state.
 * @param {'normal' | 'maximized' | 'minimized'} state
 */
export function setFloatingDialogState(state) {
  const dialog = document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  _currentState = state;
  dialog.hidden = false;

  // Remove existing state classes
  dialog.classList.remove('state-normal', 'state-maximized', 'state-minimized');
  dialog.classList.add(`state-${state}`);
  dialog.setAttribute('data-window-state', state);

  // Update control buttons active/visibility states
  const btnNormal = document.getElementById('floating-btn-normal');
  const btnMaximize = document.getElementById('floating-btn-maximize');
  const btnMinimize = document.getElementById('floating-btn-minimize');

  if (btnNormal) {
    btnNormal.classList.toggle('active', state === WINDOW_STATES.NORMAL);
    btnNormal.setAttribute('aria-pressed', String(state === WINDOW_STATES.NORMAL));
  }
  if (btnMaximize) {
    btnMaximize.classList.toggle('active', state === WINDOW_STATES.MAXIMIZED);
    btnMaximize.setAttribute('aria-pressed', String(state === WINDOW_STATES.MAXIMIZED));
  }
  if (btnMinimize) {
    btnMinimize.classList.toggle('active', state === WINDOW_STATES.MINIMIZED);
    btnMinimize.setAttribute('aria-pressed', String(state === WINDOW_STATES.MINIMIZED));
  }

  // Handle position & styling per state
  if (state === WINDOW_STATES.NORMAL) {
    dialog.style.position = 'fixed';
    dialog.style.top = `${_normalPosition.top}px`;
    dialog.style.left = `${_normalPosition.left}px`;
    dialog.style.right = 'auto';
    dialog.style.bottom = 'auto';
    dialog.style.width = '';
    dialog.style.height = '';
    if (_activeWorkbenchInstance) {
      _activeWorkbenchInstance.renderRoster();
      _activeWorkbenchInstance.renderBreachFeed();
    }
  } else if (state === WINDOW_STATES.MAXIMIZED) {
    dialog.style.top = '';
    dialog.style.left = '';
    dialog.style.right = '';
    dialog.style.bottom = '';
    dialog.style.width = '';
    dialog.style.height = '';
    if (_activeWorkbenchInstance) {
      _activeWorkbenchInstance.renderRoster();
      _activeWorkbenchInstance.renderBreachFeed();
    }
  } else if (state === WINDOW_STATES.MINIMIZED) {
    dialog.style.top = '';
    dialog.style.left = '';
    dialog.style.right = '';
    dialog.style.bottom = '';
    dialog.style.width = '';
    dialog.style.height = '';
  }

  // Dispatch state change event
  window.dispatchEvent(
    new CustomEvent('gev:map-tools-window-state-changed', {
      detail: { state },
    })
  );
}

/**
 * Closes / hides the floating dialog.
 */
export function closeFloatingDialog() {
  const dialog = document.getElementById('tactical-map-tools-floating-dialog');
  if (dialog) {
    dialog.hidden = true;
    dialog.classList.remove('state-normal', 'state-maximized', 'state-minimized');
    window.dispatchEvent(new CustomEvent('gev:map-tools-window-closed'));
  }
}

/**
 * Opens or restores the floating service dialog.
 * @param {Object} [options]
 * @param {string} [options.draftType] - 'point' | 'range_ring' | 'line' | 'polygon' | 'geofence'
 * @param {'normal' | 'maximized' | 'minimized'} [options.state='normal']
 * @param {string} [options.pluginId] - target plugin ID to focus
 */
export function openFloatingDialog({ draftType = null, state = WINDOW_STATES.NORMAL, pluginId = null } = {}) {
  const dialog = document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  if (dialog.hidden || _currentState === WINDOW_STATES.MINIMIZED) {
    setFloatingDialogState(state);
  }

  if (pluginId) {
    syncFloatingDialogWithPlugin(pluginId);
  } else if (draftType) {
    selectQuickDraftType(draftType);
    if (_currentState === WINDOW_STATES.MINIMIZED) {
      setFloatingDialogState(WINDOW_STATES.NORMAL);
    }
  }
}

// Backwards-compatible alias for existing callers
export function openMappingToolsSubmodule(draftType = null) {
  openFloatingDialog({ draftType, state: WINDOW_STATES.NORMAL });
}

/**
 * Selects active drafting type across quick chips and embedded workbench.
 * @param {string} type
 */
export function selectQuickDraftType(type) {
  const quickToolbar = document.getElementById('floating-quick-toolbar');
  if (quickToolbar) {
    const chips = quickToolbar.querySelectorAll('.submodule-tool-chip');
    chips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.draftType === type);
    });
  }

  // Trigger corresponding CAD mode & interactive measurement on the globe
  if (type === 'line') {
    setShaperMode(SHAPER_MODES.DRAW_POLYLINE, true);
  } else if (type === 'polygon') {
    setShaperMode(SHAPER_MODES.DRAW_POLYGON, true);
  } else if (type === 'point') {
    setShaperMode(SHAPER_MODES.DRAW_MARKER, true);
  }

  if (_activeWorkbenchInstance?.host) {
    const targetPill = _activeWorkbenchInstance.host.querySelector(`.tw-type-pill[data-type="${type}"]`);
    if (targetPill) {
      targetPill.click();
    }
    const draftPanel = _activeWorkbenchInstance.host.querySelector('.tw-draft-panel');
    if (draftPanel) {
      draftPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/**
 * Synchronizes the floating dialog UI (title, icon, kicker, badge, tabs, help guide,
 * and active tool container) with the specified plugin.
 * @param {string} pluginId
 */
export function syncFloatingDialogWithPlugin(pluginId) {
  const dialog = document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  const plugin = sharedPluginRegistry?.getPlugin(pluginId);
  const meta = PLUGIN_TAB_METADATA[pluginId] || {};
  const guide = TOOL_HELP_GUIDES[pluginId] || {};

  const titleEl = document.getElementById('floating-map-tools-title');
  const kickerEl = document.getElementById('tactical-floating-kicker');
  const iconEl = document.getElementById('tactical-floating-icon');
  const badgeEl = document.getElementById('tactical-floating-badge');
  const tabsBar = document.getElementById('floating-tool-tabs-bar');
  const activeControlsHost = document.getElementById('floating-active-tool-controls');
  const workbenchHost = document.getElementById('tactical-floating-workbench-host');
  const helpDrawer = document.getElementById('floating-tool-help-drawer');

  // 1. Update Title and Header Elements
  if (pluginId === 'workbench') {
    if (titleEl) titleEl.textContent = 'GEOFENCE & CAD ROSTER';
    if (kickerEl) kickerEl.textContent = 'TACTICAL INVENTORY & ASSET SURVEILLANCE';
    if (iconEl) iconEl.textContent = '🛡️';
    if (badgeEl) badgeEl.textContent = 'ROSTER ACTIVE';

    if (activeControlsHost) activeControlsHost.hidden = true;
    if (workbenchHost) workbenchHost.hidden = false;
  } else if (plugin) {
    const pluginName = plugin.name.toUpperCase();
    if (titleEl) titleEl.textContent = pluginName;
    if (kickerEl) kickerEl.textContent = `ACTIVE TOOL CONTROLS · ${meta.shortName || 'TACTICAL'}`;
    if (iconEl) iconEl.textContent = meta.icon || plugin.icon || '🛠️';
    if (badgeEl) badgeEl.textContent = `${meta.shortName || 'TOOL'} · ACTIVE`;

    if (workbenchHost) workbenchHost.hidden = true;
    if (activeControlsHost) {
      activeControlsHost.hidden = false;
      plugin.render(activeControlsHost);
    }
  }

  // 2. Update Tabs Active State
  if (tabsBar) {
    tabsBar.querySelectorAll('.floating-tool-tab-btn').forEach((btn) => {
      const isTarget = btn.dataset.pluginId === pluginId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', String(isTarget));
    });
  }

  // 3. Update Inline Help Drawer if open
  if (helpDrawer && !helpDrawer.hidden) {
    helpDrawer.innerHTML = renderToolHelpGuideHtml(pluginId);
    helpDrawer.querySelector('#floating-help-close-btn')?.addEventListener('click', () => {
      helpDrawer.hidden = true;
      _helpDrawerOpen = false;
      document.getElementById('floating-btn-help')?.classList.remove('active');
    });
  }
}

/**
 * Initializes Draggable functionality on the floating dialog titlebar.
 * @param {HTMLElement} dialog
 * @param {HTMLElement} header
 */
function initHeaderDragging(dialog, header) {
  if (!dialog || !header) return;

  const onPointerDown = (e) => {
    // Only allow dragging in normal window state
    if (_currentState !== WINDOW_STATES.NORMAL) return;

    // Do not drag if clicking on window action controls or buttons
    if (e.target?.closest?.('.tactical-floating-controls, button, a, input, select')) {
      return;
    }

    _isDragging = true;
    const rect = dialog.getBoundingClientRect();
    _dragOffset.x = e.clientX - rect.left;
    _dragOffset.y = e.clientY - rect.top;

    dialog.classList.add('is-dragging');

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!_isDragging) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const dialogW = dialog.offsetWidth;
    const dialogH = dialog.offsetHeight;

    let newLeft = e.clientX - _dragOffset.x;
    let newTop = e.clientY - _dragOffset.y;

    // Clamp within viewport
    newLeft = Math.max(10, Math.min(newLeft, viewportW - dialogW - 10));
    newTop = Math.max(10, Math.min(newTop, viewportH - 44));

    _normalPosition.left = newLeft;
    _normalPosition.top = newTop;

    dialog.style.left = `${newLeft}px`;
    dialog.style.top = `${newTop}px`;
  };

  const onPointerUp = () => {
    if (_isDragging) {
      _isDragging = false;
      dialog.classList.remove('is-dragging');
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  header.addEventListener('pointerdown', onPointerDown);
}

/**
 * Initializes the Floating Service Dialog: Tactical Map Tools & Geofence Workbench.
 *
 * @param {Object} viewer - Cesium Viewer instance
 * @param {Object} dataManager - DataLayerManager instance
 * @returns {TacticalWorkbenchUi|null}
 */
export function initMappingToolsFloatingDialog(viewer, dataManager) {
  const dialog = document.getElementById('tactical-map-tools-floating-dialog');
  const header = document.getElementById('tactical-floating-drag-header');
  const workbenchHost = document.getElementById('tactical-floating-workbench-host');
  const activeControlsHost = document.getElementById('floating-active-tool-controls');
  const quickToolbar = document.getElementById('floating-quick-toolbar');
  const badge = document.getElementById('tactical-floating-badge');
  const tabsBar = document.getElementById('floating-tool-tabs-bar');
  const btnHelp = document.getElementById('floating-btn-help');
  const helpDrawer = document.getElementById('floating-tool-help-drawer');
  const btnMinimize = document.getElementById('floating-btn-minimize');
  const btnNormal = document.getElementById('floating-btn-normal');
  const btnMaximize = document.getElementById('floating-btn-maximize');
  const btnClose = document.getElementById('floating-btn-close');

  if (!dialog || !workbenchHost) {
    console.warn('[MappingToolsFloatingDialog] Host elements not found in DOM.');
    return null;
  }

  const engine = getSharedMapToolsEngine(viewer);
  const geofenceEngine = getSharedGeofenceEngine({ mapToolsEngine: engine });

  // Mount TacticalWorkbenchUi in floating host
  try {
    _activeWorkbenchInstance = new TacticalWorkbenchUi(workbenchHost, {
      viewer,
      engine,
      geofenceEngine,
      dataManager,
      showToast: (msg) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gev:toast', { detail: { text: msg } }));
        }
      },
    });
  } catch (err) {
    console.error('[MappingToolsFloatingDialog] Failed to mount TacticalWorkbenchUi:', err);
  }

  // Update badge counters
  const updateFloatingBadge = () => {
    if (!badge) return;
    const count = engine.getAllFeatures().length;
    const breachCount = geofenceEngine ? geofenceEngine.getActiveBreachCount() : 0;
    if (breachCount > 0) {
      badge.textContent = `⚠️ ${breachCount} BREACHES`;
      badge.classList.add('breach-badge-alert');
      dialog.classList.add('has-active-breaches');
    } else {
      badge.textContent = `${count} ACTIVE`;
      badge.classList.remove('breach-badge-alert');
      dialog.classList.remove('has-active-breaches');
    }
  };

  updateFloatingBadge();

  if (!_dialogInitialized) {
    _dialogInitialized = true;

    // Listen to MapTools events
    engine.on(MAP_TOOLS_EVENTS.CREATE, updateFloatingBadge);
    engine.on(MAP_TOOLS_EVENTS.UPDATE, updateFloatingBadge);
    engine.on(MAP_TOOLS_EVENTS.DELETE, updateFloatingBadge);

    // Listen to Geofence breach events
    if (geofenceEngine) {
      geofenceEngine.addEventListener('breach-triggered', updateFloatingBadge);
      geofenceEngine.addEventListener('breach-cleared', updateFloatingBadge);
      geofenceEngine.addEventListener('breach-updated', updateFloatingBadge);
    }

    // Draggable header
    initHeaderDragging(dialog, header);

    // Window controls
    btnHelp?.addEventListener('click', (e) => {
      e.stopPropagation();
      _helpDrawerOpen = !_helpDrawerOpen;
      if (helpDrawer) {
        helpDrawer.hidden = !_helpDrawerOpen;
        btnHelp.classList.toggle('active', _helpDrawerOpen);
        if (_helpDrawerOpen) {
          const activeId = sharedPluginRegistry?.getActivePlugin()?.id || 'drawing';
          helpDrawer.innerHTML = renderToolHelpGuideHtml(activeId);
          helpDrawer.querySelector('#floating-help-close-btn')?.addEventListener('click', () => {
            helpDrawer.hidden = true;
            _helpDrawerOpen = false;
            btnHelp.classList.remove('active');
          });
        }
      }
    });

    btnMinimize?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFloatingDialogState(WINDOW_STATES.MINIMIZED);
    });

    btnNormal?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFloatingDialogState(WINDOW_STATES.NORMAL);
    });

    btnMaximize?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_currentState === WINDOW_STATES.MAXIMIZED) {
        setFloatingDialogState(WINDOW_STATES.NORMAL);
      } else {
        setFloatingDialogState(WINDOW_STATES.MAXIMIZED);
      }
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloatingDialog();
    });

    // Clicking anywhere on the minimized header restores to normal
    header?.addEventListener('click', (e) => {
      if (_currentState === WINDOW_STATES.MINIMIZED) {
        if (!e.target?.closest?.('#floating-btn-close')) {
          setFloatingDialogState(WINDOW_STATES.NORMAL);
        }
      }
    });

    // Tool Tabs Bar Handler
    if (tabsBar) {
      tabsBar.querySelectorAll('.floating-tool-tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetPluginId = btn.dataset.pluginId;
          if (targetPluginId === 'workbench') {
            syncFloatingDialogWithPlugin('workbench');
          } else if (targetPluginId && sharedPluginRegistry) {
            sharedPluginRegistry.activatePlugin(targetPluginId);
          }
        });
      });
    }

    // Quick CAD toolbar chips (preserved for tests)
    if (quickToolbar) {
      quickToolbar.querySelectorAll('.submodule-tool-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = chip.dataset.draftType;
          if (type) {
            selectQuickDraftType(type);
          }
        });
      });
    }

    // Top bar button `#tactical-map-tools-btn` opens or toggles floating dialog
    const topBarBtn = document.getElementById('tactical-map-tools-btn');
    if (topBarBtn) {
      topBarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dialog.hidden) {
          openFloatingDialog({ state: WINDOW_STATES.NORMAL });
        } else if (_currentState === WINDOW_STATES.MINIMIZED) {
          setFloatingDialogState(WINDOW_STATES.NORMAL);
        } else {
          setFloatingDialogState(WINDOW_STATES.MINIMIZED);
        }
      });
    }

    // Global listener when a plugin is activated anywhere
    window.addEventListener('gev:map-tools-plugin-activated', (e) => {
      const pluginId = e.detail?.pluginId;
      if (pluginId) {
        if (dialog.hidden || _currentState === WINDOW_STATES.MINIMIZED) {
          setFloatingDialogState(WINDOW_STATES.NORMAL);
        }
        syncFloatingDialogWithPlugin(pluginId);
      }
    });

    // Global listener to open floating dialog
    window.addEventListener('gev:open-map-tools', (e) => {
      const type = e.detail?.draftType || null;
      const state = e.detail?.state || WINDOW_STATES.NORMAL;
      const pluginId = e.detail?.pluginId || null;
      openFloatingDialog({ draftType: type, state, pluginId });
    });

    // Global toggle listener
    window.addEventListener('gev:toggle-floating-map-tools', () => {
      if (dialog.hidden) {
        openFloatingDialog({ state: WINDOW_STATES.NORMAL });
      } else {
        closeFloatingDialog();
      }
    });

    // Keyboard ESC key handler
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dialog.hidden) {
        if (_currentState === WINDOW_STATES.MAXIMIZED) {
          setFloatingDialogState(WINDOW_STATES.NORMAL);
        } else {
          setFloatingDialogState(WINDOW_STATES.MINIMIZED);
        }
      }
    });

    // Initial render of default plugin into active controls host
    const initialActive = sharedPluginRegistry?.getActivePlugin()?.id || 'drawing';
    syncFloatingDialogWithPlugin(initialActive);
  }

  return _activeWorkbenchInstance;
}

// Backwards-compatible export alias
export const initMappingToolsSubmodule = initMappingToolsFloatingDialog;
