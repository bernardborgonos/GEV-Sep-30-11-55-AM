import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTrajectorySignature,
  processTrajectoryDataset,
  interpolateVehicleAtTime,
  haversineDistanceMeters,
  calculateBearingDegrees,
  extractGpxEntities,
  extractNmeaEntities,
} from './trajectoryProcessor.js';
import {
  SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV,
  SAMPLE_METRO_PATROL_GPX,
  SAMPLE_NMEA_GPS_STREAM,
} from './fixtures/manilaVehicleSimulation.js';

test('detectTrajectorySignature accurately identifies GPS tracking telemetry headers', () => {
  const headers = ['vehicle', 'time', 'lon', 'lat'];
  const sample = [{ vehicle: 'vehicle_1', time: '2026-01-01T08:00:00Z', lon: '120.98', lat: '14.60' }];
  const sig = detectTrajectorySignature(headers, sample, 'https://example.com/telemetry.csv');
  assert.equal(sig.isTrajectory, true);
  assert.equal(sig.vehicleCol, 'vehicle');
  assert.equal(sig.timeCol, 'time');
  assert.equal(sig.latCol, 'lat');
  assert.equal(sig.lonCol, 'lon');
});

test('haversineDistanceMeters and calculateBearingDegrees calculate realistic kinematics', () => {
  // Manila City Hall to Rizal Monument (approx 1.05 km heading ~195 deg)
  const d = haversineDistanceMeters(14.5900, 120.9820, 14.5820, 120.9780);
  assert.ok(d > 800 && d < 1200, `Expected ~1000m, got ${d}`);

  const brng = calculateBearingDegrees(14.5900, 120.9820, 14.5820, 120.9780);
  assert.ok(brng > 180 && brng < 240, `Expected South-Southwest, got ${brng}`);
});

test('processTrajectoryDataset groups and calculates trajectories across vehicles', () => {
  const rawRows = [
    { vehicle: 'v1', time: '2026-01-01T08:00:00Z', lat: 14.5900, lon: 120.9820 },
    { vehicle: 'v1', time: '2026-01-01T08:01:00Z', lat: 14.5860, lon: 120.9800 },
    { vehicle: 'v1', time: '2026-01-01T08:02:00Z', lat: 14.5820, lon: 120.9780 },
    { vehicle: 'v2', time: '2026-01-01T08:00:00Z', lat: 14.6000, lon: 120.9900 },
    { vehicle: 'v2', time: '2026-01-01T08:01:00Z', lat: 14.6050, lon: 120.9950 },
  ];
  const res = processTrajectoryDataset(rawRows, {
    isTrajectory: true,
    vehicleCol: 'vehicle',
    timeCol: 'time',
    latCol: 'lat',
    lonCol: 'lon',
  });

  assert.equal(res.isTrajectory, true);
  assert.equal(res.trajectoryList.length, 2);
  assert.equal(res.fleetMetrics.totalVehicles, 2);
  assert.equal(res.fleetMetrics.totalWaypoints, 5);
  assert.ok(res.fleetMetrics.totalFleetDistanceKm > 0);

  const traj1 = res.trajectories.get('v1');
  assert.equal(traj1.totalPoints, 3);
  assert.ok(traj1.totalDistanceKm > 0.5);
  assert.ok(traj1.avgSpeedKmh > 0);

  // Test interpolation at 08:00:30Z
  const tMid = new Date('2026-01-01T08:00:30Z').getTime();
  const interp = interpolateVehicleAtTime(traj1, tMid);
  assert.ok(interp);
  assert.equal(interp.isInterpolated, true);
  assert.ok(interp.lat < 14.5900 && interp.lat > 14.5860);
});

test('extractGpxEntities successfully parses GPX XML tracks', () => {
  const gpx = extractGpxEntities(SAMPLE_METRO_PATROL_GPX);
  assert.equal(gpx.isTrajectory, true);
  assert.equal(gpx.trajectoryList.length, 1);
  const track = gpx.trajectoryList[0];
  assert.equal(track.vehicleId, 'PATROL_UNIT_01');
  assert.equal(track.totalPoints, 10);
  assert.ok(track.totalDistanceKm > 5);
});

test('extractNmeaEntities parses $GPRMC/$GPGGA sentence streams', () => {
  const nmea = extractNmeaEntities(SAMPLE_NMEA_GPS_STREAM);
  assert.equal(nmea.isTrajectory, true);
  assert.equal(nmea.trajectoryList.length, 1);
  assert.equal(nmea.trajectoryList[0].totalPoints, 4);
});
