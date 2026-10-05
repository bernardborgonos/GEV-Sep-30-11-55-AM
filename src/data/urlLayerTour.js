/**
 * @fileoverview URL Intelligence Map Search & Map Tour Engine.
 * 
 * Provides:
 * 1. Multi-chain search indexing & hierarchical filtering (Category -> Region/City -> Entity/POI/Vehicle).
 * 2. Auto-suggestions for loaded URL Intelligence data.
 * 3. Tactical Map Tour orchestration (Play, Pause, Stop, Exit, Speed, Duration).
 * 4. Animated pulsating target rings & pulsating boundary/perimeter graphics in Cesium
 *    with zero-risk argument sanitization (preventing Cesium "Invalid argument" errors).
 */

import * as Cesium from 'cesium';

/**
 * Sanitizes a longitude coordinate into the safe WGS84 range [-180, 180].
 * @param {*} val
 * @returns {number|null}
 */
export function sanitizeLon(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (n < -180 || n > 180) {
    return ((((n + 180) % 360) + 360) % 360) - 180;
  }
  return n;
}

/**
 * Sanitizes a latitude coordinate into the safe range [-89.9, 89.9].
 * @param {*} val
 * @returns {number|null}
 */
export function sanitizeLat(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.max(-89.9, Math.min(89.9, n));
}

/**
 * Sanitizes bounds into a valid, non-degenerate bounding rectangle.
 * Guarantees minLon < maxLon and minLat < maxLat with at least minSpan degrees.
 * @param {Object} bounds
 * @param {number} [minSpan=0.03]
 * @returns {{ minLat: number, maxLat: number, minLon: number, maxLon: number } | null}
 */
export function sanitizeBounds(bounds, minSpan = 0.03) {
  if (!bounds || typeof bounds !== 'object') return null;
  const rawMinLat = sanitizeLat(bounds.minLat);
  const rawMaxLat = sanitizeLat(bounds.maxLat);
  const rawMinLon = sanitizeLon(bounds.minLon);
  const rawMaxLon = sanitizeLon(bounds.maxLon);

  if (rawMinLat === null || rawMaxLat === null || rawMinLon === null || rawMaxLon === null) {
    return null;
  }

  let minLat = Math.min(rawMinLat, rawMaxLat);
  let maxLat = Math.max(rawMinLat, rawMaxLat);
  let minLon = Math.min(rawMinLon, rawMaxLon);
  let maxLon = Math.max(rawMinLon, rawMaxLon);

  // Prevent degenerate (zero-size) boundaries which cause Cesium camera errors
  if (maxLat - minLat < minSpan) {
    const midLat = (minLat + maxLat) / 2;
    minLat = Math.max(-89.9, midLat - minSpan / 2);
    maxLat = Math.min(89.9, midLat + minSpan / 2);
  }
  if (maxLon - minLon < minSpan) {
    const midLon = (minLon + maxLon) / 2;
    minLon = Math.max(-180, midLon - minSpan / 2);
    maxLon = Math.min(180, midLon + minSpan / 2);
  }

  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Extracts distinct geographic region/city tokens from an address or text string.
 * @param {string} text
 * @returns {string[]}
 */
export function extractRegionTokens(text) {
  if (!text || typeof text !== 'string') return [];
  const parts = text.split(/[,;\n•|]/).map((s) => s.trim()).filter(Boolean);
  const knownKeywords = [
    'Manila', 'Metro Manila', 'NCR', 'Pasay', 'Makati', 'Taguig', 'Quezon City',
    'Cebu', 'Davao', 'Batangas', 'Subic', 'Clark', 'Iloilo', 'Bacolod',
    'Zamboanga', 'Cagayan de Oro', 'Luzon', 'Visayas', 'Mindanao',
    'North Harbor', 'South Harbor', 'NAIA', 'Bataan', 'Pampanga', 'Laguna',
    'Cavite', 'Palawan', 'Bohol', 'General Santos', 'Angeles',
    'Calabarzon', 'Central Visayas', 'Western Visayas', 'Northern Mindanao',
    'Davao Region', 'Zamboanga Peninsula', 'Central Luzon',
  ];
  const found = new Set();
  const lower = text.toLowerCase();
  for (const kw of knownKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      found.add(kw);
    }
  }
  for (const part of parts) {
    if (part.length >= 3 && part.length <= 30 && !/\d{5,}/.test(part)) {
      found.add(part);
    }
  }
  return Array.from(found);
}

/**
 * Extracts sub-facility, terminal, station, pier, or landmark name from a point or record.
 * Supports Level 3 hierarchy in composite chains: Category > Region > Sub-facility.
 * @param {Object} pt
 * @returns {string[]}
 */
export function extractSubFacilityTokens(pt) {
  if (!pt) return [];
  const results = new Set();

  if (typeof pt.subfacility === 'string' && pt.subfacility.trim()) {
    results.add(pt.subfacility.trim());
  }
  if (typeof pt.terminal === 'string' && pt.terminal.trim()) {
    results.add(pt.terminal.trim());
  }
  if (typeof pt.facility === 'string' && pt.facility.trim()) {
    results.add(pt.facility.trim());
  }
  if (typeof pt.station === 'string' && pt.station.trim()) {
    results.add(pt.station.trim());
  }

  const name = String(pt.name || pt.title || '').trim();
  if (name) {
    results.add(name);
    // Extract sub-patterns like "Terminal 3", "Pier 4", "Cargo Berth", "District Office", etc.
    const subMatch = name.match(/(Terminal\s+\d+|Pier\s+\d+|Gate\s+\d+|Berth\s+\d+|Building\s+[A-Z\d]+|District\s+Office|Field\s+Office|Container\s+Terminal|Radar\s+Station)/i);
    if (subMatch && subMatch[0] !== name) {
      results.add(subMatch[0].trim());
    }
  }

  return Array.from(results).filter(Boolean);
}

