/**
 * @module src/ui/confirmModal.js
 * In-app Tactical Confirmation Dialog (replaces blocked native window.confirm in iframe).
 */

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _confirmModalRoot = null;

function getModalRoot() {
  if (!_confirmModalRoot || !document.body.contains(_confirmModalRoot)) {
    _confirmModalRoot = document.getElementById('in-app-confirm-modal-root');
    if (!_confirmModalRoot) {
      _confirmModalRoot = document.createElement('div');
      _confirmModalRoot.id = 'in-app-confirm-modal-root';
      document.body.appendChild(_confirmModalRoot);
    }
  }
  return _confirmModalRoot;
}

/**
 * Opens an in-app confirmation modal. Supports callbacks and returns a Promise<boolean>.
 *
 * @param {object} options
 * @param {string} [options.title='Confirm Action']
 * @param {string} [options.message='Are you sure you want to proceed?']
 * @param {string} [options.details]
 * @param {string} [options.confirmText='Confirm']
 * @param {string} [options.cancelText='Cancel']
 * @param {'rose'|'amber'|'emerald'|'sky'} [options.confirmColor='rose']
 * @param {Function} [options.onConfirm]
 * @param {Function} [options.onCancel]
 * @returns {Promise<boolean>}
 */
export function openConfirmModal({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  details = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'rose',
  onConfirm = null,
  onCancel = null,
} = {}) {
  return new Promise((resolve) => {
    const root = getModalRoot();

    let colorClasses = 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30';
    let iconName = 'delete';
    let iconColor = 'text-rose-400';

    if (confirmColor === 'amber') {
      colorClasses = 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30';
      iconName = 'warning';
      iconColor = 'text-amber-400';
    } else if (confirmColor === 'emerald') {
      colorClasses = 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30';
      iconName = 'check_circle';
      iconColor = 'text-emerald-400';
    } else if (confirmColor === 'sky') {
      colorClasses = 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/30';
      iconName = 'info';
      iconColor = 'text-sky-400';
    }

    root.innerHTML = `
      <div id="confirm-backdrop" class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in font-sans">
        <div id="confirm-card" class="relative w-full max-w-sm bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 select-none">
          
          <div class="px-5 py-4 border-b border-slate-700 bg-slate-900/90 flex items-center justify-between">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-base ${iconColor}">${iconName}</span>
              ${escapeHtml(title)}
            </h3>
            <button id="confirm-close-btn" type="button" class="text-slate-400 hover:text-white transition">
              <span class="material-symbols-outlined text-base">close</span>
            </button>
          </div>

          <div class="p-5 space-y-2.5 text-xs">
            <p class="text-slate-200 font-medium leading-relaxed">${escapeHtml(message)}</p>
            ${details ? `<p class="text-slate-400 text-[11px] leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">${escapeHtml(details)}</p>` : ''}
          </div>

          <div class="px-5 py-3 border-t border-slate-700 bg-slate-900/70 flex items-center justify-end gap-2.5">
            <button id="confirm-cancel-btn" type="button" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition">
              ${escapeHtml(cancelText)}
            </button>
            <button id="confirm-action-btn" type="button" class="px-4 py-1.5 ${colorClasses} rounded-lg text-xs font-semibold shadow-lg transition flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm">${iconName}</span>
              ${escapeHtml(confirmText)}
            </button>
          </div>

        </div>
      </div>
    `;

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
    };

    const handleConfirm = () => {
      cleanup();
      try {
        if (onConfirm) onConfirm();
      } catch (err) {
        console.error('[ConfirmModal] Error in onConfirm handler:', err);
      }
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      try {
        if (onCancel) onCancel();
      } catch (err) {
        console.error('[ConfirmModal] Error in onCancel handler:', err);
      }
      resolve(false);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    root.querySelector('#confirm-close-btn')?.addEventListener('click', handleCancel);
    root.querySelector('#confirm-cancel-btn')?.addEventListener('click', handleCancel);
    root.querySelector('#confirm-action-btn')?.addEventListener('click', handleConfirm);
    root.querySelector('#confirm-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'confirm-backdrop') {
        handleCancel();
      }
    });

    // Autofocus confirmation button for immediate action
    setTimeout(() => {
      root.querySelector('#confirm-action-btn')?.focus();
    }, 50);
  });
}

/**
 * Shorthand promise-based helper.
 */
export async function confirmAction(options) {
  return openConfirmModal(options);
}

/**
 * In-app Alert Modal (replaces blocked native window.alert in iframe).
 */
export function openAlertModal({
  title = 'Notice',
  message = '',
  buttonText = 'OK',
  alertType = 'amber',
} = {}) {
  return new Promise((resolve) => {
    const root = getModalRoot();

    let colorClasses = 'bg-amber-600 hover:bg-amber-500 text-white';
    let iconName = 'warning';
    let iconColor = 'text-amber-400';

    if (alertType === 'rose') {
      colorClasses = 'bg-rose-600 hover:bg-rose-500 text-white';
      iconName = 'error';
      iconColor = 'text-rose-400';
    } else if (alertType === 'sky') {
      colorClasses = 'bg-sky-600 hover:bg-sky-500 text-white';
      iconName = 'info';
      iconColor = 'text-sky-400';
    } else if (alertType === 'emerald') {
      colorClasses = 'bg-emerald-600 hover:bg-emerald-500 text-white';
      iconName = 'check_circle';
      iconColor = 'text-emerald-400';
    }

    root.innerHTML = `
      <div id="alert-backdrop" class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in font-sans">
        <div id="alert-card" class="relative w-full max-w-sm bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-100 select-none">
          <div class="px-5 py-4 border-b border-slate-700 bg-slate-900/90 flex items-center justify-between">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-base ${iconColor}">${iconName}</span>
              ${escapeHtml(title)}
            </h3>
            <button id="alert-close-btn" type="button" class="text-slate-400 hover:text-white transition">
              <span class="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          <div class="p-5 text-xs">
            <p class="text-slate-200 font-medium leading-relaxed">${escapeHtml(message)}</p>
          </div>
          <div class="px-5 py-3 border-t border-slate-700 bg-slate-900/70 flex items-center justify-end">
            <button id="alert-ok-btn" type="button" class="px-4 py-1.5 ${colorClasses} rounded-lg text-xs font-semibold shadow-lg transition">
              ${escapeHtml(buttonText)}
            </button>
          </div>
        </div>
      </div>
    `;

    const closeAlert = () => {
      window.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
      resolve();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        closeAlert();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    root.querySelector('#alert-close-btn')?.addEventListener('click', closeAlert);
    root.querySelector('#alert-ok-btn')?.addEventListener('click', closeAlert);
    root.querySelector('#alert-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'alert-backdrop') closeAlert();
    });

    setTimeout(() => {
      root.querySelector('#alert-ok-btn')?.focus();
    }, 50);
  });
}
