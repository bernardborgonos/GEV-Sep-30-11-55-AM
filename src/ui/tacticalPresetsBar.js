/**
 * Tactical Presets & Quick Filter Sets UI
 * Single-row list format matching the Data Layers architecture.
 */

import {
  DOMAIN_CATEGORIES,
  OPERATIONAL_PRESETS,
  calculatePresetLayerVisibility,
  calculateDomainSoloVisibility,
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  applyPresetToDataManager,
  applyDomainSoloToDataManager,
  applyInvertToDataManager,
  applyBulkStateToDataManager,
  getAvailableLayerIds,
  isLayerEnabled
} from '../data/tacticalPresets.js';

let activePresetBarEl = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Initializes and mounts the Tactical Presets UI Bar into a container.
 * @param {HTMLElement} container
 * @param {Object} dataManager
 * @returns {Object} Controller handle
 */
export function initTacticalPresetsBar(container, dataManager) {
  if (!container || !dataManager) return null;

  activePresetBarEl = container;
  renderBar(container, dataManager);

  // Subscribe to visibility updates to refresh active indicators
  const unsubscribe = typeof dataManager.subscribeVisibilityRequests === 'function'
    ? dataManager.subscribeVisibilityRequests(() => {
        updateActiveIndicator(container, dataManager);
      })
    : null;

  return {
    destroy() {
      if (typeof unsubscribe === 'function') unsubscribe();
      container.innerHTML = '';
      activePresetBarEl = null;
    },
    refresh() {
      renderBar(container, dataManager);
    }
  };
}

function renderBar(container, dataManager) {
  const customPresets = loadCustomPresets();
  const availableLayerIds = getAvailableLayerIds(dataManager);
  const currentStates = {};
  for (const id of availableLayerIds) {
    currentStates[id] = isLayerEnabled(dataManager, id);
  }

  container.innerHTML = `
    <div class="tactical-presets-wrapper">
      <!-- Quick Bulk Action Bar (Single-Row Toolbar) -->
      <div class="tactical-bulk-toolbar">
        <button type="button" class="data-toggle-btn tactical-bulk-btn" data-action="all-on" title="Enable all operational layers">
          ALL ON
        </button>
        <button type="button" class="data-toggle-btn tactical-bulk-btn" data-action="all-off" title="Disable all operational layers">
          ALL OFF
        </button>
        <button type="button" class="data-toggle-btn tactical-bulk-btn" data-action="invert" title="Invert current active/inactive layers">
          INVERT
        </button>
      </div>

      <!-- Presets Scrollable Single-Row List (Matching .data-toggle-list) -->
      <div class="tactical-presets-list data-toggle-list">
        <div class="tactical-section-divider">OPERATIONAL PRESETS</div>

        ${OPERATIONAL_PRESETS.map((preset) => {
          const expected = calculatePresetLayerVisibility(preset, availableLayerIds);
          const isMatch = availableLayerIds.length > 0 && availableLayerIds.every((k) => expected[k] === currentStates[k]);

          return `
            <div class="data-toggle-row tactical-preset-row${isMatch ? ' active' : ''}" data-preset-id="${escapeHtml(preset.id)}">
              <div class="data-toggle-top">
                <div class="data-toggle-left">
                  <span class="data-icon">${escapeHtml(preset.icon)}</span>
                  <span class="data-name">${escapeHtml(preset.label)}</span>
                </div>
                <div class="data-toggle-right">
                  <span class="data-count">${escapeHtml(preset.callsign)}</span>
                  <button type="button" class="data-toggle-btn${isMatch ? ' active' : ''}" title="${escapeHtml(preset.description)}">
                    ${isMatch ? 'ACTIVE' : 'APPLY'}
                  </button>
                </div>
              </div>
              <div class="data-toggle-meta">${escapeHtml(preset.description)}</div>
            </div>
          `;
        }).join('')}

        <!-- Domain Solo Single Rows -->
        <div class="tactical-section-divider">DOMAIN ISOLATION (SOLO)</div>

        <div class="data-toggle-row tactical-solo-row" data-domain="${DOMAIN_CATEGORIES.AIR}">
          <div class="data-toggle-top">
            <div class="data-toggle-left">
              <span class="data-icon">✈️</span>
              <span class="data-name">Air Domain Solo</span>
            </div>
            <div class="data-toggle-right">
              <span class="data-count">AIR</span>
              <button type="button" class="data-toggle-btn">SOLO</button>
            </div>
          </div>
          <div class="data-toggle-meta">Isolate civil & military flights, air defense radar</div>
        </div>

        <div class="data-toggle-row tactical-solo-row" data-domain="${DOMAIN_CATEGORIES.SEA}">
          <div class="data-toggle-top">
            <div class="data-toggle-left">
              <span class="data-icon">🚢</span>
              <span class="data-name">Maritime Solo</span>
            </div>
            <div class="data-toggle-right">
              <span class="data-count">SEA</span>
              <button type="button" class="data-toggle-btn">SOLO</button>
            </div>
          </div>
          <div class="data-toggle-meta">Isolate AIS live vessels & undersea telemetry cables</div>
        </div>

        <div class="data-toggle-row tactical-solo-row" data-domain="${DOMAIN_CATEGORIES.SPACE}">
          <div class="data-toggle-top">
            <div class="data-toggle-left">
              <span class="data-icon">🛰️</span>
              <span class="data-name">Space Domain Solo</span>
            </div>
            <div class="data-toggle-right">
              <span class="data-count">SPACE</span>
              <button type="button" class="data-toggle-btn">SOLO</button>
            </div>
          </div>
          <div class="data-toggle-meta">Isolate low-earth satellites & rocket trajectories</div>
        </div>

        <div class="data-toggle-row tactical-solo-row" data-domain="${DOMAIN_CATEGORIES.GROUND}">
          <div class="data-toggle-top">
            <div class="data-toggle-left">
              <span class="data-icon">🛡️</span>
              <span class="data-name">Ground & Grid Solo</span>
            </div>
            <div class="data-toggle-right">
              <span class="data-count">GROUND</span>
              <button type="button" class="data-toggle-btn">SOLO</button>
            </div>
          </div>
          <div class="data-toggle-meta">Isolate military bases, CCTV, and ground infrastructure</div>
        </div>

        <!-- Custom Saved Presets Section -->
        <div class="tactical-section-divider custom-section-divider">
          <span>SAVED PRESETS (${customPresets.length})</span>
          <button type="button" class="tactical-save-preset-btn" id="tactical-save-current-preset" title="Save current active layers as custom preset">
            + SAVE CURRENT
          </button>
        </div>

        ${customPresets.length > 0 ? customPresets.map((preset) => `
          <div class="data-toggle-row tactical-custom-row" data-custom-id="${escapeHtml(preset.id)}">
            <div class="data-toggle-top">
              <div class="data-toggle-left">
                <span class="data-icon">🏷️</span>
                <span class="data-name">${escapeHtml(preset.label)}</span>
              </div>
              <div class="data-toggle-right">
                <button type="button" class="data-toggle-btn custom-preset-apply-btn" title="Apply filter preset: ${escapeHtml(preset.label)}">
                  APPLY
                </button>
                <button type="button" class="tactical-del-btn" title="Delete custom preset" aria-label="Delete">
                  ✕
                </button>
              </div>
            </div>
          </div>
        `).join('') : `
          <div class="tactical-empty-hint">No custom presets saved. Click "+ SAVE CURRENT" to bookmark a layout.</div>
        `}
      </div>
    </div>
  `;

  attachEventListeners(container, dataManager);
}

