import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_PRESET_ICONS,
  getCustomIconForPreset,
  getDomainColor,
  generateTacticalSvgDataUrl,
  generateTacticalSvgString,
  resolveItemTacticalIcon,
  matchGlyphForLabel,
  registerCustomClassification,
  getLevel3Presets,
} from '../src/data/taxonomyData.js';

test('Static PNG Tactical Asset Registry', () => {
  // Test direct static asset matches
  assert.equal(getCustomIconForPreset('Tactical Operations Center (TOC)'), '/assets/icons/tactical_toc_icon.png');
  assert.equal(getCustomIconForPreset('3D Early Warning Radar Station'), '/assets/icons/radar_station_icon.png');
  assert.equal(getCustomIconForPreset('Coastal Cardinal Navigational Buoy'), '/assets/icons/maritime_buoy_icon.png');
});

test('Parametric Tactical Vector SVG Engine on unmapped/standard presets', () => {
  // When an L3 preset has no static PNG, it must dynamically generate a crisp Vector SVG Data URL
  const airfieldIcon = getCustomIconForPreset('Runway / Airfield Strip', 'AIRSPACE_AVIATION');
  assert.ok(airfieldIcon.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(airfieldIcon).includes('<svg'));
  assert.ok(decodeURIComponent(airfieldIcon).includes(getDomainColor('AIRSPACE_AVIATION')));

  const sensorIcon = getCustomIconForPreset('Acoustic Sensor Array', 'TACTICAL_DEFENSE');
  assert.ok(sensorIcon.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(sensorIcon).includes('#f43f5e')); // Tactical Defense color
});

test('Dynamic Icon Synthesis for Custom Operator Classifications', () => {
  // Brand new operator-defined classification
  const customClass = 'Amphibious Drone Deployment Pier';
  const customIcon = getCustomIconForPreset(customClass, 'MARITIME_COASTAL');
  assert.ok(customIcon.startsWith('data:image/svg+xml;charset=utf-8,'));

  const decoded = decodeURIComponent(customIcon);
  assert.ok(decoded.includes('<svg'));
  assert.ok(decoded.includes('#00e5ff')); // Maritime color
});

test('Hierarchy of Precedence: User Upload > Static PNG > Generated Vector SVG', () => {
  // Tier 1: User uploaded image / custom icon override
  const itemWithUpload = {
    name: 'Custom Asset',
    category: 'TACTICAL_DEFENSE',
    level3: 'Tactical Operations Center (TOC)',
    customIconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };
  assert.equal(resolveItemTacticalIcon(itemWithUpload, CUSTOM_PRESET_ICONS), itemWithUpload.customIconUrl);

  // Tier 2: Static registered PNG asset
  const itemWithStaticPreset = {
    name: 'Radar Post',
    category: 'TACTICAL_DEFENSE',
    level3: 'Early Warning Radar',
    customIconUrl: null,
  };
  assert.equal(resolveItemTacticalIcon(itemWithStaticPreset, CUSTOM_PRESET_ICONS), '/assets/icons/radar_station_icon.png');

  // Tier 3: Dynamic Vector SVG generation
  const itemUnmapped = {
    name: 'Special Post',
    category: 'HEALTH_PUBLIC_SAFETY',
    level3: 'Emergency Field Hospital',
    customIconUrl: null,
  };
  const resolvedSvg = resolveItemTacticalIcon(itemUnmapped, CUSTOM_PRESET_ICONS);
  assert.ok(resolvedSvg.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(resolvedSvg).includes('#ef4444')); // Health / Emergency domain color
});

test('Intelligent Glyph Matcher', () => {
  assert.equal(matchGlyphForLabel('Early Warning Radar Array'), 'radar');
  assert.equal(matchGlyphForLabel('Cardinal Buoy South'), 'buoy');
  assert.equal(matchGlyphForLabel('Perimeter Sentry Watchtower'), 'tower');
  assert.equal(matchGlyphForLabel('Naval Vessel Port Berth'), 'marine_vessel');
  assert.equal(matchGlyphForLabel('Submarine Anchorage Mooring'), 'anchor');
  assert.equal(matchGlyphForLabel('Reconnaissance Drone Station'), 'drone_uas');
  assert.equal(matchGlyphForLabel('Reinforced Underground Bunker'), 'bunker');
  assert.equal(matchGlyphForLabel('Medical Aid Triage Station'), 'medical_aid');
});

