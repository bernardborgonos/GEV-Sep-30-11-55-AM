/**
 * @module src/ui/mappingToolsHelpGuides.js
 * @description Comprehensive inline help guides, step-by-step instructions,
 * keyboard shortcuts, and tactical operational tips for Map Tools plugins.
 */

export const TOOL_HELP_GUIDES = Object.freeze({
  drawing: {
    title: 'TACTICAL DRAWING & VECTOR SUITE',
    icon: '✏️',
    summary: 'Direct geospatial sketching on the 3D globe terrain, including lines, directional vector arrows, tactical pushpin markers, multi-node waypoints, ruler measure tape, and standoff range rings.',
    steps: [
      {
        num: 1,
        heading: 'Select Vector Geometry',
        text: 'Click any tool in ACTIVE TOOL CONTROLS: Line/Path, Vector Arrow, POI Marker, Waypoints Route, Measure Tape, or Range Ring (☉). The cursor turns into a tactical crosshair immediately.',
      },
      {
        num: 2,
        heading: 'Set Center or Origin Point',
        text: 'Left-click on the 3D globe terrain to lock the origin point (e.g. base station, radar site, vessel, or start of patrol route).',
      },
      {
        num: 3,
        heading: 'Interactive Preview & Standoff Expansion',
        text: 'Move the cursor across the globe. A live dynamic preview and distance/radius readout (in both Kilometers and Nautical Miles) displays in real time.',
      },
      {
        num: 4,
        heading: 'Lock & Commit to Globe',
        text: 'Left-click a second time (or double-click / press ENTER for multi-point paths) to commit the geometry clamped to 3D terrain with a high-contrast tactical label.',
      },
    ],
    shortcuts: [
      { key: 'ENTER / Dbl-Click', action: 'Commit multi-node polyline or waypoint route' },
      { key: 'ESC / Right-Click', action: 'Cancel active drafting session' },
      { key: 'Stroke Slider', action: 'Change perimeter line thickness (1px to 8px)' },
      { key: 'Color Swatches', action: 'Switch friendly, hostile, warning, or sensor colors' },
    ],
    tip: 'Range Rings (☉) are ground-clamped along the WGS-84 ellipsoid and provide precise line-of-sight standoff envelopes around critical infrastructure.',
  },

  measurements: {
    title: 'GEODETIC MEASUREMENTS & AREA SUITE',
    icon: '📐',
    summary: 'True ellipsoidal WGS-84 geodesic distance, multi-leg path length, azimuth compass heading, and real-time polygon surface area calculation.',
    steps: [
      {
        num: 1,
        heading: 'Choose Measurement Mode',
        text: 'Select either Distance & Path Length or Polygon Geodesic Area from the controls.',
      },
      {
        num: 2,
        heading: 'Select Measurement Units',
        text: 'Toggle between METRIC (meters / km / km²), NAUTICAL MILES (NM / NM²), or IMPERIAL (feet / miles / acres).',
      },
      {
        num: 3,
        heading: 'Click Vertices on 3D Globe',
        text: 'Left-click on terrain to drop sequential measurement nodes. The cumulative distance, leg bearings, and enclosed area update in the live HUD readouts.',
      },
      {
        num: 4,
        heading: 'Save or Clear',
        text: 'Double-click or press ENTER to finish path. Click "Save as POI" to register the measurement in the tactical inventory, or "Clear" to reset.',
      },
    ],
    shortcuts: [
      { key: 'Left-Click', action: 'Add measurement waypoint on terrain' },
      { key: 'ENTER / Dbl-Click', action: 'Finalize distance or area calculation' },
      { key: 'ESC', action: 'Cancel and clear current measurement session' },
    ],
    tip: 'Geodesic calculation uses the Great Circle Haversine and Karney geodesic algorithms, ensuring centimeter accuracy over intercontinental distances.',
  },

  shape: {
    title: 'TACTICAL SHAPE & PERIMETER ZONES',
    icon: '⬡',
    summary: 'Draft enclosed perimeter cordons, concentric defense rings, and active breach-monitored geofence zones with live asset tracking.',
    steps: [
      {
        num: 1,
        heading: 'Choose Shape Subtype',
        text: 'Select Tactical Polygon (Enclosed Area), Standoff Range Rings, or Monitored Geofence Boundary.',
      },
      {
        num: 2,
        heading: 'Configure Zone Properties',
        text: 'Adjust the perimeter radius slider, fill opacity (10% to 90%), and select your operational color (Air Defense Cyan, Friendly Green, Warning Amber, Exclusion Red).',
      },
      {
        num: 3,
        heading: 'Draft on 3D Globe',
        text: 'Click "START DRAFTING SHAPE" and click on the map to define perimeter corners or drop the center origin. Live surface area and perimeter distance calculate dynamically.',
      },
      {
        num: 4,
        heading: 'Arm Security Breach Watchdog',
        text: 'Enable Breach Watchdog to track live aircraft and maritime vessels penetrating the zone, triggering real-time visual alerts and voice notifications.',
      },
    ],
    shortcuts: [
      { key: 'Left-Click', action: 'Place perimeter boundary vertex' },
      { key: 'ENTER / Dbl-Click', action: 'Close perimeter and lock boundary' },
      { key: 'ESC', action: 'Cancel draft' },
    ],
    tip: 'Geofences can monitor altitude ceilings, speed limits, and vessel loitering inside restricted territorial waters or military airspace.',
  },

  'satellite-footprint': {
    title: 'SATELLITE PASS & GROUND SWATH',
    icon: '🛰️',
    summary: 'Predict orbital ground tracks, sensor swath footprint widths, optical/SAR collection corridors, and horizon elevation masks.',
    steps: [
      {
        num: 1,
        heading: 'Choose Orbital Regime',
        text: 'Select Low Earth Orbit (LEO), Medium Earth Orbit (MEO), Geostationary (GEO), or Polar Sun-Synchronous.',
      },
      {
        num: 2,
        heading: 'Set Sensor Swath Width',
        text: 'Adjust the swath width slider (100 km to 1,500 km) to model high-resolution optical (narrow) vs wide-area synthetic aperture radar (SAR).',
      },
      {
        num: 3,
        heading: 'Configure Elevation Mask',
        text: 'Set the minimum ground elevation angle (5° to 45°) to filter line-of-sight obstruction from terrain and urban structures.',
      },
      {
        num: 4,
        heading: 'Project Pass Footprint',
        text: 'Click "PROJECT PASS FOOTPRINT" to cast the ground track vector and sensor collection corridor directly onto the 3D globe.',
      },
    ],
    shortcuts: [
      { key: 'Nadir Checkbox', action: 'Toggle sub-satellite nadir ground track vector' },
      { key: 'Clear Button', action: 'Remove projected orbital swaths from the globe' },
    ],
    tip: 'Use narrow swaths (~100-250km) for high-resolution target reconnaissance, and wide swaths (>800km) for broad ocean surveillance.',
  },

  'sensor-los-cone': {
    title: 'RADAR & LINE-OF-SIGHT SENSOR CONE',
    icon: '📡',
    summary: 'Project 3D radar coverage envelopes, sensor fields-of-view, terrain-masked radar horizons, and animated azimuth scan sweeps.',
    steps: [
      {
        num: 1,
        heading: 'Set Coverage Range & Mast Height',
        text: 'Adjust the Radar Coverage Range (10 km to 300 km) and Antenna Mast Height (5 m to 150 m AGL) to compute geometric radar horizon.',
      },
      {
        num: 2,
        heading: 'Set Azimuth Scan Span',
        text: 'Configure the sector scan angle (15° for directional phased array up to 360° for omnidirectional surveillance radar).',
      },
      {
        num: 3,
        heading: 'Position Radar Transmitter',
        text: 'Click "CAST 3D RADAR CONE" and click on the 3D terrain to place the emitter site (or cast at current view center).',
      },
      {
        num: 4,
        heading: 'Analyze Blind Spots & Horizon',
        text: 'The projected 3D fan illustrates radar illumination coverage with an animated azimuth sweep line.',
      },
    ],
    shortcuts: [
      { key: 'Range Slider', action: 'Dynamic radar horizon range adjustment' },
      { key: 'Cast Button', action: 'Deploy radar emitter and FOV cone' },
    ],
    tip: 'Antenna height increases the optical horizon distance by formula d ≈ 3.57 × (√h_transmitter + √h_target).',
  },

  'mgrs-tactical-grid': {
    title: 'MGRS & TACTICAL COORDINATE GRID',
    icon: '🌐',
    summary: 'Military Grid Reference System (MGRS), NATO UTM coordinates, precision 100km square identifiers, and real-time cursor coordinate fixes.',
    steps: [
      {
        num: 1,
        heading: 'Select Grid Resolution',
        text: 'Choose resolution density: 100km (Theater Level), 10km (Operational), 1km (Tactical), or 100m (Targeting).',
      },
      {
        num: 2,
        heading: 'Adjust Graticule Opacity',
        text: 'Slide opacity from 10% to 100% to balance tactical grid visibility against underlying satellite imagery.',
      },
      {
        num: 3,
        heading: 'Toggle Grid Overlay',
        text: 'Click "TOGGLE GRID OVERLAY" to project grid lines and 100k square identifiers onto the 3D globe.',
      },
      {
        num: 4,
        heading: 'Inspect & Copy MGRS Coordinate',
        text: 'Click "COPY CURRENT CURSOR MGRS" or click any point on the globe to copy the standardized 10-digit military coordinate string (e.g. 14RNU 12345 67890).',
      },
    ],
    shortcuts: [
      { key: 'Labels Checkbox', action: 'Toggle 100k Grid Zone Designator (GZD) square labels' },
      { key: 'Toggle Button', action: 'Turn MGRS tactical grid overlay on/off' },
    ],
    tip: 'A 10-digit MGRS coordinate pinpoints any location on Earth to a 1-meter precision square.',
  },

  'weather-hazard-buffer': {
    title: 'WEATHER & SIGMET AVOIDANCE BUFFER',
    icon: '⛈️',
    summary: 'Dynamic convective storm cell standoff envelopes, icing levels, and SIGMET turbulence clearance corridors.',
    steps: [
      {
        num: 1,
        heading: 'Set Standoff Margin',
        text: 'Configure the safety standoff margin (5 NM to 50 NM). Standard FAA/ICAO recommendation is minimum 20 NM from severe thunderstorm cells.',
      },
      {
        num: 2,
        heading: 'Set Aviation Flight Level',
        text: 'Slide the flight level selector (FL100 to FL450) to evaluate high-altitude anvil blowoff and turbulence corridors.',
      },
      {
        num: 3,
        heading: 'Generate Standoff Envelope',
        text: 'Click "GENERATE STANDOFF ENVELOPE" to render the glowing red hazard avoidance buffer zone on the 3D globe.',
      },
      {
        num: 4,
        heading: 'Route Clearance Evaluation',
        text: 'Cross-reference drawn flight paths and aircraft tracks against the buffer to ensure zero hazard intrusion.',
      },
    ],
    shortcuts: [
      { key: 'Standoff Slider', action: 'Adjust safety standoff buffer (5-50 NM)' },
      { key: 'Generate Button', action: 'Render convective clearance envelope' },
    ],
    tip: 'Severe convective storms can throw turbulence and hail up to 20 miles downwind; maintain FL350+ clearance or reroute around the buffer.',
  },

  workbench: {
    title: 'TACTICAL WORKBENCH & GEOFENCE ROSTER',
    icon: '🛡️',
    summary: 'Comprehensive tactical feature inventory, live asset breach monitoring, camera zoom shortcuts, and GeoJSON/KML import and export.',
    steps: [
      {
        num: 1,
        heading: 'View Feature Roster',
        text: 'Browse all drawn points, lines, polygons, range rings, and geofence perimeters.',
      },
      {
        num: 2,
        heading: 'Monitor Active Breaches',
        text: 'Inspect real-time asset intrusions, violations, entry timestamps, and breach severity ratings.',
      },
      {
        num: 3,
        heading: 'Align Camera & Inspect',
        text: 'Click any feature row in the roster to fly the camera directly to that geometry on the 3D globe.',
      },
      {
        num: 4,
        heading: 'Export / Import Layers',
        text: 'Export your tactical drawings as standard GeoJSON or KML for mission briefing and distribution.',
      },
    ],
    shortcuts: [
      { key: 'Fly-To Icon', action: 'Instantly center 3D camera on selected tactical feature' },
      { key: 'Trash Icon', action: 'Delete feature and remove from Cesium globe' },
    ],
    tip: 'Integrates with Google Drive to securely save and load tactical layer packages directly from the cloud.',
  },
});

