/**
 * @file taxonomyImportExport.js
 * Mission-critical import, export, validation, and serialization engine
 * for 3-tier tactical GIS taxonomy schemas (JSON & CSV).
 */

import { TAXONOMY_CHAIN, registerCustomClassification } from './taxonomyData.js';
import { getAvailableCategories, registerCustomCategory } from './itemCategories.js';

const STORAGE_CUSTOM_LEVEL3_KEY = 'gev_custom_level3_taxonomy_v1';
const STORAGE_CUSTOM_CATEGORIES_KEY = 'gev_custom_map_categories_v1';

/**
 * Calculates current taxonomy statistics (domains, subcategories, classifications).
 * @returns {{ totalDomains: number, totalSubcategories: number, totalClassifications: number, customCount: number }}
 */
export function getTaxonomyStatistics() {
  const domains = getAvailableCategories();
  let subCount = 0;
  let l3Count = 0;

  for (const dom of domains) {
    subCount += (dom.subcategories || []).length;
    if (dom.subcategoriesDetailed) {
      for (const sub of dom.subcategoriesDetailed) {
        l3Count += (sub.level3Presets || []).length;
      }
    }
  }

  let customCount = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      const rawL3 = localStorage.getItem(STORAGE_CUSTOM_LEVEL3_KEY);
      if (rawL3) {
        const parsed = JSON.parse(rawL3);
        for (const list of Object.values(parsed)) {
          if (Array.isArray(list)) customCount += list.length;
        }
      }
      const rawCat = localStorage.getItem(STORAGE_CUSTOM_CATEGORIES_KEY);
      if (rawCat) {
        const parsed = JSON.parse(rawCat);
        customCount += Object.keys(parsed).length;
      }
    } catch (_e) {}
  }

  return {
    totalDomains: domains.length,
    totalSubcategories: subCount,
    totalClassifications: l3Count,
    customCount,
  };
}

/**
 * Exports the complete operational taxonomy tree as a structured JSON object.
 * @returns {Object} Full taxonomy bundle
 */
export function generateTaxonomyExportObject() {
  const categories = getAvailableCategories();
  const domainsExport = [];

  for (const cat of categories) {
    const domainNode = {
      id: cat.id || cat.name,
      name: cat.name,
      key: cat.key || cat.id,
      color: cat.accentColor || '#3b82f6',
      icon: cat.icon || 'folder',
      subcategories: [],
    };

    if (cat.subcategoriesDetailed && cat.subcategoriesDetailed.length > 0) {
      for (const sub of cat.subcategoriesDetailed) {
        domainNode.subcategories.push({
          key: sub.key,
          label: sub.label,
          level3Presets: Array.isArray(sub.level3Presets) ? [...sub.level3Presets] : [],
        });
      }
    } else if (Array.isArray(cat.subcategories)) {
      for (const subLabel of cat.subcategories) {
        domainNode.subcategories.push({
          key: subLabel,
          label: subLabel,
          level3Presets: ['General Facility', 'Operations Hub'],
        });
      }
    }

    domainsExport.push(domainNode);
  }

  let customL3 = {};
  let customCat = {};
  if (typeof localStorage !== 'undefined') {
    try {
      customL3 = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_LEVEL3_KEY) || '{}');
      customCat = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_CATEGORIES_KEY) || '{}');
    } catch (_e) {}
  }

  return {
    schema: 'gev_tactical_taxonomy_v1',
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    system: "God's Eye View Tactical Workbench",
    stats: getTaxonomyStatistics(),
    customStorage: {
      customClassifications: customL3,
      customCategories: customCat,
    },
    domains: domainsExport,
  };
}

/**
 * Exports taxonomy to a formatted JSON string.
 * @returns {string} JSON string
 */
export function exportTaxonomyToJsonString() {
  const exportObj = generateTaxonomyExportObject();
  return JSON.stringify(exportObj, null, 2);
}

/**
 * Exports taxonomy to a CSV string suitable for spreadsheet software.
 * Columns: Domain, Subcategory, Classification, DomainColor, DomainIcon
 * @returns {string} CSV string
 */
