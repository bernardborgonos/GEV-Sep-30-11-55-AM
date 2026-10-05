/**
 * @module unescoData
 * @description Curated national indicators benchmark sourced from the UNESCO Institute
 * for Statistics (UIS) Data API (https://api.uis.unesco.org/).
 *
 * Covers core Science, Technology & Innovation (STI - SDG 9.5) and Education (SDG 4)
 * metrics across sovereign nations worldwide.
 */

export const UNESCO_INDICATORS = Object.freeze({
  GERD: 'gerd', // EXPGDP.TOT: GERD as % of GDP (SDG 9.5.1)
  RESEARCHERS: 'researchers', // RESDEN.INHAB.TFTE: Researchers per million inhabitants (FTE) (SDG 9.5.2)
  TERTIARY: 'tertiary', // GER.5T8: Gross tertiary enrolment ratio (%)
  EDUCATION: 'education', // XGDP.FSGOV: Government expenditure on education as % of GDP (%)
});

export const UNESCO_INDICATOR_CONFIG = Object.freeze({
  gerd: {
    id: 'gerd',
    label: 'R&D Spend',
    fullLabel: 'R&D Expenditure (% GDP)',
    unit: '% of GDP',
    uisCode: 'EXPGDP.TOT',
    description: 'Gross Domestic Expenditure on R&D (GERD) as percentage of GDP (SDG 9.5.1)',
    format: (v) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : '—'),
    getColor: (v) => {
      if (!Number.isFinite(v)) return '#64748b'; // slate-500
      if (v >= 3.0) return '#10b981'; // emerald-500 (Global Top Tier: >3%)
      if (v >= 1.7) return '#06b6d4'; // cyan-500 (Advanced: 1.7-3%)
      if (v >= 0.8) return '#f59e0b'; // amber-500 (Moderate: 0.8-1.7%)
      return '#f43f5e'; // rose-500 (Developing: <0.8%)
    },
    tiers: [
      { label: '≥ 3.0% (World Leader)', color: '#10b981' },
      { label: '1.7% – 3.0% (Advanced)', color: '#06b6d4' },
      { label: '0.8% – 1.7% (Moderate)', color: '#f59e0b' },
      { label: '< 0.8% (Developing)', color: '#f43f5e' },
    ],
  },
  researchers: {
    id: 'researchers',
    label: 'Researchers',
    fullLabel: 'Researchers (/M FTE)',
    unit: 'per million',
    uisCode: 'RESDEN.INHAB.TFTE',
    description: 'Researchers per million inhabitants in Full-Time Equivalents (SDG 9.5.2)',
    format: (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()}` : '—'),
    getColor: (v) => {
      if (!Number.isFinite(v)) return '#64748b';
      if (v >= 5000) return '#8b5cf6'; // violet-500 (>5000 /M)
      if (v >= 2500) return '#3b82f6'; // blue-500 (2500-5000 /M)
      if (v >= 800) return '#0ea5e9'; // sky-500 (800-2500 /M)
      return '#f97316'; // orange-500 (<800 /M)
    },
    tiers: [
      { label: '≥ 5,000 /M (High Density)', color: '#8b5cf6' },
      { label: '2,500 – 5,000 /M', color: '#3b82f6' },
      { label: '800 – 2,500 /M', color: '#0ea5e9' },
      { label: '< 800 /M', color: '#f97316' },
    ],
  },
  tertiary: {
    id: 'tertiary',
    label: 'Tertiary Ed',
    fullLabel: 'Tertiary Enrolment (%)',
    unit: '% gross',
    uisCode: 'GER.5T8',
    description: 'Gross enrolment ratio in tertiary education, both sexes',
    format: (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '—'),
    getColor: (v) => {
      if (!Number.isFinite(v)) return '#64748b';
      if (v >= 80) return '#6366f1'; // indigo-500 (≥80%)
      if (v >= 55) return '#06b6d4'; // cyan-500 (55-80%)
      if (v >= 30) return '#10b981'; // emerald-500 (30-55%)
      return '#f59e0b'; // amber-500 (<30%)
    },
    tiers: [
      { label: '≥ 80% (High Higher Ed)', color: '#6366f1' },
      { label: '55% – 80%', color: '#06b6d4' },
      { label: '30% – 55%', color: '#10b981' },
      { label: '< 30%', color: '#f59e0b' },
    ],
  },
  education: {
    id: 'education',
    label: 'Gov Ed Spend',
    fullLabel: 'Gov Education Spend (% GDP)',
    unit: '% of GDP',
    uisCode: 'XGDP.FSGOV',
    description: 'Government expenditure on education as percentage of GDP (SDG 1.a.2)',
    format: (v) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : '—'),
    getColor: (v) => {
      if (!Number.isFinite(v)) return '#64748b';
      if (v >= 6.0) return '#a855f7'; // purple-500 (≥6.0%)
      if (v >= 4.5) return '#3b82f6'; // blue-500 (4.5-6.0%)
      if (v >= 3.0) return '#14b8a6'; // teal-500 (3.0-4.5%)
      return '#f43f5e'; // rose-500 (<3.0%)
    },
    tiers: [
      { label: '≥ 6.0% of GDP', color: '#a855f7' },
      { label: '4.5% – 6.0%', color: '#3b82f6' },
      { label: '3.0% – 4.5%', color: '#14b8a6' },
      { label: '< 3.0%', color: '#f43f5e' },
    ],
  },
});

export const UNESCO_BENCHMARK_COUNTRIES = Object.freeze([
  // North America
  { id: 'USA', code2: 'US', name: 'United States', lat: 38.8951, lon: -77.0364, region: 'North America', gerd: 3.45, researchers: 4937, tertiary: 79.4, education: 5.42 },
  { id: 'CAN', code2: 'CA', name: 'Canada', lat: 45.4215, lon: -75.6972, region: 'North America', gerd: 1.79, researchers: 5624, tertiary: 76.3, education: 4.84 },
  { id: 'MEX', code2: 'MX', name: 'Mexico', lat: 19.4326, lon: -99.1332, region: 'Latin America', gerd: 0.25, researchers: 438, tertiary: 48.2, education: 4.06 },

  // Latin America & Caribbean
  { id: 'BRA', code2: 'BR', name: 'Brazil', lat: -15.7975, lon: -47.8919, region: 'Latin America', gerd: 1.19, researchers: 924, tertiary: 69.7, education: 5.62 },
  { id: 'ARG', code2: 'AR', name: 'Argentina', lat: -34.6037, lon: -58.3816, region: 'Latin America', gerd: 0.52, researchers: 1240, tertiary: 95.8, education: 4.98 },
  { id: 'CHL', code2: 'CL', name: 'Chile', lat: -33.4489, lon: -70.6693, region: 'Latin America', gerd: 0.38, researchers: 512, tertiary: 94.2, education: 5.40 },
  { id: 'COL', code2: 'CO', name: 'Colombia', lat: 4.7110, lon: -74.0721, region: 'Latin America', gerd: 0.32, researchers: 215, tertiary: 58.1, education: 4.54 },
  { id: 'PER', code2: 'PE', name: 'Peru', lat: -12.0464, lon: -77.0428, region: 'Latin America', gerd: 0.17, researchers: 142, tertiary: 72.5, education: 4.19 },
  { id: 'URY', code2: 'UY', name: 'Uruguay', lat: -34.9011, lon: -56.1645, region: 'Latin America', gerd: 0.48, researchers: 780, tertiary: 65.2, education: 4.60 },
  { id: 'CRI', code2: 'CR', name: 'Costa Rica', lat: 9.9281, lon: -84.0907, region: 'Latin America', gerd: 0.43, researchers: 420, tertiary: 57.8, education: 6.80 },

  // Europe
  { id: 'GBR', code2: 'GB', name: 'United Kingdom', lat: 51.5074, lon: -0.1278, region: 'Europe', gerd: 2.68, researchers: 4810, tertiary: 80.4, education: 5.91 },
  { id: 'DEU', code2: 'DE', name: 'Germany', lat: 52.5200, lon: 13.4050, region: 'Europe', gerd: 3.15, researchers: 5926, tertiary: 76.7, education: 5.24 },
  { id: 'FRA', code2: 'FR', name: 'France', lat: 48.8566, lon: 2.3522, region: 'Europe', gerd: 2.18, researchers: 5369, tertiary: 71.5, education: 5.32 },
  { id: 'ITA', code2: 'IT', name: 'Italy', lat: 41.9028, lon: 12.4964, region: 'Europe', gerd: 1.45, researchers: 2680, tertiary: 65.4, education: 4.15 },
  { id: 'ESP', code2: 'ES', name: 'Spain', lat: 40.4168, lon: -3.7038, region: 'Europe', gerd: 1.44, researchers: 3120, tertiary: 92.1, education: 4.59 },
  { id: 'NLD', code2: 'NL', name: 'Netherlands', lat: 52.3676, lon: 4.9041, region: 'Europe', gerd: 2.30, researchers: 5820, tertiary: 91.2, education: 5.25 },
  { id: 'CHE', code2: 'CH', name: 'Switzerland', lat: 46.9480, lon: 7.4474, region: 'Europe', gerd: 3.22, researchers: 6108, tertiary: 73.5, education: 4.86 },
  { id: 'SWE', code2: 'SE', name: 'Sweden', lat: 59.3293, lon: 18.0686, region: 'Europe', gerd: 3.60, researchers: 8911, tertiary: 84.0, education: 7.32 },
  { id: 'NOR', code2: 'NO', name: 'Norway', lat: 59.9139, lon: 10.7522, region: 'Europe', gerd: 2.04, researchers: 6240, tertiary: 86.8, education: 6.84 },
  { id: 'FIN', code2: 'FI', name: 'Finland', lat: 60.1699, lon: 24.9384, region: 'Europe', gerd: 2.99, researchers: 7650, tertiary: 98.4, education: 6.28 },
  { id: 'DNK', code2: 'DK', name: 'Denmark', lat: 55.6761, lon: 12.5683, region: 'Europe', gerd: 2.89, researchers: 8210, tertiary: 88.5, education: 6.42 },
  { id: 'BEL', code2: 'BE', name: 'Belgium', lat: 50.8503, lon: 4.3517, region: 'Europe', gerd: 3.48, researchers: 5910, tertiary: 82.3, education: 6.35 },
  { id: 'AUT', code2: 'AT', name: 'Austria', lat: 48.2082, lon: 16.3738, region: 'Europe', gerd: 3.26, researchers: 5740, tertiary: 93.1, education: 4.90 },
  { id: 'IRL', code2: 'IE', name: 'Ireland', lat: 53.3498, lon: -6.2603, region: 'Europe', gerd: 1.15, researchers: 4620, tertiary: 85.6, education: 3.12 },
  { id: 'POL', code2: 'PL', name: 'Poland', lat: 52.2297, lon: 21.0122, region: 'Europe', gerd: 1.46, researchers: 3510, tertiary: 68.9, education: 4.65 },
  { id: 'PRT', code2: 'PT', name: 'Portugal', lat: 38.7223, lon: -9.1393, region: 'Europe', gerd: 1.70, researchers: 4890, tertiary: 75.3, education: 4.72 },
  { id: 'GRC', code2: 'GR', name: 'Greece', lat: 37.9838, lon: 23.7275, region: 'Europe', gerd: 1.49, researchers: 4410, tertiary: 153.2, education: 4.10 },
  { id: 'CZE', code2: 'CZ', name: 'Czechia', lat: 50.0755, lon: 14.4378, region: 'Europe', gerd: 1.96, researchers: 4250, tertiary: 67.4, education: 4.68 },
  { id: 'HUN', code2: 'HU', name: 'Hungary', lat: 47.4979, lon: 19.0402, region: 'Europe', gerd: 1.41, researchers: 3820, tertiary: 53.8, education: 4.71 },
  { id: 'ROU', code2: 'RO', name: 'Romania', lat: 44.4268, lon: 26.1025, region: 'Europe', gerd: 0.47, researchers: 1020, tertiary: 55.6, education: 3.25 },
  { id: 'UKR', code2: 'UA', name: 'Ukraine', lat: 50.4501, lon: 30.5234, region: 'Europe', gerd: 0.38, researchers: 980, tertiary: 79.8, education: 5.68 },

  // Middle East & North Africa
  { id: 'TUR', code2: 'TR', name: 'Türkiye', lat: 39.9334, lon: 32.8597, region: 'Middle East', gerd: 1.40, researchers: 2340, tertiary: 120.4, education: 3.85 },
  { id: 'ISR', code2: 'IL', name: 'Israel', lat: 31.7683, lon: 35.2137, region: 'Middle East', gerd: 6.35, researchers: 8850, tertiary: 56.3, education: 5.93 },
  { id: 'SAU', code2: 'SA', name: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, region: 'Middle East', gerd: 0.52, researchers: 680, tertiary: 76.5, education: 7.82 },
  { id: 'ARE', code2: 'AE', name: 'United Arab Emirates', lat: 24.4539, lon: 54.3773, region: 'Middle East', gerd: 1.50, researchers: 2420, tertiary: 61.2, education: 3.10 },
  { id: 'QAT', code2: 'QA', name: 'Qatar', lat: 25.2854, lon: 51.5310, region: 'Middle East', gerd: 0.68, researchers: 1450, tertiary: 28.5, education: 3.20 },
  { id: 'KWT', code2: 'KW', name: 'Kuwait', lat: 29.3759, lon: 47.9774, region: 'Middle East', gerd: 0.22, researchers: 480, tertiary: 64.2, education: 6.60 },
  { id: 'JOR', code2: 'JO', name: 'Jordan', lat: 31.9454, lon: 35.9284, region: 'Middle East', gerd: 0.70, researchers: 610, tertiary: 42.1, education: 3.60 },
  { id: 'EGY', code2: 'EG', name: 'Egypt', lat: 30.0444, lon: 31.2357, region: 'Africa', gerd: 1.02, researchers: 1120, tertiary: 37.6, education: 3.80 },
  { id: 'MAR', code2: 'MA', name: 'Morocco', lat: 34.0209, lon: -6.8416, region: 'Africa', gerd: 0.75, researchers: 1080, tertiary: 44.8, education: 5.90 },

  // Sub-Saharan Africa
  { id: 'ZAF', code2: 'ZA', name: 'South Africa', lat: -25.7479, lon: 28.2293, region: 'Africa', gerd: 0.61, researchers: 444, tertiary: 23.5, education: 6.02 },
  { id: 'NGA', code2: 'NG', name: 'Nigeria', lat: 9.0765, lon: 7.3986, region: 'Africa', gerd: 0.28, researchers: 22, tertiary: 12.5, education: 1.80 },
  { id: 'KEN', code2: 'KE', name: 'Kenya', lat: -1.2921, lon: 36.8219, region: 'Africa', gerd: 0.65, researchers: 280, tertiary: 11.2, education: 5.10 },
  { id: 'GHA', code2: 'GH', name: 'Ghana', lat: 5.6037, lon: -0.1870, region: 'Africa', gerd: 0.38, researchers: 110, tertiary: 20.4, education: 3.60 },
  { id: 'ETH', code2: 'ET', name: 'Ethiopia', lat: 9.0320, lon: 38.7482, region: 'Africa', gerd: 0.27, researchers: 85, tertiary: 13.1, education: 4.70 },
  { id: 'RWA', code2: 'RW', name: 'Rwanda', lat: -1.9441, lon: 30.0619, region: 'Africa', gerd: 0.66, researchers: 98, tertiary: 12.0, education: 3.80 },

  // East & Southeast Asia
  { id: 'JPN', code2: 'JP', name: 'Japan', lat: 35.6762, lon: 139.6503, region: 'East Asia', gerd: 3.44, researchers: 5609, tertiary: 64.5, education: 3.34 },
  { id: 'KOR', code2: 'KR', name: 'South Korea', lat: 37.5665, lon: 126.9780, region: 'East Asia', gerd: 4.94, researchers: 9472, tertiary: 111.9, education: 5.41 },
  { id: 'CHN', code2: 'CN', name: 'China', lat: 39.9042, lon: 116.4074, region: 'East Asia', gerd: 2.58, researchers: 2107, tertiary: 76.9, education: 3.90 },
  { id: 'TWN', code2: 'TW', name: 'Taiwan', lat: 25.0330, lon: 121.5654, region: 'East Asia', gerd: 3.79, researchers: 8120, tertiary: 89.2, education: 4.50 },
  { id: 'MNG', code2: 'MN', name: 'Mongolia', lat: 47.9212, lon: 106.9186, region: 'East Asia', gerd: 0.16, researchers: 320, tertiary: 68.4, education: 4.80 },
  { id: 'SGP', code2: 'SG', name: 'Singapore', lat: 1.3521, lon: 103.8198, region: 'Southeast Asia', gerd: 1.81, researchers: 8782, tertiary: 97.3, education: 2.19 },
  { id: 'PHL', code2: 'PH', name: 'Philippines', lat: 14.5995, lon: 120.9842, region: 'Southeast Asia', gerd: 0.28, researchers: 320, tertiary: 47.4, education: 3.93 },
  { id: 'MYS', code2: 'MY', name: 'Malaysia', lat: 3.1390, lon: 101.6869, region: 'Southeast Asia', gerd: 0.95, researchers: 2180, tertiary: 48.6, education: 4.20 },
  { id: 'IDN', code2: 'ID', name: 'Indonesia', lat: -6.2088, lon: 106.8456, region: 'Southeast Asia', gerd: 0.28, researchers: 380, tertiary: 37.8, education: 2.90 },
  { id: 'THA', code2: 'TH', name: 'Thailand', lat: 13.7563, lon: 100.5018, region: 'Southeast Asia', gerd: 1.21, researchers: 1790, tertiary: 51.2, education: 3.10 },
  { id: 'VNM', code2: 'VN', name: 'Vietnam', lat: 21.0285, lon: 105.8542, region: 'Southeast Asia', gerd: 0.53, researchers: 740, tertiary: 38.6, education: 4.10 },

  // South Asia
  { id: 'IND', code2: 'IN', name: 'India', lat: 28.6139, lon: 77.2090, region: 'South Asia', gerd: 0.65, researchers: 259, tertiary: 34.4, education: 4.10 },
  { id: 'PAK', code2: 'PK', name: 'Pakistan', lat: 33.6844, lon: 73.0479, region: 'South Asia', gerd: 0.24, researchers: 180, tertiary: 13.8, education: 1.70 },
  { id: 'BGD', code2: 'BD', name: 'Bangladesh', lat: 23.8103, lon: 90.4125, region: 'South Asia', gerd: 0.30, researchers: 125, tertiary: 24.2, education: 1.85 },
  { id: 'LKA', code2: 'LK', name: 'Sri Lanka', lat: 6.9271, lon: 79.8612, region: 'South Asia', gerd: 0.12, researchers: 110, tertiary: 21.8, education: 1.60 },

  // Oceania
  { id: 'AUS', code2: 'AU', name: 'Australia', lat: -35.2809, lon: 149.1300, region: 'Oceania', gerd: 1.86, researchers: 4650, tertiary: 108.4, education: 5.06 },
  { id: 'NZL', code2: 'NZ', name: 'New Zealand', lat: -41.2865, lon: 174.7762, region: 'Oceania', gerd: 1.47, researchers: 5210, tertiary: 82.5, education: 5.80 },
]);

const COUNTRY_BY_CODE3 = new Map(UNESCO_BENCHMARK_COUNTRIES.map((c) => [c.id.toUpperCase(), c]));
const COUNTRY_BY_CODE2 = new Map(UNESCO_BENCHMARK_COUNTRIES.map((c) => [c.code2.toUpperCase(), c]));
const COUNTRY_BY_NAME = new Map(UNESCO_BENCHMARK_COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/**
 * Lookup a country by ISO code (2-letter or 3-letter) or name.
 * @param {string} identifier - Code or country name
 * @returns {Object|null}
 */
export function lookupUnescoCountry(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const raw = identifier.trim();
  const upper = raw.toUpperCase();
  if (upper.length === 3 && COUNTRY_BY_CODE3.has(upper)) {
    return COUNTRY_BY_CODE3.get(upper);
  }
  if (upper.length === 2 && COUNTRY_BY_CODE2.has(upper)) {
    return COUNTRY_BY_CODE2.get(upper);
  }
  const lower = raw.toLowerCase();
  if (COUNTRY_BY_NAME.has(lower)) {
    return COUNTRY_BY_NAME.get(lower);
  }
  for (const c of UNESCO_BENCHMARK_COUNTRIES) {
    if (c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) {
      return c;
    }
  }
  return null;
}

export default UNESCO_BENCHMARK_COUNTRIES;