/**
 * Generates HTML string for the inline help guide drawer based on active plugin ID.
 * @param {string} pluginId
 * @returns {string} HTML string
 */
export function renderToolHelpGuideHtml(pluginId) {
  const guide = TOOL_HELP_GUIDES[pluginId] || TOOL_HELP_GUIDES.drawing;

  return `
    <div class="tool-help-guide-inner p-3 bg-slate-950/95 border-b border-cyan-500/40 text-xs font-sans animate-fade-in">
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="text-base">${guide.icon}</span>
          <div>
            <div class="font-mono font-bold text-cyan-300 tracking-wider text-[11px] uppercase">${guide.title}</div>
            <div class="text-[10px] text-slate-400 font-sans">${guide.summary}</div>
          </div>
        </div>
        <button type="button" id="floating-help-close-btn" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 transition" title="Hide Help Guide">
          ✕ HIDE GUIDE
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
        <!-- Step-by-Step Instructions -->
        <div>
          <div class="text-[10px] font-mono font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <span>📋</span> <span>STEP-BY-STEP INSTRUCTIONS</span>
          </div>
          <div class="space-y-1.5">
            ${guide.steps
              .map(
                (s) => `
              <div class="flex items-start gap-2 bg-slate-900/60 p-1.5 rounded border border-slate-800/80">
                <span class="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                  ${s.num}
                </span>
                <div class="min-w-0">
                  <div class="font-semibold text-slate-200 text-[11px]">${s.heading}</div>
                  <div class="text-slate-400 text-[10px] leading-relaxed">${s.text}</div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Shortcuts & Tactical Field Tip -->
        <div class="flex flex-col justify-between">
          <div>
            <div class="text-[10px] font-mono font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <span>⌨️</span> <span>KEYS &amp; SHORTCUTS</span>
            </div>
            <div class="space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800/80 mb-2">
              ${guide.shortcuts
                .map(
                  (sc) => `
                <div class="flex items-center justify-between text-[10px]">
                  <span class="font-mono text-cyan-300 px-1.5 py-0.5 rounded bg-slate-800 border border-cyan-500/30 font-semibold">${sc.key}</span>
                  <span class="text-slate-400 text-right ml-2">${sc.action}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="bg-cyan-950/40 border border-cyan-500/30 rounded p-2 text-[10px] text-cyan-200">
            <div class="font-mono font-bold text-cyan-400 mb-0.5 flex items-center gap-1">
              <span>💡</span> <span>TACTICAL OPERATIONAL TIP</span>
            </div>
            <p class="leading-relaxed text-slate-300">${guide.tip}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}