/**
 * Parses a freeform or multi-chain search query into structured search tokens.
 * Supports:
 * - "Port > Manila" (hierarchical chain delimiter)
 * - "Category > Region > Sub-facility" (3-level composite chain)
 * - "Field Office | Cebu"
 * - "category:port city:manila sub:terminal 3"
 * - "NAIA Pasay"
 * @param {string} queryStr
 * @returns {{
 *   raw: string,
 *   isMultiChain: boolean,
 *   chainSteps: string[],
 *   tokens: string[],
 *   categoryHint: string|null,
 *   regionHint: string|null,
 *   entityHint: string|null,
 *   subFacilityHint: string|null
 * }}
 */
export function parseMultiChainQuery(queryStr) {
  const raw = String(queryStr || '').trim();
  if (!raw) {
    return {
      raw: '',
      isMultiChain: false,
      chainSteps: [],
      tokens: [],
      categoryHint: null,
      regionHint: null,
      entityHint: null,
      subFacilityHint: null,
    };
  }

  // Check for explicit chain delimiters: ' > ', ' / ', ' | ', ' -> '
  let chainSteps = [];
  if (raw.includes('>') || raw.includes('|') || raw.includes(' -> ')) {
    chainSteps = raw
      .split(/>|\||->/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (raw.includes(' / ')) {
    chainSteps = raw
      .split(' / ')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const isMultiChain = chainSteps.length > 1;

  // Extract key-value hints if present, e.g. "cat:port", "city:manila", "sub:naia"
  let categoryHint = null;
  let regionHint = null;
  let entityHint = null;

  const catMatch = raw.match(/(?:category|cat):\s*([a-zA-Z0-9_\s-]+)(?:$|\s+(?=[a-z]+:))/i);
  if (catMatch) categoryHint = catMatch[1].trim();

  const regMatch = raw.match(/(?:region|city|loc|area):\s*([a-zA-Z0-9_\s-]+)(?:$|\s+(?=[a-z]+:))/i);
  if (regMatch) regionHint = regMatch[1].trim();

  const subMatch = raw.match(/(?:subfacility|sub-facility|facility|terminal|sub|station|poi):\s*([a-zA-Z0-9_\s-]+)(?:$|\s+(?=[a-z]+:))/i);
  if (subMatch) entityHint = subMatch[1].trim();

  // If explicit chain steps were given:
  // Step 0: Category (Level 1)
  // Step 1: Region / Locality (Level 2)
  // Step 2: Sub-facility / Station / POI (Level 3)
  if (isMultiChain) {
    if (!categoryHint && chainSteps[0]) categoryHint = chainSteps[0];
    if (!regionHint && chainSteps[1]) regionHint = chainSteps[1];
    if (chainSteps[2]) entityHint = chainSteps[2];
  }

  // General lowercase tokens for broad fuzzy intersection
  const cleanStr = raw.replace(/(?:category|cat|region|city|loc|area|subfacility|sub-facility|facility|terminal|sub|station|poi):/gi, ' ');
  const tokens = cleanStr
    .toLowerCase()
    .split(/[\s,>|/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return {
    raw,
    isMultiChain,
    chainSteps,
    tokens,
    categoryHint,
    regionHint,
    entityHint,
    subFacilityHint: entityHint || (chainSteps.length >= 3 ? chainSteps[2] : null),
  };
}

/**
 * Searches loaded URL Intelligence data with multi-chain reasoning.
 * Returns categorized suggestions:
 * - actions: "Tour All Data", "Fit Layer Extent"
 * - categories: Matching categories with counts & tour links
 * - multiChains: Composite hierarchies (e.g. Category > Region (N items))
 * - items: Individual matching points or vehicle units
 *
 * @param {string} query
 * @param {Object} dataset - Current URL Intelligence data
 * @param {Object} [options]
 * @returns {{
 *   totalMatches: number,
 *   actions: Array<Object>,
 *   categories: Array<Object>,
 *   multiChains: Array<Object>,
 *   items: Array<Object>
 * }}
 */
export function searchUrlIntelligence(query, dataset, options = {}) {
  const parsed = parseMultiChainQuery(query);
  const points = Array.isArray(dataset?.points) ? dataset.points : [];
  const trajectories = Array.isArray(dataset?.trajectoryList)
    ? dataset.trajectoryList
    : dataset?.trajectories instanceof Map
      ? Array.from(dataset.trajectories.values())
      : Object.values(dataset?.trajectories || {});
  const categories = Array.isArray(dataset?.categories) ? dataset.categories : [];
  const categoryCounts = dataset?.categoryCounts || {};

  const maxItems = options.maxItems || 10;
  const isQueryEmpty = parsed.tokens.length === 0;

  const actions = [];
  const matchedCategories = [];
  const matchedMultiChains = [];
  const matchedItems = [];

  // 1. Base Actions
  const totalCount = points.length || trajectories.length;
  if (totalCount > 0) {
    actions.push({
      id: 'action-tour-all',
      type: 'action',
      label: `▶ Start Map Tour (${totalCount} Total Units)`,
      icon: '🧭',
      action: 'start-tour-all',
      count: totalCount,
    });
    actions.push({
      id: 'action-fit-extent',
      type: 'action',
      label: `🎯 Fit Globe to Dataset Bounds`,
      icon: '🌐',
      action: 'fit-extent',
      count: totalCount,
    });
  }

  // 2. Category matching & Multi-chain generation
  const categoryScoreMap = new Map();

  for (const cat of categories) {
    if (cat === 'All') continue;
    const catLower = cat.toLowerCase();
    const count = categoryCounts[cat] || points.filter((p) => p.category === cat).length;
    let matchScore = 0;

    if (isQueryEmpty) {
      matchScore = 1;
    } else {
      if (parsed.categoryHint && catLower.includes(parsed.categoryHint.toLowerCase())) {
        matchScore += 10;
      }
      for (const tok of parsed.tokens) {
        if (catLower.includes(tok)) matchScore += 3;
      }
    }

    if (matchScore > 0) {
      categoryScoreMap.set(cat, {
        id: `cat-${cat}`,
        type: 'category',
        name: cat,
        count,
        icon: getCategoryIcon(cat),
        score: matchScore,
      });
    }
  }

  // Sort categories by score then count
  const sortedCategories = Array.from(categoryScoreMap.values())
    .sort((a, b) => b.score - a.score || b.count - a.count);

  for (const catEntry of sortedCategories.slice(0, 5)) {
    matchedCategories.push({
      ...catEntry,
      tourAction: `start-tour-category:${catEntry.name}`,
    });
  }

  // 3. Multi-Chain Hierarchy generation (2-tier: Category > Region, 3-tier: Category > Region > Sub-facility)
  const chainCounts = new Map(); // key: chainKey -> { tier, category, region, subFacility, count, points }

  for (const pt of points) {
    const cat = pt.category || 'General';
    const regions = extractRegionTokens(pt.address || pt.details || pt.name);
    const subFacilities = extractSubFacilityTokens(pt);

    for (const reg of regions) {
      // 2-tier: Category > Region
      const chain2Key = `${cat} > ${reg}`;
      if (!chainCounts.has(chain2Key)) {
        chainCounts.set(chain2Key, {
          tier: 2,
          category: cat,
          region: reg,
          subFacility: null,
          points: [],
        });
      }
      chainCounts.get(chain2Key).points.push(pt);

      // 3-tier: Category > Region > Sub-facility
      for (const sub of subFacilities) {
        if (!sub) continue;
        if (sub.toLowerCase() === reg.toLowerCase() || sub.toLowerCase() === cat.toLowerCase()) continue;
        const chain3Key = `${cat} > ${reg} > ${sub}`;
        if (!chainCounts.has(chain3Key)) {
          chainCounts.set(chain3Key, {
            tier: 3,
            category: cat,
            region: reg,
            subFacility: sub,
            points: [],
          });
        }
        if (!chainCounts.get(chain3Key).points.includes(pt)) {
          chainCounts.get(chain3Key).points.push(pt);
        }
      }
    }
  }

  for (const [chainKey, data] of chainCounts.entries()) {
    const chainLower = chainKey.toLowerCase();
    let score = 0;

    if (parsed.isMultiChain) {
      const step0 = parsed.chainSteps[0]?.toLowerCase() || '';
      const step1 = parsed.chainSteps[1]?.toLowerCase() || '';
      const step2 = parsed.chainSteps[2]?.toLowerCase() || '';

      const match0 = data.category.toLowerCase().includes(step0);
      const match1 = data.region.toLowerCase().includes(step1);
      const match2 = data.subFacility ? data.subFacility.toLowerCase().includes(step2) : false;

      if (parsed.chainSteps.length >= 3) {
        if (data.tier === 3 && match0 && match1 && match2) {
          score += 45; // Precise 3-tier composite chain match
        } else if (match0 && match1) {
          score += 15;
        }
      } else if (parsed.chainSteps.length === 2) {
        if (match0 && match1) {
          score += (data.tier === 3 ? 22 : 25);
        }
      }
    } else if (!isQueryEmpty) {
      let matchedTokens = 0;
      for (const tok of parsed.tokens) {
        if (chainLower.includes(tok)) matchedTokens++;
      }
      if (matchedTokens > 0) {
        score = matchedTokens * 4;
        if (data.tier === 3 && matchedTokens >= 2) {
          score += 5; // Bonus for multi-token match on 3-tier hierarchy
        }
      }
    } else {
      score = data.tier === 3 ? 2 : 3;
    }

    if (score > 0 && data.points.length > 0) {
      matchedMultiChains.push({
        id: `chain-${data.tier}-${chainKey.replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
        type: 'multi-chain',
        tier: data.tier,
        label: chainKey,
        category: data.category,
        region: data.region,
        subFacility: data.subFacility,
        count: data.points.length,
        points: data.points,
        score,
        icon: data.tier === 3 ? '🏢' : '🔗',
      });
    }
  }

  matchedMultiChains.sort((a, b) => b.score - a.score || b.tier - a.tier || b.count - a.count);

  // 4. Individual Points & Trajectory Vehicles matching
  const scoredItems = [];

  // Match regular points
  for (const pt of points) {
    const name = String(pt.name || pt.title || 'Data Point');
    const nameLower = name.toLowerCase();
    const catLower = String(pt.category || '').toLowerCase();
    const addrLower = String(pt.address || '').toLowerCase();
    const detLower = String(pt.details || '').toLowerCase();

    let score = 0;

    if (isQueryEmpty) {
      score = 1;
    } else {
      if (parsed.categoryHint && catLower.includes(parsed.categoryHint.toLowerCase())) {
        score += 5;
      }
      if (parsed.regionHint && (addrLower.includes(parsed.regionHint.toLowerCase()) || detLower.includes(parsed.regionHint.toLowerCase()))) {
        score += 5;
      }
      if (parsed.entityHint && nameLower.includes(parsed.entityHint.toLowerCase())) {
        score += 8;
      }

      for (const tok of parsed.tokens) {
        if (nameLower.includes(tok)) score += 6;
        else if (catLower.includes(tok)) score += 3;
        else if (addrLower.includes(tok)) score += 2;
        else if (detLower.includes(tok)) score += 1;
      }
    }

    if (score > 0) {
      scoredItems.push({
        id: pt.id || `pt-${Math.random()}`,
        type: 'point',
        name,
        category: pt.category || 'Point',
        lat: pt.lat,
        lon: pt.lon,
        address: pt.address || '',
        details: pt.details || '',
        icon: pt.icon || getCategoryIcon(pt.category),
        pointRef: pt,
        score,
      });
    }
  }

  // Match trajectory vehicles
  for (const veh of trajectories) {
    const vId = String(veh.vehicleId || veh.id || 'Vehicle');
    const vName = String(veh.name || vId);
    const vLower = (vId + ' ' + vName).toLowerCase();
    const speed = Number(veh.avgSpeedKmh || veh.speedKmh || 0);
    const status = speed >= 3 ? 'Active' : 'Idle';

    let score = 0;
    if (isQueryEmpty) {
      score = 1;
    } else {
      for (const tok of parsed.tokens) {
        if (vLower.includes(tok)) score += 8;
        if (tok === 'active' && status === 'Active') score += 5;
        if (tok === 'idle' && status === 'Idle') score += 5;
        if (tok === 'fleet' || tok === 'vehicle' || tok === 'unit') score += 3;
      }
    }

    if (score > 0) {
      const firstWp = Array.isArray(veh.waypoints) && veh.waypoints[0] ? veh.waypoints[0] : veh;
      scoredItems.push({
        id: vId,
        type: 'vehicle',
        name: `${vName} (${status} · ${Math.round(speed)} km/h)`,
        category: 'Fleet Telemetry',
        vehicleId: vId,
        lat: firstWp.lat,
        lon: firstWp.lon,
        address: `${veh.totalDistanceKm ? veh.totalDistanceKm.toFixed(1) + ' km route' : 'Real-time telemetry'}`,
        details: `Speed: ${Math.round(speed)} km/h · Status: ${status}`,
        icon: '🚙',
        vehicleRef: veh,
        score,
      });
    }
  }

  scoredItems.sort((a, b) => b.score - a.score);
  matchedItems.push(...scoredItems.slice(0, maxItems));

  const totalMatches =
    actions.length + matchedCategories.length + matchedMultiChains.length + matchedItems.length;

  return {
    totalMatches,
    query: parsed,
    actions,
    categories: matchedCategories,
    multiChains: matchedMultiChains.slice(0, 4),
    items: matchedItems,
  };
}

/**
 * Returns an appropriate emoji icon for a category name.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryIcon(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('port') || c.includes('harbor') || c.includes('terminal')) return '⚓';
  if (c.includes('office') || c.includes('bureau') || c.includes('building')) return '🏢';
  if (c.includes('fleet') || c.includes('vehicle') || c.includes('truck')) return '🚙';
  if (c.includes('patrol') || c.includes('police') || c.includes('tactical')) return '🚔';
  if (c.includes('airport') || c.includes('flight')) return '✈️';
  if (c.includes('logistic') || c.includes('depot') || c.includes('warehouse')) return '📦';
  if (c.includes('heritage') || c.includes('monument')) return '🏛️';
  if (c.includes('hospital') || c.includes('health')) return '🏥';
  if (c.includes('active')) return '🟢';
  if (c.includes('idle')) return '🟡';
  return '📍';
}

/**
 * Returns an accent color hex string for category or layer styling.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryAccentColor(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('port') || c.includes('maritime') || c.includes('fleet') || c.includes('active')) {
    return '#00e5ff'; // Tactical cyan
  }
  if (c.includes('office') || c.includes('bureau') || c.includes('idle') || c.includes('dwell')) {
    return '#fbbf24'; // Amber
  }
  if (c.includes('logistic') || c.includes('depot') || c.includes('relief')) {
    return '#10b981'; // Emerald
  }
  if (c.includes('heritage') || c.includes('unesco')) {
    return '#a855f7'; // Purple
  }
  if (c.includes('customs') || c.includes('security') || c.includes('patrol')) {
    return '#f43f5e'; // Rose
  }
  return '#38bdf8'; // Sky blue
}

// ─────────────────────────────────────────────────────────────────────────────
// CESIUM PULSATING VISUAL HIGHLIGHTS (Pulsating Ring & Pulsating Perimeter)
// STRICT ZERO-RISK ARGUMENT SANITIZATION TO PREVENT "Invalid argument" ERRORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active highlight tracking to ensure clean lifecycle management.
 */
let _activePulsatingEntities = new Set();
let _activePerimeterEntities = new Set();

/**
 * Creates a high-visibility tactical pulsating ring centered on a target data point.
 * Features:
 * - Dynamic radar-pulse expanding wave (semiMajorAxis / semiMinorAxis CallbackProperty).
 * - Fading radial wave opacity.
 * - Solid ground-anchored high-contrast core beacon.
 *
 * @param {Cesium.Viewer} viewer
 * @param {Object} options
 * @param {number} options.lat - Target latitude
 * @param {number} options.lon - Target longitude
 * @param {string} [options.color='#00e5ff'] - Hex or CSS color string
 * @param {number} [options.baseRadius=200] - Base radius in meters
 * @param {string} [options.label] - Optional text label
 * @returns {Function} Cleanup function to safely remove the pulsating ring.
 */
export function highlightPulsatingTarget(viewer, options = {}) {
  if (!viewer?.entities) return () => {};

  const lat = sanitizeLat(options.lat);
  const lon = sanitizeLon(options.lon);

  // Hard safety check: discard if coordinates are invalid
  if (lat === null || lon === null) {
    console.warn('[urlLayerTour] Invalid coordinates passed to highlightPulsatingTarget:', options);
    return () => {};
  }

  // Clear previous point highlight entities
  clearPulsatingTarget(viewer);

  const colorHex = options.color || '#00e5ff';
  let baseColor;
  try {
    baseColor = Cesium.Color.fromCssColorString(colorHex);
  } catch {
    baseColor = Cesium.Color.CYAN;
  }

  const baseRadius = Number.isFinite(options.baseRadius) && options.baseRadius > 0
    ? options.baseRadius
    : 220;

  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Dynamic radar pulse radius property - synchronized across axes to strictly guarantee semiMajorAxis >= semiMinorAxis
  let cachedRadarRadius = baseRadius;
  let lastMajorRadarRadius = baseRadius;
  let lastRadarRadiusTime = -1;

  function getRadarRadius() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Recompute at most once every 12ms so both axes read the identical radius within a frame
    if (now - lastRadarRadiusTime >= 12 || lastRadarRadiusTime < 0) {
      lastRadarRadiusTime = now;
      const elapsedSec = (now - startTime) / 1000;
      const cycle = (elapsedSec % 1.5) / 1.5; // 0..1 loop
      cachedRadarRadius = Math.max(1, baseRadius + cycle * (baseRadius * 2.2));
    }
    return cachedRadarRadius;
  }

  const majorAxisProperty = new Cesium.CallbackProperty(() => {
    const r = getRadarRadius();
    lastMajorRadarRadius = r;
    return r;
  }, false);

  const minorAxisProperty = new Cesium.CallbackProperty(() => {
    const r = getRadarRadius();
    // Strictly guarantee semiMinorAxis <= semiMajorAxis regardless of call order or sub-millisecond clock drift
    return Math.max(1, Math.min(r, lastMajorRadarRadius));
  }, false);

  // Dynamic alpha property (fades out as ring expands)
  let cachedRadarAlpha = 0.85;
  let lastRadarAlphaTime = -1;

  function getRadarAlpha() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastRadarAlphaTime >= 12 || lastRadarAlphaTime < 0) {
      lastRadarAlphaTime = now;
      const elapsedSec = (now - startTime) / 1000;
      const cycle = (elapsedSec % 1.5) / 1.5;
      cachedRadarAlpha = Math.max(0, (1 - cycle) * 0.85);
    }
    return cachedRadarAlpha;
  }

  const position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);

  // 1. Inner core beacon (sharp, luminous center)
  const coreEntity = viewer.entities.add({
    id: `gev-tour-core-${Date.now()}`,
    position,
    point: {
      pixelSize: 14,
      color: baseColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2.5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  _activePulsatingEntities.add(coreEntity);

  // 2. Outer pulsating radar ring
  const ringEntity = viewer.entities.add({
    id: `gev-tour-ring-${Date.now()}`,
    position,
    ellipse: {
      semiMajorAxis: majorAxisProperty,
      semiMinorAxis: minorAxisProperty,
      height: 0,
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => {
          const a = getRadarAlpha();
          return baseColor.withAlpha(a * 0.45);
        }, false)
      ),
      outline: true,
      outlineColor: new Cesium.CallbackProperty(() => {
        const a = getRadarAlpha();
        return Cesium.Color.WHITE.withAlpha(a);
      }, false),
      outlineWidth: 2,
    },
  });
  _activePulsatingEntities.add(ringEntity);

  // 3. Optional secondary holographic vertical beacon line
  const beaconEntity = viewer.entities.add({
    id: `gev-tour-beacon-${Date.now()}`,
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        Cesium.Cartesian3.fromDegrees(lon, lat, 800),
      ],
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: baseColor.withAlpha(0.6),
      }),
    },
  });
  _activePulsatingEntities.add(beaconEntity);

  return () => {
    clearPulsatingTarget(viewer);
  };
}

/**
 * Removes all active point highlight entities safely.
 * @param {Cesium.Viewer} viewer
 */
export function clearPulsatingTarget(viewer) {
  if (!viewer?.entities) return;
  for (const entity of _activePulsatingEntities) {
    try {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    } catch {
      /* ignore cleanup */
    }
  }
  _activePulsatingEntities.clear();
}

/**
 * Creates a pulsating boundary box / perimeter polygon around a cluster or category extent.
 * Guarantees zero "Invalid argument" errors through bounds validation and coordinate expansion.
 *
 * @param {Cesium.Viewer} viewer
 * @param {Object} options
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} options.bounds
 * @param {string} [options.color='#00e5ff'] - Hex color
 * @param {string} [options.title] - Optional label
 * @returns {Function} Cleanup function
 */
export function highlightPulsatingPerimeter(viewer, options = {}) {
  if (!viewer?.entities) return () => {};

  const bounds = sanitizeBounds(options.bounds, 0.04);
  if (!bounds) {
    console.warn('[urlLayerTour] Invalid boundary passed to highlightPulsatingPerimeter:', options);
    return () => {};
  }

  // Clear previous perimeters
  clearPulsatingPerimeter(viewer);

  const colorHex = options.color || '#00e5ff';
  let baseColor;
  try {
    baseColor = Cesium.Color.fromCssColorString(colorHex);
  } catch {
    baseColor = Cesium.Color.CYAN;
  }

  const { minLat, maxLat, minLon, maxLon } = bounds;

  // Closed perimeter polygon coordinates
  const perimeterCoords = [
    minLon, minLat,
    maxLon, minLat,
    maxLon, maxLat,
    minLon, maxLat,
    minLon, minLat,
  ];

  const positions = Cesium.Cartesian3.fromDegreesArray(perimeterCoords);
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Smooth sinusoidal breathing pulse for the boundary line (0.35 .. 0.95 alpha)
  const breathingAlpha = new Cesium.CallbackProperty(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedSec = (now - startTime) / 1000;
    return 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(elapsedSec * 3.0));
  }, false);

  // 1. Glowing perimeter polyline
  const polylineEntity = viewer.entities.add({
    id: `gev-tour-perim-line-${Date.now()}`,
    polyline: {
      positions,
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.35,
        color: new Cesium.CallbackProperty(() => {
          const a = breathingAlpha.getValue(Cesium.JulianDate.now());
          return baseColor.withAlpha(typeof a === 'number' ? a : 0.8);
        }, false),
      }),
      clampToGround: true,
    },
  });
  _activePerimeterEntities.add(polylineEntity);

  // 2. Faint translucent interior tinted polygon
  const fillPositions = Cesium.Cartesian3.fromDegreesArray([
    minLon, minLat,
    maxLon, minLat,
    maxLon, maxLat,
    minLon, maxLat,
  ]);

  const fillEntity = viewer.entities.add({
    id: `gev-tour-perim-fill-${Date.now()}`,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(fillPositions),
      height: 0,
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => {
          const a = breathingAlpha.getValue(Cesium.JulianDate.now());
          return baseColor.withAlpha(typeof a === 'number' ? a * 0.12 : 0.08);
        }, false)
      ),
    },
  });
  _activePerimeterEntities.add(fillEntity);

  return () => {
    clearPulsatingPerimeter(viewer);
  };
}

/**
 * Removes all active perimeter highlight entities safely.
 * @param {Cesium.Viewer} viewer
 */
export function clearPulsatingPerimeter(viewer) {
  if (!viewer?.entities) return;
  for (const entity of _activePerimeterEntities) {
    try {
      if (viewer.entities.contains(entity)) {
        viewer.entities.remove(entity);
      }
    } catch {
      /* ignore cleanup */
    }
  }
  _activePerimeterEntities.clear();
}

/**
 * Clears all temporary visual highlights (both point targets and perimeters).
 * @param {Cesium.Viewer} viewer
 */
export function clearAllTourHighlights(viewer) {
  clearPulsatingTarget(viewer);
  clearPulsatingPerimeter(viewer);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP TOUR CONTROLLER (Fly, Present, Pulsating Ring/Perimeter, Playback Engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates automated or step-by-step Map Tours across loaded URL data.
 */
export class MapTourController {
  /**
   * @param {Cesium.Viewer} viewer
   * @param {Object} [options]
   */
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.status = 'idle'; // 'idle' | 'playing' | 'paused' | 'stopped'
    this.stops = [];
    this.currentIndex = 0;
    this.speed = 1.0; // 0.5, 1, 2, 3
    this.dwellDurationSec = 4.0; // seconds at each stop
    this.timer = null;
    this.intervalCountdown = null;
    this.dwellRemainingSec = 0;
    this.tourTitle = 'Map Tour';
    this.mode = 'all';
    this.chainPath = null;
    this.chainTier = null;
    this.chainCategory = null;
    this.chainRegion = null;
    this.chainSubFacility = null;
    this.animationMode = options.animationMode || 'swoop-orbit'; // 'swoop-orbit' | 'glide-lock' | 'nadir'
    this._orbitRemoveListener = null;
    this._activeOrbitTarget = null;
    this._orbitAngle = 0;
    this.listeners = new Set();
    this.onSelectCallback = options.onSelectCallback || null;
  }

  /**
   * Register a state change listener for UI HUD synchronization.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    const state = this.getState();
    for (const cb of this.listeners) {
      try {
        cb(state);
      } catch (err) {
        console.error('[urlLayerTour] Listener callback error:', err);
      }
    }
  }

  getState() {
    const currentStop = this.stops[this.currentIndex] || null;
    return {
      status: this.status,
      currentIndex: this.currentIndex,
      totalStops: this.stops.length,
      currentStop,
      speed: this.speed,
      dwellDurationSec: this.dwellDurationSec,
      dwellRemainingSec: Math.max(0, this.dwellRemainingSec),
      progressRatio: this.stops.length > 0 ? (this.currentIndex + 1) / this.stops.length : 0,
      tourTitle: this.tourTitle,
      mode: this.mode,
      animationMode: this.animationMode,
      chainPath: this.chainPath,
      chainTier: this.chainTier,
      chainCategory: this.chainCategory,
      chainRegion: this.chainRegion,
      chainSubFacility: this.chainSubFacility,
    };
  }

  /**
   * Builds and launches a Map Tour.
   *
   * @param {Object} config
   * @param {'all'|'category'|'multi-chain'|'perimeters'} [config.mode='all']
   * @param {string} [config.category] - Filtered category name
   * @param {Array<Object>} [config.items] - Pre-filtered items
   * @param {Object} [config.bounds] - Initial dataset boundary
   * @param {string} [config.title] - Tour display title
   * @param {string} [config.chainPath] - e.g. "Category > Region > Sub-facility"
   * @param {number} [config.chainTier] - 2 or 3
   * @param {string} [config.chainCategory]
   * @param {string} [config.chainRegion]
   * @param {string} [config.chainSubFacility]
   * @param {boolean} [config.autoPlay=true]
   */
  startTour(config = {}) {
    this.stop(); // Stop any currently running tour

    const mode = config.mode || 'all';
    const items = Array.isArray(config.items) ? config.items : [];
    const category = config.category || config.chainCategory || null;
    const title = config.title || (config.chainPath ? `Tour: ${config.chainPath}` : category ? `Tour: ${category}` : 'Global Dataset Tour');

    this.mode = mode;
    this.chainPath = config.chainPath || null;
    this.chainTier = config.chainTier || null;
    this.chainCategory = config.chainCategory || category || null;
    this.chainRegion = config.chainRegion || null;
    this.chainSubFacility = config.chainSubFacility || null;
    this.tourTitle = title;
    this.stops = [];

    // Helper: calculate bounds from an array of coordinate objects
    const calcBounds = (pts) => {
      if (!pts || pts.length === 0) return null;
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const p of pts) {
        const lat = Number(p.lat);
        const lon = Number(p.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
      }
      return Number.isFinite(minLat) ? { minLat, maxLat, minLon, maxLon } : null;
    };

    // 1. Initial Overview Stop (Boundary & Perimeters)
    const overallBounds = config.bounds || calcBounds(items);
    if (overallBounds) {
      this.stops.push({
        id: 'stop-overview-perimeter',
        isPerimeter: true,
        title: this.chainPath ? `${this.chainPath} (Perimeter Overview)` : `${title} (Perimeter Overview)`,
        category: category || 'Overview',
        bounds: overallBounds,
        color: getCategoryAccentColor(category || 'Overview'),
        details: this.chainPath
          ? `Hierarchical composite chain encompassing ${items.length} units`
          : `Encompassing ${items.length} units across regional boundary perimeters`,
        chainPath: this.chainPath,
      });
    }

    // 2. Individual Data Point Stops
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const lat = Number(it.lat);
      const lon = Number(it.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      this.stops.push({
        id: it.id || `stop-${i}`,
        isPerimeter: false,
        title: it.name || it.vehicleId || `Unit #${i + 1}`,
        category: it.category || category || 'Data Point',
        lat,
        lon,
        color: getCategoryAccentColor(it.category || category),
        address: it.address || '',
        details: it.details || '',
        icon: it.icon || getCategoryIcon(it.category),
        chainPath: this.chainPath,
        rawRef: it,
      });
    }

    if (this.stops.length === 0) {
      console.warn('[urlLayerTour] Cannot start tour: no valid stops found.');
      return false;
    }

    this.currentIndex = 0;
    this.status = 'playing';
    this._presentCurrentStop();
    this._startDwellTimer();
    this._notify();
    return true;
  }

  /**
   * Flies camera to and highlights the current stop.
   */
  /**
   * Flies camera to and highlights the current stop.
   * Guarantees that the target stop is mathematically centered in the viewport,
   * using adaptive parabolic flight arcs and selectable transition styles.
   */
  _presentCurrentStop() {
    if (!this.viewer) return;
    const stop = this.stops[this.currentIndex];
    if (!stop) return;

    this._stopDwellOrbit();
    clearAllTourHighlights(this.viewer);

    if (stop.isPerimeter && stop.bounds) {
      // ── Bounding Perimeter Stop ──
      const safeBounds = sanitizeBounds(stop.bounds, 0.05);
      if (safeBounds) {
        highlightPulsatingPerimeter(this.viewer, {
          bounds: safeBounds,
          color: stop.color,
          title: stop.title,
        });

        // Fly camera to frame boundary
        try {
          if (typeof Cesium !== 'undefined' && Cesium.Rectangle && this.viewer.camera?.flyTo) {
            const rect = Cesium.Rectangle.fromDegrees(
              safeBounds.minLon,
              safeBounds.minLat,
              safeBounds.maxLon,
              safeBounds.maxLat
            );
            this.viewer.camera.flyTo({
              destination: rect,
              duration: Math.max(1.2, 2.0 / this.speed),
            });
          }
        } catch (err) {
          console.warn('[urlLayerTour] camera flyTo perimeter error:', err);
        }
      }
    } else {
      // ── Individual Data Point Stop ──
      const lat = sanitizeLat(stop.lat);
      const lon = sanitizeLon(stop.lon);

      if (lat !== null && lon !== null) {
        highlightPulsatingTarget(this.viewer, {
          lat,
          lon,
          color: stop.color,
          baseRadius: 240,
          label: stop.title,
        });

        const animMode = this.animationMode || 'swoop-orbit';

        // Camera flight parameters based on animation mode
        let pitchDeg = -35;
        let rangeM = 3800;
        let headingDeg = 0;

        if (animMode === 'nadir') {
          // OpenLayers-style orthographic top-down pan
          pitchDeg = -89.9;
          rangeM = 3400;
        } else if (animMode === 'glide-lock') {
          // Direct smooth glide with locked tactical angle
          pitchDeg = -32;
          rangeM = 3600;
        } else {
          // 'swoop-orbit' (Cinematic Recon — OpenLayers "Fly to" + "Rotate around")
          pitchDeg = -35;
          rangeM = 3800;
        }

        try {
          if (
            typeof Cesium !== 'undefined' &&
            Cesium.Cartesian3 &&
            Cesium.BoundingSphere &&
            this.viewer?.camera?.flyToBoundingSphere
          ) {
            const targetPos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
            const sphere = new Cesium.BoundingSphere(targetPos, 0);

            // Calculate adaptive duration based on distance from current camera
            let flightDuration = Math.max(1.2, 2.0 / this.speed);
            if (this.viewer.camera?.position) {
              try {
                const distM = Cesium.Cartesian3.distance(this.viewer.camera.position, targetPos);
                if (distM > 50000) {
                  // Far distance (>50km): parabolic sub-orbital arc flight
                  flightDuration = Math.min(3.6, Math.max(1.8, (2.0 + Math.log10(distM / 10000)) / this.speed));
                } else if (distM < 6000) {
                  // Nearby stop: low-altitude smooth cruise
                  flightDuration = Math.max(1.0, 1.4 / this.speed);
                }
              } catch {}
            }

            const hpr = new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(headingDeg),
              Cesium.Math.toRadians(pitchDeg),
              rangeM
            );

            this.viewer.camera.flyToBoundingSphere(sphere, {
              offset: hpr,
              duration: flightDuration,
              easingFunction: Cesium.EasingFunction?.CUBIC_IN_OUT || undefined,
              complete: () => {
                // Guarantee target is locked in viewport center
                try {
                  this.viewer.camera.lookAt(targetPos, hpr);
                  this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                } catch {}

                // In 'swoop-orbit' mode, initiate gentle surveillance inspection orbit during dwell
                if (this.animationMode === 'swoop-orbit' && this.status === 'playing') {
                  this._startDwellOrbit(targetPos, rangeM, pitchDeg);
                }
              },
            });
          } else if (this.viewer?.camera?.flyTo) {
            // Fallback for mock environments or basic camera
            const dest = (typeof Cesium !== 'undefined' && Cesium.Cartesian3)
              ? Cesium.Cartesian3.fromDegrees(lon, lat, rangeM)
              : { x: lon, y: lat, z: rangeM };
            this.viewer.camera.flyTo({
              destination: dest,
              duration: Math.max(1.0, 1.8 / this.speed),
            });
          }
        } catch (err) {
          console.warn('[urlLayerTour] camera flyTo point error:', err);
        }

        // Notify app selection callback
        if (typeof this.onSelectCallback === 'function' && stop.rawRef) {
          this.onSelectCallback(stop.rawRef);
        }
      }
    }
  }

  /**
   * Starts a gentle 3D surveillance inspection orbit around the active target point.
   * Inspired by OpenLayers' "Rotate around target" view animation.
   * @param {Cesium.Cartesian3} targetPos
   * @param {number} radius
   * @param {number} pitchDeg
   */
  _startDwellOrbit(targetPos, radius, pitchDeg) {
    this._stopDwellOrbit();
    if (!this.viewer || !this.viewer.scene?.preRender || this.status !== 'playing') return;

    this._activeOrbitTarget = targetPos;
    this._orbitAngle = this.viewer.camera?.heading || 0;
    // Gentle inspection yaw: ~3.0° per second adjusted by speed
    const orbitSpeedRadPerSec = (typeof Cesium !== 'undefined' && Cesium.Math?.toRadians)
      ? Cesium.Math.toRadians(3.0 * this.speed)
      : (3.0 * Math.PI / 180) * this.speed;

    let lastTime = Date.now();
    this._orbitRemoveListener = this.viewer.scene.preRender.addEventListener(() => {
      if (this.status !== 'playing' || !this._activeOrbitTarget) {
        this._stopDwellOrbit();
        return;
      }
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      this._orbitAngle += orbitSpeedRadPerSec * dt;
      if (typeof Cesium !== 'undefined' && Cesium.HeadingPitchRange) {
        const hpr = new Cesium.HeadingPitchRange(
          this._orbitAngle,
          Cesium.Math.toRadians(pitchDeg),
          radius
        );
        try {
          this.viewer.camera.lookAt(this._activeOrbitTarget, hpr);
        } catch {}
      }
    });
  }

  /**
   * Cleans up active inspection orbit and unlocks camera transform.
   */
  _stopDwellOrbit() {
    if (this._orbitRemoveListener) {
      try {
        this._orbitRemoveListener();
      } catch {}
      this._orbitRemoveListener = null;
    }
    if (this.viewer?.camera?.lookAtTransform && typeof Cesium !== 'undefined' && Cesium.Matrix4?.IDENTITY) {
      try {
        this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } catch {}
    }
    this._activeOrbitTarget = null;
  }

  _startDwellTimer() {
    this._clearTimers();
    if (this.status !== 'playing') return;

    const totalDwellMs = Math.max(1000, (this.dwellDurationSec * 1000) / this.speed);
    this.dwellRemainingSec = totalDwellMs / 1000;

    const stepMs = 200;
    this.intervalCountdown = setInterval(() => {
      this.dwellRemainingSec -= stepMs / 1000;
      if (this.dwellRemainingSec <= 0) {
        this.dwellRemainingSec = 0;
      }
      this._notify();
    }, stepMs);

    this.timer = setTimeout(() => {
      this._clearTimers();
      this.next();
    }, totalDwellMs);
  }

  _clearTimers() {
    this._stopDwellOrbit();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.intervalCountdown) {
      clearInterval(this.intervalCountdown);
      this.intervalCountdown = null;
    }
  }

  play() {
    if (this.stops.length === 0) return;
    this.status = 'playing';
    this._presentCurrentStop();
    this._startDwellTimer();
    this._notify();
  }

  pause() {
    this.status = 'paused';
    this._clearTimers();
    this._notify();
  }

  togglePlay() {
    if (this.status === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    if (this.stops.length === 0) return;
    this._clearTimers();
    this.currentIndex = (this.currentIndex + 1) % this.stops.length;
    this._presentCurrentStop();
    if (this.status === 'playing') {
      this._startDwellTimer();
    }
    this._notify();
  }

  prev() {
    if (this.stops.length === 0) return;
    this._clearTimers();
    this.currentIndex = (this.currentIndex - 1 + this.stops.length) % this.stops.length;
    this._presentCurrentStop();
    if (this.status === 'playing') {
      this._startDwellTimer();
    }
    this._notify();
  }

  goTo(index) {
    if (index < 0 || index >= this.stops.length) return;
    this._clearTimers();
    this.currentIndex = index;
    this._presentCurrentStop();
    if (this.status === 'playing') {
      this._startDwellTimer();
    }
    this._notify();
  }

  stop() {
    this.status = 'stopped';
    this._clearTimers();
    this.currentIndex = 0;
    this.dwellRemainingSec = 0;
    if (this.viewer) {
      clearAllTourHighlights(this.viewer);
    }
    this._notify();
  }

  exit() {
    this.stop();
    this.status = 'idle';
    this.stops = [];
    this._notify();
  }

  setSpeed(speedMultiplier) {
    const s = Number(speedMultiplier);
    if (!Number.isFinite(s) || s <= 0) return;
    this.speed = s;
    if (this.status === 'playing') {
      this._startDwellTimer(); // Recalculate remaining duration with new speed
    }
    this._notify();
  }

  setDuration(durationSec) {
    const d = Number(durationSec);
    if (!Number.isFinite(d) || d < 1) return;
    this.dwellDurationSec = d;
    if (this.status === 'playing') {
      this._startDwellTimer();
    }
    this._notify();
  }

  setAnimationMode(mode) {
    if (['swoop-orbit', 'glide-lock', 'nadir'].includes(mode)) {
      this.animationMode = mode;
      if (mode !== 'swoop-orbit') {
        this._stopDwellOrbit();
      }
      this._notify();
    }
  }
}
