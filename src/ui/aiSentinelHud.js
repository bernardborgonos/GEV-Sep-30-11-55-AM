/**
 * @module src/ui/aiSentinelHud.js
 * @description Renders a floating, persistent HUD component visualizing Gemini API usage,
 * cooldown timers, active models, diagnostics, and health status (Sentinel).
 */

import { sentinel } from '../ai/aiSentinel.js';

let hudInterval = null;
let isMinimized = localStorage.getItem('gev_sentinel_minimized') === 'true';
let showDiagnostics = false; // Displays interactive simulation controls

/**
 * Mounts/Updates the floating Sentinel HUD.
 */
export function renderSentinelHud() {
  let container = document.getElementById('ai-sentinel-hud-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ai-sentinel-hud-container';
    container.className = 'fixed bottom-10 left-4 z-[9500] font-mono select-none animate-fade-in transition-all duration-300';
    document.body.appendChild(container);
    setupEvents();
  }

  const stats = sentinel.getStats();

  // Determine status color & label
  let statusColor = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
  let statusText = 'OPTIMAL';
  if (stats.isRateLimited) {
    statusColor = 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse';
    statusText = 'EXHAUSTED';
  } else if (stats.errorCount > 0) {
    statusColor = 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse';
    statusText = 'WARNING';
  }

  if (isMinimized) {
    // Collapsed Mini Badge
    container.innerHTML = `
      <button id="sentinel-restore-btn" class="flex items-center gap-2.5 px-3 py-2 bg-slate-950/90 border border-slate-700/80 hover:border-sky-500/80 rounded-lg text-slate-100 shadow-xl backdrop-blur-md hover:bg-slate-900 transition-all duration-200 text-xs">
        <span class="w-2 h-2 rounded-full ${statusColor}"></span>
        <span class="font-bold text-[10px] tracking-wider text-slate-300">SENTINEL</span>
        <span class="font-bold text-sky-400 tabular-nums">${stats.usageCount}</span>
        <span class="text-[10px] text-slate-500">·</span>
        <span class="text-xs text-sky-400 font-semibold hover:text-sky-300 flex items-center gap-1">
          Expand ↗
        </span>
      </button>
    `;
    return;
  }

  // Expanded HUD Card
  container.innerHTML = `
    <div class="bg-slate-950/95 border border-slate-800/80 rounded-xl p-4 shadow-2xl backdrop-blur-md text-slate-100 w-[240px] border-t-2 ${stats.isRateLimited ? 'border-t-rose-500' : 'border-t-sky-500'} transition-all duration-300">
      <!-- Title Bar -->
      <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${statusColor}"></span>
          <span class="text-[10px] font-bold text-sky-400 tracking-wider">AI SENTINEL</span>
        </div>
        <button id="sentinel-minimize-btn" class="text-slate-500 hover:text-slate-200 transition-colors p-1" title="Minimize HUD">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      <!-- Metrics -->
      <div class="space-y-2 text-xs">
        <div class="flex justify-between items-center">
          <span class="text-slate-400">Status:</span>
          <span class="font-bold text-[10px] tracking-wider py-0.5 px-1.5 rounded bg-slate-900 border ${stats.isRateLimited ? 'border-rose-900/40 text-rose-400' : stats.errorCount > 0 ? 'border-amber-900/40 text-amber-400' : 'border-emerald-900/40 text-emerald-400'}">${statusText}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Total Calls:</span>
          <span class="font-bold tabular-nums text-slate-200">${stats.usageCount}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Errors:</span>
          <span class="font-bold tabular-nums ${stats.errorCount > 0 ? 'text-rose-400' : 'text-slate-200'}">${stats.errorCount}</span>
        </div>
        
        <!-- Cooldown Timer Progress -->
        ${stats.isRateLimited ? `
          <div class="mt-2.5 p-2 bg-rose-950/40 border border-rose-900/30 rounded-md text-[10px] text-rose-300">
            <div class="flex justify-between font-bold mb-1">
              <span>RATE LIMITED</span>
              <span class="tabular-nums animate-pulse">${stats.cooldownSeconds}s left</span>
            </div>
            <!-- Progress Bar -->
            <div class="w-full bg-rose-950 h-1 rounded-full overflow-hidden">
              <div class="bg-rose-500 h-1 transition-all duration-1000" style="width: ${(stats.cooldownSeconds / 60) * 100}%"></div>
            </div>
          </div>
        ` : ''}

        <!-- Active Models -->
        ${Object.keys(stats.modelUsage).length > 0 ? `
          <div class="mt-2.5 pt-2 border-t border-slate-900/60 text-[10px]">
            <div class="text-slate-500 mb-1">MONITORED MODELS:</div>
            <div class="space-y-0.5 max-h-[60px] overflow-y-auto pr-1">
              ${Object.entries(stats.modelUsage).map(([model, count]) => `
                <div class="flex justify-between text-slate-400">
                  <span class="truncate max-w-[120px]" title="${model}">${model}</span>
                  <span class="font-bold tabular-nums text-slate-300">${count}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Links & Diagnostics Toggle -->
      <div class="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
        <a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:text-sky-300 underline font-semibold">Check Quota ↗</a>
        <button id="sentinel-toggle-diag-btn" class="text-slate-500 hover:text-slate-300 transition-colors">
          ${showDiagnostics ? 'Hide Controls' : 'Simulate'}
        </button>
      </div>

      <!-- Live Interactive Diagnostic Console -->
      ${showDiagnostics ? `
        <div class="mt-3 pt-3 border-t border-slate-800 space-y-2 text-[10px]">
          <div class="text-[9px] font-bold text-slate-500 tracking-wider">DIAGNOSTIC TESTER</div>
          <div class="grid grid-cols-2 gap-1.5">
            <button id="sentinel-sim-call-btn" class="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500 rounded text-slate-300 hover:text-white transition-colors text-center text-[10px]">
              + API Call
            </button>
            <button id="sentinel-sim-limit-btn" class="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-rose-500 rounded text-rose-400 hover:text-rose-300 transition-colors text-center text-[10px]">
              + Simulate 429
            </button>
          </div>
          <button id="sentinel-reset-btn" class="w-full px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 rounded text-slate-400 hover:text-white transition-colors text-center text-[10px]">
            Clear Logs & Cooldown
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Attaches click handlers for toggle buttons & interactive simulations.
 */
function setupEvents() {
  document.addEventListener('click', (e) => {
    // Restore button
    const restoreBtn = e.target.closest('#sentinel-restore-btn');
    if (restoreBtn) {
      isMinimized = false;
      localStorage.setItem('gev_sentinel_minimized', 'false');
      renderSentinelHud();
      return;
    }

    // Minimize button
    const minimizeBtn = e.target.closest('#sentinel-minimize-btn');
    if (minimizeBtn) {
      isMinimized = true;
      localStorage.setItem('gev_sentinel_minimized', 'true');
      renderSentinelHud();
      return;
    }

    // Diagnostics toggle
    const toggleDiagBtn = e.target.closest('#sentinel-toggle-diag-btn');
    if (toggleDiagBtn) {
      showDiagnostics = !showDiagnostics;
      renderSentinelHud();
      return;
    }

    // Simulate API Call
    const simCallBtn = e.target.closest('#sentinel-sim-call-btn');
    if (simCallBtn) {
      sentinel.simulateCall();
      renderSentinelHud();
      return;
    }

    // Simulate 429 Rate Limit
    const simLimitBtn = e.target.closest('#sentinel-sim-limit-btn');
    if (simLimitBtn) {
      sentinel.simulateRateLimit();
      renderSentinelHud();
      return;
    }

    // Reset stats
    const resetBtn = e.target.closest('#sentinel-reset-btn');
    if (resetBtn) {
      sentinel.resetAll();
      renderSentinelHud();
      return;
    }
  });
}

/**
 * Starts the Sentinel HUD update loop (at 1000ms for accurate timers).
 */
export function startSentinelHud() {
  if (hudInterval) return;
  renderSentinelHud();
  hudInterval = setInterval(renderSentinelHud, 1000);
}

/**
 * Stops the Sentinel HUD update loop.
 */
export function stopSentinelHud() {
  if (hudInterval) clearInterval(hudInterval);
  hudInterval = null;
}
