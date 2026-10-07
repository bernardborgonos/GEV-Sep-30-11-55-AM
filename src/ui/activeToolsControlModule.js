/**
 * @module src/ui/activeToolsControlModule.js
 * @description Active Tools Control module for Tactical Map Application.
 * Provides a dedicated, floating service controller for Active Tool Controls,
 * CAD Drafting, Geofence CAD Workbench, and Tool Plugin Management.
 */

import { TacticalWorkbenchUi } from './tacticalWorkbenchUi.js';
import { getSharedMapToolsEngine, MAP_TOOLS_EVENTS } from '../tools/mapToolsEngine.js';
import { getSharedGeofenceEngine } from '../tools/geofenceEngine.js';
import { setShaperMode, SHAPER_MODES } from './shaperCadToolbar.js';
import { sharedPluginRegistry, PLUGIN_TAB_METADATA } from '../plugins/mapToolsPluginRegistry.js';
import { renderToolHelpGuideHtml, TOOL_HELP_GUIDES } from './mappingToolsHelpGuides.js';

export const CONTROL_WINDOW_STATES = Object.freeze({
  NORMAL: 'normal',
  MAXIMIZED: 'maximized',
  MINIMIZED: 'minimized',
});

let _activeWorkbenchInstance = null;
let _moduleInitialized = false;
let _currentState = CONTROL_WINDOW_STATES.NORMAL;
let _normalPosition = { top: 72, left: 80 };
let _isDragging = false;
let _dragOffset = { x: 0, y: 0 };
let _helpDrawerOpen = false;

/**
 * Returns the currently mounted workbench instance.
 * @returns {TacticalWorkbenchUi|null}
 */
export function getActiveToolsWorkbenchInstance() {
  return _activeWorkbenchInstance;
}

/**
 * Returns current window state ('normal' | 'maximized' | 'minimized').
 * @returns {string}
 */
export function getActiveToolsWindowState() {
  return _currentState;
}

/**
 * Sets the active tools control dialog state.
 * @param {'normal' | 'maximized' | 'minimized'} state
 */
export function setActiveToolsWindowState(state) {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  _currentState = state;
  dialog.hidden = false;

  dialog.classList.remove('state-normal', 'state-maximized', 'state-minimized');
  dialog.classList.add(`state-${state}`);
  dialog.setAttribute('data-window-state', state);

  const btnNormal = document.getElementById('active-tools-btn-normal') || document.getElementById('floating-btn-normal');
  const btnMaximize = document.getElementById('active-tools-btn-maximize') || document.getElementById('floating-btn-maximize');
  const btnMinimize = document.getElementById('active-tools-btn-minimize') || document.getElementById('floating-btn-minimize');

  if (btnNormal) {
    btnNormal.classList.toggle('active', state === CONTROL_WINDOW_STATES.NORMAL);
    btnNormal.setAttribute('aria-pressed', String(state === CONTROL_WINDOW_STATES.NORMAL));
  }
  if (btnMaximize) {
    btnMaximize.classList.toggle('active', state === CONTROL_WINDOW_STATES.MAXIMIZED);
    btnMaximize.setAttribute('aria-pressed', String(state === CONTROL_WINDOW_STATES.MAXIMIZED));
  }
  if (btnMinimize) {
    btnMinimize.classList.toggle('active', state === CONTROL_WINDOW_STATES.MINIMIZED);
    btnMinimize.setAttribute('aria-pressed', String(state === CONTROL_WINDOW_STATES.MINIMIZED));
  }

  if (state === CONTROL_WINDOW_STATES.NORMAL) {
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
  } else if (state === CONTROL_WINDOW_STATES.MAXIMIZED || state === CONTROL_WINDOW_STATES.MINIMIZED) {
    dialog.style.top = '';
    dialog.style.left = '';
    dialog.style.right = '';
    dialog.style.bottom = '';
    dialog.style.width = '';
    dialog.style.height = '';
  }

  window.dispatchEvent(
    new CustomEvent('gev:active-tools-window-state-changed', {
      detail: { state },
    })
  );
}

/**
 * Closes the active tools control dialog.
 */
export function closeActiveToolsControl() {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  if (dialog) {
    dialog.hidden = true;
    dialog.classList.remove('state-normal', 'state-maximized', 'state-minimized');
    window.dispatchEvent(new CustomEvent('gev:active-tools-window-closed'));
  }
}

/**
 * Opens or restores the active tools control dialog.
 * @param {Object} [options]
 * @param {string} [options.draftType] - 'point' | 'range_ring' | 'line' | 'polygon' | 'geofence'
 * @param {'normal' | 'maximized' | 'minimized'} [options.state='normal']
 * @param {string} [options.pluginId] - target plugin ID to focus
 */
