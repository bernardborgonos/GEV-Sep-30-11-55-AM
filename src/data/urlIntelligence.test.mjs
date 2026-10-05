import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  PH_PORTS_OF_ENTRY,
  PH_KNOWN_OFFICE_COORDS,
  lookupPhilippineCoordinates,
} from './fixtures/philippineGeoData.js';
import {
  extractHtmlTableEntities,
  getCategoryColor,
  resolvePointCoordinates,
  CATEGORY_COLORS,
} from './urlLayerIngest.js';
import urlIntelligenceLayer, {
  URL_INTELLIGENCE_LAYER_ID,
  createUrlIntelligenceOverlayEntry,
  setUrlDetailsBoxProfile,
  getUrlDetailsBoxProfile,
  setUrlLeaderStyle,
  getUrlLeaderStyle,
} from './urlIntelligence.js';
import { LAYER_STATE_REGISTRY } from './layerState.js';

test('Philippine geo database covers major ports, airports, and regional offices', () => {
  const totalCount = PH_PORTS_OF_ENTRY.length + Object.keys(PH_KNOWN_OFFICE_COORDS).length;
  assert.ok(totalCount >= 80, 'Contains over 80 pre-mapped locations');

  // Check key international airports
  const naia = lookupPhilippineCoordinates('NAIA Terminal 3');
  assert.ok(naia, 'Found NAIA coords');
  assert.ok(Math.abs(naia.lat - 14.52) < 0.1, 'NAIA latitude is correct');

  const clark = lookupPhilippineCoordinates('Clark International Airport');
  assert.ok(clark, 'Found Clark coords');
  assert.ok(Math.abs(clark.lat - 15.18) < 0.1, 'Clark latitude is correct');

  const cebu = lookupPhilippineCoordinates('Mactan-Cebu International Airport');
  assert.ok(cebu, 'Found Cebu coords');
  assert.ok(Math.abs(cebu.lat - 10.31) < 0.1, 'Cebu latitude is correct');

  const davao = lookupPhilippineCoordinates('Davao International Airport');
  assert.ok(davao, 'Found Davao coords');
  assert.ok(Math.abs(davao.lat - 7.12) < 0.1, 'Davao latitude is correct');
});

test('resolvePointCoordinates resolves regional city and provincial coordinates', () => {
  const manila = resolvePointCoordinates({ name: 'Bureau of Immigration Head Office', address: 'Intramuros, Manila' });
  assert.ok(manila, 'Resolved Manila head office');
  assert.ok(Math.abs(manila.lat - 14.59) < 0.1);

  const iloilo = resolvePointCoordinates({ name: 'Iloilo Field Office', address: 'Custom House, Iloilo City' });
  assert.ok(iloilo, 'Resolved Iloilo field office');
  assert.ok(Math.abs(iloilo.lat - 10.7) < 0.5);

  const zamboanga = resolvePointCoordinates({ name: 'Zamboanga District Office', address: '' });
  assert.ok(zamboanga, 'Resolved Zamboanga');
  assert.ok(Math.abs(zamboanga.lat - 6.9) < 0.5);
});

test('extractHtmlTableEntities correctly parses HTML table rows and categorizes entries', () => {
  const sampleHtml = `
    <table class="supsystic-table">
      <thead>
        <tr>
          <th>Airport Name</th>
          <th>Location / Terminal</th>
          <th>Contact Number</th>
          <th>Officer-in-Charge</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ninoy Aquino International Airport (NAIA)</td>
          <td>NAIA Complex, Pasay City, Metro Manila</td>
          <td>(02) 8877-1109</td>
          <td>Airport Operations Division</td>
        </tr>
        <tr>
          <td>Bacolod Field Office</td>
          <td>Old Airport Road, Bacolod City, Negros Occidental</td>
          <td>(034) 433-2882</td>
          <td>Alien Control Officer</td>
        </tr>
      </tbody>
    </table>
  `;

  const entities = extractHtmlTableEntities(sampleHtml, 'https://immigration.gov.ph/contacts/');
  assert.equal(entities.length, 2, 'Parsed exactly 2 rows');

  const airport = entities.find((e) => e.name.includes('NAIA'));
  assert.ok(airport, 'Found NAIA entity');
  assert.equal(airport.category, 'Airport', 'Correctly categorized as Airport');
  const airportCoords = resolvePointCoordinates(airport);
  assert.ok(airportCoords && Number.isFinite(airportCoords.lat) && Number.isFinite(airportCoords.lon), 'Has valid coordinates');

  const fieldOffice = entities.find((e) => e.name.includes('Bacolod'));
  assert.ok(fieldOffice, 'Found Bacolod field office');
  assert.equal(fieldOffice.category, 'Field Office', 'Correctly categorized as Field Office');
});