function attachEventListeners(container, dataManager) {
  // Built-in operational preset click (both row or button)
  container.querySelectorAll('.tactical-preset-row').forEach((row) => {
    const presetId = row.dataset.presetId;
    const btn = row.querySelector('.data-toggle-btn');
    const trigger = () => {
      const preset = OPERATIONAL_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        applyPresetToDataManager(preset, dataManager);
        updateActiveIndicator(container, dataManager);
      }
    };
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); trigger(); });
    row.addEventListener('click', trigger);
  });

  // Bulk actions: ALL ON, ALL OFF, INVERT
  container.querySelectorAll('.tactical-bulk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'all-on') {
        applyBulkStateToDataManager(true, dataManager);
      } else if (action === 'all-off') {
        applyBulkStateToDataManager(false, dataManager);
      } else if (action === 'invert') {
        applyInvertToDataManager(dataManager);
      }
      updateActiveIndicator(container, dataManager);
    });
  });

  // Domain solo click
  container.querySelectorAll('.tactical-solo-row').forEach((row) => {
    const domain = row.dataset.domain;
    const btn = row.querySelector('.data-toggle-btn');
    const trigger = () => {
      applyDomainSoloToDataManager(domain, dataManager);
      updateActiveIndicator(container, dataManager);
    };
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); trigger(); });
    row.addEventListener('click', trigger);
  });

  // Save current preset
  const saveBtn = container.querySelector('#tactical-save-current-preset');
  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSavePresetPrompt(container, dataManager);
    });
  }

  // Apply custom preset
  container.querySelectorAll('.custom-preset-apply-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = btn.closest('.tactical-custom-row');
      const customId = parent?.dataset.customId;
      const customPresets = loadCustomPresets();
      const preset = customPresets.find((p) => p.id === customId);
      if (preset) {
        applyPresetToDataManager(preset, dataManager);
        updateActiveIndicator(container, dataManager);
      }
    });
  });

  // Delete custom preset
  container.querySelectorAll('.tactical-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = btn.closest('.tactical-custom-row');
      const customId = parent?.dataset.customId;
      if (customId && confirm('Delete this custom preset?')) {
        deleteCustomPreset(customId);
        renderBar(container, dataManager);
      }
    });
  });
}

function updateActiveIndicator(container, dataManager) {
  if (!container || !dataManager) return;
  const availableLayerIds = getAvailableLayerIds(dataManager);
  const currentStates = {};
  for (const id of availableLayerIds) {
    currentStates[id] = isLayerEnabled(dataManager, id);
  }

  // Update built-in preset rows
  for (const preset of OPERATIONAL_PRESETS) {
    const expected = calculatePresetLayerVisibility(preset, availableLayerIds);
    const isMatch = availableLayerIds.length > 0 && availableLayerIds.every((k) => expected[k] === currentStates[k]);
    const row = container.querySelector(`.tactical-preset-row[data-preset-id="${preset.id}"]`);
    if (row) {
      row.classList.toggle('active', isMatch);
      const btn = row.querySelector('.data-toggle-btn');
      if (btn) {
        btn.classList.toggle('active', isMatch);
        btn.textContent = isMatch ? 'ACTIVE' : 'APPLY';
      }
    }
  }
}

function openSavePresetPrompt(container, dataManager) {
  const name = prompt('Enter a label for this custom tactical preset:');
  if (!name || !name.trim()) return;

  const availableLayerIds = getAvailableLayerIds(dataManager);
  const layerOverrides = {};
  for (const id of availableLayerIds) {
    layerOverrides[id] = isLayerEnabled(dataManager, id);
  }

  const customPreset = {
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: name.trim(),
    callsign: 'CUSTOM',
    activeDomains: [],
    layerOverrides,
  };

  saveCustomPreset(customPreset);
  renderBar(container, dataManager);
}
