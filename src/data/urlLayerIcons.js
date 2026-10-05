/**
 * @module urlLayerIcons
 * @description Dynamic vector billboard iconography for URL Intelligence & Geospatial Entity layers.
 *
 * Generates crisp, military-grade tactical SVG badge billboards with domain-specific
 * iconography (Airports ✈️, Seaports 🚢, Border Checkpoints 🛂, District Headquarters 🏢,
 * Field Offices 📍, Extension Units 🏷️, Embassies 🏛️) that map directly to AI-driven
 * entity classifications.
 */

export const CATEGORY_ICONS = Object.freeze({
  'Airport': '✈️',
  'Seaport': '🚢',
  'Border Crossing': '🛂',
  'District Office': '🏢',
  'Main Office': '🏢',
  'Field Office': '📍',
  'Extension Unit': '🏷️',
  'Embassy': '🏛️',
  'Landmark': '🏛️',
  'Hospital': '🏥',
  'Security': '🛡️',
  'Services': '💼',
  'Property': '🏢',
  'Holding Firms': '🏛️',
  'Mining & Oil': '⛏️',
  'Industrial': '🏭',
  'SME': '🏪',
  'Financials': '💳',
  'ETF': '📊',
  'Technology': '💻',
  'Energy': '⚡',
  'Agriculture': '🌾',
  'Logistics': '📦',
  'Fleet Vehicle': '🚙',
  'Vehicle Active': '🚗',
  'Vehicle Idle': '⏸️',
  'Dwell Stop': '🛑',
  'Waypoint': '📍',
  'Transit Corridor': '🛣️',
  'Train Station': '🚉',
  'Rail Station': '🚉',
  'Train': '🚆',
  'Transit Hub': '🚊',
  'Default': '📍',
});

export const CATEGORY_COLORS = Object.freeze({
  'Airport': '#00e5ff',          // Vibrant Cyan
  'Seaport': '#00e676',          // Electric Emerald
  'Border Crossing': '#d500f9',  // Neon Purple
  'District Office': '#2979ff',  // Royal Azure
  'Main Office': '#7c4dff',      // Deep Violet
  'Field Office': '#ffab00',     // Golden Amber
  'Extension Unit': '#ff4081',   // Neon Pink
  'Embassy': '#7c4dff',          // Deep Violet
  'Landmark': '#00b0ff',         // Sky Blue
  'Hospital': '#ff1744',         // Crimson Red
  'Security': '#ffd600',         // Bright Gold
  'Services': '#38bdf8',         // Bright Sky Azure
  'Property': '#10b981',         // Emerald Green
  'Holding Firms': '#a855f7',    // Royal Amethyst
  'Mining & Oil': '#f97316',     // High-Vis Flame Orange
  'Industrial': '#06b6d4',       // Industrial Teal
  'SME': '#ec4899',              // Cyber Rose Pink
  'Financials': '#fbbf24',       // Financial Gold
  'ETF': '#eab308',              // Electric Sun Yellow
  'Technology': '#6366f1',       // Digital Indigo
  'Energy': '#f43f5e',           // Ruby Pulse
  'Agriculture': '#84cc16',      // Lime Green
  'Logistics': '#14b8a6',        // Maritime Teal
  'Fleet Vehicle': '#00e5ff',    // High-Vis Fleet Cyan
  'Vehicle Active': '#10b981',   // Active Emerald
  'Vehicle Idle': '#f59e0b',     // Idle Solar Amber
  'Dwell Stop': '#ef4444',       // Stop Red
  'Waypoint': '#64748b',         // Slate Gray
  'Transit Corridor': '#3b82f6', // Corridor Blue
  'Train Station': '#a855f7',    // Royal Line Amethyst
  'Rail Station': '#a855f7',     // Royal Line Amethyst
  'Train': '#00e5ff',            // High-Vis Fleet Cyan
  'Transit Hub': '#38bdf8',      // Sky Azure Interchange
  'Default': '#00e5ff',          // Fallback Cyan
});

/** Dynamic in-memory registry of AI-generated or custom overridden category icons */
const _customCategoryRegistry = new Map();

/**
 * Register or update an AI-generated or custom category icon mapping.
 * @param {string} category
 * @param {{ emoji?: string, color?: string, symbolSvg?: string, description?: string }} iconData
 */
export function registerCategoryIcon(category, iconData = {}) {
  if (!category) return;
  const norm = normalizeCategory(category);
  const existing = _customCategoryRegistry.get(norm) || {};
  _customCategoryRegistry.set(norm, {
    ...existing,
    ...iconData,
    norm,
    category,
    registeredAt: Date.now(),
  });
  // Invalidate billboard cache for this category
  _billboardCache.delete(`${norm}:normal`);
  _billboardCache.delete(`${norm}:selected`);
}

/**
 * Retrieve all registered custom category icons.
 * @returns {Record<string, { emoji: string, color: string, norm: string }>}
 */
export function getAllCategoryMappings() {
  const result = {};
  for (const [norm, data] of _customCategoryRegistry.entries()) {
    result[norm] = {
      emoji: data.emoji || getCategoryEmoji(norm),
      color: data.color || getCategoryColor(norm),
      norm,
    };
  }
  return result;
}

export function getCategoryEmoji(category = '') {
  const norm = normalizeCategory(category);
  const custom = _customCategoryRegistry.get(norm);
  if (custom && custom.emoji) {
    return custom.emoji;
  }
  return CATEGORY_ICONS[norm] || deriveProceduralEmoji(category);
}

export function getCategoryColor(category = '') {
  const norm = normalizeCategory(category);
  const custom = _customCategoryRegistry.get(norm);
  if (custom && custom.color) {
    return custom.color;
  }
  return CATEGORY_COLORS[norm] || deriveProceduralColor(category);
}

/**
 * Procedural fallback emoji generator for arbitrary unknown categories
 * ensuring no category is left with a generic red pin.
 */
