/**
 * @file taxonomyImportExportModal.js
 * User interface modal for exporting, importing, and validating
 * operational 3-tier taxonomy schemas (JSON & CSV).
 */

import {
  exportTaxonomyToJsonString,
  exportTaxonomyToCsvString,
  validateTaxonomyImport,
  importTaxonomyData,
  resetTaxonomyToDefaults,
  getTaxonomyStatistics,
} from '../data/taxonomyImportExport.js';

let activeModalEl = null;

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
 * Triggers a client-side file download.
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens the Taxonomy Import/Export Management Modal.
 * @param {Object} [options]
 * @param {Function} [options.onUpdated] - Callback invoked when taxonomy updates
 */
export function openTaxonomyImportExportModal({ onUpdated } = {}) {
  if (activeModalEl) {
    activeModalEl.remove();
    activeModalEl = null;
  }

  const stats = getTaxonomyStatistics();

  const modalRoot = document.createElement('div');
  modalRoot.id = 'taxonomy-import-export-modal-root';
  modalRoot.className = 'fixed inset-0 z-[100060] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in font-sans';

  modalRoot.innerHTML = `
    <div class="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-950 border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden">
      
      <!-- Header -->
      <div class="p-4 sm:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-inner">
            <span class="material-symbols-outlined text-2xl">account_tree</span>
          </div>
          <div>
            <h3 class="font-bold text-base text-white flex items-center gap-2">
              Taxonomy Schema Manager
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 font-mono">v1.2</span>
            </h3>
            <p class="text-xs text-slate-400">Import, export, backup, and restore 3-tier operational taxonomy data</p>
          </div>
        </div>
        <button type="button" id="tax-close-modal-btn" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer" aria-label="Close modal">
          <span class="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <!-- Live Statistics Bar -->
      <div class="grid grid-cols-4 gap-2 px-4 sm:px-6 py-2.5 bg-slate-900/40 border-b border-slate-800/80 text-center flex-shrink-0">
        <div class="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Domains (L1)</div>
          <div class="text-sm font-bold text-cyan-400 font-mono" id="stat-domains">${stats.totalDomains}</div>
        </div>
        <div class="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sub-Levels (L2)</div>
          <div class="text-sm font-bold text-emerald-400 font-mono" id="stat-subs">${stats.totalSubcategories}</div>
        </div>
        <div class="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Presets (L3)</div>
          <div class="text-sm font-bold text-amber-400 font-mono" id="stat-l3">${stats.totalClassifications}</div>
        </div>
        <div class="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Custom Items</div>
          <div class="text-sm font-bold text-purple-400 font-mono" id="stat-custom">${stats.customCount}</div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex border-b border-slate-800 px-4 sm:px-6 bg-slate-950/60 flex-shrink-0">
        <button type="button" class="tax-tab-btn px-4 py-2.5 text-xs font-semibold border-b-2 border-cyan-400 text-cyan-400 transition cursor-pointer flex items-center gap-1.5" data-tab="export">
          <span class="material-symbols-outlined text-sm">download</span> Export Taxonomy
        </button>
        <button type="button" class="tax-tab-btn px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5" data-tab="import">
          <span class="material-symbols-outlined text-sm">upload</span> Import Taxonomy
        </button>
        <button type="button" class="tax-tab-btn px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5" data-tab="guide">
          <span class="material-symbols-outlined text-sm">menu_book</span> Instruction Guide
        </button>
        <button type="button" class="tax-tab-btn px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5 ml-auto text-rose-400 hover:text-rose-300" data-tab="reset">
          <span class="material-symbols-outlined text-sm">restart_alt</span> Reset
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
        
        <!-- TAB: EXPORT -->
        <div id="tax-pane-export" class="tax-pane space-y-4">
          <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
            <div class="font-semibold text-white flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-cyan-400">info</span> Operational Export Options
            </div>
            <p class="text-slate-400">
              Download your taxonomy to share with command units or archive customized operator classifications.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" id="tax-download-json-btn" class="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-cyan-500/40 hover:border-cyan-400 text-left transition flex items-start gap-3 group cursor-pointer">
              <div class="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition flex-shrink-0">
                <span class="material-symbols-outlined text-xl">data_object</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-white text-sm group-hover:text-cyan-300 transition">Download JSON Bundle</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Complete 3-tier schema with color codes, icons, and custom classifications (.json)</div>
              </div>
            </button>

            <button type="button" id="tax-download-csv-btn" class="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-emerald-500/40 hover:border-emerald-400 text-left transition flex items-start gap-3 group cursor-pointer">
              <div class="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition flex-shrink-0">
                <span class="material-symbols-outlined text-xl">table_chart</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-white text-sm group-hover:text-emerald-300 transition">Download CSV Table</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Flat table format compatible with Excel and Google Sheets (.csv)</div>
              </div>
            </button>
          </div>

          <div class="pt-2">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider">JSON Preview</label>
              <button type="button" id="tax-copy-json-btn" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium border border-slate-700 transition flex items-center gap-1 cursor-pointer">
                <span class="material-symbols-outlined text-xs">content_copy</span> Copy to Clipboard
              </button>
            </div>
            <textarea id="tax-export-preview" readonly class="w-full h-44 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-cyan-300/90 focus:outline-none resize-none">${escapeHtml(exportTaxonomyToJsonString())}</textarea>
          </div>
        </div>

        <!-- TAB: IMPORT -->
        <div id="tax-pane-import" class="tax-pane hidden space-y-4">
          
          <!-- Dropzone -->
          <div id="tax-import-dropzone" class="border-2 border-dashed border-slate-700 hover:border-cyan-400/80 bg-slate-950/70 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center group select-none">
            <div class="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 transition">
              <span class="material-symbols-outlined text-2xl animate-pulse">cloud_upload</span>
            </div>
            <div class="font-bold text-white text-sm">Drag & drop taxonomy file or click to browse</div>
            <div class="text-xs text-slate-400">Supported formats: <strong class="text-cyan-400">.JSON</strong> or <strong class="text-emerald-400">.CSV</strong> (Max 2MB)</div>
            <input type="file" id="tax-file-input" accept=".json,.csv" class="hidden" />
          </div>

          <!-- Import Strategy Mode -->
          <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
            <div class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-cyan-400">tune</span> Import Strategy
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label class="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-slate-700 hover:border-slate-500 cursor-pointer transition select-none">
                <input type="radio" name="tax-import-mode" value="merge" checked class="mt-0.5 text-cyan-500 focus:ring-0" />
                <div>
                  <div class="text-xs font-semibold text-slate-200">Merge with Current (Recommended)</div>
                  <div class="text-[10px] text-slate-400">Keeps existing entries; adds new domains, sub-levels & L3 classifications.</div>
                </div>
              </label>

              <label class="flex items-start gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-slate-700 hover:border-slate-500 cursor-pointer transition select-none">
                <input type="radio" name="tax-import-mode" value="replace" class="mt-0.5 text-cyan-500 focus:ring-0" />
                <div>
                  <div class="text-xs font-semibold text-slate-200">Replace Custom Taxonomy</div>
                  <div class="text-[10px] text-slate-400">Clears previous custom classifications and applies only the imported set.</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Paste text directly -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Or Paste Raw JSON / CSV Content</label>
              <button type="button" id="tax-validate-btn" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-medium border border-slate-700 transition flex items-center gap-1 cursor-pointer">
                <span class="material-symbols-outlined text-xs">verified</span> Validate Content
              </button>
            </div>
            <textarea id="tax-import-textarea" placeholder="Paste .json or .csv payload here..." class="w-full h-28 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400 resize-none"></textarea>
          </div>

          <!-- Validation Result Card -->
          <div id="tax-validation-result" class="hidden p-3 rounded-xl border text-xs"></div>

          <!-- Apply Button -->
          <div class="flex justify-end pt-2">
            <button type="button" id="tax-apply-import-btn" disabled class="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span class="material-symbols-outlined text-sm">check_circle</span> Apply Taxonomy Import
            </button>
          </div>
        </div>

        <!-- TAB: INSTRUCTION GUIDE -->
        <div id="tax-pane-guide" class="tax-pane hidden space-y-3 text-xs text-slate-300 leading-relaxed">
          <div class="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <h4 class="font-bold text-cyan-400 text-sm mb-1 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base">account_tree</span> 3-Tier Tactical Taxonomy Architecture
            </h4>
            <p class="text-slate-400 text-[11px]">
              The system organizes all operational entities into a strict 3-tier hierarchy:
            </p>
            <ul class="list-disc list-inside mt-2 space-y-1 text-slate-300 text-[11px]">
              <li><strong>Level 1 (Domain):</strong> Primary theater of operations (e.g., Tactical & Defense, Maritime, Airspace, Critical Infrastructure). Defines the signature accent color.</li>
              <li><strong>Level 2 (Sub-Level):</strong> Tactical functional branch or specialized operational capability.</li>
              <li><strong>Level 3 (Classification):</strong> Exact operational facility or asset preset. The parametric vector SVG engine derives badge geometry from this label.</li>
            </ul>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
              <h5 class="font-semibold text-emerald-400 text-xs mb-1">CSV File Format Requirements</h5>
              <p class="text-[11px] text-slate-400">
                CSV files must include a header row with the following column headers:
              </p>
              <pre class="mt-2 p-2 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto">Domain,Subcategory,Classification,DomainColor,DomainIcon
"Tactical & Defense","Radar Systems","Air Defense Radar","#dc2626","radar"</pre>
            </div>

            <div class="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
              <h5 class="font-semibold text-amber-400 text-xs mb-1">Import Strategies Explained</h5>
              <ul class="space-y-1.5 text-[11px] text-slate-400">
                <li><strong class="text-slate-200">Merge:</strong> Combines incoming categories with existing ones. Zero risk of data loss. Recommended for team collaborations.</li>
                <li><strong class="text-slate-200">Replace:</strong> Wipes custom classifications and establishes the imported file as the new operational baseline.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- TAB: RESET -->
        <div id="tax-pane-reset" class="tax-pane hidden space-y-4">
          <div class="p-4 bg-rose-950/40 rounded-xl border border-rose-500/40 text-xs text-rose-200 space-y-2">
            <div class="font-bold text-rose-400 text-sm flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base">warning</span> Factory Reset Taxonomy
            </div>
            <p>
              This action clears all custom Level-1 Categories, Subcategories, and Level-3 Classifications registered on this terminal and restores the built-in system baseline taxonomy (12 domains, 46 subcategories, 206+ presets).
            </p>
            <p class="text-rose-300 font-semibold">
              Existing map items on saved maps will retain their saved text labels, but custom options in the dropdowns will be reverted.
            </p>
          </div>

          <div class="flex justify-end pt-2">
            <button type="button" id="tax-factory-reset-btn" class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span class="material-symbols-outlined text-sm">restart_alt</span> Confirm Factory Reset
            </button>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-3 sm:px-6 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
        <span class="text-[11px]">Changes take effect immediately across all dropdowns & maps.</span>
        <button type="button" id="tax-close-footer-btn" class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer">
          Done
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modalRoot);
  activeModalEl = modalRoot;

  let validatedData = null;

  // --- TAB SWITCHING ---
  modalRoot.querySelectorAll('.tax-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update tab headers
      modalRoot.querySelectorAll('.tax-tab-btn').forEach((b) => {
        b.classList.remove('border-cyan-400', 'text-cyan-400');
        b.classList.add('border-transparent', 'text-slate-400');
      });
      btn.classList.remove('border-transparent', 'text-slate-400');
      btn.classList.add('border-cyan-400', 'text-cyan-400');

      // Update panes
      modalRoot.querySelectorAll('.tax-pane').forEach((p) => p.classList.add('hidden'));
      const targetPane = modalRoot.querySelector(`#tax-pane-${targetTab}`);
      if (targetPane) targetPane.classList.remove('hidden');
    });
  });

  // --- EXPORT HANDLERS ---
  modalRoot.querySelector('#tax-download-json-btn')?.addEventListener('click', () => {
    const jsonStr = exportTaxonomyToJsonString();
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadFile(jsonStr, `tactical_taxonomy_${dateStamp}.json`, 'application/json');
  });

  modalRoot.querySelector('#tax-download-csv-btn')?.addEventListener('click', () => {
    const csvStr = exportTaxonomyToCsvString();
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadFile(csvStr, `tactical_taxonomy_${dateStamp}.csv`, 'text/csv');
  });

  modalRoot.querySelector('#tax-copy-json-btn')?.addEventListener('click', async () => {
    const jsonStr = exportTaxonomyToJsonString();
    try {
      await navigator.clipboard.writeText(jsonStr);
      const copyBtn = modalRoot.querySelector('#tax-copy-json-btn');
      if (copyBtn) {
        copyBtn.innerHTML = '<span class="material-symbols-outlined text-xs">check</span> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<span class="material-symbols-outlined text-xs">content_copy</span> Copy to Clipboard';
        }, 2000);
      }
    } catch (_e) {}
  });

  // --- IMPORT & VALIDATION HANDLERS ---
  const dropzone = modalRoot.querySelector('#tax-import-dropzone');
  const fileInput = modalRoot.querySelector('#tax-file-input');
  const textarea = modalRoot.querySelector('#tax-import-textarea');
  const validateBtn = modalRoot.querySelector('#tax-validate-btn');
  const applyBtn = modalRoot.querySelector('#tax-apply-import-btn');
  const resultCard = modalRoot.querySelector('#tax-validation-result');

  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-cyan-400', 'bg-cyan-950/20');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleIncomingFile(file);
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleIncomingFile(file);
  });

  function handleIncomingFile(file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        if (textarea) textarea.value = content;
        runValidation(content, file.name.endsWith('.csv') ? 'csv' : 'json');
      }
    };
    reader.readAsText(file);
  }

  validateBtn?.addEventListener('click', () => {
    const text = textarea?.value || '';
    runValidation(text);
  });

  function runValidation(text, hintFormat = 'json') {
    if (!resultCard) return;
    const res = validateTaxonomyImport(text, hintFormat);
    resultCard.classList.remove('hidden');

    if (res.valid) {
      validatedData = res;
      resultCard.className = 'p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs space-y-1';
      resultCard.innerHTML = `
        <div class="font-bold flex items-center gap-1.5 text-emerald-300">
          <span class="material-symbols-outlined text-sm">check_circle</span> Valid ${res.format.toUpperCase()} Taxonomy Schema
        </div>
        <div class="text-[11px] text-emerald-200/90 flex gap-3 mt-1">
          <span>• Domains: <strong>${res.count.domains}</strong></span>
          <span>• Subcategories: <strong>${res.count.subcategories}</strong></span>
          <span>• Classifications (L3): <strong>${res.count.classifications}</strong></span>
        </div>
      `;
      if (applyBtn) applyBtn.disabled = false;
    } else {
      validatedData = null;
      resultCard.className = 'p-3 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-200 text-xs space-y-1';
      resultCard.innerHTML = `
        <div class="font-bold flex items-center gap-1.5 text-rose-300">
          <span class="material-symbols-outlined text-sm">error</span> Validation Error
        </div>
        <div class="text-[11px] text-rose-200/90">${escapeHtml(res.error || 'Unknown format issue')}</div>
      `;
      if (applyBtn) applyBtn.disabled = true;
    }
  }

  applyBtn?.addEventListener('click', () => {
    if (!validatedData || !validatedData.valid) return;
    const mode = modalRoot.querySelector('input[name="tax-import-mode"]:checked')?.value || 'merge';
    try {
      const outcome = importTaxonomyData(validatedData, mode);
      if (outcome.success) {
        resultCard.className = 'p-3 rounded-xl border border-cyan-500/40 bg-cyan-950/50 text-cyan-200 text-xs space-y-1';
        resultCard.innerHTML = `
          <div class="font-bold flex items-center gap-1.5 text-cyan-300">
            <span class="material-symbols-outlined text-sm">task_alt</span> Import Applied Successfully!
          </div>
          <div class="text-[11px] text-slate-300 mt-1">
            Registered ${outcome.applied.domains} domains, ${outcome.applied.subcategories} subcategories, and ${outcome.applied.classifications} tactical classifications (${mode} mode).
          </div>
        `;
        if (applyBtn) applyBtn.disabled = true;
        refreshStatsBar();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  });

  // --- RESET HANDLER ---
  modalRoot.querySelector('#tax-factory-reset-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset custom taxonomy to system defaults?')) {
      resetTaxonomyToDefaults();
      refreshStatsBar();
      const exportPreview = modalRoot.querySelector('#tax-export-preview');
      if (exportPreview) exportPreview.value = exportTaxonomyToJsonString();
      alert('Custom taxonomy reset to system defaults.');
      if (onUpdated) onUpdated();
    }
  });

  function refreshStatsBar() {
    const s = getTaxonomyStatistics();
    const d = modalRoot.querySelector('#stat-domains');
    const sub = modalRoot.querySelector('#stat-subs');
    const l3 = modalRoot.querySelector('#stat-l3');
    const cust = modalRoot.querySelector('#stat-custom');
    if (d) d.textContent = s.totalDomains;
    if (sub) sub.textContent = s.totalSubcategories;
    if (l3) l3.textContent = s.totalClassifications;
    if (cust) cust.textContent = s.customCount;
  }

  function closeModal() {
    modalRoot.remove();
    activeModalEl = null;
  }

  modalRoot.querySelector('#tax-close-modal-btn')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#tax-close-footer-btn')?.addEventListener('click', closeModal);
}
