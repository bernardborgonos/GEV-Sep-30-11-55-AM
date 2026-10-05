/**
 * @module src/data/tacticalIconGenerator.js
 * Parametric Tactical Vector SVG Engine for God's Eye View (GEV).
 *
 * Generates crisp, MIL-STD / NATO APP-6 inspired vector tactical badges on-the-fly
 * for any Level 3 operational preset or custom user classification.
 *
 * Supported engines:
 * - 2D Leaflet (L.divIcon)
 * - 3D Cesium (Cesium.Billboard)
 * - Inspector UI Badges & Active Map HUD Callouts
 */

/**
 * Domain-specific visual configurations:
 * Shape frames, signature colors, and military symbology defaults.
 */
export const DOMAIN_VISUAL_STYLES = {
  TACTICAL_DEFENSE: {
    frame: 'shield',
    color: '#f43f5e',
    secondaryColor: '#fda4af',
    defaultGlyph: 'c2_star',
  },
  MARITIME_COASTAL: {
    frame: 'diamond',
    color: '#00e5ff',
    secondaryColor: '#67e8f9',
    defaultGlyph: 'buoy',
  },
  AIRSPACE_AVIATION: {
    frame: 'delta',
    color: '#38bdf8',
    secondaryColor: '#bae6fd',
    defaultGlyph: 'jet_aviation',
  },
  CRITICAL_INFRASTRUCTURE: {
    frame: 'octagon',
    color: '#f59e0b',
    secondaryColor: '#fde68a',
    defaultGlyph: 'power_grid',
  },
  HEALTH_PUBLIC_SAFETY: {
    frame: 'cross_shield',
    color: '#ef4444',
    secondaryColor: '#fca5a5',
    defaultGlyph: 'medical_aid',
  },
  TRANSPORTATION_LOGISTICS: {
    frame: 'tech_square',
    color: '#06b6d4',
    secondaryColor: '#a5f3fc',
    defaultGlyph: 'logistics_depot',
  },
  NATURE_ENVIRONMENT: {
    frame: 'hexagon',
    color: '#22c55e',
    secondaryColor: '#86efac',
    defaultGlyph: 'nature_leaf',
  },
  STORES_COMMERCIAL: {
    frame: 'tech_square',
    color: '#10b981',
    secondaryColor: '#6ee7b7',
    defaultGlyph: 'store_cart',
  },
  TOURISM_LANDMARKS: {
    frame: 'octagon',
    color: '#ec4899',
    secondaryColor: '#fbcfe8',
    defaultGlyph: 'landmark_pin',
  },
  CULTURE_ENTERTAINMENT: {
    frame: 'shield',
    color: '#8b5cf6',
    secondaryColor: '#c4b5fd',
    defaultGlyph: 'culture_theater',
  },
  RESTAURANTS_HOTELS: {
    frame: 'tech_square',
    color: '#f97316',
    secondaryColor: '#fed7aa',
    defaultGlyph: 'restaurant_utensils',
  },
  CIVIC_REAL_ESTATE: {
    frame: 'octagon',
    color: '#64748b',
    secondaryColor: '#cbd5e1',
    defaultGlyph: 'civic_building',
  },
};

/**
 * Library of vector tactical glyphs (48x48 viewport centered within 64x64 badges).
 */
