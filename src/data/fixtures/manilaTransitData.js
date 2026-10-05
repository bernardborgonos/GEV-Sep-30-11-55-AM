/**
 * @module manilaTransitData
 * @description Exportable datasets translated directly from "The Living Network: Manila Transit Telemetry & Simulation"
 * Formats: .kml, .gpx, .nmea, .csv
 * Target Google Drive Folders:
 * - CSV  ➔ GodsEyeView/Fleet-GPS/
 * - GPX  ➔ GodsEyeView/GPX-Tracks/
 * - NMEA ➔ GodsEyeView/NMEA-Logs/
 * - KML  ➔ GodsEyeView/Layers/
 */

import {
  TRANSIT_LINES,
  SIMULATION_EPOCH_ISO,
  TOTAL_DURATION_SEC,
  generateManilaTransitKML,
  generateManilaTransitGPX,
  generateManilaTransitNMEA,
  generateManilaTransitCSV,
  generateSpaceTimeTrajectory,
} from './manilaTransitGenerator.js';

export {
  TRANSIT_LINES,
  SIMULATION_EPOCH_ISO,
  TOTAL_DURATION_SEC,
  generateSpaceTimeTrajectory,
};

export const MANILA_TRANSIT_KML = generateManilaTransitKML();
export const MANILA_TRANSIT_GPX = generateManilaTransitGPX();
export const MANILA_TRANSIT_NMEA = generateManilaTransitNMEA();
export const MANILA_TRANSIT_CSV = generateManilaTransitCSV();

export const MANILA_TRANSIT_DATASETS = Object.freeze([
  {
    id: 'manila-transit-kml',
    name: 'manila_transit_living_network.kml',
    format: 'KML',
    driveCategory: 'LAYERS',
    folderPath: 'GodsEyeView/Layers/',
    size: '48 KB',
    description: '46 station <Placemark> nodes & synchronized <gx:Track> dynamic simulation (LRT-1, LRT-2, MRT-3)',
    getContent: () => MANILA_TRANSIT_KML,
  },
  {
    id: 'manila-transit-gpx',
    name: 'manila_transit_simulation.gpx',
    format: 'GPX',
    driveCategory: 'GPX_TRACKS',
    folderPath: 'GodsEyeView/GPX-Tracks/',
    size: '104 KB',
    description: 'Lead trains 001 (LRT-2) & 002 (MRT-3) timed <trkpt> sequence with 90s transit / 30s dwell rhythm',
    getContent: () => MANILA_TRANSIT_GPX,
  },
  {
    id: 'manila-transit-nmea',
    name: 'manila_transit_telemetry.nmea',
    format: 'NMEA',
    driveCategory: 'NMEA_LOGS',
    folderPath: 'GodsEyeView/NMEA-Logs/',
    size: '40 KB',
    description: 'Raw NMEA-0183 ($GPRMC & $GPGGA) satellite navigation stream starting 2026-09-11T00:00:00Z',
    getContent: () => MANILA_TRANSIT_NMEA,
  },
  {
    id: 'manila-transit-csv',
    name: 'manila_transit_space_time.csv',
    format: 'CSV',
    driveCategory: 'FLEET_GPS',
    folderPath: 'GodsEyeView/Fleet-GPS/',
    size: '49 KB',
    description: 'Tabular transit telemetry with status, station tracking, speed, heading, and kinematics',
    getContent: () => MANILA_TRANSIT_CSV,
  },
]);
