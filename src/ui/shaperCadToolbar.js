/**
 * @module src/ui/shaperCadToolbar.js
 * Tactical Shaper & CAD Toolbar directly implementing the reference tools:
 * 1. Pan / Navigate Globe (Hand)
 * 2. Select / Modify (Pointer Arrow - Inspect & Adjust Vertices)
 * 3. Polygon / Perimeter Zone (Polygon with corner nodes)
 * 4. Polyline / Road (Polyline with connected nodes)
 * 5. Point of Interest (Tactical Pushpin)
 * 6. Ground Observer / Pegman (Street / Eye-level View)
 */

export const SHAPER_MODES = Object.freeze({
  PAN: 'pan',
  SELECT_MODIFY: 'select-modify',
  DRAW_POLYGON: 'draw-polygon',
  DRAW_POLYLINE: 'draw-polyline',
  DRAW_MARKER: 'draw-marker',
  DRAW_BEARING: 'draw-bearing',
  DRAW_ELEVATION: 'draw-elevation',
  GROUND_OBSERVER: 'ground-observer',
});

let _currentMode = SHAPER_MODES.SELECT_MODIFY;
let _toolbarElement = null;
let _onModeChangeCallback = null;

export function initShaperCadToolbar({ onModeChange }) {
  _onModeChangeCallback = onModeChange;

  if (_toolbarElement) {
    _toolbarElement.remove();
  }

  _toolbarElement = document.createElement('div');
  _toolbarElement.id = 'shaper-cad-toolbar';
  _toolbarElement.setAttribute('role', 'toolbar');
  _toolbarElement.setAttribute('aria-label', 'Tactical Shape Drafting & Geometry Tools');

  _toolbarElement.innerHTML = `
    <div class="shaper-bar-inner flex items-center gap-1.5 p-1.5 bg-[#0b1329]/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md">
      
      <!-- 1. Hand / Pan -->
      <button type="button" class="shaper-tool-btn shaper-btn-teal" data-mode="${SHAPER_MODES.PAN}" title="Pan / Navigate Globe (Free Camera Orbit)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
          <path d="M12 2a1.5 1.5 0 0 0-1.5 1.5v6.5a.5.5 0 0 1-1 0V3.5a1.5 1.5 0 0 0-3 0v6.5a.5.5 0 0 1-1 0V5.5a1.5 1.5 0 0 0-3 0v8.5a7.5 7.5 0 0 0 15 0V7.5a1.5 1.5 0 0 0-3 0v2.5a.5.5 0 0 1-1 0V3.5A1.5 1.5 0 0 0 12 2z"/>
        </svg>
        <span class="sr-only">Pan</span>
      </button>

      <!-- 2. Select / Modify (Pointer Arrow) -->
      <button type="button" class="shaper-tool-btn shaper-btn-amber active" data-mode="${SHAPER_MODES.SELECT_MODIFY}" title="Select / Modify (Inspect properties & drag vertices)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
          <path d="M4 2.5l14 9.5-6.5 1.5 3.8 6.5-2.2 1.2-3.8-6.5L4 20V2.5z"/>
        </svg>
        <span class="sr-only">Select / Modify</span>
      </button>

      <div class="w-[1px] h-6 bg-slate-700/80 mx-0.5"></div>

      <!-- 3. Polygon / Perimeter Zone -->
      <button type="button" class="shaper-tool-btn shaper-btn-teal" data-mode="${SHAPER_MODES.DRAW_POLYGON}" title="Draft Polygon / Perimeter Zone (Enclosed Area)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="1.8">
          <polygon points="5,7 19,4 20,18 7,19" fill="currentColor" fill-opacity="0.25"/>
          <circle cx="5" cy="7" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="19" cy="4" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="20" cy="18" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="7" cy="19" r="2.2" fill="#fff" stroke="currentColor"/>
        </svg>
        <span class="sr-only">Polygon</span>
      </button>

      <!-- 4. Polyline / Road -->
      <button type="button" class="shaper-tool-btn shaper-btn-teal" data-mode="${SHAPER_MODES.DRAW_POLYLINE}" title="Draft Polyline / Road (Vector Path)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4,18 10,7 16,13 20,6"/>
          <circle cx="4" cy="18" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="10" cy="7" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="16" cy="13" r="2.2" fill="#fff" stroke="currentColor"/>
          <circle cx="20" cy="6" r="2.2" fill="#fff" stroke="currentColor"/>
        </svg>
        <span class="sr-only">Polyline</span>
      </button>

      <div class="w-[1px] h-6 bg-slate-700/80 mx-0.5"></div>

      <!-- 5. Point of Interest (Pushpin) -->
      <button type="button" class="shaper-tool-btn shaper-btn-olive" data-mode="${SHAPER_MODES.DRAW_MARKER}" title="Drop Point of Interest (POI Pushpin)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
          <path d="M16 12V4h1V2H7v2h1v8l-3 3v2h6.5v6l1.5 1 1.5-1v-6H19v-2l-3-3z"/>
        </svg>
        <span class="sr-only">Point of Interest</span>
      </button>

      <!-- 6. Ground Observer / Pegman -->
      <button type="button" class="shaper-tool-btn shaper-btn-olive" data-mode="${SHAPER_MODES.GROUND_OBSERVER}" title="Ground Observer (Street / Eye-Level Perspective)">
        <svg viewBox="0 0 24 24" class="shaper-icon" fill="currentColor">
          <circle cx="12" cy="5" r="2.8"/>
          <path d="M15 9H9c-1.1 0-2 .9-2 2v4h2v6h2v-6h2v6h2v-6h2v-4c0-1.1-.9-2-2-2z"/>
        </svg>
        <span class="sr-only">Ground Observer</span>
      </button>

    </div>
  `;

  document.body.appendChild(_toolbarElement);

  // Bind click handlers
  _toolbarElement.querySelectorAll('.shaper-tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      setShaperMode(mode);
    });
  });

  return {
    setMode: setShaperMode,
    getMode: () => _currentMode,
    destroy: () => {
      if (_toolbarElement) {
        _toolbarElement.remove();
        _toolbarElement = null;
      }
    },
  };
}

let _isChangingMode = false;

export function setShaperMode(mode, triggerCallback = true) {
  const previousMode = _currentMode;
  _currentMode = mode;
  if (!_toolbarElement) return;

  _toolbarElement.querySelectorAll('.shaper-tool-btn').forEach((btn) => {
    const btnMode = btn.getAttribute('data-mode');
    if (btnMode === mode) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  if (triggerCallback && _onModeChangeCallback && previousMode !== mode && !_isChangingMode) {
    try {
      _isChangingMode = true;
      _onModeChangeCallback(mode);
    } finally {
      _isChangingMode = false;
    }
  }
}

export function getShaperMode() {
  return _currentMode;
}