export const TACTICAL_GLYPHS = {
  // Radar & Surveillance
  radar: `
    <circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2" opacity="0.6"/>
    <circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.8"/>
    <circle cx="32" cy="32" r="3" fill="currentColor"/>
    <path d="M32 32 L44 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M32 14 A18 18 0 0 1 50 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
  `,

  // Command & Control / Tactical HQ
  c2_star: `
    <polygon points="32,18 35.8,26.5 45,27.5 38.2,33.8 40.1,43 32,38.2 23.9,43 25.8,33.8 19,27.5 28.2,26.5" fill="currentColor" stroke="#000" stroke-width="1.2"/>
    <circle cx="32" cy="31" r="2.5" fill="#090d16"/>
  `,

  // Navigational Buoys (North/South cardinal cones)
  buoy: `
    <line x1="20" y1="41" x2="44" y2="41" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <polygon points="32,17 26,27 38,27" fill="currentColor"/>
    <polygon points="32,39 26,29 38,29" fill="currentColor"/>
    <circle cx="32" cy="15" r="1.5" fill="#fff"/>
  `,

  // Watchtower / Observation
  tower: `
    <line x1="24" y1="43" x2="28" y2="23" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="40" y1="43" x2="36" y2="23" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="26" y1="34" x2="38" y2="34" stroke="currentColor" stroke-width="1.8"/>
    <line x1="28" y1="23" x2="36" y2="23" stroke="currentColor" stroke-width="2.2"/>
    <rect x="25" y="18" width="14" height="6" rx="1.5" fill="currentColor"/>
    <polygon points="32,12 23,18 41,18" fill="currentColor"/>
  `,

  // Bunker / Fortification
  bunker: `
    <path d="M20 38 L22 25 L42 25 L44 38 Z" fill="currentColor" opacity="0.9"/>
    <rect x="26" y="29" width="12" height="3" fill="#090d16" rx="0.5"/>
    <path d="M18 42 L46 42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="32" y1="18" x2="32" y2="25" stroke="currentColor" stroke-width="2.2"/>
  `,

  // Airfield / Aircraft / Helicopter
  jet_aviation: `
    <path d="M32 16 L35 24 L46 30 L46 33 L35 31 L34 40 L38 43 L38 45 L32 43.5 L26 45 L26 43 L30 40 L29 31 L18 33 L18 30 L29 24 Z" fill="currentColor"/>
  `,

  // Drone / UAS
  drone_uas: `
    <circle cx="32" cy="32" r="4.5" fill="currentColor"/>
    <line x1="23" y1="23" x2="41" y2="41" stroke="currentColor" stroke-width="2"/>
    <line x1="41" y1="23" x2="23" y2="41" stroke="currentColor" stroke-width="2"/>
    <circle cx="21" cy="21" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="43" cy="21" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="21" cy="43" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="43" cy="43" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
  `,

  // Marine Vessel / Harbor
  marine_vessel: `
    <path d="M20 34 L44 34 L41 41 L23 41 Z" fill="currentColor"/>
    <path d="M30 26 L30 34 M34 23 L34 34" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="27" y="29" width="10" height="5" fill="currentColor"/>
    <circle cx="34" cy="21" r="1.5" fill="currentColor"/>
  `,

  // Anchor
  anchor: `
    <circle cx="32" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="22" x2="32" y2="42" stroke="currentColor" stroke-width="2.5"/>
    <line x1="26" y1="28" x2="38" y2="28" stroke="currentColor" stroke-width="2"/>
    <path d="M21 34 C21 42 43 42 43 34" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <polygon points="19,34 23,34 21,30" fill="currentColor"/>
    <polygon points="41,34 45,34 43,30" fill="currentColor"/>
  `,

  // Satellite / Space
  satellite: `
    <rect x="28" y="28" width="8" height="8" rx="1" fill="currentColor"/>
    <line x1="20" y1="32" x2="28" y2="32" stroke="currentColor" stroke-width="2"/>
    <line x1="36" y1="32" x2="44" y2="32" stroke="currentColor" stroke-width="2"/>
    <rect x="16" y="27" width="5" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="43" y="27" width="5" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M32 23 A9 9 0 0 1 41 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `,

  // Missile / Air Defense / Rocket
  missile_defense: `
    <path d="M24 40 L38 20 L40 22 L26 42 Z" fill="currentColor"/>
    <polygon points="38,20 40,22 43,17" fill="currentColor"/>
    <path d="M22 42 L25 38 L27 40 Z" fill="currentColor"/>
  `,

  // Optical Sensor / CCTV / IR Recon
  sensor_cctv: `
    <rect x="20" y="25" width="22" height="14" rx="2.5" fill="currentColor"/>
    <circle cx="31" cy="32" r="4.5" fill="#090d16" stroke="#fff" stroke-width="1.5"/>
    <circle cx="31" cy="32" r="1.8" fill="currentColor"/>
    <polygon points="42,28 47,24 47,40 42,36" fill="currentColor"/>
  `,

  // Checkpoint / Gate
  checkpoint_gate: `
    <rect x="19" y="30" width="4" height="12" fill="currentColor"/>
    <rect x="41" y="30" width="4" height="12" fill="currentColor"/>
    <line x1="21" y1="33" x2="43" y2="33" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="22" r="5" fill="currentColor"/>
    <line x1="30" y1="22" x2="34" y2="22" stroke="#090d16" stroke-width="2"/>
  `,

  // Hazard / Warning
  hazard_warning: `
    <polygon points="32,16 18,41 46,41" fill="currentColor"/>
    <polygon points="32,19 21,39 43,39" fill="#090d16"/>
    <rect x="30.5" y="25" width="3" height="7" rx="1" fill="currentColor"/>
    <circle cx="32" cy="35.5" r="1.5" fill="currentColor"/>
  `,

  // Medical / Aid
  medical_aid: `
    <rect x="29" y="19" width="6" height="26" rx="1" fill="currentColor"/>
    <rect x="19" y="29" width="26" height="6" rx="1" fill="currentColor"/>
  `,

  // Power Grid / Energy
  power_grid: `
    <polygon points="33,16 23,30 31,30 28,44 41,28 32,28" fill="currentColor"/>
  `,

  // Logistics / Cargo / Depot
  logistics_depot: `
    <polygon points="32,18 45,25 32,32 19,25" fill="currentColor" opacity="0.9"/>
    <polygon points="19,25 32,32 32,44 19,37" fill="currentColor" opacity="0.75"/>
    <polygon points="45,25 32,32 32,44 45,37" fill="currentColor" opacity="0.6"/>
  `,

  // Nature / Forestry
  nature_leaf: `
    <path d="M32 17 C22 23 21 37 32 44 C43 37 42 23 32 17 Z" fill="currentColor"/>
    <line x1="32" y1="21" x2="32" y2="43" stroke="#090d16" stroke-width="1.8"/>
  `,

  // Commercial / Store
  store_cart: `
    <path d="M21 21 L24 21 L28 34 L39 34 L43 24 L25 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="29" cy="39" r="2.5" fill="currentColor"/>
    <circle cx="38" cy="39" r="2.5" fill="currentColor"/>
  `,

  // Landmark / Photo / Tourism
  landmark_pin: `
    <path d="M32 17 C26 17 22 22 22 28 C22 36 32 44 32 44 C32 44 42 36 42 28 C42 22 38 17 32 17 Z" fill="currentColor"/>
    <circle cx="32" cy="27" r="3.5" fill="#090d16"/>
  `,

  // Civic / Building
  civic_building: `
    <polygon points="32,17 19,24 45,24" fill="currentColor"/>
    <line x1="22" y1="24" x2="22" y2="38" stroke="currentColor" stroke-width="2.5"/>
    <line x1="28" y1="24" x2="28" y2="38" stroke="currentColor" stroke-width="2.5"/>
    <line x1="36" y1="24" x2="36" y2="38" stroke="currentColor" stroke-width="2.5"/>
    <line x1="42" y1="24" x2="42" y2="38" stroke="currentColor" stroke-width="2.5"/>
    <rect x="18" y="38" width="28" height="4" fill="currentColor"/>
  `,

  // Entertainment / Culture
  culture_theater: `
    <path d="M20 22 C20 33 26 38 32 38 C38 38 44 33 44 22 Z" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="27" cy="26" r="2" fill="currentColor"/>
    <circle cx="37" cy="26" r="2" fill="currentColor"/>
    <path d="M28 32 Q32 35 36 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  // Restaurant
  restaurant_utensils: `
    <path d="M26 19 L26 27 C26 29 28 30 30 30 L30 43" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="24" y1="19" x2="24" y2="24" stroke="currentColor" stroke-width="1.8"/>
    <line x1="28" y1="19" x2="28" y2="24" stroke="currentColor" stroke-width="1.8"/>
    <path d="M38 19 L38 43 M38 19 C35 22 35 27 38 29" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  // Law Enforcement / Police Badge
  police_badge: `
    <path d="M32 15 L35 24 L44 24 L37 29 L40 38 L32 32 L24 38 L27 29 L20 24 L29 24 Z" fill="currentColor"/>
    <circle cx="32" cy="27" r="4" fill="#090d16"/>
    <circle cx="32" cy="27" r="2.2" fill="currentColor"/>
  `,

  // Fire & Rescue
  fire_rescue: `
    <path d="M32 16 C30 20 26 24 26 31 C26 36 29 42 32 43 C35 42 38 36 38 31 C38 27 35 24 34 21 C33 24 32 25 31 27 C31 24 32 20 32 16 Z" fill="currentColor"/>
    <path d="M32 28 C30 31 29 33 29 36 C29 39 31 41 32 41 C33 41 35 39 35 36 C35 33 34 31 32 28 Z" fill="#090d16"/>
  `,

  // Border Customs & Inspection Barrier
  customs_barrier: `
    <rect x="18" y="32" width="6" height="12" fill="currentColor" rx="1"/>
    <rect x="40" y="32" width="6" height="12" fill="currentColor" rx="1"/>
    <line x1="18" y1="26" x2="46" y2="26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="24" y1="26" x2="28" y2="22" stroke="currentColor" stroke-width="2"/>
    <line x1="36" y1="26" x2="40" y2="22" stroke="currentColor" stroke-width="2"/>
    <circle cx="32" cy="20" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
  `,

  // Correctional / Detention Facility
  correctional_facility: `
    <rect x="20" y="18" width="24" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <line x1="26" y1="18" x2="26" y2="44" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="18" x2="32" y2="44" stroke="currentColor" stroke-width="2"/>
    <line x1="38" y1="18" x2="38" y2="44" stroke="currentColor" stroke-width="2"/>
    <line x1="20" y1="31" x2="44" y2="31" stroke="currentColor" stroke-width="2.5"/>
  `,

  // Diplomatic Mission / Embassy
  diplomatic_embassy: `
    <polygon points="32,18 20,24 44,24" fill="currentColor"/>
    <line x1="23" y1="24" x2="23" y2="38" stroke="currentColor" stroke-width="2.2"/>
    <line x1="32" y1="24" x2="32" y2="38" stroke="currentColor" stroke-width="2.2"/>
    <line x1="41" y1="24" x2="41" y2="38" stroke="currentColor" stroke-width="2.2"/>
    <rect x="18" y="38" width="28" height="4" fill="currentColor"/>
    <path d="M32 18 L32 10 L39 12 L32 14" fill="currentColor" stroke="currentColor" stroke-width="1.2"/>
  `,

  // Heavy Manufacturing / Factory
  factory_industrial: `
    <path d="M18 42 L18 28 L26 33 L26 28 L34 33 L34 23 L42 23 L42 42 Z" fill="currentColor"/>
    <line x1="38" y1="17" x2="38" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="38" cy="14" r="1.5" fill="currentColor" opacity="0.8"/>
  `,

  // Chemical & Fertilizer Processing
  chemical_hazard: `
    <path d="M29 18 L35 18 M32 18 L32 26 L41 38 C42 40 40 42 38 42 L26 42 C24 42 22 40 23 38 L32 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M25 38 L39 38 L37 34 L27 34 Z" fill="currentColor"/>
    <circle cx="32" cy="30" r="1.5" fill="currentColor"/>
  `,

  // Mining & Mineral Quarry
  mining_quarry: `
    <path d="M23 20 Q32 16 41 20 L39 23 Q32 20 25 23 Z" fill="currentColor"/>
    <line x1="20" y1="41" x2="40" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="44" y1="41" x2="24" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  `,

  // Scrap & Recycling
  recycle_arrows: `
    <path d="M30 18 L34 18 L32 14 Z M34 18 L41 29 L38 31" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M43 32 L40 35 L44 37 Z M40 35 L26 41 L25 38" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M21 34 L21 30 L17 32 Z M21 30 L27 20 L30 22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  `,

  // Rail & Mass Transit / Train
  rail_train: `
    <rect x="22" y="17" width="20" height="20" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <line x1="22" y1="26" x2="42" y2="26" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="26" cy="32" r="2" fill="currentColor"/>
    <circle cx="38" cy="32" r="2" fill="currentColor"/>
    <line x1="20" y1="41" x2="44" y2="41" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="25" y1="37" x2="23" y2="42" stroke="currentColor" stroke-width="2"/>
    <line x1="39" y1="37" x2="41" y2="42" stroke="currentColor" stroke-width="2"/>
  `,

  // Toll Plaza & Weigh Station
  toll_plaza: `
    <rect x="26" y="22" width="12" height="18" fill="currentColor" rx="1.5"/>
    <rect x="28" y="25" width="8" height="6" fill="#090d16"/>
    <line x1="16" y1="32" x2="26" y2="32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="21" cy="32" r="1.5" fill="#f43f5e"/>
  `,

  // EV Supercharging Station
  ev_charging: `
    <rect x="21" y="20" width="14" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <path d="M28 24 L25 30 L29 30 L27 36" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M35 25 Q41 25 41 31 L41 38 L38 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  // Parking Facility
  parking_facility: `
    <rect x="19" y="17" width="26" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <path d="M28 36 L28 23 L34 23 C36.5 23 38 24.5 38 27 C38 29.5 36.5 31 34 31 L28 31" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Passenger Ferry & Ro-Ro Ramp
  ferry_terminal: `
    <path d="M18 35 L46 35 L42 41 L22 41 Z" fill="currentColor"/>
    <rect x="24" y="27" width="16" height="8" rx="1" fill="currentColor"/>
    <line x1="20" y1="44" x2="44" y2="44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  // Marina & Yacht Basin
  marina_yacht: `
    <path d="M20 37 L44 37 L40 43 L24 43 Z" fill="currentColor"/>
    <path d="M31 16 L31 34 L42 34 Z" fill="currentColor"/>
    <path d="M29 20 L29 34 L22 34 Z" fill="currentColor" opacity="0.8"/>
  `,

  // Subsea Cable Landing
  subsea_cable: `
    <path d="M18 26 Q24 20 30 26 T42 26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M18 34 Q24 28 30 34 T42 34" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="30" cy="30" r="3" fill="currentColor"/>
  `,

  // Marine Search & Rescue (SAR)
  marine_sar: `
    <circle cx="32" cy="31" r="12" fill="none" stroke="currentColor" stroke-width="3"/>
    <circle cx="32" cy="31" r="6" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="19" x2="32" y2="25" stroke="currentColor" stroke-width="2.5"/>
    <line x1="32" y1="37" x2="32" y2="43" stroke="currentColor" stroke-width="2.5"/>
    <line x1="20" y1="31" x2="26" y2="31" stroke="currentColor" stroke-width="2.5"/>
    <line x1="38" y1="31" x2="44" y2="31" stroke="currentColor" stroke-width="2.5"/>
  `,

  // Tidal & Hydrographic Sensor
  tide_gauge: `
    <line x1="26" y1="18" x2="26" y2="44" stroke="currentColor" stroke-width="2.5"/>
    <line x1="26" y1="22" x2="31" y2="22" stroke="currentColor" stroke-width="2"/>
    <line x1="26" y1="28" x2="34" y2="28" stroke="currentColor" stroke-width="2"/>
    <line x1="26" y1="34" x2="31" y2="34" stroke="currentColor" stroke-width="2"/>
    <line x1="26" y1="40" x2="34" y2="40" stroke="currentColor" stroke-width="2"/>
    <path d="M34 24 Q38 21 42 24 T50 24" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M34 36 Q38 33 42 36 T50 36" fill="none" stroke="currentColor" stroke-width="1.8"/>
  `,

  // Campsite & RV Park
  camp_tent: `
    <polygon points="32,17 18,39 46,39" fill="currentColor"/>
    <polygon points="32,17 32,39 25,39" fill="#090d16"/>
    <line x1="15" y1="42" x2="49" y2="42" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  `,

  // Trailhead & Expedition
  trailhead_hiker: `
    <circle cx="28" cy="20" r="3" fill="currentColor"/>
    <path d="M26 24 L29 32 L33 42 M29 32 L26 42" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="23" y="24" width="4" height="7" rx="1.5" fill="currentColor"/>
    <line x1="36" y1="26" x2="36" y2="43" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="29" y1="27" x2="36" y2="31" stroke="currentColor" stroke-width="2"/>
  `,

  // Mountain Pass / Alpine Hut
  alpine_hut: `
    <polygon points="32,18 20,28 44,28" fill="currentColor"/>
    <rect x="22" y="28" width="20" height="12" fill="currentColor"/>
    <rect x="28" y="32" width="6" height="8" fill="#090d16"/>
    <polygon points="16,25 21,17 26,25" fill="currentColor" opacity="0.6"/>
  `,

  // Subterranean Cave / Cavern
  cave_cavern: `
    <path d="M19 41 C19 25 45 25 45 41 Z" fill="currentColor"/>
    <path d="M24 41 C24 30 40 30 40 41 Z" fill="#090d16"/>
    <polygon points="28,30 30,34 32,30" fill="currentColor"/>
    <polygon points="34,30 36,35 38,30" fill="currentColor"/>
  `,

  // Marine Dive / Scuba
  scuba_dive: `
    <rect x="22" y="24" width="18" height="10" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <line x1="31" y1="24" x2="31" y2="34" stroke="currentColor" stroke-width="2"/>
    <path d="M40 27 L44 27 L44 38 L40 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="27" cy="29" r="2" fill="currentColor"/>
    <circle cx="35" cy="29" r="2" fill="currentColor"/>
  `,

  // Ski Resort & Aerial Tramway
  ski_tramway: `
    <line x1="16" y1="16" x2="48" y2="22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="32" y1="19" x2="32" y2="26" stroke="currentColor" stroke-width="2"/>
    <rect x="24" y="26" width="16" height="14" rx="3" fill="currentColor"/>
    <rect x="26" y="29" width="5" height="5" fill="#090d16"/>
    <rect x="33" y="29" width="5" height="5" fill="#090d16"/>
  `,

  // Convention & Summit Center
  convention_summit: `
    <path d="M26 38 L28 26 L36 26 L38 38 Z" fill="currentColor"/>
    <rect x="24" y="23" width="16" height="3" rx="1" fill="currentColor"/>
    <path d="M30 23 L30 18 L32 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <circle cx="33" cy="18" r="1.5" fill="currentColor"/>
  `,

  // Press Briefing & Media Hub
  press_media: `
    <rect x="22" y="23" width="14" height="10" rx="1.5" fill="currentColor"/>
    <polygon points="36,25 43,21 43,35 36,31" fill="currentColor"/>
    <circle cx="26" cy="20" r="3" fill="currentColor"/>
    <line x1="29" y1="33" x2="24" y2="43" stroke="currentColor" stroke-width="2"/>
    <line x1="29" y1="33" x2="34" y2="43" stroke="currentColor" stroke-width="2"/>
  `,

  // Court of Law / Judicial Complex
  court_judicial: `
    <line x1="32" y1="17" x2="32" y2="41" stroke="currentColor" stroke-width="2.5"/>
    <line x1="20" y1="21" x2="44" y2="21" stroke="currentColor" stroke-width="2.5"/>
    <polygon points="32,17 30,19 34,19" fill="currentColor"/>
    <line x1="22" y1="41" x2="42" y2="41" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M19 22 L16 30 L22 30 Z" fill="currentColor"/>
    <path d="M43 22 L40 30 L46 30 Z" fill="currentColor"/>
  `
};

/**
 * Geometric frame paths fitting within 64x64 bounding box.
 */
export const FRAME_PATHS = {
  // NATO / Military beveled shield
  shield: `M32 7 L54 13 L54 36 C54 48 43 55 32 58 C21 55 10 48 10 36 L10 13 Z`,

  // Maritime diamond / rhombus
  diamond: `M32 6 L58 32 L32 58 L6 32 Z`,

  // Aviation delta / swept apex
  delta: `M32 7 L57 52 L32 44 L7 52 Z`,

  // Industrial / Infrastructure chamfered octagon
  octagon: `M20 8 L44 8 L56 20 L56 44 L44 56 L20 56 L8 44 L8 20 Z`,

  // Health / First Responder cross-shield
  cross_shield: `M24 7 L40 7 L40 18 L55 18 L55 34 L40 34 L40 57 L24 57 L24 34 L9 34 L9 18 L24 18 Z`,

  // Environmental / Sensor hexagon
  hexagon: `M32 7 L55 20 L55 44 L32 57 L9 44 L9 20 Z`,

  // Tactical rounded square
  tech_square: `M16 8 L48 8 A8 8 0 0 1 56 16 L56 48 A8 8 0 0 1 48 56 L16 56 A8 8 0 0 1 8 48 L8 16 A8 8 0 0 1 16 8 Z`,

  // Circular reticle (default)
  circle: `M32 8 A24 24 0 1 1 31.9 8 Z`,
};

/**
 * Intelligent keyword-to-glyph matcher.
 * Detects tactical intent from Level 3 classification string or subcategory label.
 *
 * @param {string} text
 * @returns {string} Glyph key in TACTICAL_GLYPHS
 */
export function matchGlyphForLabel(text) {
  if (!text || typeof text !== 'string') return 'c2_star';
  const t = text.toLowerCase();

  // Radar / EW / Surveillance
  if (t.includes('radar') || t.includes('sensor array') || t.includes('sigint') || t.includes('electronic warfare')) return 'radar';
  if (t.includes('camera') || t.includes('cctv') || t.includes('electro-optical') || t.includes('infrared') || t.includes('optic')) return 'sensor_cctv';
  if (t.includes('watchtower') || t.includes('tower') || t.includes('lookout') || t.includes('sentry') || t.includes('mast')) return 'tower';

  // Law Enforcement, Emergency & Civil Security
  if (t.includes('police') || t.includes('sheriff') || t.includes('law enforcement') || t.includes('patrol station')) return 'police_badge';
  if (t.includes('fire') || t.includes('firefighter') || t.includes('rescue station')) return 'fire_rescue';
  if (t.includes('customs') || t.includes('border inspection') || t.includes('inspection post')) return 'customs_barrier';
  if (t.includes('prison') || t.includes('jail') || t.includes('detention') || t.includes('correctional')) return 'correctional_facility';
  if (t.includes('embassy') || t.includes('consulate') || t.includes('diplomatic') || t.includes('liaison office')) return 'diplomatic_embassy';

  // Heavy Industry, Processing & Mining
  if (t.includes('chemical') || t.includes('fertilizer') || t.includes('hazmat')) return 'chemical_hazard';
  if (t.includes('mine') || t.includes('quarry') || t.includes('mineral') || t.includes('open-pit')) return 'mining_quarry';
  if (t.includes('recycl') || t.includes('scrap') || t.includes('waste management')) return 'recycle_arrows';
  if (t.includes('factory') || t.includes('manufacturing') || t.includes('assembly plant') || t.includes('plant')) return 'factory_industrial';

  // Outdoor Recreation & Expedition
  if (t.includes('trailhead') || t.includes('trail') || t.includes('hiker') || t.includes('hiking') || t.includes('staging point')) return 'trailhead_hiker';
  if (t.includes('campsite') || t.includes('camping') || t.includes('rv park') || t.includes('tent')) return 'camp_tent';
  if (t.includes('alpine hut') || t.includes('mountain pass') || t.includes('chalet')) return 'alpine_hut';
  if (t.includes('cave') || t.includes('cavern') || t.includes('subterranean')) return 'cave_cavern';
  if (t.includes('scuba') || t.includes('dive') || t.includes('snorkel')) return 'scuba_dive';
  if (t.includes('ski') || t.includes('tramway') || t.includes('cable car') || t.includes('gondola') || t.includes('aerial lift')) return 'ski_tramway';

  // Rail & Mass Transit
  if (((t.includes('rail') && !t.includes('trail')) || t.includes('metro') || t.includes('train') || t.includes('locomotive') || t.includes('transit terminal'))) return 'rail_train';
  if (t.includes('toll') || t.includes('weigh station')) return 'toll_plaza';
  if (t.includes('ev charging') || t.includes('charging superstation') || t.includes('fast-charging')) return 'ev_charging';
  if (t.includes('parking') || t.includes('garage')) return 'parking_facility';

  // Assemblies & Judicial
  if (t.includes('convention') || t.includes('summit center') || t.includes('assembly plaza')) return 'convention_summit';
  if (t.includes('press') || t.includes('media hub') || t.includes('broadcast')) return 'press_media';
  if (t.includes('court') || t.includes('judicial') || t.includes('justice') || t.includes('tribunal')) return 'court_judicial';

  // Maritime Operations & Harbor Services
  if (t.includes('ferry') || t.includes('ro-ro') || t.includes('water taxi')) return 'ferry_terminal';
  if (t.includes('marina') || t.includes('yacht') || t.includes('craft basin')) return 'marina_yacht';
  if (t.includes('subsea cable') || t.includes('cable landing')) return 'subsea_cable';
  if (t.includes('search & rescue') || t.includes('sar base') || t.includes('lifebuoy')) return 'marine_sar';
  if (t.includes('tidal') || t.includes('hydrographic') || t.includes('tide gauge')) return 'tide_gauge';

  // Maritime / Buoys / Ports
  if (t.includes('buoy') || t.includes('beacon') || t.includes('navigational aid') || t.includes('channel mark')) return 'buoy';
  if (t.includes('anchor') || t.includes('anchorage') || t.includes('mooring')) return 'anchor';
  if (t.includes('vessel') || t.includes('ship') || t.includes('berth') || t.includes('pier') || t.includes('naval') || t.includes('port') || t.includes('dock')) return 'marine_vessel';

  // Command & Fortifications
  if (t.includes('toc') || t.includes('command') || t.includes('mcp') || t.includes('fob') || t.includes('headquarters') || t.includes('hq') || t.includes('operation')) return 'c2_star';
  if (t.includes('bunker') || t.includes('fort') || t.includes('perimeter') || t.includes('defensive') || t.includes('entrenchment')) return 'bunker';
  if (t.includes('checkpoint') || t.includes('gate') || t.includes('entry control') || t.includes('ecp') || t.includes('barrier')) return 'checkpoint_gate';

  // Airspace & Aerial
  if (t.includes('drone') || t.includes('uas') || t.includes('uav') || t.includes('quad') || t.includes('unmanned')) return 'drone_uas';
  if (t.includes('airfield') || t.includes('flight') || t.includes('jet') || t.includes('heli') || t.includes('runway') || t.includes('hangar') || t.includes('aviation')) return 'jet_aviation';
  if (t.includes('satellite') || t.includes('space') || t.includes('orbit') || t.includes('ground station') || t.includes('teleport')) return 'satellite';
  if (t.includes('missile') || t.includes('rocket') || t.includes('sam') || t.includes('air defense') || t.includes('battery')) return 'missile_defense';

  // Hazards & Safety
  if (t.includes('danger') || t.includes('hazard') || t.includes('minefield') || t.includes('volcano') || t.includes('seismic') || t.includes('warning')) return 'hazard_warning';
  if (t.includes('hospital') || t.includes('medical') || t.includes('aid') || t.includes('clinic') || t.includes('first responder') || t.includes('ambulance')) return 'medical_aid';
  if (t.includes('power') || t.includes('electric') || t.includes('grid') || t.includes('substation') || t.includes('generator') || t.includes('energy') || t.includes('nuclear')) return 'power_grid';
  if (t.includes('depot') || t.includes('cargo') || t.includes('warehouse') || t.includes('logistics') || t.includes('storage') || t.includes('bunkering')) return 'logistics_depot';

  // Civics / Others
  if (t.includes('nature') || t.includes('forest') || t.includes('park') || t.includes('reserve') || t.includes('conservation')) return 'nature_leaf';
  if (t.includes('store') || t.includes('shop') || t.includes('market') || t.includes('commercial')) return 'store_cart';
  if (t.includes('landmark') || t.includes('monument') || t.includes('tourism') || t.includes('attraction')) return 'landmark_pin';
  if (t.includes('civic') || t.includes('city') || t.includes('building') || t.includes('facility') || t.includes('government')) return 'civic_building';
  if (t.includes('theater') || t.includes('museum') || t.includes('entertainment') || t.includes('cinema')) return 'culture_theater';
  if (t.includes('food') || t.includes('restaurant') || t.includes('hotel') || t.includes('cafe')) return 'restaurant_utensils';

  return 'c2_star';
}

/**
 * Resolves frame type from domain or text.
 *
 * @param {string} domain
 * @returns {string} Frame shape key in FRAME_PATHS
 */
export function getFrameForDomain(domain) {
  if (!domain) return 'circle';
  const clean = domain.toUpperCase().replace(/\s+/g, '_').replace(/&/g, '');

  for (const [key, val] of Object.entries(DOMAIN_VISUAL_STYLES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val.frame;
    }
  }

  const lower = domain.toLowerCase();
  if (lower.includes('tactical') || lower.includes('defense') || lower.includes('military')) return 'shield';
  if (lower.includes('maritime') || lower.includes('coastal') || lower.includes('marine') || lower.includes('sea')) return 'diamond';
  if (lower.includes('air') || lower.includes('aviation') || lower.includes('flight')) return 'delta';
  if (lower.includes('infra') || lower.includes('industry') || lower.includes('critical')) return 'octagon';
  if (lower.includes('health') || lower.includes('safety') || lower.includes('emergency')) return 'cross_shield';
  if (lower.includes('transport') || lower.includes('logistics')) return 'tech_square';
  if (lower.includes('nature') || lower.includes('env')) return 'hexagon';

  return 'circle';
}

/**
 * Generates an SVG string representation of a military/tactical badge.
 *
 * @param {Object} options
 * @param {string} options.label - Level 3 classification name
 * @param {string} [options.domain] - Domain name or key (e.g. 'Tactical & Defense')
 * @param {string} [options.color] - Custom hex color override
 * @param {string} [options.frame] - Explicit frame shape override
 * @param {string} [options.glyph] - Explicit glyph key override
 * @param {number} [options.size=64] - Pixel dimension (square)
 * @returns {string} Raw SVG XML string
 */
export function generateTacticalSvgString({
  label = '',
  domain = 'Tactical & Defense',
  color = null,
  frame = null,
  glyph = null,
  size = 64
}) {
  const chosenGlyphKey = glyph || matchGlyphForLabel(label || domain);
  const chosenGlyphMarkup = TACTICAL_GLYPHS[chosenGlyphKey] || TACTICAL_GLYPHS.c2_star;

  const chosenFrameKey = frame || getFrameForDomain(domain);
  const chosenFramePath = FRAME_PATHS[chosenFrameKey] || FRAME_PATHS.circle;

  const accentColor = color || (domain && DOMAIN_VISUAL_STYLES[domain.toUpperCase()]?.color) || '#38bdf8';

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs>
    <!-- Stealth Dark Radial Glow -->
    <radialGradient id="gevBgGrad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#141e33"/>
      <stop offset="70%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#030712"/>
    </radialGradient>

    <!-- Accent Drop Filter -->
    <filter id="gevGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="${accentColor}" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Frame Background Fill -->
  <path d="${chosenFramePath}" fill="url(#gevBgGrad)" filter="url(#gevGlow)"/>

  <!-- Tactical Reticle Brackets (Corners) -->
  <g stroke="${accentColor}" stroke-width="1.2" stroke-linecap="round" opacity="0.65">
    <path d="M4 14 L4 4 L14 4"/>
    <path d="M50 4 L60 4 L60 14"/>
    <path d="M60 50 L60 60 L50 60"/>
    <path d="M14 60 L4 60 L4 50"/>
  </g>

  <!-- High-Visibility Tactical Frame Accent Stroke -->
  <path d="${chosenFramePath}" fill="none" stroke="${accentColor}" stroke-width="2.4" stroke-linejoin="round"/>

  <!-- Inner Inset Ring -->
  <path d="${chosenFramePath}" fill="none" stroke="#ffffff" stroke-width="0.7" opacity="0.25" transform="scale(0.88) translate(4.3, 4.3)"/>

  <!-- Tactical Center Glyph -->
  <g color="${accentColor}" fill="${accentColor}">
    ${chosenGlyphMarkup}
  </g>
</svg>
`.trim();
}