test('CATEGORY_COLORS provides valid hex colors for all entity types', () => {
  const categories = ['Airport', 'Seaport', 'Border Crossing', 'District Office', 'Field Office', 'Main Office'];
  for (const cat of categories) {
    const color = getCategoryColor(cat);
    assert.match(color, /^#[0-9a-fA-F]{6}$/, `Category ${cat} has valid hex color`);
  }
});

test('URL Intelligence layer is registered in LAYER_STATE_REGISTRY with token y', () => {
  const entry = LAYER_STATE_REGISTRY.find((l) => l.id === URL_INTELLIGENCE_LAYER_ID);
  assert.ok(entry, 'Found url-intelligence in registry');
  assert.equal(entry.token, 'y', 'Has token y');
  assert.equal(entry.disposition, 'enabled-only');
});

test('urlIntelligenceLayer exposes standard lifecycle and control methods', () => {
  assert.equal(urlIntelligenceLayer.id, 'url-intelligence');
  assert.ok(typeof urlIntelligenceLayer.init === 'function');
  assert.ok(typeof urlIntelligenceLayer.enable === 'function');
  assert.ok(typeof urlIntelligenceLayer.disable === 'function');
  assert.ok(typeof urlIntelligenceLayer.getStats === 'function');
  assert.ok(typeof urlIntelligenceLayer.getRowControls === 'function');
  assert.ok(typeof urlIntelligenceLayer.setParams === 'function');

  const stats = urlIntelligenceLayer.getStats();
  assert.ok(typeof stats.count === 'number');
  assert.ok(typeof stats.url === 'string');

  const controls = urlIntelligenceLayer.getRowControls();
  assert.ok(Array.isArray(controls.chips));
  assert.ok(controls.chips.some((c) => c.id === 'category-all'));
  assert.ok(controls.chips.some((c) => c.id === 'action-analyze-url'));
});

test('createUrlIntelligenceOverlayEntry produces valid HUD card payload', () => {
  const mockPoint = {
    name: 'NAIA Terminal 3 Port of Entry',
    category: 'Airport',
    address: 'Pasay City, Metro Manila',
    contact: '+63 2 8877-1109',
    details: '24/7 International Port of Entry & Exit',
    color: '#00e5ff',
    lat: 14.52,
    lon: 121.01,
  };
  const pos = Cesium.Cartesian3.fromDegrees(121.01, 14.52, 100);
  const card = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos);

  assert.ok(card);
  assert.equal(card.id, 'url-intelligence:naia-t3');
  assert.equal(card.variant, 'selected');
  assert.ok(card.details.length >= 2);
  assert.ok(card.details.some((d) => d.includes('AIRPORT')));
  assert.equal(card.accent, '#00e5ff');
  assert.equal(card.placement, 'above');
  assert.equal(card.minAnchorGapPx, 95);
  assert.equal(card.dimensionProfile, 'standard');
  assert.equal(card.maxWidthPx, 300);
  assert.equal(card.leaderType, 'straight');
  assert.equal(card.arrowType, 'single_point');

  // Test explicit dimension profiles
  const compactCard = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos, { dimensionProfile: 'compact' });
  assert.equal(compactCard.dimensionProfile, 'compact');
  assert.equal(compactCard.maxWidthPx, 230);
  assert.equal(compactCard.minAnchorGapPx, 75);

  const expandedCard = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos, { dimensionProfile: 'expanded' });
  assert.equal(expandedCard.dimensionProfile, 'expanded');
  assert.equal(expandedCard.maxWidthPx, 380);

  const wideCard = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos, { dimensionProfile: 'wide' });
  assert.equal(wideCard.dimensionProfile, 'wide');
  assert.equal(wideCard.maxWidthPx, 440);
  assert.equal(wideCard.minWidthPx, 340);

  // Test profile state management
  setUrlDetailsBoxProfile('expanded');
  assert.equal(getUrlDetailsBoxProfile(), 'expanded');
  const reactiveCard = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos);
  assert.equal(reactiveCard.dimensionProfile, 'expanded');
  assert.equal(reactiveCard.maxWidthPx, 380);

  // Reset to standard
  setUrlDetailsBoxProfile('standard');
  assert.equal(getUrlDetailsBoxProfile(), 'standard');

  // Test leader style configuration
  setUrlLeaderStyle('l_shape', 'stealth');
  const style = getUrlLeaderStyle();
  assert.equal(style.leaderType, 'l_shape');
  assert.equal(style.arrowType, 'stealth');
  const styledCard = createUrlIntelligenceOverlayEntry('naia-t3', mockPoint, pos);
  assert.equal(styledCard.leaderType, 'l_shape');
  assert.equal(styledCard.arrowType, 'stealth');

  // Reset to default
  setUrlLeaderStyle('straight', 'single_point');
});

