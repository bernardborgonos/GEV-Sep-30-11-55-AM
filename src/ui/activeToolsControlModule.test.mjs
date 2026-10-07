import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initActiveToolsControl,
  openActiveToolsControl,
  toggleActiveToolsControl,
  closeActiveToolsControl,
  setActiveToolsWindowState,
  getActiveToolsWindowState,
  getActiveToolsWorkbenchInstance,
  selectActiveToolsDraftType,
  CONTROL_WINDOW_STATES,
} from './activeToolsControlModule.js';
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

test('Active Tools Control Module Suite', async (t) => {
  resetSharedMapToolsEngine();
  resetSharedGeofenceEngine();

  const dialog = createMockElement('active-tools-control-dialog', 'aside');
  const header = createMockElement('active-tools-drag-header', 'header');
  const host = createMockElement('active-tools-workbench-host');
  const badge = createMockElement('active-tools-badge', 'span');
  const topBarBtn = createMockElement('active-tools-control-btn', 'button');

  const btnMinimize = createMockElement('active-tools-btn-minimize', 'button');
  const btnNormal = createMockElement('active-tools-btn-normal', 'button');
  const btnMaximize = createMockElement('active-tools-btn-maximize', 'button');
  const btnClose = createMockElement('active-tools-btn-close', 'button');

  const chipPoint = createMockElement('active-chip-point', 'button');
  chipPoint.dataset.draftType = 'point';
  const chipRing = createMockElement('active-chip-ring', 'button');
  chipRing.dataset.draftType = 'range_ring';
  const chipPolygon = createMockElement('active-chip-polygon', 'button');
  chipPolygon.dataset.draftType = 'polygon';

  const quickToolbar = createMockElement('active-tools-quick-toolbar');
  const allChips = [chipPoint, chipRing, chipPolygon];
  quickToolbar.querySelectorAll = (sel) => {
    if (sel.includes('.submodule-tool-chip')) return allChips;
    return [];
  };

  const elementsById = {
    'active-tools-control-dialog': dialog,
    'active-tools-drag-header': header,
    'active-tools-workbench-host': host,
    'active-tools-badge': badge,
    'active-tools-control-btn': topBarBtn,
    'active-tools-btn-minimize': btnMinimize,
    'active-tools-btn-normal': btnNormal,
    'active-tools-btn-maximize': btnMaximize,
    'active-tools-btn-close': btnClose,
    'active-tools-quick-toolbar': quickToolbar,
    'active-chip-point': chipPoint,
    'active-chip-ring': chipRing,
    'active-chip-polygon': chipPolygon,
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

  await t.test('1. initializes active tools control module and mounts TacticalWorkbenchUi', () => {
    const workbench = initActiveToolsControl(mockViewer, null);
    assert.ok(workbench, 'tactical workbench mounted in active tools host');
    assert.equal(getActiveToolsWorkbenchInstance(), workbench);
    assert.equal(badge.textContent, '0 ACTIVE');
  });

  await t.test('2. controls window states: minimize, normal, maximize', () => {
    btnMaximize.click();
    assert.equal(getActiveToolsWindowState(), CONTROL_WINDOW_STATES.MAXIMIZED);
    assert.equal(dialog.classList.contains('state-maximized'), true);

    btnNormal.click();
    assert.equal(getActiveToolsWindowState(), CONTROL_WINDOW_STATES.NORMAL);
    assert.equal(dialog.classList.contains('state-normal'), true);

    btnMinimize.click();
    assert.equal(getActiveToolsWindowState(), CONTROL_WINDOW_STATES.MINIMIZED);
    assert.equal(dialog.classList.contains('state-minimized'), true);
  });

  await t.test('3. quick CAD toolbar selects draft type and updates active state', () => {
    selectActiveToolsDraftType('range_ring');
    assert.equal(chipRing.classList.contains('active'), true);
    assert.equal(chipPoint.classList.contains('active'), false);
  });

  await t.test('4. openActiveToolsControl opens dialog and selects draft type', () => {
    dialog.hidden = true;
    openActiveToolsControl({ draftType: 'polygon', state: CONTROL_WINDOW_STATES.NORMAL });

    assert.equal(dialog.hidden, false);
    assert.equal(getActiveToolsWindowState(), CONTROL_WINDOW_STATES.NORMAL);
    assert.equal(chipPolygon.classList.contains('active'), true);
  });

  await t.test('5. closeActiveToolsControl hides dialog', () => {
    closeActiveToolsControl();
    assert.equal(dialog.hidden, true);
  });

  await t.test('6. toggleActiveToolsControl opens and closes dialog', () => {
    dialog.hidden = true;
    toggleActiveToolsControl();
    assert.equal(dialog.hidden, false);

    toggleActiveToolsControl();
    assert.equal(dialog.hidden, true);
  });

  await t.test('7. top bar button triggers toggleActiveToolsControl', () => {
    dialog.hidden = true;
    topBarBtn.click();
    assert.equal(dialog.hidden, false);
  });

  await t.test('8. updates badge count upon feature creation event', () => {
    const engine = getSharedMapToolsEngine(mockViewer);
    engine.createFeature({
      type: 'point',
      name: 'Active Checkpoint Alpha',
      coordinates: [121.05, 14.58],
    });

    assert.equal(badge.textContent, '1 ACTIVE');
  });
});
