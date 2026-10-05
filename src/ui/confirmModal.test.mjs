import test from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal DOM mock
const handlers = {};
const mockElements = new Map();

function createMockElement(id = '') {
  const el = {
    id,
    innerHTML: '',
    children: [],
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
    querySelector: (selector) => {
      const cleanId = selector.replace('#', '');
      if (!mockElements.has(cleanId)) {
        mockElements.set(cleanId, createMockElement(cleanId));
      }
      return mockElements.get(cleanId);
    },
    querySelectorAll: () => [],
    addEventListener: (event, fn) => {
      handlers[`${id || 'el'}_${event}`] = fn;
    },
    removeEventListener: () => {},
    focus: () => {},
  };
  return el;
}

if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag) => createMockElement(tag),
    body: {
      appendChild: () => {},
      contains: () => true,
    },
    getElementById: (id) => {
      if (!mockElements.has(id)) {
        mockElements.set(id, createMockElement(id));
      }
      return mockElements.get(id);
    },
  };
}

if (typeof window === 'undefined') {
  global.window = {
    addEventListener: (event, fn) => {
      handlers[`window_${event}`] = fn;
    },
    removeEventListener: () => {},
  };
}

import { openConfirmModal, confirmAction, openAlertModal } from './confirmModal.js';

test('Confirm and Alert Modal Suite', async (t) => {
  await t.test('1. openConfirmModal renders dialog markup and resolves on confirm', async () => {
    let confirmed = false;
    const promise = openConfirmModal({
      title: 'Delete Active Map',
      message: 'Are you sure you want to delete map "bernard (Copy)"?',
      confirmText: 'Delete Map',
      onConfirm: () => {
        confirmed = true;
      },
    });

    const root = document.getElementById('in-app-confirm-modal-root');
    assert.ok(root.innerHTML.includes('Delete Active Map'));
    assert.ok(root.innerHTML.includes('bernard (Copy)'));
    assert.ok(root.innerHTML.includes('Delete Map'));

    // Trigger confirm button click handler
    const confirmBtnHandler = handlers['confirm-action-btn_click'];
    assert.equal(typeof confirmBtnHandler, 'function');
    confirmBtnHandler();

    const res = await promise;
    assert.equal(res, true);
    assert.equal(confirmed, true);
  });

  await t.test('2. openConfirmModal resolves false on cancel', async () => {
    let cancelled = false;
    const promise = openConfirmModal({
      title: 'Delete Item',
      message: 'Delete polyline "polylinew"?',
      onCancel: () => {
        cancelled = true;
      },
    });

    const cancelBtnHandler = handlers['confirm-cancel-btn_click'];
    assert.equal(typeof cancelBtnHandler, 'function');
    cancelBtnHandler();

    const res = await promise;
    assert.equal(res, false);
    assert.equal(cancelled, true);
  });

  await t.test('3. confirmAction shorthand works with async/await', async () => {
    const promise = confirmAction({
      title: 'Confirm Operation',
      message: 'Proceed with deletion?',
    });

    handlers['confirm-action-btn_click']();
    const result = await promise;
    assert.equal(result, true);
  });

  await t.test('4. openAlertModal renders message and resolves on OK click', async () => {
    const promise = openAlertModal({
      title: 'Validation Notice',
      message: 'Please enter a name.',
      buttonText: 'Got It',
    });

    const root = document.getElementById('in-app-confirm-modal-root');
    assert.ok(root.innerHTML.includes('Validation Notice'));
    assert.ok(root.innerHTML.includes('Please enter a name.'));
    assert.ok(root.innerHTML.includes('Got It'));

    const okBtnHandler = handlers['alert-ok-btn_click'];
    assert.equal(typeof okBtnHandler, 'function');
    okBtnHandler();

    await promise;
  });
});