test('urlLayerIcons produces valid SVG billboard data URLs and emojis for all categories', async () => {
  const {
    CATEGORY_ICONS,
    getCategoryBillboardImage,
    getCategoryEmoji,
    normalizeCategory,
  } = await import('./urlLayerIcons.js');

  const categories = Object.keys(CATEGORY_ICONS);
  assert.ok(categories.length >= 8, 'Has at least 8 category icons registered');

  for (const cat of categories) {
    const normalDataUrl = getCategoryBillboardImage(cat, false);
    assert.match(normalDataUrl, /^data:image\/svg\+xml;base64,/, `${cat} produces valid base64 data URL`);

    const selectedDataUrl = getCategoryBillboardImage(cat, true);
    assert.match(selectedDataUrl, /^data:image\/svg\+xml;base64,/, `${cat} produces valid selected base64 data URL`);
    assert.notEqual(normalDataUrl, selectedDataUrl, `${cat} selected state differs from unselected`);

    const emoji = getCategoryEmoji(cat);
    assert.ok(typeof emoji === 'string' && emoji.length > 0, `${cat} has emoji`);
  }

  // Normalization tests
  assert.equal(normalizeCategory('International Airport'), 'Airport');
  assert.equal(normalizeCategory('Harbor Seaport Wharf'), 'Seaport');
  assert.equal(normalizeCategory('Border Checkpoint'), 'Border Crossing');
  assert.equal(normalizeCategory('Field Office Sub-unit'), 'Field Office');
  assert.equal(normalizeCategory('Embassy / Consulate'), 'Embassy');
});

test('urlIntelligenceLayer multi-pinning and state controls', () => {
  // Pinning controls
  assert.equal(typeof urlIntelligenceLayer.pinPoint, 'function');
  assert.equal(typeof urlIntelligenceLayer.unpinPoint, 'function');
  assert.equal(typeof urlIntelligenceLayer.togglePinPoint, 'function');
  assert.equal(typeof urlIntelligenceLayer.clearPinnedPoints, 'function');
  assert.equal(typeof urlIntelligenceLayer.setMultiPinMode, 'function');
  assert.equal(typeof urlIntelligenceLayer.isMultiPinMode, 'function');
  assert.equal(typeof urlIntelligenceLayer.pinTopEntities, 'function');
  assert.equal(typeof urlIntelligenceLayer.getPinnedPoints, 'function');

  // Test multi-pin toggle
  urlIntelligenceLayer.setMultiPinMode(true);
  assert.equal(urlIntelligenceLayer.isMultiPinMode(), true);
  urlIntelligenceLayer.setMultiPinMode(false);
  assert.equal(urlIntelligenceLayer.isMultiPinMode(), false);

  // Test profiles through layer methods
  urlIntelligenceLayer.setUrlDetailsBoxProfile('compact');
  assert.equal(urlIntelligenceLayer.getUrlDetailsBoxProfile(), 'compact');
  urlIntelligenceLayer.setUrlDetailsBoxProfile('standard');
  assert.equal(urlIntelligenceLayer.getUrlDetailsBoxProfile(), 'standard');

  // Test leader style through layer methods
  urlIntelligenceLayer.setUrlLeaderStyle('diagonal_45', 'bead');
  const style = urlIntelligenceLayer.getUrlLeaderStyle();
  assert.equal(style.leaderType, 'diagonal_45');
  assert.equal(style.arrowType, 'bead');
  urlIntelligenceLayer.setUrlLeaderStyle('straight', 'single_point');

  // Test pinned points empty
  urlIntelligenceLayer.clearPinnedPoints();
  assert.deepEqual(urlIntelligenceLayer.getPinnedPoints(), []);
});