/**
 * Returns a browser-ready SVG Data URL for Leaflet / Cesium / Image tags.
 * Encoded using encodeURIComponent for guaranteed cross-browser texture compatibility.
 *
 * @param {Object} options
 * @returns {string} 'data:image/svg+xml,...'
 */
export function generateTacticalSvgDataUrl(options) {
  const svg = generateTacticalSvgString(options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Primary Tactical Icon Resolver for God's Eye View:
 * 1. Checks if the item has an uploaded image or custom icon URL override.
 * 2. Checks if an explicit static PNG icon asset is registered in CUSTOM_PRESET_ICONS.
 * 3. Generates a crisp, parametric Vector SVG Data URL based on the Level 3 classification and Level 1 domain.
 *
 * @param {Object} item - Spatial item record (name, category, subcategory, level3, customIconUrl, color)
 * @param {Object} [customAssetMap] - Static asset registry map (e.g. CUSTOM_PRESET_ICONS)
 * @returns {string} Icon URL (PNG path, uploaded Base64, or generated SVG Data URL)
 */
export function resolveItemTacticalIcon(item, customAssetMap = null) {
  if (!item) return '';

  // 1. Explicit user upload or drag-and-drop override
  if (item.customIconUrl && typeof item.customIconUrl === 'string') {
    return item.customIconUrl;
  }

  // 2. Direct PNG asset match
  const l3 = item.level3 || '';
  if (l3 && customAssetMap && customAssetMap[l3]) {
    return customAssetMap[l3];
  }

  // 3. Parametric Tactical Vector SVG Engine
  const domain = item.category || 'Tactical & Defense';
  const color = item.color || null;

  return generateTacticalSvgDataUrl({
    label: l3 || item.subcategory || item.name || '',
    domain,
    color,
    size: 64,
  });
}
