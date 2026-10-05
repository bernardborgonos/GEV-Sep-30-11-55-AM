/**
 * @module src/data/itemCategories.js
 * Unified Category Registry integrating 3-Tier Taxonomy Module (taxonomyData.js).
 * Provides Level 1 (Domain), Level 2 (Subcategory), and Level 3 (Operational Classification)
 * definitions, plus local persistence for user-added custom categories and subcategories.
 */

import { 
  TAXONOMY_CHAIN, 
  getLevel1Options, 
  getLevel2Options, 
  getLevel3Presets, 
  registerCustomClassification,
  getDomainColor, 
  getDomainIcon,
  CUSTOM_PRESET_ICONS,
  getCustomIconForPreset,
  findTaxonomyMatch,
  generateTacticalSvgDataUrl,
  generateTacticalSvgString,
  resolveItemTacticalIcon,
  matchGlyphForLabel
} from './taxonomyData.js';

export { 
  TAXONOMY_CHAIN, 
  getLevel1Options, 
  getLevel2Options, 
  getLevel3Presets, 
  registerCustomClassification,
  getDomainColor, 
  getDomainIcon,
  CUSTOM_PRESET_ICONS,
  getCustomIconForPreset,
  findTaxonomyMatch,
  generateTacticalSvgDataUrl,
  generateTacticalSvgString,
  resolveItemTacticalIcon,
  matchGlyphForLabel
};

const STORAGE_CUSTOM_CATEGORIES_KEY = 'gev_custom_map_categories_v1';

/**
 * Default categories compiled dynamically from the primary TAXONOMY_CHAIN.
 */
export const DEFAULT_CATEGORIES_TAXONOMY = Object.entries(TAXONOMY_CHAIN).map(([key, domain]) => ({
  id: domain.label,
  key,
  name: domain.label,
  icon: domain.defaultIcon,
  accentColor: domain.color,
  subcategories: Object.values(domain.subcategories).map((sub) => sub.label),
  subcategoriesDetailed: Object.entries(domain.subcategories).map(([subKey, sub]) => ({
    key: subKey,
    label: sub.label,
    level3Presets: [...(sub.level3Presets || [])],
  })),
}));

/**
 * Loads custom categories from LocalStorage and merges with TAXONOMY_CHAIN defaults.
 * @returns {Array<{ id: string, key?: string, name: string, icon: string, accentColor: string, subcategories: string[] }>}
 */
export function getAvailableCategories() {
  let custom = {};
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_CATEGORIES_KEY);
    if (raw) {
      custom = JSON.parse(raw);
    }
  } catch (_e) {
    custom = {};
  }

  // Clone default categories derived from TAXONOMY_CHAIN
  const categories = DEFAULT_CATEGORIES_TAXONOMY.map((c) => ({
    ...c,
    subcategories: [...c.subcategories],
  }));

  // Merge custom subcategories into existing categories
  for (const cat of categories) {
    const customList = custom[cat.name] || custom[cat.key] || custom[cat.id];
    if (customList && Array.isArray(customList)) {
      for (const sub of customList) {
        if (!cat.subcategories.includes(sub)) {
          cat.subcategories.push(sub);
        }
      }
    }
  }

  // Add any completely new primary categories created by the user
  for (const [catName, subList] of Object.entries(custom)) {
    if (!categories.some((c) => c.name.toLowerCase() === catName.toLowerCase())) {
      categories.push({
        id: catName,
        name: catName,
        icon: 'folder',
        accentColor: '#a855f7',
        subcategories: Array.isArray(subList) ? [...subList] : ['General'],
      });
    }
  }

  return categories;
}

/**
 * Persists a new category or subcategory into storage.
 * @param {string} categoryName
 * @param {string} [subcategoryName]
 */
export function registerCustomCategory(categoryName, subcategoryName) {
  if (!categoryName || typeof categoryName !== 'string') return;
  const cleanCat = categoryName.trim();
  const cleanSub = subcategoryName ? subcategoryName.trim() : 'General';

  if (typeof localStorage === 'undefined') return;

  try {
    let custom = {};
    const raw = localStorage.getItem(STORAGE_CUSTOM_CATEGORIES_KEY);
    if (raw) custom = JSON.parse(raw);

    if (!custom[cleanCat]) {
      custom[cleanCat] = [];
    }

    if (cleanSub && !custom[cleanCat].includes(cleanSub)) {
      custom[cleanCat].push(cleanSub);
    }

    localStorage.setItem(STORAGE_CUSTOM_CATEGORIES_KEY, JSON.stringify(custom));
  } catch (err) {
    console.warn('[itemCategories] Failed to persist custom category:', err);
  }
}

/**
 * Helper to get color for a category (Level 1 name or key)
 * @param {string} categoryName
 * @returns {string} Hex color
 */
export function getCategoryColor(categoryName) {
  if (!categoryName) return '#38bdf8';
  return getDomainColor(categoryName);
}

/**
 * Helper to get Material Symbols icon name for a category
 * @param {string} categoryName
 * @returns {string} Icon identifier
 */
export function getCategoryIcon(categoryName) {
  if (!categoryName) return 'folder';
  const lower = categoryName.toLowerCase();
  if (lower === 'general') return 'folder';
  return getDomainIcon(categoryName);
}
