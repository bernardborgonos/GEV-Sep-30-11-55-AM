import fs from 'node:fs';
import path from 'node:path';
import {
  generateManilaTransitKML,
  generateManilaTransitGPX,
  generateManilaTransitNMEA,
  generateManilaTransitCSV,
} from './manilaTransitGenerator.js';

const targetDir = path.resolve('src/data/fixtures/manilaTransit');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log('[Manila Transit Builder] Generating translated datasets...');

const kmlContent = generateManilaTransitKML();
fs.writeFileSync(path.join(targetDir, 'manila_transit_living_network.kml'), kmlContent, 'utf-8');
console.log(`✓ Generated KML: ${(kmlContent.length / 1024).toFixed(1)} KB`);

const gpxContent = generateManilaTransitGPX();
fs.writeFileSync(path.join(targetDir, 'manila_transit_simulation.gpx'), gpxContent, 'utf-8');
console.log(`✓ Generated GPX: ${(gpxContent.length / 1024).toFixed(1)} KB`);

const nmeaContent = generateManilaTransitNMEA();
fs.writeFileSync(path.join(targetDir, 'manila_transit_telemetry.nmea'), nmeaContent, 'utf-8');
console.log(`✓ Generated NMEA: ${(nmeaContent.length / 1024).toFixed(1)} KB`);

const csvContent = generateManilaTransitCSV();
fs.writeFileSync(path.join(targetDir, 'manila_transit_space_time.csv'), csvContent, 'utf-8');
console.log(`✓ Generated CSV: ${(csvContent.length / 1024).toFixed(1)} KB`);

console.log('[Manila Transit Builder] All 4 formats generated successfully!');
