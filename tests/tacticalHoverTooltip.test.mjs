import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTacticalHoverHtml,
  formatItemCoordinates,
} from '../src/ui/tacticalHoverTooltip.js';

test('Format item coordinates correctly', () => {
  const singlePoint = JSON.stringify([{ lat: 14.599512, lng: 120.984222 }]);
  assert.equal(formatItemCoordinates(singlePoint), '14.5995° N, 120.9842° E');

  const southernWestern = JSON.stringify([{ lat: -33.8688, lng: -70.6693 }]);
  assert.equal(formatItemCoordinates(southernWestern), '33.8688° S, 70.6693° W');

  const multiVertex = JSON.stringify([
    { lat: 10, lng: 20 },
    { lat: 11, lng: 21 },
    { lat: 12, lng: 22 },
  ]);
  assert.equal(formatItemCoordinates(multiVertex), '10.0000° N, 20.0000° E (3 vertices)');
});

test('Tactical Hover Mode: "none" returns null (silent hover)', () => {
  const item = {
    name: 'Stealth Relay 1',
    category: 'TACTICAL_DEFENSE',
    level3: 'Radar Station',
    hoverBehavior: 'none',
  };
  assert.equal(getTacticalHoverHtml(item), null);
  assert.equal(getTacticalHoverHtml(item, 'none'), null);
});

test('Tactical Hover Mode: "bubble" renders compact tactical HUD pill', () => {
  const item = {
    name: 'Airspace Radar Bravo',
    category: 'AIRSPACE_AVIATION',
    subcategory: 'Radar Systems',
    level3: 'Air Defense Radar',
    color: '#00e5ff',
    coordinates: JSON.stringify([{ lat: 14.5, lng: 120.9 }]),
    hoverBehavior: 'bubble',
  };

  const html = getTacticalHoverHtml(item);
  assert.ok(html);
  assert.ok(html.includes('tactical-bubble-inner'));
  assert.ok(html.includes('Airspace Radar Bravo'));
  assert.ok(html.includes('Air Defense Radar'));
  assert.ok(html.includes('14.5000° N, 120.9000° E'));
  assert.ok(html.includes('#00e5ff'));
});

test('Tactical Hover Mode: "dialog" renders rich tactical intel card', () => {
  const item = {
    name: 'Coastal Watchtower North',
    type: 'marker',
    category: 'MARITIME_COASTAL',
    subcategory: 'Harbor Services',
    level3: 'Observation Tower',
    color: '#ef4444',
    description: 'Primary visual watch post monitoring northern strait maritime traffic.',
    coordinates: JSON.stringify([{ lat: 14.6, lng: 120.8 }]),
    hoverBehavior: 'dialog',
  };

  const html = getTacticalHoverHtml(item);
  assert.ok(html);
  assert.ok(html.includes('tactical-dialog-inner'));
  assert.ok(html.includes('Coastal Watchtower North'));
  assert.ok(html.includes('MARITIME_COASTAL'));
  assert.ok(html.includes('Observation Tower'));
  assert.ok(html.includes('Harbor Services'));
  assert.ok(html.includes('Primary visual watch post'));
  assert.ok(html.includes('Left-Click to Inspect'));
  assert.ok(html.includes('#ef4444'));
});

test('Tactical Hover Tooltip responds to custom color theme and dynamic SVG badges', () => {
  const item = {
    name: 'HAZMAT Bio Staging Area',
    type: 'polygon',
    category: 'CRITICAL_INFRASTRUCTURE',
    level3: 'Chemical Storage Area',
    color: '#a855f7', // HAZMAT violet theme
    hoverBehavior: 'dialog',
    coordinates: JSON.stringify([
      { lat: 14.1, lng: 120.1 },
      { lat: 14.2, lng: 120.2 },
      { lat: 14.1, lng: 120.3 },
    ]),
  };

  const html = getTacticalHoverHtml(item);
  assert.ok(html);
  assert.ok(html.includes('Zone / Area'));
  assert.ok(html.includes('#a855f7'));
  assert.ok(html.includes('Chemical Storage Area'));
  assert.ok(html.includes('3 vertices'));
});
