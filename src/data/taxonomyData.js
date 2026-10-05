/**
 * Unified 3-Tier Tactical & Marker Taxonomy Module (taxonomyData.js)
 * Combines Map Icons Collection dataset with Tactical C2 Categories.
 *
 * Hierarchy: Level 1 (Domain) -> Level 2 (Subcategory) -> Level 3 (Operational Classification)
 */

import {
  generateTacticalSvgDataUrl,
  generateTacticalSvgString,
  resolveItemTacticalIcon,
  matchGlyphForLabel,
} from './tacticalIconGenerator.js';

export {
  generateTacticalSvgDataUrl,
  generateTacticalSvgString,
  resolveItemTacticalIcon,
  matchGlyphForLabel,
};

export const CUSTOM_PRESET_ICONS = {
  'Tactical Operations Center (TOC)': '/assets/icons/tactical_toc_icon.png',
  'Main Command Post (MCP)': '/assets/icons/tactical_toc_icon.png',
  'Forward Operating Base (FOB)': '/assets/icons/tactical_toc_icon.png',
  'Early Warning Radar': '/assets/icons/radar_station_icon.png',
  '3D Early Warning Radar Station': '/assets/icons/radar_station_icon.png',
  'Coastal Cardinal Navigational Buoy': '/assets/icons/maritime_buoy_icon.png',
  'Cardinal Buoy (North/South/East/West)': '/assets/icons/maritime_buoy_icon.png',
  'Cardinal Buoy': '/assets/icons/maritime_buoy_icon.png',
};

/**
 * Returns the matching custom icon asset URL for an operational preset.
 * 1. Checks if a registered local PNG asset exists.
 * 2. If not, dynamically generates an on-the-fly tactical vector SVG data URL
 *    derived from the preset classification name and domain accent or custom color styling.
 *
 * @param {string} preset - Level 3 preset or classification name
 * @param {string} [domainOrColor] - Level 1 Domain name or Hex color
 * @param {string|boolean} [customColorOrFallback=null] - Optional hex color override or fallback boolean
 * @param {boolean} [generateFallback=true] - Generate vector SVG if no static PNG matches
 * @returns {string|null} Icon URL (PNG path or SVG Data URL)
 */
export function getCustomIconForPreset(preset, domainOrColor = null, customColorOrFallback = null, generateFallback = true) {
  if (!preset || typeof preset !== 'string') return null;
  const p = preset.trim();
  if (CUSTOM_PRESET_ICONS[p]) return CUSTOM_PRESET_ICONS[p];

  const lower = p.toLowerCase();
  for (const [key, iconPath] of Object.entries(CUSTOM_PRESET_ICONS)) {
    const keyLower = key.toLowerCase();
    if (lower === keyLower || lower.includes(keyLower) || keyLower.includes(lower)) {
      return iconPath;
    }
  }

  let shouldGenerate = generateFallback;
  if (typeof customColorOrFallback === 'boolean') {
    shouldGenerate = customColorOrFallback;
  }

  if (shouldGenerate) {
    let domain = 'Tactical & Defense';
    let color = null;

    if (typeof domainOrColor === 'string') {
      if (domainOrColor.startsWith('#')) {
        color = domainOrColor;
      } else {
        domain = domainOrColor;
      }
    }

    if (typeof customColorOrFallback === 'string' && customColorOrFallback.startsWith('#')) {
      color = customColorOrFallback;
    }

    if (!color) {
      color = getDomainColor(domain);
    }

    return generateTacticalSvgDataUrl({
      label: p,
      domain,
      color,
      size: 64,
    });
  }

  return null;
}