export function exportTaxonomyToCsvString() {
  const categories = getAvailableCategories();
  const rows = [['Domain', 'Subcategory', 'Classification', 'DomainColor', 'DomainIcon']];

  for (const cat of categories) {
    const domainName = `"${(cat.name || '').replace(/"/g, '""')}"`;
    const domainColor = `"${(cat.accentColor || '#3b82f6').replace(/"/g, '""')}"`;
    const domainIcon = `"${(cat.icon || 'folder').replace(/"/g, '""')}"`;

    if (cat.subcategoriesDetailed && cat.subcategoriesDetailed.length > 0) {
      for (const sub of cat.subcategoriesDetailed) {
        const subLabel = `"${(sub.label || '').replace(/"/g, '""')}"`;
        if (sub.level3Presets && sub.level3Presets.length > 0) {
          for (const l3 of sub.level3Presets) {
            const l3Label = `"${(l3 || '').replace(/"/g, '""')}"`;
            rows.push([domainName, subLabel, l3Label, domainColor, domainIcon]);
          }
        } else {
          rows.push([domainName, subLabel, '""', domainColor, domainIcon]);
        }
      }
    } else if (Array.isArray(cat.subcategories)) {
      for (const sub of cat.subcategories) {
        const subLabel = `"${(sub || '').replace(/"/g, '""')}"`;
        rows.push([domainName, subLabel, '""', domainColor, domainIcon]);
      }
    }
  }

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Validates an incoming taxonomy file (JSON or CSV) before applying.
 * @param {string} rawContent
 * @param {'json'|'csv'} [hintFormat='json']
 * @returns {{ valid: boolean, format: 'json'|'csv', data?: Object, count?: { domains: number, subcategories: number, classifications: number }, error?: string }}
 */
export function validateTaxonomyImport(rawContent, hintFormat = null) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { valid: false, error: 'Empty or invalid file content provided.' };
  }

  const trimmed = rawContent.trim();
  const isLikelyJson = hintFormat === 'json' || (hintFormat !== 'csv' && (trimmed.startsWith('{') || trimmed.startsWith('[')));

  // Try JSON
  if (isLikelyJson) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Root JSON payload must be an object.');
      }

      // Check structure: either a full exported schema or customStorage object
      let domains = Array.isArray(parsed.domains) ? parsed.domains : [];
      let totalL3 = 0;
      let totalSubs = 0;

      for (const dom of domains) {
        if (!dom.name) continue;
        if (Array.isArray(dom.subcategories)) {
          totalSubs += dom.subcategories.length;
          for (const sub of dom.subcategories) {
            if (sub && Array.isArray(sub.level3Presets)) {
              totalL3 += sub.level3Presets.length;
            }
          }
        }
      }

      // If domains array was not present, check customStorage
      if (domains.length === 0 && parsed.customStorage) {
        const l3Obj = parsed.customStorage.customClassifications || {};
        totalL3 = Object.values(l3Obj).reduce((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);
        totalSubs = Object.keys(l3Obj).length;
        domains = Object.keys(parsed.customStorage.customCategories || {});
      }

      return {
        valid: true,
        format: 'json',
        data: parsed,
        count: {
          domains: domains.length,
          subcategories: totalSubs,
          classifications: totalL3,
        },
      };
    } catch (e) {
      if (hintFormat === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return { valid: false, error: `Invalid JSON format: ${e.message}` };
      }
    }
  }

  // Parse CSV
  try {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return { valid: false, error: 'CSV file must have a header row and at least one data row.' };
    }

    const header = lines[0].toLowerCase();
    if (!header.includes('domain') || !header.includes('subcategory')) {
      return { valid: false, error: 'CSV header must include at least "Domain" and "Subcategory" columns.' };
    }

    const domainsSet = new Set();
    const subsSet = new Set();
    let classCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length >= 2 && parts[0]) {
        domainsSet.add(parts[0]);
        subsSet.add(`${parts[0]}:::${parts[1]}`);
        if (parts[2]) classCount++;
      }
    }

    return {
      valid: true,
      format: 'csv',
      data: { rawCsv: trimmed },
      count: {
        domains: domainsSet.size,
        subcategories: subsSet.size,
        classifications: classCount,
      },
    };
  } catch (err) {
    return { valid: false, error: `Unable to parse CSV taxonomy: ${err.message}` };
  }
}