function deriveProceduralEmoji(catName = '') {
  const c = String(catName || '').toLowerCase();
  if (c.includes('oil') || c.includes('petro') || c.includes('gas') || c.includes('fuel')) return '🛢️';
  if (c.includes('mine') || c.includes('mining') || c.includes('ore') || c.includes('gold') || c.includes('mineral')) return '⛏️';
  if (c.includes('holding') || c.includes('conglomerate') || c.includes('corp') || c.includes('group')) return '🏛️';
  if (c.includes('bank') || c.includes('financ') || c.includes('capital') || c.includes('invest') || c.includes('fund')) return '💳';
  if (c.includes('etf') || c.includes('index') || c.includes('stock') || c.includes('share') || c.includes('equity')) return '📊';
  if (c.includes('prop') || c.includes('estate') || c.includes('realty') || c.includes('land') || c.includes('tower')) return '🏢';
  if (c.includes('indus') || c.includes('manuf') || c.includes('fact') || c.includes('plant') || c.includes('steel')) return '🏭';
  if (c.includes('serv') || c.includes('consult') || c.includes('agency') || c.includes('solut')) return '💼';
  if (c.includes('sme') || c.includes('retail') || c.includes('shop') || c.includes('store') || c.includes('market')) return '🏪';
  if (c.includes('tech') || c.includes('soft') || c.includes('data') || c.includes('cyber') || c.includes('cloud')) return '💻';
  if (c.includes('power') || c.includes('energy') || c.includes('solar') || c.includes('wind') || c.includes('elect')) return '⚡';
  if (c.includes('agri') || c.includes('farm') || c.includes('crop') || c.includes('food') || c.includes('feed')) return '🌾';
  if (c.includes('trans') || c.includes('freight') || c.includes('cargo') || c.includes('ship') || c.includes('logis')) return '📦';
  if (c.includes('health') || c.includes('med') || c.includes('pharma') || c.includes('bio')) return '🏥';
  if (c.includes('school') || c.includes('univ') || c.includes('colleg') || c.includes('educ')) return '🎓';
  if (c.includes('hotel') || c.includes('resort') || c.includes('tour') || c.includes('travel')) return '🏖️';
  return '🔷';
}

/**
 * Procedural distinct high-contrast cybernetic color generator based on string hash.
 */
function deriveProceduralColor(catName = '') {
  const palette = [
    '#00e5ff', '#38bdf8', '#818cf8', '#a855f7',
    '#ec4899', '#f43f5e', '#fb923c', '#f59e0b',
    '#eab308', '#84cc16', '#10b981', '#14b8a6',
    '#06b6d4', '#60a5fa', '#c084fc', '#f472b6',
  ];
  let hash = 0;
  const str = String(catName || 'Default');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % palette.length;
  return palette[idx];
}