export const TAXONOMY_CHAIN = {
  "TACTICAL_DEFENSE": {
    "label": "Tactical & Defense",
    "color": "#f43f5e",
    "defaultIcon": "shield",
    "subcategories": {
      "Command_Control": {
        "label": "Command & Control (C2)",
        "level3Presets": [
          "Main Command Post (MCP)",
          "Tactical Operations Center (TOC)",
          "Forward Operating Base (FOB)",
          "Mobile Command Vehicle",
          "Observation Post (OP)"
        ]
      },
      "Observation_Surveillance": {
        "label": "Observation & Surveillance",
        "level3Presets": [
          "Early Warning Radar",
          "Electro-Optical / IR Station",
          "Acoustic Sensor Array",
          "Border Patrol Watchtower",
          "Unmanned Aerial Station (UAS)"
        ]
      },
      "Fortifications_Obstacles": {
        "label": "Fortifications & Perimeter",
        "level3Presets": [
          "Watchdog Geofence Zone",
          "Reinforced Bunker",
          "Checkpoint / Entry Control Point",
          "Anti-Vehicle Trench",
          "Minefield / Standoff Buffer"
        ]
      }
    }
  },
  "MARITIME_COASTAL": {
    "label": "Maritime & Coastal",
    "color": "#00e5ff",
    "defaultIcon": "directions_boat",
    "subcategories": {
      "Navigational_Aids": {
        "label": "Navigational Aids & Buoys",
        "level3Presets": [
          "Cardinal Buoy (North/South/East/West)",
          "Lateral Mark Buoy",
          "Isolated Danger Mark",
          "Safe Water Fairway Marker",
          "Lighthouse / Coastal Beacon"
        ]
      },
      "Port_Facilities": {
        "label": "Port & Harbor Infrastructure",
        "level3Presets": [
          "Mooring Berth / Pier",
          "Canal / Lock Access",
          "Container Cargo Terminal",
          "Naval Shipyard / Drydock",
          "Fuel Bunkering Dock"
        ]
      },
      "Coastal_Operations": {
        "label": "Coastal Operations & Harbor Services",
        "level3Presets": [
          "Harbor Master Command Tower",
          "Passenger Ferry & Ro-Ro Ramp",
          "Marina & Small Craft Basin",
          "Subsea Cable Landing Station",
          "Marine Search & Rescue (SAR) Base",
          "Tidal & Hydrographic Sensor Station"
        ]
      }
    }
  },
  "CRITICAL_INFRASTRUCTURE": {
    "label": "Critical Infrastructure",
    "color": "#eab308",
    "defaultIcon": "bolt",
    "subcategories": {
      "Electric_Power": {
        "label": "Electric Power & Utilities",
        "level3Presets": [
          "Electrical Substation",
          "High-Voltage Transmission Tower",
          "Thermal / Hydro Power Plant",
          "Utility Vault / Cable Chamber",
          "Emergency Backup Generator"
        ]
      },
      "Telecommunications": {
        "label": "Telecommunications & Cyber",
        "level3Presets": [
          "Microwave Relay Terminal",
          "Cellular Backhaul Tower",
          "Satellite Earth Station",
          "Fiber Optic Junction Box",
          "High-Frequency Tactical Antenna"
        ]
      },
      "Oil_Gas_Industry": {
        "label": "Energy, Oil & Gas",
        "level3Presets": [
          "Oil & Gas Wellhead",
          "Refinery Storage Tank",
          "Fuel Pipeline Valve Station",
          "Offshore Drilling Rig",
          "Gas Processing Plant"
        ]
      },
      "Industrial_Manufacturing": {
        "label": "Heavy Industry & Manufacturing",
        "level3Presets": [
          "Heavy Manufacturing Plant",
          "Chemical / Fertilizer Processing Facility",
          "Open-Pit Mine / Mineral Quarry",
          "Scrap & Recycling Processing Center",
          "Automotive / Aerospace Assembly Plant",
          "Industrial Storage & Logistics Warehouse"
        ]
      }
    }
  },
  "AIRSPACE_AVIATION": {
    "label": "Airspace & Aviation",
    "color": "#a855f7",
    "defaultIcon": "flight_takeoff",
    "subcategories": {
      "Airfields": {
        "label": "Airfields & Helipads",
        "level3Presets": [
          "Tactical Runway",
          "Helicopter Landing Zone (PZ/LZ)",
          "Air Traffic Control Tower",
          "Aircraft Hangar",
          "Aviation Fueling Station"
        ]
      },
      "Airspace_Control": {
        "label": "Airspace Control & Exclusion",
        "level3Presets": [
          "Restricted Airspace Buffer",
          "SIGMET Danger Envelope",
          "Radar Coverage Sector (3D)",
          "Convective Cell Exclusion Zone",
          "Flight Corridor Route"
        ]
      }
    }
  },
  "STORES_COMMERCIAL": {
    "label": "Stores & Commercial",
    "color": "#3b82f6",
    "defaultIcon": "shopping_bag",
    "subcategories": {
      "Apparel": {
        "label": "Apparel & Fashion",
        "level3Presets": [
          "Clothing Outlet",
          "Footwear Store",
          "Tailor Shop",
          "Jewelry & Accessories"
        ]
      },
      "Computers_Electronics": {
        "label": "Computers & Electronics",
        "level3Presets": [
          "Hardware Store",
          "Telecom & Phone Repair",
          "Consumer Electronics",
          "IT Service Center"
        ]
      },
      "Food_Drink": {
        "label": "Food & Beverage",
        "level3Presets": [
          "Grocery Store",
          "Bakery & Tortilleria",
          "Supermarket",
          "Beverage Depot"
        ]
      },
      "General_Merchandise": {
        "label": "General Merchandise",
        "level3Presets": [
          "Department Store",
          "Wholesale Market",
          "Variety Store",
          "Kiosk"
        ]
      }
    }
  },
  "NATURE_ENVIRONMENT": {
    "label": "Nature & Environment",
    "color": "#22c55e",
    "defaultIcon": "park",
    "subcategories": {
      "Agriculture": {
        "label": "Agriculture & Farming",
        "level3Presets": [
          "Crop Field / Grain Silo",
          "Livestock Ranch",
          "Irrigation System",
          "Botanical Site"
        ]
      },
      "Animals_Wildlife": {
        "label": "Animals & Wildlife",
        "level3Presets": [
          "Wildlife Reserve",
          "Livestock Pasture",
          "Veterinary Clinic",
          "Game Hunting Station"
        ]
      },
      "Natural_Marvels": {
        "label": "Natural Marvels & Terrain",
        "level3Presets": [
          "Mountain / Hill Peak",
          "Forest Canopy",
          "River / Waterfall",
          "Geothermal Feature"
        ]
      },
      "Weather_Climate": {
        "label": "Weather & Environmental Hazards",
        "level3Presets": [
          "Meteorological Station",
          "Flood Plain Zone",
          "Storm Tracking Station",
          "Seismic Sensor Node"
        ]
      },
      "Expedition_Outdoor": {
        "label": "Expedition & Outdoor Recreation",
        "level3Presets": [
          "Backcountry Trailhead / Staging Point",
          "Designated Campsite / RV Park",
          "Mountain Pass / Alpine Hut",
          "Subterranean Cave / Cavern System",
          "Marine Dive / Scuba Launch Site",
          "Ski Resort & Aerial Tramway Lift"
        ]
      }
    }
  },
  "TOURISM_LANDMARKS": {
    "label": "Tourism & Landmarks",
    "color": "#f97316",
    "defaultIcon": "castle",
    "subcategories": {
      "Cult_Religion": {
        "label": "Cult & Religion",
        "level3Presets": [
          "Historic Church / Cathedral",
          "Temple / Mosque",
          "Shrine / Monastery",
          "Cemetery"
        ]
      },
      "Monuments_Structures": {
        "label": "Monuments & Structures",
        "level3Presets": [
          "Memorial Monument",
          "Bridge / Viaduct",
          "Historic Tower",
          "Public Plaza"
        ]
      },
      "Defensive_Historical": {
        "label": "Historical Defensive Structures",
        "level3Presets": [
          "Castle / Fort",
          "Watchtower / Citadel",
          "Historic Citadel",
          "Legacy Trench Site"
        ]
      },
      "Places_To_See": {
        "label": "Places to See",
        "level3Presets": [
          "Scenic Viewpoint",
          "Tourist Attraction",
          "Historic Landmark"
        ]
      }
    }
  },
  "HEALTH_PUBLIC_SAFETY": {
    "label": "Health & Emergency Services",
    "color": "#ef4444",
    "defaultIcon": "medical_services",
    "subcategories": {
      "Health_Medical": {
        "label": "Health & Medical",
        "level3Presets": [
          "Regional Hospital",
          "Emergency Care Center",
          "Pulmonary / Oculist Specialist",
          "Pharmacy"
        ]
      },
      "Education": {
        "label": "Education & Research",
        "level3Presets": [
          "Primary / Secondary School",
          "University Campus",
          "Research Institute",
          "Training Grounds"
        ]
      },
      "Crisis_Events": {
        "label": "Crisis & Emergency Hazards",
        "level3Presets": [
          "Crime Incident Site",
          "Natural Disaster Zone",
          "HAZMAT Standoff Area",
          "Evacuation Assembly Point"
        ]
      },
      "Law_Enforcement_Civil_Protection": {
        "label": "Law Enforcement & Civil Security",
        "level3Presets": [
          "Police Headquarters / Station",
          "Fire & Rescue Station",
          "Border Customs & Inspection Post",
          "Correctional / Detention Facility",
          "Embassy / Diplomatic Mission",
          "Coast Guard / Marine Police Station"
        ]
      }
    }
  },
  "CULTURE_ENTERTAINMENT": {
    "label": "Culture & Entertainment",
    "color": "#ec4899",
    "defaultIcon": "theater_comedy",
    "subcategories": {
      "Culture": {
        "label": "Culture & Heritage",
        "level3Presets": [
          "Museum / Gallery",
          "Theater / Opera",
          "Library / Archive",
          "Cultural Center"
        ]
      },
      "Entertainment": {
        "label": "Entertainment & Recreation",
        "level3Presets": [
          "Amusement Park / Bumper Cars",
          "Cinema / Movie House",
          "Concert Venue",
          "Festival Grounds"
        ]
      },
      "Sports": {
        "label": "Sports & Athletics",
        "level3Presets": [
          "Air Sports Airfield",
          "Cycling Track",
          "Winter Sports Station",
          "Water Sports Center",
          "Sports Stadium"
        ]
      }
    }
  },
  "RESTAURANTS_HOTELS": {
    "label": "Restaurants & Accommodations",
    "color": "#14b8a6",
    "defaultIcon": "restaurant",
    "subcategories": {
      "Bars_Nightlife": {
        "label": "Bars & Nightlife",
        "level3Presets": [
          "Cocktail Bar",
          "Pub / Brewery",
          "Nightclub",
          "Lounge"
        ]
      },
      "Hotels_Lodging": {
        "label": "Hotels & Lodging",
        "level3Presets": [
          "Hotel Reception",
          "Resort / Spa",
          "Hostel",
          "Ski Station Lodge"
        ]
      },
      "Restaurants": {
        "label": "Restaurants & Dining",
        "level3Presets": [
          "Dining Restaurant",
          "Burger / Sandwich Stand",
          "Seafood Bistro",
          "Pizzeria"
        ]
      },
      "Take_Away": {
        "label": "Take-Away & Quick Food",
        "level3Presets": [
          "Take-Away Counter",
          "Fast Food Kiosk",
          "Hot Dog Stand",
          "Food Truck"
        ]
      }
    }
  },
  "CIVIC_REAL_ESTATE": {
    "label": "Civic & Real Estate",
    "color": "#8b5cf6",
    "defaultIcon": "location_city",
    "subcategories": {
      "City_Services": {
        "label": "City & Municipal Services",
        "level3Presets": [
          "City Hall / Municipal Office",
          "Counseling & Welfare Center",
          "Public Utility Office",
          "Post Office"
        ]
      },
      "Real_Estate": {
        "label": "Real Estate & Property",
        "level3Presets": [
          "Residential Building",
          "Commercial Property",
          "Gated Complex",
          "Land Plot"
        ]
      },
      "Interior_Facilities": {
        "label": "Interior Facilities",
        "level3Presets": [
          "Office Suite",
          "Conference Room",
          "Utility Room",
          "Storage Facility"
        ]
      },
      "Assemblies_Diplomatic": {
        "label": "Assemblies & Diplomatic Facilities",
        "level3Presets": [
          "International Convention / Summit Center",
          "Consulate / Foreign Liaison Office",
          "Public Demonstration / Assembly Plaza",
          "Press Briefing & Media Hub",
          "Court of Law / Judicial Complex"
        ]
      }
    }
  },
  "TRANSPORTATION_LOGISTICS": {
    "label": "Transportation & Logistics",
    "color": "#6366f1",
    "defaultIcon": "commute",
    "subcategories": {
      "Road_Transportation": {
        "label": "Road Transportation",
        "level3Presets": [
          "Vehicle Depot",
          "Highway Interchange",
          "Traffic Control Checkpoint",
          "Rest Stop / Fuel Depot"
        ]
      },
      "Sea_Transportation": {
        "label": "Sea & Maritime",
        "level3Presets": [
          "Sea Signs & Markers",
          "Lateral Buoy",
          "Cardinal Buoy",
          "Mooring Berth",
          "Canal / Waterway"
        ]
      },
      "Aerial_Transportation": {
        "label": "Aerial Transportation",
        "level3Presets": [
          "Airport Terminal",
          "Helipad",
          "Flight Corridor",
          "Aviation Hangar"
        ]
      },
      "Road_Signs_Wayfinding": {
        "label": "Road Signs & Wayfinding",
        "level3Presets": [
          "Speed Monitoring Station",
          "Directional Signpost",
          "Turning Point Marker",
          "Warning Sign"
        ]
      },
      "Media_Indexing": {
        "label": "Indexing & Identifiers",
        "level3Presets": [
          "100km MGRS Square ID",
          "Waypoint Grid Letter",
          "Numeric Sector Index",
          "24/7 Service Station"
        ]
      },
      "Rail_Mass_Transit": {
        "label": "Rail & Mass Transit Systems",
        "level3Presets": [
          "Passenger Rail / Metro Terminal",
          "Freight Rail Classification Yard",
          "Highway Toll Plaza & Weigh Station",
          "Intermodal Cargo Transfer Depot",
          "EV Fast-Charging Superstation",
          "Multi-Level Parking Facility"
        ]
      }
    }
  }
};

