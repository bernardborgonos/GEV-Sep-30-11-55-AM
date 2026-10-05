/**
 * @module manilaVehicleSimulation
 * @description Generates high-fidelity, realistic GPS fleet telemetry simulation data
 * modeled after real Metro Manila road corridors (Roxas Blvd, EDSA, Espana, Taft Ave, C-5, SLEX).
 * Produces 100 vehicles over a 60-minute operational window matching the reference
 * "manila_100_vehicle_simulation.xlsx" dataset structure (vehicle, time, lon, lat).
 */

/**
 * Waypoint anchor corridors representing major Metro Manila transportation arteries.
 */
const MANILA_CORRIDORS = [
  {
    name: 'Espana - Quezon Ave Arterial',
    waypoints: [
      [120.9800692, 14.60030227],
      [120.9845000, 14.60320000],
      [120.9912000, 14.60680000],
      [121.0025000, 14.61100000],
      [121.0150000, 14.62000000],
      [121.0280000, 14.63200000],
      [121.0450000, 14.65100000],
    ],
  },
  {
    name: 'Roxas Blvd - Bay City Corridor',
    waypoints: [
      [120.9740000, 14.59500000],
      [120.9780000, 14.58200000],
      [120.9830000, 14.56500000],
      [120.9860000, 14.55000000],
      [120.9900000, 14.53500000],
      [120.9930000, 14.52000000],
    ],
  },
  {
    name: 'EDSA Ring Expressway',
    waypoints: [
      [121.0005000, 14.53600000],
      [121.0180000, 14.54500000],
      [121.0280000, 14.55300000],
      [121.0420000, 14.57000000],
      [121.0580000, 14.58700000],
      [121.0540000, 14.61900000],
      [121.0400000, 14.64000000],
      [121.0020000, 14.65800000],
    ],
  },
  {
    name: 'Taft Ave Transit Route',
    waypoints: [
      [120.9820000, 14.59000000],
      [120.9870000, 14.57500000],
      [120.9910000, 14.56000000],
      [120.9940000, 14.54800000],
      [120.9980000, 14.53300000],
    ],
  },
  {
    name: 'C-5 Commercial & Tech Spine',
    waypoints: [
      [121.0450000, 14.50200000],
      [121.0550000, 14.55000000],
      [121.0650000, 14.57500000],
      [121.0800000, 14.59000000],
      [121.0750000, 14.65000000],
    ],
  },
  {
    name: 'South Luzon Expressway (SLEX)',
    waypoints: [
      [121.0000000, 14.57500000],
      [121.0120000, 14.54500000],
      [121.0250000, 14.51000000],
      [121.0350000, 14.47000000],
      [121.0420000, 14.42000000],
    ],
  },
];

/**
 * Interpolate a point along a sequence of waypoints at fraction t [0..1]
 * with slight lateral jitter for realistic road lane spread.
 */
function interpolatePath(waypoints, fraction, lateralOffset = 0) {
  const n = waypoints.length - 1;
  if (n <= 0) return waypoints[0];
  const scaled = fraction * n;
  const idx = Math.min(Math.floor(scaled), n - 1);
  const localFrac = scaled - idx;

  const [p0Lon, p0Lat] = waypoints[idx];
  const [p1Lon, p1Lat] = waypoints[idx + 1];

  // Normal vector for lane offset
  const dx = p1Lon - p0Lon;
  const dy = p1Lat - p0Lat;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const lon = p0Lon + dx * localFrac + nx * lateralOffset;
  const lat = p0Lat + dy * localFrac + ny * lateralOffset;

  return [lon, lat];
}

/**
 * Generates the complete 100-vehicle Manila simulation CSV string.
 * Total points: 100 vehicles * 61 timestamps = 6,100 rows.
 * @param {number} [vehicleCount=100]
 * @param {number} [timestampsCount=61]
 * @returns {string} CSV text
 */