/**
 * Basic RFC 4180 CSV line parser.
 */
function parseCsvLine(text) {
  const p = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      p.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  p.push(cur.trim());
  return p;
}

/**
 * Applies imported taxonomy data into the active runtime and persistent storage.
 * @param {Object} parsedResult - Validated result from validateTaxonomyImport
 * @param {'merge'|'replace'} [mode='merge'] - 'merge' adds new items; 'replace' replaces custom taxonomy
 * @returns {{ success: boolean, applied: { domains: number, subcategories: number, classifications: number } }}
 */
export function importTaxonomyData(parsedResult, mode = 'merge') {
  if (!parsedResult || !parsedResult.valid) {
    throw new Error('Cannot import invalid taxonomy payload.');
  }

  if (mode === 'replace') {
    resetTaxonomyToDefaults(false); // clear custom without firing event yet
  }

  let appliedDomains = 0;
  let appliedSubs = 0;
  let appliedL3 = 0;

  // Case A: JSON format
  if (parsedResult.format === 'json') {
    const payload = parsedResult.data;

    // 1. Process customStorage if present
    if (payload.customStorage) {
      const { customCategories, customClassifications } = payload.customStorage;
      if (customCategories && typeof customCategories === 'object') {
        for (const [catName, subList] of Object.entries(customCategories)) {
          if (Array.isArray(subList)) {
            for (const sub of subList) {
              registerCustomCategory(catName, sub);
              appliedSubs++;
            }
            appliedDomains++;
          }
        }
      }

      if (customClassifications && typeof customClassifications === 'object') {
        for (const [key, l3List] of Object.entries(customClassifications)) {
          const parts = key.split(':::');
          const dom = parts[0];
          const sub = parts[1] || 'General';
          if (Array.isArray(l3List)) {
            for (const l3 of l3List) {
              registerCustomClassification(dom, sub, l3);
              appliedL3++;
            }
          }
        }
      }
    }

    // 2. Process domains array if present
    if (Array.isArray(payload.domains)) {
      for (const dom of payload.domains) {
        if (!dom.name) continue;
        const domName = dom.name;
        if (Array.isArray(dom.subcategories)) {
          for (const sub of dom.subcategories) {
            const subLabel = typeof sub === 'string' ? sub : sub.label;
            if (!subLabel) continue;
            registerCustomCategory(domName, subLabel);
            appliedSubs++;

            if (sub && Array.isArray(sub.level3Presets)) {
              for (const l3 of sub.level3Presets) {
                registerCustomClassification(domName, subLabel, l3);
                appliedL3++;
              }
            }
          }
        }
        appliedDomains++;
      }
    }
  }

  // Case B: CSV format
  if (parsedResult.format === 'csv' && parsedResult.data?.rawCsv) {
    const lines = parsedResult.data.rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length >= 2) {
        const dom = parts[0];
        const sub = parts[1];
        const l3 = parts[2];
        if (dom && sub) {
          registerCustomCategory(dom, sub);
          appliedSubs++;
          if (l3) {
            registerCustomClassification(dom, sub, l3);
            appliedL3++;
          }
        }
      }
    }
  }

  // Broadcast update event so all open UI components refresh
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:taxonomy-updated', {
        detail: { mode, stats: getTaxonomyStatistics() },
      })
    );
  }

  return {
    success: true,
    applied: {
      domains: appliedDomains,
      subcategories: appliedSubs,
      classifications: appliedL3,
    },
  };
}

/**
 * Resets custom taxonomy back to system baseline defaults.
 * @param {boolean} [fireEvent=true]
 */
export function resetTaxonomyToDefaults(fireEvent = true) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_CUSTOM_LEVEL3_KEY);
    localStorage.removeItem(STORAGE_CUSTOM_CATEGORIES_KEY);
  }

  if (fireEvent && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:taxonomy-updated', {
        detail: { mode: 'reset', stats: getTaxonomyStatistics() },
      })
    );
  }
}