export function openActiveToolsControl({ draftType = null, state = CONTROL_WINDOW_STATES.NORMAL, pluginId = null } = {}) {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  if (dialog.hidden || _currentState === CONTROL_WINDOW_STATES.MINIMIZED) {
    setActiveToolsWindowState(state);
  }

  if (pluginId) {
    syncActiveToolsControlWithPlugin(pluginId);
  } else if (draftType) {
    selectActiveToolsDraftType(draftType);
    if (_currentState === CONTROL_WINDOW_STATES.MINIMIZED) {
      setActiveToolsWindowState(CONTROL_WINDOW_STATES.NORMAL);
    }
  }
}

/**
 * Toggles the open/closed or normalized/minimized state of the active tools control.
 */
export function toggleActiveToolsControl() {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  if (dialog.hidden) {
    openActiveToolsControl({ state: CONTROL_WINDOW_STATES.NORMAL });
  } else if (_currentState === CONTROL_WINDOW_STATES.MINIMIZED) {
    setActiveToolsWindowState(CONTROL_WINDOW_STATES.NORMAL);
  } else {
    closeActiveToolsControl();
  }
}

/**
 * Selects active drafting type across quick chips and embedded workbench.
 * @param {string} type
 */
export function selectActiveToolsDraftType(type) {
  const quickToolbar = document.getElementById('active-tools-quick-toolbar') || document.getElementById('floating-quick-toolbar');
  if (quickToolbar) {
    const chips = quickToolbar.querySelectorAll('.submodule-tool-chip');
    chips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.draftType === type);
    });
  }

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
  }
}

/**
 * Synchronizes the active tools control UI with the specified plugin.
 * @param {string} pluginId
 */