/**
 * Returns all Level 1 Primary Domains with metadata.
 * @returns {Array<{key: string, label: string, color: string, defaultIcon: string}>}
 */
export function getLevel1Options() {
  return Object.entries(TAXONOMY_CHAIN).map(([key, domain]) => ({
    key,
    label: domain.label,
    color: domain.color,
    defaultIcon: domain.defaultIcon
  }));
}

/**
 * Returns Level 2 Subcategories for a given Level 1 Domain Key or label.
 * @param {string} level1KeyOrLabel
 * @returns {Array<{key: string, label: string}>}
 */
export function getLevel2Options(level1KeyOrLabel) {
  if (!level1KeyOrLabel) return [];
  
  // Try direct key first
  let domain = TAXONOMY_CHAIN[level1KeyOrLabel];
  
  // If not found, match by label or case-insensitive key
  if (!domain) {
    const entry = Object.entries(TAXONOMY_CHAIN).find(
      ([k, v]) => k.toLowerCase() === level1KeyOrLabel.toLowerCase() || v.label.toLowerCase() === level1KeyOrLabel.toLowerCase()
    );
    if (entry) domain = entry[1];
  }

  if (!domain || !domain.subcategories) return [];
  return Object.entries(domain.subcategories).map(([key, sub]) => ({
    key,
    label: sub.label
  }));
}

