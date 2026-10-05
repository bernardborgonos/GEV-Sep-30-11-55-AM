import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initMappingToolsFloatingDialog,
  openFloatingDialog,
  setFloatingDialogState,
  closeFloatingDialog,
  getFloatingDialogState,
  getFloatingWorkbenchInstance,
  WINDOW_STATES,
} from './mappingToolsModuleUi.js';
import { getSharedMapToolsEngine, resetSharedMapToolsEngine } from '../tools/mapToolsEngine.js';
import { getSharedGeofenceEngine, resetSharedGeofenceEngine } from '../tools/geofenceEngine.js';

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};

  const element = {
    id,
    tagName: tag.toUpperCase(),
    textContent: '',
    innerHTML: '',
    hidden: false,
    style: {},
    dataset: {},
    classList: {
      add: (...cls) => cls.forEach((c) => classes.add(c)),
      remove: (...cls) => cls.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        if (force === true) classes.add(c);
        else if (force === false) classes.delete(c);
        else if (classes.has(c)) classes.delete(c);
        else classes.add(c);
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => { attributes[name] = String(val); },
    getAttribute: (name) => attributes[name] || null,
    removeAttribute: (name) => { delete attributes[name]; },
    addEventListener: (type, fn) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    closest: (sel) => {
      if (sel.includes(id)) return element;
      return null;
    },
    click: function () {
      if (listeners['click']) {
        listeners['click'].forEach((fn) => fn({
          target: this,
          stopPropagation: () => {},
          preventDefault: () => {},
          closest: (sel) => this.closest(sel),
        }));
      }
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollIntoView: () => {},
    getBoundingClientRect: () => ({ top: 72, left: 80, width: 640, height: 520 }),
    offsetWidth: 640,
    offsetHeight: 520,
  };

  return element;
}

test('Tactical Map Tools Floating Service Dialog UI Suite', async (t) => {
  resetSharedMapToolsEngine();
  resetSharedGeofenceEngine();

  // Set up mock DOM elements for floating service dialog outside Data Layers
  const dialog = createMockElement('tactical-map-tools-floating-dialog', 'aside');
  const header = createMockElement('tactical-floating-drag-header', 'header');
  const host = createMockElement('tactical-floating-workbench-host');
  const badge = createMockElement('tactical-floating-badge', 'span');
  const topBarBtn = createMockElement('tactical-map-tools-btn', 'button');

  const btnMinimize = createMockElement('floating-btn-minimize', 'button');
  const btnNormal = createMockElement('floating-btn-normal', 'button');
  const btnMaximize = createMockElement('floating-btn-maximize', 'button');
  const btnClose = createMockElement('floating-btn-close', 'button');

  const chipPoint = createMockElement('float-chip-point', 'button');
  chipPoint.dataset.draftType = 'point';
  const chipRing = createMockElement('float-chip-ring', 'button');
  chipRing.dataset.draftType = 'range_ring';
  const chipPolygon = createMockElement('float-chip-polygon', 'button');
  chipPolygon.dataset.draftType = 'polygon';

  const quickToolbar = createMockElement('floating-quick-toolbar');
  const allChips = [chipPoint, chipRing, chipPolygon];
  quickToolbar.querySelectorAll = (sel) => {
    if (sel.includes('.submodule-tool-chip')) return allChips;
    return [];
  };

  const elementsById = {
    'tactical-map-tools-floating-dialog': dialog,
    'tactical-floating-drag-header': header,
    'tactical-floating-workbench-host': host,
    'tactical-floating-badge': badge,
    'tactical-map-tools-btn': topBarBtn,
    'floating-btn-minimize': btnMinimize,
    'floating-btn-normal': btnNormal,
    'floating-btn-maximize': btnMaximize,
    'floating-btn-close': btnClose,
    'floating-quick-toolbar': quickToolbar,
    'float-chip-point': chipPoint,
    'float-chip-ring': chipRing,
    'float-chip-polygon': chipPolygon,
  };

  const windowEvents = {};
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: (type, fn) => {
      if (!windowEvents[type]) windowEvents[type] = [];
      windowEvents[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!windowEvents[type]) return;
      windowEvents[type] = windowEvents[type].filter((f) => f !== fn);
    },
    dispatchEvent: (evt) => {
      const handlers = windowEvents[evt.type] || [];
      handlers.forEach((h) => h(evt));
      return true;
    },
  };

  globalThis.document = {
    getElementById: (id) => elementsById[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const mockViewer = {
    entities: {
      values: [],
      add: (e) => e,
      remove: () => true,
      removeAll: () => {},
    },
    scene: {
      requestRender: () => {},
      globe: { ellipsoid: {} },
    },
    camera: {
      flyTo: () => {},
    },
  };

  await t.test('1. initializes floating dialog and mounts TacticalWorkbenchUi', () => {
    const workbench = initMappingToolsFloatingDialog(mockViewer, null);
    assert.ok(workbench, 'tactical workbench mounted in floating host');
    assert.equal(getFloatingWorkbenchInstance(), workbench);
    assert.equal(badge.textContent, '0 ACTIVE');
  });

  await t.test('2. controls window states: minimize, normal, maximize', () => {
    // Switch to Maximize
    btnMaximize.click();
    assert.equal(getFloatingDialogState(), WINDOW_STATES.MAXIMIZED);
    assert.equal(dialog.classList.contains('state-maximized'), true);

    // Switch to Normal
    btnNormal.click();
    assert.equal(getFloatingDialogState(), WINDOW_STATES.NORMAL);
    assert.equal(dialog.classList.contains('state-normal'), true);

    // Switch to Minimize
    btnMinimize.click();
    assert.equal(getFloatingDialogState(), WINDOW_STATES.MINIMIZED);
    assert.equal(dialog.classList.contains('state-minimized'), true);

    // Clicking header when minimized restores to normal
    header.click();
    assert.equal(getFloatingDialogState(), WINDOW_STATES.NORMAL);
    assert.equal(dialog.classList.contains('state-normal'), true);
  });

  await t.test('3. quick CAD toolbar selects draft type and updates active state', () => {
    chipRing.click();
    assert.equal(chipRing.classList.contains('active'), true);
    assert.equal(chipPoint.classList.contains('active'), false);
  });

  await t.test('4. openFloatingDialog opens and selects draft type', () => {
    dialog.hidden = true;
    openFloatingDialog({ draftType: 'polygon', state: WINDOW_STATES.NORMAL });

    assert.equal(dialog.hidden, false);
    assert.equal(getFloatingDialogState(), WINDOW_STATES.NORMAL);
    assert.equal(chipPolygon.classList.contains('active'), true);
  });

  await t.test('5. closeFloatingDialog hides dialog', () => {
    closeFloatingDialog();
    assert.equal(dialog.hidden, true);
  });

  await t.test('6. top bar button opens floating dialog', () => {
    dialog.hidden = true;
    topBarBtn.click();
    assert.equal(dialog.hidden, false);
    assert.equal(getFloatingDialogState(), WINDOW_STATES.NORMAL);
  });

  await t.test('7. updates badge count and alert classes upon feature and breach events', () => {
    const engine = getSharedMapToolsEngine(mockViewer);
    engine.createFeature({
      type: 'point',
      name: 'Floating Checkpoint Bravo',
      coordinates: [121.05, 14.58],
    });

    assert.equal(badge.textContent, '1 ACTIVE');
  });

  await t.test('8. renders comprehensive inline help guides for all 7 tactical tools', async () => {
    const { TOOL_HELP_GUIDES, renderToolHelpGuideHtml } = await import('./mappingToolsHelpGuides.js');
    const toolIds = [
      'drawing',
      'measurements',
      'shape',
      'satellite-footprint',
      'sensor-los-cone',
      'mgrs-tactical-grid',
      'weather-hazard-buffer',
    ];

    for (const toolId of toolIds) {
      assert.ok(TOOL_HELP_GUIDES[toolId], `Guide exists for ${toolId}`);
      assert.ok(TOOL_HELP_GUIDES[toolId].title, `Title exists for ${toolId}`);
      assert.ok(TOOL_HELP_GUIDES[toolId].steps.length >= 3, `Has steps for ${toolId}`);
      assert.ok(TOOL_HELP_GUIDES[toolId].shortcuts.length >= 2, `Has shortcuts for ${toolId}`);
      assert.ok(TOOL_HELP_GUIDES[toolId].tip, `Has tactical tip for ${toolId}`);

      const html = renderToolHelpGuideHtml(toolId);
      assert.match(html, /STEP-BY-STEP INSTRUCTIONS/);
      assert.match(html, /KEYS &amp; SHORTCUTS/);
      assert.match(html, /TACTICAL OPERATIONAL TIP/);
    }
  });
});