export function syncActiveToolsControlWithPlugin(pluginId) {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  if (!dialog) return;

  const plugin = sharedPluginRegistry?.getPlugin(pluginId);
  const meta = PLUGIN_TAB_METADATA[pluginId] || {};

  const titleEl = document.getElementById('active-tools-title') || document.getElementById('floating-map-tools-title');
  const kickerEl = document.getElementById('active-tools-kicker') || document.getElementById('tactical-floating-kicker');
  const iconEl = document.getElementById('active-tools-icon') || document.getElementById('tactical-floating-icon');
  const badgeEl = document.getElementById('active-tools-badge') || document.getElementById('tactical-floating-badge');
  const tabsBar = document.getElementById('active-tools-tabs-bar') || document.getElementById('floating-tool-tabs-bar');
  const activeControlsHost = document.getElementById('active-tools-controls-host') || document.getElementById('floating-active-tool-controls');
  const workbenchHost = document.getElementById('active-tools-workbench-host') || document.getElementById('tactical-floating-workbench-host');
  const helpDrawer = document.getElementById('active-tools-help-drawer') || document.getElementById('floating-tool-help-drawer');

  if (pluginId === 'workbench') {
    if (titleEl) titleEl.textContent = 'ACTIVE TOOLS & GEOFENCE ROSTER';
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

  if (tabsBar) {
    tabsBar.querySelectorAll('.floating-tool-tab-btn').forEach((btn) => {
      const isTarget = btn.dataset.pluginId === pluginId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', String(isTarget));
    });
  }

  if (helpDrawer && !helpDrawer.hidden) {
    helpDrawer.innerHTML = renderToolHelpGuideHtml(pluginId);
    helpDrawer.querySelector('#floating-help-close-btn')?.addEventListener('click', () => {
      helpDrawer.hidden = true;
      _helpDrawerOpen = false;
      const btnHelp = document.getElementById('active-tools-btn-help') || document.getElementById('floating-btn-help');
      if (btnHelp) btnHelp.classList.remove('active');
    });
  }
}

/**
 * Draggable header initialization for dialog window.
 */
function initHeaderDragging(dialog, header) {
  if (!dialog || !header) return;

  const onPointerDown = (e) => {
    if (_currentState !== CONTROL_WINDOW_STATES.NORMAL) return;
    if (e.target?.closest?.('.tactical-floating-controls, button, a, input, select')) return;

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
 * Initializes the Active Tools Control Module.
 * @param {Object} viewer - Cesium Viewer
 * @param {Object} dataManager - DataLayerManager
 * @returns {TacticalWorkbenchUi|null}
 */
export function initActiveToolsControl(viewer, dataManager) {
  const dialog = document.getElementById('active-tools-control-dialog') || document.getElementById('tactical-map-tools-floating-dialog');
  const header = document.getElementById('active-tools-drag-header') || document.getElementById('tactical-floating-drag-header');
  const workbenchHost = document.getElementById('active-tools-workbench-host') || document.getElementById('tactical-floating-workbench-host');
  const quickToolbar = document.getElementById('active-tools-quick-toolbar') || document.getElementById('floating-quick-toolbar');
  const badge = document.getElementById('active-tools-badge') || document.getElementById('tactical-floating-badge');
  const tabsBar = document.getElementById('active-tools-tabs-bar') || document.getElementById('floating-tool-tabs-bar');
  const btnHelp = document.getElementById('active-tools-btn-help') || document.getElementById('floating-btn-help');
  const helpDrawer = document.getElementById('active-tools-help-drawer') || document.getElementById('floating-tool-help-drawer');
  const btnMinimize = document.getElementById('active-tools-btn-minimize') || document.getElementById('floating-btn-minimize');
  const btnNormal = document.getElementById('active-tools-btn-normal') || document.getElementById('floating-btn-normal');
  const btnMaximize = document.getElementById('active-tools-btn-maximize') || document.getElementById('floating-btn-maximize');
  const btnClose = document.getElementById('active-tools-btn-close') || document.getElementById('floating-btn-close');
  const topBarBtn = document.getElementById('active-tools-control-btn') || document.getElementById('tactical-map-tools-btn');

  if (!dialog || !workbenchHost) {
    console.warn('[ActiveToolsControlModule] Host elements not found in DOM.');
    return null;
  }

  const engine = getSharedMapToolsEngine(viewer);
  const geofenceEngine = getSharedGeofenceEngine({ mapToolsEngine: engine });

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
    console.error('[ActiveToolsControlModule] Failed to mount TacticalWorkbenchUi:', err);
  }

  const updateBadge = () => {
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

  updateBadge();

  if (!_moduleInitialized) {
    _moduleInitialized = true;

    engine.on(MAP_TOOLS_EVENTS.CREATE, updateBadge);
    engine.on(MAP_TOOLS_EVENTS.UPDATE, updateBadge);
    engine.on(MAP_TOOLS_EVENTS.DELETE, updateBadge);

    if (geofenceEngine) {
      geofenceEngine.addEventListener('breach-triggered', updateBadge);
      geofenceEngine.addEventListener('breach-cleared', updateBadge);
      geofenceEngine.addEventListener('breach-updated', updateBadge);
    }

    initHeaderDragging(dialog, header);

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
      setActiveToolsWindowState(CONTROL_WINDOW_STATES.MINIMIZED);
    });

    btnNormal?.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveToolsWindowState(CONTROL_WINDOW_STATES.NORMAL);
    });

    btnMaximize?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_currentState === CONTROL_WINDOW_STATES.MAXIMIZED) {
        setActiveToolsWindowState(CONTROL_WINDOW_STATES.NORMAL);
      } else {
        setActiveToolsWindowState(CONTROL_WINDOW_STATES.MAXIMIZED);
      }
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveToolsControl();
    });

    if (tabsBar) {
      tabsBar.querySelectorAll('.floating-tool-tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetPluginId = btn.dataset.pluginId;
          if (targetPluginId === 'workbench') {
            syncActiveToolsControlWithPlugin('workbench');
          } else if (targetPluginId && sharedPluginRegistry) {
            sharedPluginRegistry.activatePlugin(targetPluginId);
          }
        });
      });
    }

    if (quickToolbar) {
      quickToolbar.querySelectorAll('.submodule-tool-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = chip.dataset.draftType;
          if (type) selectActiveToolsDraftType(type);
        });
      });
    }

    if (topBarBtn) {
      topBarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleActiveToolsControl();
      });
    }

    window.addEventListener('gev:map-tools-plugin-activated', (e) => {
      const pluginId = e.detail?.pluginId;
      if (pluginId) {
        if (dialog.hidden || _currentState === CONTROL_WINDOW_STATES.MINIMIZED) {
          setActiveToolsWindowState(CONTROL_WINDOW_STATES.NORMAL);
        }
        syncActiveToolsControlWithPlugin(pluginId);
      }
    });

    window.addEventListener('gev:open-active-tools', (e) => {
      const type = e.detail?.draftType || null;
      const state = e.detail?.state || CONTROL_WINDOW_STATES.NORMAL;
      const pluginId = e.detail?.pluginId || null;
      openActiveToolsControl({ draftType: type, state, pluginId });
    });

    window.addEventListener('gev:toggle-active-tools', () => {
      toggleActiveToolsControl();
    });

    const initialActive = sharedPluginRegistry?.getActivePlugin()?.id || 'drawing';
    syncActiveToolsControlWithPlugin(initialActive);
  }

  return _activeWorkbenchInstance;
}