const STORAGE_CUSTOM_LEVEL3_KEY = 'gev_custom_level3_taxonomy_v1';

/**
 * Retrieves persisted custom Level 3 classifications from LocalStorage.
 * @returns {Record<string, string[]>}
 */
function getStoredCustomClassifications() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_LEVEL3_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_e) {
    return {};
  }
}

/**
 * Registers a new custom Level 3 Classification under a domain and subcategory.
 * Persists to LocalStorage and integrates into TAXONOMY_CHAIN in-memory.
 * @param {string} level1KeyOrLabel
 * @param {string} level2KeyOrLabel
 * @param {string} classificationName
 */
export function registerCustomClassification(level1KeyOrLabel, level2KeyOrLabel, classificationName) {
  if (!classificationName || typeof classificationName !== 'string') return;
  const cleanL3 = classificationName.trim();
  if (!cleanL3) return;

  const l1Norm = (level1KeyOrLabel || 'TACTICAL_DEFENSE').trim();
  const l2Norm = (level2KeyOrLabel || 'General').trim();

  // 1. In-memory integration into TAXONOMY_CHAIN if matching node exists
  let domain = TAXONOMY_CHAIN[l1Norm];
  if (!domain) {
    const entry = Object.entries(TAXONOMY_CHAIN).find(
      ([k, v]) => k.toLowerCase() === l1Norm.toLowerCase() || v.label.toLowerCase() === l1Norm.toLowerCase()
    );
    if (entry) domain = entry[1];
  }

  if (domain && domain.subcategories) {
    let sub = domain.subcategories[l2Norm];
    if (!sub) {
      const subEntry = Object.entries(domain.subcategories).find(
        ([k, v]) => k.toLowerCase() === l2Norm.toLowerCase() || v.label.toLowerCase() === l2Norm.toLowerCase()
      );
      if (subEntry) sub = subEntry[1];
    }
    if (sub) {
      if (!Array.isArray(sub.level3Presets)) sub.level3Presets = [];
      if (!sub.level3Presets.includes(cleanL3)) {
        sub.level3Presets.push(cleanL3);
      }
    }
  }

  // 2. Persist to localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = getStoredCustomClassifications();
      const storageKey = `${l1Norm}:::${l2Norm}`;
      if (!stored[storageKey]) stored[storageKey] = [];
      if (!stored[storageKey].includes(cleanL3)) {
        stored[storageKey].push(cleanL3);
        localStorage.setItem(STORAGE_CUSTOM_LEVEL3_KEY, JSON.stringify(stored));
      }
    } catch (e) {
      console.warn('[taxonomyData] Failed to persist custom classification:', e);
    }
  }
}