test('Expanded Taxonomy Categories & Designated Vector Glyphs', () => {
  // Law Enforcement & Civil Security
  assert.equal(matchGlyphForLabel('Police Headquarters / Station'), 'police_badge');
  assert.equal(matchGlyphForLabel('Fire & Rescue Station'), 'fire_rescue');
  assert.equal(matchGlyphForLabel('Border Customs & Inspection Post'), 'customs_barrier');
  assert.equal(matchGlyphForLabel('Correctional / Detention Facility'), 'correctional_facility');

  // Heavy Industry
  assert.equal(matchGlyphForLabel('Heavy Manufacturing Plant'), 'factory_industrial');
  assert.equal(matchGlyphForLabel('Chemical / Fertilizer Processing Facility'), 'chemical_hazard');
  assert.equal(matchGlyphForLabel('Open-Pit Mine / Mineral Quarry'), 'mining_quarry');

  // Rail & Mass Transit
  assert.equal(matchGlyphForLabel('Passenger Rail / Metro Terminal'), 'rail_train');
  assert.equal(matchGlyphForLabel('Highway Toll Plaza & Weigh Station'), 'toll_plaza');
  assert.equal(matchGlyphForLabel('EV Fast-Charging Superstation'), 'ev_charging');

  // Coastal Operations
  assert.equal(matchGlyphForLabel('Passenger Ferry & Ro-Ro Ramp'), 'ferry_terminal');
  assert.equal(matchGlyphForLabel('Marina & Small Craft Basin'), 'marina_yacht');
  assert.equal(matchGlyphForLabel('Subsea Cable Landing Station'), 'subsea_cable');

  // Expedition & Outdoor
  assert.equal(matchGlyphForLabel('Backcountry Trailhead / Staging Point'), 'trailhead_hiker');
  assert.equal(matchGlyphForLabel('Designated Campsite / RV Park'), 'camp_tent');
  assert.equal(matchGlyphForLabel('Mountain Pass / Alpine Hut'), 'alpine_hut');

  // Assemblies & Judicial
  assert.equal(matchGlyphForLabel('International Convention / Summit Center'), 'convention_summit');
  assert.equal(matchGlyphForLabel('Court of Law / Judicial Complex'), 'court_judicial');

  // Check that custom icons for these presets generate valid SVG data URLs
  const policeIcon = getCustomIconForPreset('Police Headquarters / Station', 'HEALTH_PUBLIC_SAFETY');
  assert.ok(policeIcon.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(policeIcon).includes('#ef4444'));

  const trainIcon = getCustomIconForPreset('Passenger Rail / Metro Terminal', 'TRANSPORTATION_LOGISTICS');
  assert.ok(trainIcon.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(trainIcon).includes('#6366f1'));
});

test('Dynamic Classification (L3) Registration and Immediate Reflection', () => {
  const initialPresets = getLevel3Presets('MARITIME_COASTAL', 'Coastal_Operations');
  const customL3Name = 'Tactical Offshore USV Command Hub';
  assert.equal(initialPresets.includes(customL3Name), false);

  // Register custom classification
  registerCustomClassification('MARITIME_COASTAL', 'Coastal_Operations', customL3Name);

  // Validate it immediately reflects in getLevel3Presets by domain key and label
  const updatedByKey = getLevel3Presets('MARITIME_COASTAL', 'Coastal_Operations');
  assert.ok(updatedByKey.includes(customL3Name));

  const updatedByLabel = getLevel3Presets('Maritime & Coastal', 'Coastal Operations & Harbor Services');
  assert.ok(updatedByLabel.includes(customL3Name));

  // Validate custom icon generation for the new classification
  const customIcon = getCustomIconForPreset(customL3Name, 'MARITIME_COASTAL');
  assert.ok(customIcon.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(decodeURIComponent(customIcon).includes('#00e5ff'));
});

test('Tactical Icon Color Theming & MIL-STD Affiliation Overrides', () => {
  // Test Hostile Threat Red override on a Maritime asset while retaining Maritime diamond frame
  const hostileBuoy = getCustomIconForPreset('Lateral Mark Buoy', 'MARITIME_COASTAL', '#ef4444');
  assert.ok(hostileBuoy.startsWith('data:image/svg+xml;charset=utf-8,'));
  const hostileSvg = decodeURIComponent(hostileBuoy);
  assert.ok(hostileSvg.includes('#ef4444')); // In hostile red theme

  // Test Friendly Allied Blue override on an Aviation airfield
  const friendlyAirfield = getCustomIconForPreset('Tactical Runway', 'AIRSPACE_AVIATION', '#3b82f6');
  assert.ok(friendlyAirfield.startsWith('data:image/svg+xml;charset=utf-8,'));
  const friendlySvg = decodeURIComponent(friendlyAirfield);
  assert.ok(friendlySvg.includes('#3b82f6')); // In friendly blue theme

  // Test Night Vision (NVG Green Phosphor) theme override
  const nvgRadar = getCustomIconForPreset('Observation Post (OP)', 'TACTICAL_DEFENSE', '#22c55e');
  assert.ok(nvgRadar.startsWith('data:image/svg+xml;charset=utf-8,'));
  const nvgSvg = decodeURIComponent(nvgRadar);
  assert.ok(nvgSvg.includes('#22c55e')); // In NVG green theme
});
