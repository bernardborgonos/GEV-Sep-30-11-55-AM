/**
 * @module src/plugins/mapToolsAddonModal.js
 * @description Interactive Tactical Addon Marketplace, Importer, and Operator Preset Manager.
 *
 * Provides operators with an intuitive HUD dialog to:
 * 1. Browse and 1-click install/uninstall specialized tactical addons from the catalog.
 * 2. Import external plugins via portable JSON manifest specifications.
 * 3. Save, export, and reset operator workbench presets across sessions.
 */

import { TACTICAL_ADDON_CATALOG } from './addonCatalog.js';
import {
  loadOperatorPreset,
  saveOperatorPreset,
  resetOperatorPreset,
  getSavedInstalledAddons,
  saveInstalledAddons,
} from './operatorPresetManager.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Opens the Map Tools Addon Marketplace & Preset Manager Modal.
 * @param {import('./mapToolsPluginRegistry.js').MapToolsPluginRegistry} registry
 * @param {Object} [viewer]
 */
export function openMapToolsAddonModal(registry, viewer = null) {
  const existing = document.getElementById('map-tools-addon-modal');
  if (existing) existing.remove();

  let activeTab = 'catalog'; // 'catalog' | 'import' | 'presets'
  let importError = null;

  const modal = document.createElement('div');
  modal.id = 'map-tools-addon-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans text-slate-100';

  const closeModal = () => {
    modal.remove();
    document.removeEventListener('keydown', handleKeyDown);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', handleKeyDown);

  const render = () => {
    const installedPlugins = registry.getAllPlugins();
    const installedIds = new Set(installedPlugins.map((p) => p.id));
    const currentPreset = loadOperatorPreset();

    modal.innerHTML = `
      <div class="bg-slate-950 border border-cyan-500/30 rounded-xl shadow-[0_0_50px_rgba(0,212,255,0.15)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🧩</span>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-bold text-white tracking-wide">MAP TOOLS MODULAR ADDON MANAGER</h2>
                <span class="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/50 text-cyan-300">
                  ${installedPlugins.length} PLUGINS ACTIVE
                </span>
              </div>
              <p class="text-xs text-slate-400">Install portable addon modules, import JSON specifications, and synchronize operator presets.</p>
            </div>
          </div>
          <button id="addon-modal-close-btn" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Close modal">
            <span class="text-xl leading-none">✕</span>
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="px-6 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button class="addon-modal-tab-btn px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition ${activeTab === 'catalog' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}" data-tab="catalog">
              📦 TACTICAL CATALOG (${TACTICAL_ADDON_CATALOG.length})
            </button>
            <button class="addon-modal-tab-btn px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition ${activeTab === 'import' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}" data-tab="import">
              📥 IMPORT MANIFEST
            </button>
            <button class="addon-modal-tab-btn px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition ${activeTab === 'presets' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}" data-tab="presets">
              ⚙️ OPERATOR PRESETS
            </button>
          </div>
          <div class="text-[10px] font-mono text-slate-500">
            REGISTRY PROTOCOL v1.0
          </div>
        </div>

        <!-- Tab Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          ${renderTabContent(activeTab, { installedPlugins, installedIds, currentPreset, importError })}
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-2 font-mono text-[10px]">
            <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
            <span>HOST ENGINE ONLINE</span>
            <span class="text-slate-600">|</span>
            <span>PORTABLE SPECIFICATION COMPLIANT</span>
          </div>
          <button id="addon-modal-done-btn" class="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-medium tracking-wide transition">
            DONE
          </button>
        </div>
      </div>
    `;

    // Bind event handlers
    modal.querySelector('#addon-modal-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#addon-modal-done-btn')?.addEventListener('click', closeModal);

    modal.querySelectorAll('.addon-modal-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        importError = null;
        render();
      });
    });

    bindTabActions(activeTab, { installedIds });
  };

  const renderTabContent = (tab, { installedPlugins, installedIds, currentPreset, importError }) => {
    if (tab === 'catalog') {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${TACTICAL_ADDON_CATALOG.map((item) => {
            const isInstalled = installedIds.has(item.id);
            return `
              <div class="bg-slate-900/90 border ${isInstalled ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(0,212,255,0.08)]' : 'border-slate-800 hover:border-slate-700'} rounded-xl p-4 flex flex-col justify-between transition">
                <div>
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2.5">
                      <span class="text-2xl">${item.icon}</span>
                      <div>
                        <h4 class="font-bold text-sm text-white flex items-center gap-2">
                          ${escapeHtml(item.name)}
                          <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">v${item.version}</span>
                        </h4>
                        <span class="text-[10px] font-mono text-cyan-400/80 uppercase">${escapeHtml(item.category)} · ${escapeHtml(item.author)}</span>
                      </div>
                    </div>
                    ${
                      isInstalled
                        ? '<span class="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">INSTALLED</span>'
                        : '<span class="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">READY</span>'
                    }
                  </div>
                  <p class="text-xs text-slate-300 mb-3">${escapeHtml(item.description)}</p>
                  <div class="flex flex-wrap gap-1 mb-4">
                    ${item.capabilities
                      .map(
                        (cap) =>
                          `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">${escapeHtml(cap)}</span>`
                      )
                      .join('')}
                  </div>
                </div>

                <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span class="text-[10px] font-mono text-slate-500">ID: ${item.id}</span>
                  ${
                    isInstalled
                      ? `<button class="addon-uninstall-btn px-3 py-1 rounded bg-rose-950/80 border border-rose-700 text-rose-300 hover:bg-rose-900 font-mono text-xs transition" data-addon-id="${item.id}">UNINSTALL</button>`
                      : `<button class="addon-install-btn px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-medium transition" data-addon-id="${item.id}">INSTALL ADDON</button>`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (tab === 'import') {
      return `
        <div class="space-y-4 max-w-2xl mx-auto">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 class="text-sm font-bold text-white mb-1">Import External Addon Specification</h3>
              <p class="text-xs text-slate-400">
                Paste a manifest JSON adhering to the Map Tools Plugin Specification to dynamically load, verify, and attach an external addon.
              </p>
            </div>

            ${
              importError
                ? `<div class="p-3 bg-rose-950/80 border border-rose-700 rounded text-xs text-rose-300 font-mono">${escapeHtml(importError)}</div>`
                : ''
            }

            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Addon Manifest JSON</label>
                <button id="addon-paste-sample-btn" class="text-[10px] font-mono text-cyan-400 hover:underline">Insert Sample Manifest</button>
              </div>
              <textarea id="addon-manifest-input" class="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500" placeholder='{\n  "schemaVersion": "1.0.0",\n  "manifest": {\n    "id": "my-custom-tool",\n    "name": "Custom Recon Tool",\n    "version": "1.0.0",\n    "category": "analytics",\n    "description": "Custom external analysis module"\n  }\n}'></textarea>
            </div>

            <div class="flex items-center justify-between pt-2">
              <label class="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer border border-slate-700 transition">
                <span>📁 Upload .json file</span>
                <input type="file" id="addon-file-input" accept=".json" class="hidden" />
              </label>

              <button id="addon-verify-install-btn" class="px-5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition">
                VERIFY & INSTALL
              </button>
            </div>
          </div>
        </div>
      `;
    }

    if (tab === 'presets') {
      return `
        <div class="space-y-4 max-w-2xl mx-auto">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 class="text-sm font-bold text-white mb-1">Operator Workbench Presets</h3>
              <p class="text-xs text-slate-400">
                Configurations and tactical defaults are retained across browser sessions.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs">
              <div>
                <span class="text-[10px] font-mono text-slate-500 uppercase block">Active Plugin</span>
                <span class="font-mono text-cyan-400 font-bold">${escapeHtml(currentPreset.activePluginId)}</span>
              </div>
              <div>
                <span class="text-[10px] font-mono text-slate-500 uppercase block">Drawing Color / Width</span>
                <span class="font-mono text-slate-200">${currentPreset.drawing.selectedColor} (${currentPreset.drawing.strokeWidth}px)</span>
              </div>
              <div>
                <span class="text-[10px] font-mono text-slate-500 uppercase block">Measurement Units</span>
                <span class="font-mono text-slate-200 uppercase">${escapeHtml(currentPreset.measurements.unit)}</span>
              </div>
              <div>
                <span class="text-[10px] font-mono text-slate-500 uppercase block">Shape Radius / Watchdog</span>
                <span class="font-mono text-slate-200">${currentPreset.shape.radiusKm} km (Alerts: ${currentPreset.shape.breachAlertEnabled ? 'ON' : 'OFF'})</span>
              </div>
              <div class="col-span-2 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                LAST SAVED: ${currentPreset.lastUpdated ? new Date(currentPreset.lastUpdated).toLocaleString() : 'Using Defaults'}
              </div>
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button id="preset-save-current-btn" class="flex-1 px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold transition">
                SAVE CURRENT STATE
              </button>
              <button id="preset-reset-btn" class="px-4 py-2 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-700 border border-slate-700 text-slate-300 font-mono text-xs transition">
                RESET TO DEFAULTS
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  };

  const bindTabActions = (tab, { installedIds }) => {
    if (tab === 'catalog') {
      modal.querySelectorAll('.addon-install-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const addonId = btn.dataset.addonId;
          const entry = TACTICAL_ADDON_CATALOG.find((c) => c.id === addonId);
          if (!entry) return;

          btn.disabled = true;
          btn.textContent = 'INSTALLING...';

          try {
            const plugin = entry.createPlugin();
            await registry.registerPlugin(plugin);

            // Persist to saved addons
            const currentSaved = getSavedInstalledAddons();
            if (!currentSaved.some((a) => a.id === addonId)) {
              currentSaved.push({ id: addonId, isCatalog: true, manifest: plugin.exportManifest() });
              saveInstalledAddons(currentSaved);
            }

            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('gev:toast', {
                  detail: { text: `Installed ${entry.name} modular addon.` },
                })
              );
            }
            render();
          } catch (err) {
            console.error('[AddonModal] Install failed:', err);
            btn.disabled = false;
            btn.textContent = 'RETRY';
          }
        });
      });

      modal.querySelectorAll('.addon-uninstall-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const addonId = btn.dataset.addonId;
          btn.disabled = true;
          btn.textContent = 'REMOVING...';

          try {
            await registry.unregisterPlugin(addonId);

            // Remove from saved addons
            const currentSaved = getSavedInstalledAddons().filter((a) => a.id !== addonId);
            saveInstalledAddons(currentSaved);

            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('gev:toast', {
                  detail: { text: `Uninstalled addon "${addonId}".` },
                })
              );
            }
            render();
          } catch (err) {
            console.error('[AddonModal] Uninstall failed:', err);
            btn.disabled = false;
            btn.textContent = 'ERROR';
          }
        });
      });
    }

    if (tab === 'import') {
      const textarea = modal.querySelector('#addon-manifest-input');
      const pasteSampleBtn = modal.querySelector('#addon-paste-sample-btn');
      const fileInput = modal.querySelector('#addon-file-input');
      const verifyBtn = modal.querySelector('#addon-verify-install-btn');

      pasteSampleBtn?.addEventListener('click', () => {
        if (textarea) {
          textarea.value = JSON.stringify(
            {
              schemaVersion: '1.0.0',
              manifest: {
                id: 'custom-recon-drone',
                name: 'Tactical Drone Loiter Overlay',
                version: '1.0.0',
                category: 'intelligence',
                icon: '🛸',
                description: 'Calculates endurance loiter orbits and telemetry transmission ranges.',
                capabilities: ['drone-loiter', 'endurance-rings', 'telemetry-cone'],
                author: 'Autonomous Recon Taskforce',
              },
            },
            null,
            2
          );
        }
      });

      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (textarea) textarea.value = evt.target.result;
        };
        reader.readAsText(file);
      });

      verifyBtn?.addEventListener('click', async () => {
        if (!textarea) return;
        try {
          const parsed = JSON.parse(textarea.value.trim());
          const plugin = await registry.installFromManifest(parsed);

          // Save custom manifest
          const currentSaved = getSavedInstalledAddons();
          currentSaved.push({
            id: plugin.id,
            isCatalog: false,
            manifest: parsed,
          });
          saveInstalledAddons(currentSaved);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('gev:toast', {
                detail: { text: `Successfully installed external addon "${plugin.name}"!` },
              })
            );
          }
          activeTab = 'catalog';
          render();
        } catch (err) {
          importError = `Manifest Error: ${err.message}`;
          render();
        }
      });
    }

    if (tab === 'presets') {
      const saveBtn = modal.querySelector('#preset-save-current-btn');
      const resetBtn = modal.querySelector('#preset-reset-btn');

      saveBtn?.addEventListener('click', () => {
        // Collect current state from plugins
        const drawing = registry.getPlugin('drawing')?.config || {};
        const measurements = registry.getPlugin('measurements')?.config || {};
        const shape = registry.getPlugin('shape')?.config || {};
        const activePlugin = registry.getActivePlugin();

        saveOperatorPreset({
          activePluginId: activePlugin?.id || 'drawing',
          drawing,
          measurements,
          shape,
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('gev:toast', {
              detail: { text: 'Saved operator workbench preferences to local storage.' },
            })
          );
        }
        render();
      });

      resetBtn?.addEventListener('click', () => {
        resetOperatorPreset();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('gev:toast', {
              detail: { text: 'Reset operator preferences to defaults.' },
            })
          );
        }
        render();
      });
    }
  };

  document.body.appendChild(modal);
  render();
}