export function generateManilaVehicleSimulationCsv(vehicleCount = 100, timestampsCount = 61) {
  const header = 'vehicle,time,lon,lat';
  const rows = [header];

  const baseDate = new Date('2026-01-01T08:00:00Z').getTime();

  for (let v = 1; v <= vehicleCount; v++) {
    const vehicleId = `vehicle_${v}`;
    const corridorIdx = (v - 1) % MANILA_CORRIDORS.length;
    const corridor = MANILA_CORRIDORS[corridorIdx];
    const reverse = v % 2 === 0;

    // Waypoints for this vehicle
    const pathWaypoints = reverse ? [...corridor.waypoints].reverse() : corridor.waypoints;

    // Unique start phase offset and speed variation
    const startPhase = ((v * 7) % 30) / 100; // 0.0 to 0.3
    const travelSpan = 0.55 + ((v * 13) % 40) / 100; // 0.55 to 0.95
    const laneOffset = (((v * 11) % 7) - 3) * 0.00018; // road lane spread ~20m

    // Some vehicles experience a simulated red light or delivery dwell
    const dwellStartIdx = 15 + (v % 25);
    const dwellDuration = v % 5 === 0 ? 8 : (v % 3 === 0 ? 4 : 0); // dwell steps
    let currentDwellFrac = null;

    for (let t = 0; t < timestampsCount; t++) {
      const timeMs = baseDate + t * 60 * 1000;
      const timeIso = new Date(timeMs).toISOString();

      let fraction;
      if (dwellDuration > 0 && t >= dwellStartIdx && t < dwellStartIdx + dwellDuration) {
        if (currentDwellFrac === null) {
          currentDwellFrac = startPhase + ((dwellStartIdx / timestampsCount) * travelSpan);
        }
        fraction = currentDwellFrac;
      } else {
        const effectiveT = dwellDuration > 0 && t >= dwellStartIdx + dwellDuration
          ? t - dwellDuration
          : t;
        fraction = Math.min(1.0, startPhase + (effectiveT / (timestampsCount - (dwellDuration > 0 ? dwellDuration : 0))) * travelSpan);
      }

      // Add microscopic sensor noise (e.g. 1-2 meters GPS precision jitter)
      const noiseLon = ((Math.sin(v * 100 + t * 13) * 0.00004));
      const noiseLat = ((Math.cos(v * 100 + t * 17) * 0.00004));

      const [lon, lat] = interpolatePath(pathWaypoints, fraction, laneOffset);
      const cleanLon = (lon + noiseLon).toFixed(7);
      const cleanLat = (lat + noiseLat).toFixed(8);

      rows.push(`${vehicleId},${timeIso},${cleanLon},${cleanLat}`);
    }
  }

  return rows.join('\n');
}

/**
 * Precomputed sample of Manila 100-vehicle simulation (first 20 vehicles by default for immediate synchronous memory).
 */
export const SAMPLE_MANILA_100_VEHICLE_SIMULATION_CSV = generateManilaVehicleSimulationCsv(100, 61);

/**
 * Sample GPX track of Rapid Response Patrol unit in Metro Manila.
 */
export const SAMPLE_METRO_PATROL_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GEV-Tactical-Command" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Metro Manila Tactical Patrol Route Alpha-1</name>
    <desc>Tactical mobility route across Roxas Boulevard and Port Area</desc>
    <time>2026-01-01T08:00:00Z</time>
  </metadata>
  <trk>
    <name>PATROL_UNIT_01</name>
    <type>Tactical Response Vehicle</type>
    <trkseg>
      <trkpt lat="14.599500" lon="120.974200"><ele>4.2</ele><time>2026-01-01T08:00:00Z</time></trkpt>
      <trkpt lat="14.594200" lon="120.975800"><ele>4.5</ele><time>2026-01-01T08:02:00Z</time></trkpt>
      <trkpt lat="14.587800" lon="120.978500"><ele>5.1</ele><time>2026-01-01T08:05:00Z</time></trkpt>
      <trkpt lat="14.581000" lon="120.980200"><ele>5.0</ele><time>2026-01-01T08:08:00Z</time></trkpt>
      <trkpt lat="14.573200" lon="120.982500"><ele>4.8</ele><time>2026-01-01T08:11:00Z</time></trkpt>
      <trkpt lat="14.565000" lon="120.985000"><ele>5.2</ele><time>2026-01-01T08:15:00Z</time></trkpt>
      <trkpt lat="14.554000" lon="120.988000"><ele>5.5</ele><time>2026-01-01T08:19:00Z</time></trkpt>
      <trkpt lat="14.542000" lon="120.991000"><ele>6.0</ele><time>2026-01-01T08:24:00Z</time></trkpt>
      <trkpt lat="14.530000" lon="120.994000"><ele>6.2</ele><time>2026-01-01T08:30:00Z</time></trkpt>
      <trkpt lat="14.522000" lon="120.996000"><ele>5.8</ele><time>2026-01-01T08:36:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

/**
 * Sample NMEA-0183 GPS stream sentences for maritime/vehicle tracking.
 */
export const SAMPLE_NMEA_GPS_STREAM = `$GPRMC,080000.00,A,1435.9700,N,12058.8000,E,22.5,145.2,010126,,,A*7A
$GPGGA,080000.00,1435.9700,N,12058.8000,E,1,08,0.9,5.2,M,0.0,M,,*47
$GPRMC,080200.00,A,1435.4200,N,12058.9500,E,24.1,148.0,010126,,,A*7B
$GPGGA,080200.00,1435.4200,N,12058.9500,E,1,08,0.9,5.4,M,0.0,M,,*48
$GPRMC,080500.00,A,1434.7800,N,12059.1200,E,28.4,152.4,010126,,,A*7C
$GPGGA,080500.00,1434.7800,N,12059.1200,E,1,09,0.8,5.1,M,0.0,M,,*49
$GPRMC,080800.00,A,1434.1000,N,12059.3000,E,26.0,150.1,010126,,,A*7D
$GPGGA,080800.00,1434.1000,N,12059.3000,E,1,09,0.8,5.0,M,0.0,M,,*4A`;