export function normalizeCategory(category = '') {
  const clean = String(category || '').trim().toLowerCase();
  if (!clean) return 'Default';

  // Domain-specific aliases
  if (clean.includes('air') || clean.includes('avia') || clean.includes('flight') || clean.includes('terminal')) return 'Airport';
  if (clean.includes('sea') || clean.includes('port') || clean.includes('maritime') || clean.includes('harbor') || clean.includes('pier') || clean.includes('wharf')) return 'Seaport';
  if (clean.includes('border') || clean.includes('bcs') || clean.includes('crossing') || clean.includes('checkpoint')) return 'Border Crossing';
  if (clean.includes('main office') || clean.includes('headquarters') || clean.includes('hq') || clean.includes('central office')) return 'Main Office';
  if (clean.includes('district') || clean.includes('do ')) return 'District Office';
  if (clean.includes('field office') || clean.includes('fo ')) return 'Field Office';
  if (clean.includes('extension') || clean.includes('satellite') || clean.includes('one-stop') || clean.includes('unit')) return 'Extension Unit';
  if (clean.includes('embassy') || clean.includes('consul') || clean.includes('diplomat')) return 'Embassy';
  if (clean.includes('monument') || clean.includes('heritage') || clean.includes('unesco') || clean.includes('landmark')) return 'Landmark';
  if (clean.includes('hospital') || clean.includes('clinic') || clean.includes('health') || clean.includes('medical')) return 'Hospital';
  if (clean.includes('police') || clean.includes('security') || clean.includes('military') || clean.includes('coast guard')) return 'Security';

  // Rapid transit, rail, train & station classifications
  if (
    clean.includes('train station') ||
    clean.includes('rail station') ||
    clean.includes('railway station') ||
    clean.includes('subway station') ||
    clean.includes('metro station') ||
    clean.includes('rail_station') ||
    clean.includes('transit station') ||
    clean.includes('station_node') ||
    clean === 'station' ||
    clean === 'subway' ||
    clean.endsWith(' station')
  ) {
    return 'Train Station';
  }
  if (
    clean.includes('train') ||
    clean.includes('locomotive') ||
    clean.includes('rail vehicle') ||
    clean.includes('lrt-1') ||
    clean.includes('lrt-2') ||
    clean.includes('mrt-3') ||
    clean.includes('lrt1') ||
    clean.includes('lrt2') ||
    clean.includes('mrt3') ||
    clean.includes('transit_telemetry') ||
    clean.includes('metro patrol') ||
    clean.includes('lead train') ||
    clean.includes('emu')
  ) {
    return 'Train';
  }
  if (clean.includes('transit hub') || clean.includes('interchange') || clean.includes('transfer station')) {
    return 'Transit Hub';
  }

  // Economic, commercial & industry classifications
  if (clean === 'services' || clean.includes('service')) return 'Services';
  if (clean === 'property' || clean.includes('real estate') || clean.includes('properties')) return 'Property';
  if (clean === 'holding firms' || clean.includes('holding') || clean.includes('conglomerate')) return 'Holding Firms';
  if (clean === 'mining & oil' || clean.includes('mining') || clean.includes('oil') || clean.includes('petroleum')) return 'Mining & Oil';
  if (clean === 'industrial' || clean.includes('manufacturing') || clean.includes('industry')) return 'Industrial';
  if (clean === 'sme' || clean.includes('small') || clean.includes('medium enterprise') || clean.includes('retail')) return 'SME';
  if (clean === 'financials' || clean.includes('finance') || clean.includes('banking') || clean.includes('capital')) return 'Financials';
  if (clean === 'etf' || clean.includes('exchange traded') || clean.includes('index fund')) return 'ETF';
  if (clean.includes('tech') || clean.includes('software') || clean.includes('telecom')) return 'Technology';
  if (clean.includes('energy') || clean.includes('power') || clean.includes('utility')) return 'Energy';
  if (clean.includes('agri') || clean.includes('farm') || clean.includes('fishery')) return 'Agriculture';
  if (clean.includes('logis') || clean.includes('cargo') || clean.includes('transport')) return 'Logistics';

  // Capitalize normalized category name preserving multi-word titles
  return category
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Generates an SVG symbol graphic based on normalized category.
 * @param {string} normCategory
 * @param {string} color
 * @returns {string} SVG inner markup
 */
function getSymbolSvg(normCategory, color) {
  switch (normCategory) {
    case 'Train Station':
    case 'Rail Station':
      // Architectural elevated rapid transit rail station with vaulted canopy, tracks & viaduct
      return `
        <!-- Vaulted curved aerodynamic station canopy roof -->
        <path d="M 6 12 Q 20 5 34 12 L 32 14.5 Q 20 8 8 14.5 Z" fill="${color}" stroke="#ffffff" stroke-width="0.8" />
        <!-- Structural steel truss framework ribs -->
        <path d="M 10 13.5 L 13.5 9 L 17 13 L 20.5 8.5 L 24 13 L 27.5 9 L 30 13" fill="none" stroke="#ffffff" stroke-width="0.75" opacity="0.85" />
        <!-- Central illuminated station clock / entrance beacon -->
        <circle cx="20" cy="11.5" r="2.2" fill="#060c13" stroke="#ffffff" stroke-width="0.7" />
        <circle cx="20" cy="11.5" r="1.2" fill="${color}" />
        <!-- Overhead catenary electrical power wire -->
        <line x1="6" y1="5.5" x2="34" y2="5.5" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2,1" />
        <line x1="20" y1="5.5" x2="20" y2="8" stroke="#ffffff" stroke-width="1" />
        <!-- Twin polished steel rails with railway cross-ties -->
        <line x1="7" y1="16.5" x2="33" y2="16.5" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
        <line x1="7" y1="18.5" x2="33" y2="18.5" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
        <line x1="11" y1="16" x2="11" y2="19" stroke="#cbd5e1" stroke-width="0.8" />
        <line x1="15.5" y1="16" x2="15.5" y2="19" stroke="#cbd5e1" stroke-width="0.8" />
        <line x1="20" y1="16" x2="20" y2="19" stroke="#cbd5e1" stroke-width="0.8" />
        <line x1="24.5" y1="16" x2="24.5" y2="19" stroke="#cbd5e1" stroke-width="0.8" />
        <line x1="29" y1="16" x2="29" y2="19" stroke="#cbd5e1" stroke-width="0.8" />
        <!-- Elevated platform concourse & yellow tactile edge stripe -->
        <rect x="7" y="19.5" width="26" height="3" rx="0.5" fill="#1e293b" stroke="#ffffff" stroke-width="0.6" />
        <rect x="7" y="19.5" width="26" height="0.8" fill="#fbbf24" />
        <!-- Concrete viaduct piers and ground foundation -->
        <rect x="11" y="22.5" width="4" height="4.5" fill="${color}" opacity="0.45" stroke="#ffffff" stroke-width="0.6" />
        <rect x="25" y="22.5" width="4" height="4.5" fill="${color}" opacity="0.45" stroke="#ffffff" stroke-width="0.6" />
        <line x1="8" y1="27" x2="32" y2="27" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" />
      `;

    case 'Train':
      // Streamlined modern commuter rapid-transit EMU train with aerodynamic cab & headlights
      return `
        <!-- Rooftop high-voltage single-arm pantograph -->
        <path d="M 16 6.5 L 18.5 4.5 L 20.5 5.5 L 23.5 4.5" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="17.5" y1="4.5" x2="23" y2="4.5" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
        <rect x="18.5" y="6" width="3" height="1.5" fill="#475569" stroke="#ffffff" stroke-width="0.4" />
        <!-- Streamlined aerodynamic train body shell -->
        <path d="M 13 8.5 Q 20 6.5 27 8.5 L 28 22 Q 28 26 20 26 Q 12 26 12 22 Z" fill="#0f172a" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" />
        <path d="M 13 8.5 Q 20 6.5 27 8.5 L 28 22 Q 28 26 20 26 Q 12 26 12 22 Z" fill="${color}" opacity="0.2" />
        <!-- Electronic destination LED matrix sign -->
        <rect x="16.5" y="8" width="7" height="2" rx="0.5" fill="#060c13" stroke="#ffffff" stroke-width="0.5" />
        <line x1="17.5" y1="9" x2="22.5" y2="9" stroke="${color}" stroke-width="0.8" />
        <!-- Panoramic wraparound driver cab windshield with reflection glare -->
        <path d="M 14 11 Q 20 9 26 11 L 25.5 15.5 Q 20 14.5 14.5 15.5 Z" fill="#020617" stroke="#ffffff" stroke-width="0.7" />
        <path d="M 15.5 11.5 L 18.5 11.5 L 17 15 L 14.8 15 Z" fill="#ffffff" opacity="0.35" />
        <!-- Dynamic chevron livery accent stripe across the nose -->
        <path d="M 12.8 17 L 20 19 L 27.2 17 L 27.5 18.6 L 20 20.8 L 12.5 18.6 Z" fill="${color}" stroke="#ffffff" stroke-width="0.4" />
        <!-- High-intensity Xenon/LED dual headlights with forward beam glow -->
        <circle cx="15" cy="21.5" r="1.8" fill="#ffffff" stroke="#fef08a" stroke-width="0.8" />
        <circle cx="25" cy="21.5" r="1.8" fill="#ffffff" stroke="#fef08a" stroke-width="0.8" />
        <circle cx="15" cy="21.5" r="0.9" fill="#fef08a" />
        <circle cx="25" cy="21.5" r="0.9" fill="#fef08a" />
        <!-- Red lower marker / tail safety LEDs -->
        <circle cx="13.2" cy="23.5" r="0.9" fill="#ef4444" />
        <circle cx="26.8" cy="23.5" r="0.9" fill="#ef4444" />
        <!-- Lower pilot skirt / track cowcatcher & steel rails -->
        <path d="M 14.5 24.5 L 25.5 24.5 L 24 26.5 L 16 26.5 Z" fill="#334155" stroke="#ffffff" stroke-width="0.5" />
        <line x1="9" y1="27.8" x2="31" y2="27.8" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
      `;

    case 'Transit Hub':
      // Multi-line rail interchange hub with dual intersecting tracks & central transfer beacon
      return `
        <!-- Outer circular interchange junction halo -->
        <circle cx="20" cy="16" r="10" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="1.2" stroke-dasharray="3,1.5" />
        <!-- Crossed railway tracks -->
        <line x1="10" y1="16" x2="30" y2="16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
        <line x1="20" y1="6" x2="20" y2="26" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
        <line x1="10" y1="17.5" x2="30" y2="17.5" stroke="#94a3b8" stroke-width="0.8" />
        <line x1="21.5" y1="6" x2="21.5" y2="26" stroke="#94a3b8" stroke-width="0.8" />
        <!-- Central multi-line interchange hub core -->
        <circle cx="20" cy="16" r="4.5" fill="#060c13" stroke="#ffffff" stroke-width="1.2" />
        <circle cx="20" cy="16" r="2.5" fill="${color}" />
        <polygon points="20,13 22,16 20,19 18,16" fill="#ffffff" />
      `;

    case 'Airport':
      // Sleek swept-wing aircraft silhouette
      return `
        <path d="M 20 7 L 22.8 13.5 L 32.5 17.5 L 32.5 19.8 L 22.8 18 L 22.8 23.5 L 25.8 26 L 25.8 27.8 L 20 26.5 L 14.2 27.8 L 14.2 26 L 17.2 23.5 L 17.2 18 L 7.5 19.8 L 7.5 17.5 L 17.2 13.5 Z"
              fill="${color}" stroke="#ffffff" stroke-width="0.5" stroke-linejoin="round" />
      `;

    case 'Seaport':
      // Maritime vessel hull, superstructure & waves
      return `
        <path d="M 18.5 7 L 21.5 7 L 21.5 10.5 L 24.5 10.5 L 24.5 14.5 L 15.5 14.5 L 15.5 10.5 L 18.5 10.5 Z" fill="${color}" />
        <path d="M 9 16.5 L 31 16.5 L 28 22.5 C 27 24.5, 24.5 25, 20 25 C 15.5 25, 13 24.5, 12 22.5 Z" fill="${color}" stroke="#ffffff" stroke-width="0.5" />
        <path d="M 8.5 25.5 C 11.5 24.5, 13.5 26.5, 16.5 25.5 C 19.5 24.5, 21.5 26.5, 24.5 25.5 C 27.5 24.5, 29.5 26.5, 31.5 25.5" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
      `;

    case 'Border Crossing':
      // Security shield & verified passport checkpoint
      return `
        <path d="M 20 7 L 29.5 10.5 L 29.5 16.5 C 29.5 22.5, 25 25.5, 20 27 C 15 25.5, 10.5 22.5, 10.5 16.5 L 10.5 10.5 Z" fill="none" stroke="${color}" stroke-width="1.8" />
        <path d="M 20 8.5 L 28 11.8 L 28 16.5 C 28 21.2, 24 24, 20 25.2 C 16 24, 12 21.2, 12 16.5 L 12 11.8 Z" fill="${color}" opacity="0.25" />
        <path d="M 16 16.5 L 19 19.5 L 24.5 13.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `;

    case 'District Office':
    case 'Main Office':
      // Government civic administration building with windows & flagpole
      return `
        <rect x="11" y="9.5" width="18" height="15.5" rx="1.5" fill="${color}" opacity="0.3"/>
        <rect x="11" y="9.5" width="18" height="15.5" rx="1.5" fill="none" stroke="${color}" stroke-width="1.5"/>
        <rect x="13.5" y="12" width="3" height="3" fill="#ffffff" />
        <rect x="18.5" y="12" width="3" height="3" fill="#ffffff" />
        <rect x="23.5" y="12" width="3" height="3" fill="#ffffff" />
        <rect x="13.5" y="16.5" width="3" height="3" fill="#ffffff" />
        <rect x="18.5" y="16.5" width="3" height="3" fill="#ffffff" />
        <rect x="23.5" y="16.5" width="3" height="3" fill="#ffffff" />
        <rect x="18" y="21" width="4" height="4" fill="${color}" stroke="#ffffff" stroke-width="0.8" />
        <line x1="20" y1="6.5" x2="20" y2="9.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
      `;

    case 'Field Office':
      // Field station location beacon / pin with center radar dot
      return `
        <circle cx="20" cy="14" r="6.5" fill="none" stroke="${color}" stroke-width="1.8" />
        <circle cx="20" cy="14" r="5" fill="${color}" opacity="0.25" />
        <circle cx="20" cy="14" r="2.6" fill="#ffffff" />
        <path d="M 15 18 L 20 24.5 L 25 18" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      `;

    case 'Extension Unit':
      // Extension satellite unit / outpost emitter
      return `
        <circle cx="20" cy="16.5" r="3.2" fill="#ffffff" />
        <path d="M 13.5 11 A 9.5 9.5 0 0 1 26.5 11" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
        <path d="M 10.5 7.5 A 13.5 13.5 0 0 1 29.5 7.5" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
        <line x1="20" y1="20" x2="20" y2="25.5" stroke="${color}" stroke-width="2" stroke-linecap="round" />
        <line x1="16" y1="25.5" x2="24" y2="25.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
      `;

    case 'Embassy':
    case 'Landmark':
      // Classical diplomatic portico / neoclassical columns
      return `
        <polygon points="20,7 8.5,12 31.5,12" fill="${color}" stroke="#ffffff" stroke-width="0.5" />
        <rect x="9.5" y="12.8" width="21" height="1.8" fill="#ffffff" />
        <line x1="12" y1="14.8" x2="12" y2="21.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
        <line x1="17.3" y1="14.8" x2="17.3" y2="21.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
        <line x1="22.7" y1="14.8" x2="22.7" y2="21.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
        <line x1="28" y1="14.8" x2="28" y2="21.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
        <rect x="8.5" y="21.8" width="23" height="2.2" rx="0.5" fill="#ffffff" />
      `;

    case 'Hospital':
      // Medical cross
      return `
        <rect x="17" y="9" width="6" height="16" rx="1.5" fill="#ffffff" />
        <rect x="12" y="14" width="16" height="6" rx="1.5" fill="#ffffff" />
      `;

    case 'Security':
      // Defense badge
      return `
        <path d="M 20 7 L 29 11 L 29 17 C 29 23, 20 27, 20 27 C 20 27, 11 23, 11 17 L 11 11 Z" fill="${color}" stroke="#ffffff" stroke-width="1.2" />
        <circle cx="20" cy="16" r="3" fill="#ffffff" />
      `;

    case 'Services':
      // Tactical briefcase & diamond service node
      return `
        <rect x="11" y="12" width="18" height="13" rx="2" fill="${color}" opacity="0.3"/>
        <rect x="11" y="12" width="18" height="13" rx="2" fill="none" stroke="${color}" stroke-width="1.6"/>
        <path d="M 16 12 L 16 9 C 16 8, 17 7.5, 18 7.5 L 22 7.5 C 23 7.5, 24 8, 24 9 L 24 12" fill="none" stroke="#ffffff" stroke-width="1.5" />
        <line x1="11" y1="17" x2="29" y2="17" stroke="#ffffff" stroke-width="1" />
        <circle cx="20" cy="17" r="2.2" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>
      `;

    case 'Property':
      // Modern commercial architectural skyscraper towers
      return `
        <rect x="9" y="13" width="9" height="13" fill="${color}" opacity="0.35"/>
        <rect x="9" y="13" width="9" height="13" fill="none" stroke="${color}" stroke-width="1.4"/>
        <rect x="20" y="8" width="11" height="18" fill="${color}" opacity="0.5"/>
        <rect x="20" y="8" width="11" height="18" fill="none" stroke="${color}" stroke-width="1.5"/>
        <line x1="25.5" y1="5" x2="25.5" y2="8" stroke="#ffffff" stroke-width="1.5"/>
        <line x1="12" y1="16" x2="15" y2="16" stroke="#ffffff" stroke-width="1"/>
        <line x1="12" y1="20" x2="15" y2="20" stroke="#ffffff" stroke-width="1"/>
        <line x1="23.5" y1="12" x2="27.5" y2="12" stroke="#ffffff" stroke-width="1"/>
        <line x1="23.5" y1="16" x2="27.5" y2="16" stroke="#ffffff" stroke-width="1"/>
        <line x1="23.5" y1="20" x2="27.5" y2="20" stroke="#ffffff" stroke-width="1"/>
      `;

    case 'Holding Firms':
      // Interconnected corporate network nodes & central apex crown
      return `
        <polygon points="20,7 28,12 28,21 20,26 12,21 12,12" fill="${color}" opacity="0.25"/>
        <polygon points="20,7 28,12 28,21 20,26 12,21 12,12" fill="none" stroke="${color}" stroke-width="1.5"/>
        <circle cx="20" cy="11" r="2.2" fill="#ffffff"/>
        <circle cx="15.5" cy="19" r="2.2" fill="#ffffff"/>
        <circle cx="24.5" cy="19" r="2.2" fill="#ffffff"/>
        <line x1="20" y1="11" x2="15.5" y2="19" stroke="${color}" stroke-width="1.4"/>
        <line x1="20" y1="11" x2="24.5" y2="19" stroke="${color}" stroke-width="1.4"/>
        <line x1="15.5" y1="19" x2="24.5" y2="19" stroke="${color}" stroke-width="1.4"/>
        <circle cx="20" cy="16.5" r="1.6" fill="${color}"/>
      `;

    case 'Mining & Oil':
      // Oil derrick & industrial resource pickaxes
      return `
        <polygon points="20,7 13,26 27,26" fill="${color}" opacity="0.25"/>
        <line x1="20" y1="7" x2="13" y2="26" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="20" y1="7" x2="27" y2="26" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="15" y1="18" x2="25" y2="18" stroke="#ffffff" stroke-width="1.2"/>
        <line x1="16.5" y1="13" x2="23.5" y2="13" stroke="#ffffff" stroke-width="1.2"/>
        <line x1="15" y1="18" x2="23.5" y2="13" stroke="${color}" stroke-width="0.9"/>
        <line x1="25" y1="18" x2="16.5" y2="13" stroke="${color}" stroke-width="0.9"/>
        <circle cx="20" cy="6.5" r="1.8" fill="#ffffff"/>
        <path d="M 18 21.5 C 18 20.5, 20 19, 20 19 C 20 19, 22 20.5, 22 21.5 C 22 22.5, 21.2 23.5, 20 23.5 C 18.8 23.5, 18 22.5, 18 21.5 Z" fill="#ff7043"/>
      `;

    case 'Industrial':
      // Manufacturing facility sawtooth roof & rotating cogwheel
      return `
        <polygon points="9,25 9,14 14,18 14,14 19,18 19,10 24,10 24,25" fill="${color}" opacity="0.35"/>
        <polygon points="9,25 9,14 14,18 14,14 19,18 19,10 24,10 24,25" fill="none" stroke="${color}" stroke-width="1.5"/>
        <line x1="21.5" y1="6" x2="21.5" y2="10" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="26" cy="18" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
        <circle cx="26" cy="18" r="1.8" fill="#060c13"/>
      `;

    case 'SME':
      // Storefront commercial awning & retail canopy
      return `
        <path d="M 10 12 L 30 12 L 28 17 L 12 17 Z" fill="${color}" stroke="#ffffff" stroke-width="1"/>
        <rect x="12" y="17" width="16" height="8.5" fill="${color}" opacity="0.25"/>
        <rect x="12" y="17" width="16" height="8.5" fill="none" stroke="${color}" stroke-width="1.4"/>
        <rect x="17" y="19" width="6" height="6.5" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>
        <circle cx="20" cy="9" r="1.8" fill="#ffffff"/>
      `;

    case 'Financials':
      // Classical banking pediment & financial ascending candlestick chart
      return `
        <polygon points="20,7 10,12 30,12" fill="${color}" stroke="#ffffff" stroke-width="1"/>
        <line x1="13" y1="13" x2="13" y2="20" stroke="${color}" stroke-width="2"/>
        <line x1="17.5" y1="13" x2="17.5" y2="20" stroke="${color}" stroke-width="2"/>
        <line x1="22.5" y1="13" x2="22.5" y2="20" stroke="${color}" stroke-width="2"/>
        <line x1="27" y1="13" x2="27" y2="20" stroke="${color}" stroke-width="2"/>
        <rect x="9.5" y="20.5" width="21" height="2" fill="#ffffff"/>
        <path d="M 11 25.5 L 18 22 L 23 24 L 29 18.5" fill="none" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/>
      `;

    case 'ETF':
      // ETF / Index distribution bars & trend vector
      return `
        <rect x="10" y="19" width="4.5" height="7" fill="${color}" opacity="0.8"/>
        <rect x="16.5" y="14" width="4.5" height="12" fill="${color}" opacity="0.8"/>
        <rect x="23" y="10" width="4.5" height="16" fill="${color}" opacity="0.8"/>
        <path d="M 10 17 L 17 12 L 23 8 L 29.5 6.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <polygon points="29.5,6.5 25.5,6 28,9.5" fill="#ffffff"/>
      `;

    case 'Technology':
      // Integrated circuit CPU with peripheral pins
      return `
        <rect x="13" y="11" width="14" height="14" rx="2" fill="${color}" opacity="0.4"/>
        <rect x="13" y="11" width="14" height="14" rx="2" fill="none" stroke="${color}" stroke-width="1.6"/>
        <rect x="16.5" y="14.5" width="7" height="7" fill="#ffffff"/>
        <line x1="10" y1="14" x2="13" y2="14" stroke="${color}" stroke-width="1.5"/>
        <line x1="10" y1="18" x2="13" y2="18" stroke="${color}" stroke-width="1.5"/>
        <line x1="10" y1="22" x2="13" y2="22" stroke="${color}" stroke-width="1.5"/>
        <line x1="27" y1="14" x2="30" y2="14" stroke="${color}" stroke-width="1.5"/>
        <line x1="27" y1="18" x2="30" y2="18" stroke="${color}" stroke-width="1.5"/>
        <line x1="27" y1="22" x2="30" y2="22" stroke="${color}" stroke-width="1.5"/>
      `;

    case 'Energy':
      // High-voltage electric lightning bolt
      return `
        <polygon points="22,6 12,18 19,18 17,28 28,15 21,15" fill="${color}" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>
      `;

    case 'Logistics':
      // Intermodal freight container / transport arrow
      return `
        <rect x="10" y="11" width="20" height="13" rx="1" fill="${color}" opacity="0.3"/>
        <rect x="10" y="11" width="20" height="13" rx="1" fill="none" stroke="${color}" stroke-width="1.5"/>
        <line x1="15" y1="11" x2="15" y2="24" stroke="#ffffff" stroke-width="1"/>
        <line x1="20" y1="11" x2="20" y2="24" stroke="#ffffff" stroke-width="1.4"/>
        <line x1="25" y1="11" x2="25" y2="24" stroke="#ffffff" stroke-width="1"/>
        <circle cx="20" cy="27" r="1.5" fill="${color}"/>
      `;

    case 'Agriculture':
      // Plant seedling sprout / wheat sheaf
      return `
        <path d="M 20 26 L 20 12" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M 20 16 C 14 14, 13 8, 20 8 C 20 8, 20 13, 20 16 Z" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>
        <path d="M 20 19 C 26 17, 27 11, 20 11 C 20 11, 20 16, 20 19 Z" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>
      `;

    default:
      // Default tactical diamond badge
      return `
        <polygon points="20,8 29,17 20,25 11,17" fill="${color}" stroke="#ffffff" stroke-width="1" />
        <circle cx="20" cy="16.5" r="2.5" fill="#ffffff" />
      `;
  }
}

/** Cache for generated SVG billboard data URLs */
const _billboardCache = new Map();

/**
 * Returns a high-DPI SVG billboard data URL for the given category.
 * @param {string} category
 * @param {boolean} [isSelected=false]
 * @returns {string} Data URL for Cesium.Billboard
 */
export function getCategoryBillboardImage(category, isSelected = false) {
  const norm = normalizeCategory(category);
  const cacheKey = `${norm}:${isSelected ? 'selected' : 'normal'}`;

  if (_billboardCache.has(cacheKey)) {
    return _billboardCache.get(cacheKey);
  }

  const color = getCategoryColor(norm);
  const strokeColor = isSelected ? '#ffffff' : color;
  const strokeWidth = isSelected ? 2.4 : 1.8;
  const filterId = `glow-${norm.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${isSelected ? 'sel' : 'nor'}`;
  const glowOpacity = isSelected ? 0.95 : 0.65;
  const custom = _customCategoryRegistry.get(norm);
  const symbolMarkup = (custom && custom.symbolSvg) ? custom.symbolSvg : getSymbolSvg(norm, color);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 40 40">
  <defs>
    <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="${glowOpacity}"/>
      ${isSelected ? `<feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="${color}" flood-opacity="0.9"/>` : ''}
    </filter>
  </defs>
  <!-- Tactical Badge Shell with Geodetic Anchor Needle -->
  <path d="M 6 4 C 3.8 4, 2 5.8, 2 8 L 2 24 C 2 26.2, 3.8 28, 6 28 L 15.5 28 L 20 37.5 L 24.5 28 L 34 28 C 36.2 28, 38 26.2, 38 24 L 38 8 C 38 5.8, 36.2 4, 34 4 Z"
        fill="#060c13"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        filter="url(#${filterId})" />
  <!-- Category Symbol Silhouette -->
  <g id="symbol">
    ${symbolMarkup}
  </g>
  ${isSelected ? `<circle cx="20" cy="37.5" r="2" fill="#ffffff" />` : ''}
</svg>`;

  const dataUrl = 'data:image/svg+xml;base64,' + btoa(svg.trim());
  _billboardCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Intelligent AI Icon Generation for extracted geospatial categories.
 * Queries backend AI endpoint if available, with robust client-side tactical vector synthesis fallback.
 *
 * @param {string} category - Category name (e.g. 'Holding Firms', 'Property', 'Seaport')
 * @param {object} [options] - Optional custom prompt or manual overrides
 * @returns {Promise<{ emoji: string, color: string, symbolSvg: string, description: string, billboardUrl: string }>}
 */
export async function generateAiCategoryIcon(category, options = {}) {
  const norm = normalizeCategory(category);

  // If manual overrides are supplied, apply immediately
  if (options.color || options.emoji || options.symbolSvg) {
    const manualIcon = {
      emoji: options.emoji || getCategoryEmoji(norm),
      color: options.color || getCategoryColor(norm),
      symbolSvg: options.symbolSvg || null,
      description: options.description || `Tactical icon for ${norm}`,
    };
    registerCategoryIcon(norm, manualIcon);
    return {
      ...manualIcon,
      category: norm,
      billboardUrl: getCategoryBillboardImage(norm),
    };
  }

  // Attempt backend AI generation via /api/url-layer/generate-icon
  if (typeof fetch === 'function') {
    try {
      const resp = await fetch('/api/url-layer/generate-icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: norm,
          prompt: options.prompt || `Tactical military and geospatial intelligence icon for category "${norm}"`,
          theme: options.theme || 'cyber-tactical',
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && data.color && (data.emoji || data.symbolSvg)) {
          const aiResult = {
            emoji: data.emoji || getCategoryEmoji(norm),
            color: data.color || getCategoryColor(norm),
            symbolSvg: data.symbolSvg || null,
            description: data.description || `AI generated tactical emblem for ${norm}`,
          };
          registerCategoryIcon(norm, aiResult);
          return {
            ...aiResult,
            category: norm,
            billboardUrl: getCategoryBillboardImage(norm),
          };
        }
      }
    } catch {
      // Fallback to procedural generator below
    }
  }

  // Procedural AI Tactical Synthesis fallback
  const proceduralEmoji = deriveProceduralEmoji(norm);
  const proceduralColor = deriveProceduralColor(norm + ':ai:' + Date.now());
  const symbolMarkup = getSymbolSvg(norm, proceduralColor);

  const fallbackResult = {
    emoji: proceduralEmoji,
    color: proceduralColor,
    symbolSvg: symbolMarkup,
    description: `Tactical AI Vector Billboard for ${norm}`,
  };

  registerCategoryIcon(norm, fallbackResult);

  return {
    ...fallbackResult,
    category: norm,
    billboardUrl: getCategoryBillboardImage(norm),
  };
}

/**
 * Returns a realistic high-resolution SVG billboard for an active or dwelling commuter train.
 * Features aerodynamic EMU cab profile, pantograph, LED matrix head sign, dual forward Xenon headlights,
 * and line-specific livery styling.
 *
 * @param {Object} [options]
 * @param {string} [options.lineId]
 * @param {string} [options.color]
 * @param {boolean} [options.isDwell]
 * @param {boolean} [options.isSelected]
 * @param {number} [options.speedKmh]
 * @returns {string} Base64 SVG Data URL
 */
export function getTrainBillboardImage(options = {}) {
  const {
    lineId = '',
    color = '#00e5ff',
    isDwell = false,
    isSelected = false,
  } = options;

  let liveryColor = color;
  const lineNorm = String(lineId || '').toUpperCase();
  if (lineNorm.includes('LRT1') || lineNorm.includes('LRT-1')) liveryColor = '#facc15';
  else if (lineNorm.includes('LRT2') || lineNorm.includes('LRT-2')) liveryColor = '#a855f7';
  else if (lineNorm.includes('MRT3') || lineNorm.includes('MRT-3')) liveryColor = '#00e5ff';

  const strokeColor = isSelected ? '#ffffff' : liveryColor;
  const strokeWidth = isSelected ? 2.4 : 1.8;
  const statusGlow = isDwell ? '#f59e0b' : '#10b981';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 44 44">
  <defs>
    <filter id="train-glow-${isSelected ? 's' : 'n'}" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.8"/>
      ${isSelected ? `<feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="${liveryColor}" flood-opacity="0.95"/>` : ''}
    </filter>
    <linearGradient id="train-glass-${isSelected ? 's' : 'n'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#0369a1" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
    </linearGradient>
    <radialGradient id="headlight-beam-${isSelected ? 's' : 'n'}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="45%" stop-color="#fef08a" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#fef08a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Tactical Hexagonal/Badge Container -->
  <path d="M 8 4 C 5 4, 3 6, 3 9 L 3 27 C 3 30, 5 32, 8 32 L 17.5 32 L 22 41 L 26.5 32 L 36 32 C 39 32, 41 30, 41 27 L 41 9 C 41 6, 39 4, 36 4 Z"
        fill="#060c13"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        filter="url(#train-glow-${isSelected ? 's' : 'n'})" />
  <!-- Pantograph & High Voltage Rooftop Line -->
  <path d="M 18 6.5 L 20.5 4.5 L 22 5.2 L 23.5 4.5 L 26 6.5" fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="19.5" y1="4.5" x2="24.5" y2="4.5" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
  <!-- Train Aerodynamic Front Profile -->
  <path d="M 14 8.5 Q 22 6.5 30 8.5 L 31 22 Q 31 27 22 27 Q 13 27 13 22 Z"
        fill="#0f172a" stroke="${liveryColor}" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Aerodynamic Windshield -->
  <path d="M 15 11 Q 22 9.5 29 11 L 28.5 16 Q 22 15 15.5 16 Z"
        fill="url(#train-glass-${isSelected ? 's' : 'n'})" stroke="#94a3b8" stroke-width="0.75"/>
  <path d="M 16.5 11.5 L 19.5 11.5 L 18 15.5 L 16 15.5 Z" fill="#ffffff" opacity="0.4"/>
  <!-- LED Matrix Destination Line Header -->
  <rect x="18" y="8" width="8" height="2.2" rx="0.5" fill="#000000" stroke="${liveryColor}" stroke-width="0.6"/>
  <circle cx="19.5" cy="9.1" r="0.5" fill="${liveryColor}"/>
  <circle cx="21" cy="9.1" r="0.5" fill="${liveryColor}"/>
  <circle cx="22.5" cy="9.1" r="0.5" fill="${liveryColor}"/>
  <circle cx="24" cy="9.1" r="0.5" fill="${liveryColor}"/>
  <!-- Dynamic Livery Band -->
  <path d="M 13.8 17.5 L 22 19.5 L 30.2 17.5 L 30.5 19.2 L 22 21.5 L 13.5 19.2 Z" fill="${liveryColor}"/>
  <!-- Xenon Forward Headlights (Dual Beams) -->
  <circle cx="16.5" cy="22.5" r="2.2" fill="url(#headlight-beam-${isSelected ? 's' : 'n'})"/>
  <circle cx="27.5" cy="22.5" r="2.2" fill="url(#headlight-beam-${isSelected ? 's' : 'n'})"/>
  <circle cx="16.5" cy="22.5" r="1" fill="#ffffff"/>
  <circle cx="27.5" cy="22.5" r="1" fill="#ffffff"/>
  <!-- Red Marker Safety Lights -->
  <circle cx="14.5" cy="24.5" r="0.9" fill="#ef4444"/>
  <circle cx="29.5" cy="24.5" r="0.9" fill="#ef4444"/>
  <!-- Lower Deflector / Cowcatcher / Tracks -->
  <path d="M 16 25.5 L 28 25.5 L 26.5 27.5 L 17.5 27.5 Z" fill="#334155" stroke="#64748b" stroke-width="0.5"/>
  <line x1="10" y1="29.5" x2="34" y2="29.5" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="10" y1="31" x2="34" y2="31" stroke="#64748b" stroke-width="0.8" stroke-dasharray="1.5,1.5"/>
  <!-- Dwell / Moving Status Indicator Pill -->
  <circle cx="22" cy="35" r="2" fill="${statusGlow}"/>
  ${isSelected ? `<circle cx="22" cy="41" r="1.8" fill="#ffffff"/>` : ''}
</svg>`;

  return 'data:image/svg+xml;base64,' + btoa(svg.trim());
}

/**
 * Returns a realistic high-resolution SVG billboard for an elevated rapid transit station node.
 * Features vaulted structural steel canopy roof, elevated concrete platform concourse,
 * twin polished rails on cross-ties, illuminated station entrance clock, and viaduct pillars.
 *
 * @param {Object} [options]
 * @param {string} [options.lineId]
 * @param {string} [options.color]
 * @param {boolean} [options.isSelected]
 * @param {boolean} [options.isInterchange]
 * @returns {string} Base64 SVG Data URL
 */
export function getStationBillboardImage(options = {}) {
  const {
    lineId = '',
    color = '#a855f7',
    isSelected = false,
    isInterchange = false,
  } = options;

  let stationColor = color;
  const lineNorm = String(lineId || '').toUpperCase();
  if (lineNorm.includes('LRT1') || lineNorm.includes('LRT-1')) stationColor = '#facc15';
  else if (lineNorm.includes('LRT2') || lineNorm.includes('LRT-2')) stationColor = '#a855f7';
  else if (lineNorm.includes('MRT3') || lineNorm.includes('MRT-3')) stationColor = '#00e5ff';

  const strokeColor = isSelected ? '#ffffff' : stationColor;
  const strokeWidth = isSelected ? 2.4 : 1.8;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 44 44">
  <defs>
    <filter id="station-glow-${isSelected ? 's' : 'n'}" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.8"/>
      ${isSelected ? `<feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="${stationColor}" flood-opacity="0.95"/>` : ''}
    </filter>
    <linearGradient id="canopy-glass-${isSelected ? 's' : 'n'}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${stationColor}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <!-- Architectural Transit Station Badge Shell -->
  <path d="M 8 4 C 5 4, 3 6, 3 9 L 3 27 C 3 30, 5 32, 8 32 L 17.5 32 L 22 41 L 26.5 32 L 36 32 C 39 32, 41 30, 41 27 L 41 9 C 41 6, 39 4, 36 4 Z"
        fill="#060c13"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        filter="url(#station-glow-${isSelected ? 's' : 'n'})" />
  <!-- Catenary Overhead Power Line -->
  <line x1="7" y1="6.5" x2="37" y2="6.5" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="2,1"/>
  <line x1="22" y1="6.5" x2="22" y2="9.5" stroke="#ffffff" stroke-width="1.2"/>
  <!-- Vaulted Station Glass Canopy -->
  <path d="M 7 13.5 Q 22 6 37 13.5 L 35 16 Q 22 9.5 9 16 Z"
        fill="url(#canopy-glass-${isSelected ? 's' : 'n'})" stroke="#ffffff" stroke-width="0.85"/>
  <!-- Structural Steel Truss Framework Ribs -->
  <path d="M 11 15 L 15 10 L 19 14.5 L 23 10 L 27 14.5 L 31 10 L 33 15"
        fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.85"/>
  <!-- Illuminated Station Entrance / Clock Beacon -->
  <circle cx="22" cy="13" r="2.4" fill="#020617" stroke="#ffffff" stroke-width="0.8"/>
  <circle cx="22" cy="13" r="1.3" fill="${stationColor}"/>
  <!-- Elevated Twin Railway Tracks & Wooden Ties -->
  <line x1="8" y1="18.5" x2="36" y2="18.5" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="8" y1="20.5" x2="36" y2="20.5" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="12" y1="18" x2="12" y2="21" stroke="#cbd5e1" stroke-width="0.8"/>
  <line x1="17" y1="18" x2="17" y2="21" stroke="#cbd5e1" stroke-width="0.8"/>
  <line x1="22" y1="18" x2="22" y2="21" stroke="#cbd5e1" stroke-width="0.8"/>
  <line x1="27" y1="18" x2="27" y2="21" stroke="#cbd5e1" stroke-width="0.8"/>
  <line x1="32" y1="18" x2="32" y2="21" stroke="#cbd5e1" stroke-width="0.8"/>
  <!-- Elevated Platform Deck & Tactile Safety Edge -->
  <rect x="8" y="21.5" width="28" height="3" rx="0.5" fill="#1e293b" stroke="#ffffff" stroke-width="0.6"/>
  <rect x="8" y="21.5" width="28" height="0.8" fill="#fbbf24"/>
  <!-- Viaduct Concrete Columns & Foundation -->
  <rect x="12" y="24.5" width="4.5" height="4.5" fill="${stationColor}" opacity="0.55" stroke="#ffffff" stroke-width="0.6"/>
  <rect x="27.5" y="24.5" width="4.5" height="4.5" fill="${stationColor}" opacity="0.55" stroke="#ffffff" stroke-width="0.6"/>
  <line x1="9" y1="29" x2="35" y2="29" stroke="#cbd5e1" stroke-width="0.9" stroke-linecap="round"/>
  ${isInterchange ? `<polygon points="22,23.5 24,26.5 20,26.5" fill="#fbbf24"/>` : ''}
  ${isSelected ? `<circle cx="22" cy="41" r="1.8" fill="#ffffff"/>` : ''}
</svg>`;

  return 'data:image/svg+xml;base64,' + btoa(svg.trim());
}
