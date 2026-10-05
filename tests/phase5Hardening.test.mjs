import test from 'node:test';
import assert from 'node:assert/strict';

// Setup Mock DOM and LocalStorage environment before dynamic imports
const mockStorage = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  };
}

const elements = new Map();
const makeEl = (id = '') => ({
  id,
  innerHTML: '',
  nodeType: 1,
  childNodes: [],
  style: {},
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
  },
  querySelector: (sel) => {
    const clean = sel.replace('#', '');
    if (!elements.has(clean)) elements.set(clean, makeEl(clean));
    return elements.get(clean);
  },
  querySelectorAll: () => [],
  getElementsByTagName: () => [],
  appendChild: (child) => child,
  removeChild: () => {},
  remove: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
});

const locObj = { href: 'http://localhost:3000/' };
globalThis.location = locObj;

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    location: locObj,
    documentElement: { style: {} },
    createElement: (tag) => makeEl(tag),
    createComment: () => makeEl('#comment'),
    createTextNode: (t) => makeEl(t),
    getElementById: (id) => elements.get(id) || makeEl(id),
    getElementsByTagName: () => [],
    head: { appendChild: () => {} },
    body: {
      appendChild: () => {},
      contains: () => true,
    },
  };
} else {
  if (!globalThis.document.location) globalThis.document.location = locObj;
  if (!globalThis.document.getElementsByTagName) globalThis.document.getElementsByTagName = () => [];
  if (!globalThis.document.createComment) globalThis.document.createComment = () => makeEl('#comment');
  if (!globalThis.document.createTextNode) globalThis.document.createTextNode = (t) => makeEl(t);
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    screen: { deviceXDPI: 96, logicalXDPI: 96 },
    devicePixelRatio: 1,
    location: locObj,
  };
} else {
  if (!globalThis.window.screen) globalThis.window.screen = { deviceXDPI: 96, logicalXDPI: 96 };
  if (!globalThis.window.location) globalThis.window.location = locObj;
}

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {
    userAgent: 'node',
  };
}

test('Phase 5 Hardening: Offline-First Synchronous LocalStorage Persistence', async (t) => {
  const { saveItem, deleteItem, openConfirmModal, openAlertModal } = await import('../src/data/firebaseMapsStore.js');
  mockStorage.clear();
  const mapId = 'map_phase5_test';
  
  // Verify saveItem writes synchronously to LocalStorage (0ms UI latency)
  const itemData = {
    name: 'Tactical Recon Point',
    type: 'marker',
    color: '#059669',
    coordinates: [{ lat: 14.59, lng: 120.98, alt: 0 }],
  };

  const saved = await saveItem(mapId, itemData);
  assert.ok(saved.id, 'Item must have an assigned ID');
  assert.strictEqual(saved.name, 'Tactical Recon Point');

  // Verify it exists in localStorage immediately
  const rawCache = globalThis.localStorage.getItem(`gev_map_items_v1_${mapId}`);
  assert.ok(rawCache, 'Item must be immediately written to localStorage cache');
  const cachedItems = JSON.parse(rawCache);
  assert.strictEqual(cachedItems.length, 1);
  assert.strictEqual(cachedItems[0].id, saved.id);
  assert.strictEqual(cachedItems[0].color, '#059669');

  // Verify deleteItem updates localStorage synchronously
  await deleteItem(mapId, saved.id);
  const updatedCache = JSON.parse(globalThis.localStorage.getItem(`gev_map_items_v1_${mapId}`));
  assert.strictEqual(updatedCache.length, 0, 'Deleted item must be purged immediately from local cache');

  // Verify non-blocking dialogs exported from store
  assert.strictEqual(typeof openConfirmModal, 'function');
  assert.strictEqual(typeof openAlertModal, 'function');
});

test('Phase 5 Hardening: Active Map HUD Disposal & Non-blocking Notifications', async (t) => {
  const { disposeActiveMapHud, showNonBlockingNotification } = await import('../src/ui/activeMapHud.js');
  assert.strictEqual(typeof disposeActiveMapHud, 'function', 'activeMapHud exports disposeActiveMapHud');
  assert.strictEqual(typeof showNonBlockingNotification, 'function', 'activeMapHud exports showNonBlockingNotification');

  // Call disposeActiveMapHud to verify safe teardown
  assert.doesNotThrow(() => {
    disposeActiveMapHud();
  }, 'disposeActiveMapHud executes cleanly without throwing');
});

test('Phase 5 Hardening: Item Inspector Modal Teardown & Swatches', async (t) => {
  const { SWATCH_COLORS, showNonBlockingNotification, openQuickColorPicker } = await import('../src/ui/itemInspectorModal.js');
  assert.strictEqual(SWATCH_COLORS.length, 16, 'SWATCH_COLORS contains 16 colors');
  assert.strictEqual(typeof showNonBlockingNotification, 'function');
  assert.strictEqual(typeof openQuickColorPicker, 'function');
});