/**
 * Returns Level 3 Operational Presets for a given Level 1 & Level 2 Key/Label pair.
 * Merges primary TAXONOMY_CHAIN presets, fallback defaults for General subcategories,
 * and user-added custom classifications.
 * @param {string} level1KeyOrLabel
 * @param {string} level2KeyOrLabel
 * @returns {Array<string>}
 */
export function getLevel3Presets(level1KeyOrLabel, level2KeyOrLabel) {
  if (!level1KeyOrLabel || !level2KeyOrLabel) return [];

  const l1Norm = String(level1KeyOrLabel).trim();
  const l2Norm = String(level2KeyOrLabel).trim();

  let domain = TAXONOMY_CHAIN[l1Norm];
  if (!domain) {
    const entry = Object.entries(TAXONOMY_CHAIN).find(
      ([k, v]) => k.toLowerCase() === l1Norm.toLowerCase() || v.label.toLowerCase() === l1Norm.toLowerCase()
    );
    if (entry) domain = entry[1];
  }

  const presets = [];

  if (domain && domain.subcategories) {
    // Match subcategory by key or label
    let sub = domain.subcategories[l2Norm];
    if (!sub) {
      const subEntry = Object.entries(domain.subcategories).find(
        ([k, v]) => k.toLowerCase() === l2Norm.toLowerCase() || v.label.toLowerCase() === l2Norm.toLowerCase()
      );
      if (subEntry) sub = subEntry[1];
    }

    if (sub && Array.isArray(sub.level3Presets)) {
      presets.push(...sub.level3Presets);
    }
  }

  // Default presets for generic or unmapped subcategories
  if (presets.length === 0 && (l2Norm.toLowerCase() === 'general' || l2Norm.toLowerCase() === 'all')) {
    presets.push(
      'General Point of Interest',
      'Observation Post',
      'Tactical Landmark',
      'Access / Entry Gate',
      'Operational Area'
    );
  }

  // Merge any custom classifications registered in localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = getStoredCustomClassifications();
      for (const [key, list] of Object.entries(stored)) {
        const [storedDom, storedSub] = key.split(':::');
        if (
          storedDom && storedSub &&
          (storedDom.toLowerCase() === l1Norm.toLowerCase() || (domain && storedDom.toLowerCase() === domain.label.toLowerCase())) &&
          storedSub.toLowerCase() === l2Norm.toLowerCase() &&
          Array.isArray(list)
        ) {
          for (const item of list) {
            if (!presets.includes(item)) {
              presets.push(item);
            }
          }
        }
      }
    } catch (_e) {}
  }

  return presets;
}

