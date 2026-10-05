import test from 'node:test';
import assert from 'node:assert/strict';
import { initTacticalPresetsBar } from './tacticalPresetsBar.js';

test('initTacticalPresetsBar mounts UI elements and handles destroy cleanly', () => {
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: () => null,
  };

  const mockDataManager = {
    layers: [],
    subscribeVisibilityRequests: () => () => {},
  };

  const handle = initTacticalPresetsBar(container, mockDataManager);
  assert.ok(handle);
  assert.equal(typeof handle.destroy, 'function');
  assert.equal(typeof handle.refresh, 'function');

  handle.destroy();
  assert.equal(container.innerHTML, '');
});

test('initTacticalPresetsBar returns null for null container or dataManager', () => {
  assert.equal(initTacticalPresetsBar(null, {}), null);
  assert.equal(initTacticalPresetsBar({}, null), null);
});