/**
 * Gets the signature accent color for a Level 1 Domain (key or label).
 * @param {string} level1KeyOrLabel
 * @returns {string} Hex color code (e.g. '#f43f5e')
 */
export function getDomainColor(level1KeyOrLabel) {
  if (!level1KeyOrLabel) return '#3b82f6';
  const direct = TAXONOMY_CHAIN[level1KeyOrLabel]?.color;
  if (direct) return direct;

  const entry = Object.values(TAXONOMY_CHAIN).find(
    (v) => v.label.toLowerCase() === level1KeyOrLabel.toLowerCase()
  );
  return entry?.color || '#3b82f6';
}

/**
 * Gets the default Material Symbol icon ID for a Level 1 Domain (key or label).
 * @param {string} level1KeyOrLabel
 * @returns {string} Material Symbol icon ID
 */
export function getDomainIcon(level1KeyOrLabel) {
  if (!level1KeyOrLabel) return 'place';
  const direct = TAXONOMY_CHAIN[level1KeyOrLabel]?.defaultIcon;
  if (direct) return direct;

  const entry = Object.values(TAXONOMY_CHAIN).find(
    (v) => v.label.toLowerCase() === level1KeyOrLabel.toLowerCase()
  );
  return entry?.defaultIcon || 'place';
}

/**
 * Reverse lookup helper: Searches for matching domain/subcategory by keyword.
 * @param {string} query
 * @returns {{level1Key: string, level2Key: string, matchedPreset: string}|null}
 */
export function findTaxonomyMatch(query) {
  if (!query) return null;
  const q = query.toLowerCase();

  for (const [l1Key, l1Data] of Object.entries(TAXONOMY_CHAIN)) {
    for (const [l2Key, l2Data] of Object.entries(l1Data.subcategories)) {
      for (const preset of l2Data.level3Presets) {
        if (preset.toLowerCase().includes(q)) {
          return { level1Key: l1Key, level2Key: l2Key, matchedPreset: preset };
        }
      }
      if (l2Data.label.toLowerCase().includes(q)) {
        return { level1Key: l1Key, level2Key: l2Key, matchedPreset: null };
      }
    }
    if (l1Data.label.toLowerCase().includes(q)) {
      return { level1Key: l1Key, level2Key: null, matchedPreset: null };
    }
  }
  return null;
}
