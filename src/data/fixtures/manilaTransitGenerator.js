/**
 * @module manilaTransitGenerator
 * @description Translates the 15-page "The Living Network: Manila Transit Telemetry & Simulation"
 * specification into production spatial datasets:
 * - KML 2.2 (Static Placemarks & Dynamic gx:Track space-time simulation)
 * - GPX 1.1 (Waypoints & Multi-Segment Timed Tracks)
 * - NMEA-0183 ($GPRMC & $GPGGA synchronized sentences)
 * - CSV (Tabular telemetry with 90s transit / 30s dwell rhythm)
 *
 * Epoch: 2026-09-11T00:00:00Z
 * Duration: 24.5 minutes (00:24:30Z)
 */

export const SIMULATION_EPOCH_ISO = '2026-09-11T00:00:00Z';
export const SIMULATION_EPOCH_MS = Date.parse(SIMULATION_EPOCH_ISO);
export const TOTAL_DURATION_SEC = 1470; // 24.5 minutes (00:24:30Z)

export const TRANSIT_LINES = {
  LRT1: {
    id: 'LRT-1',
    name: 'Light Rail Transit Line 1 (Yellow Corridor)',
    colorHex: '#eab308', // Yellow (#ffff00 / #ff00ffff in KML)
    kmlColor: 'ff00ffff', // aabbggrr
    stationCount: 20,
    terminals: 'Fernando Poe Jr. ➔ Baclaran',
    telemetryStatus: 'Static Markers Only',
    stations: [
      { id: 'L1-01', name: 'Fernando Poe Jr.', lon: 121.0189, lat: 14.6575, ele: 24 },
      { id: 'L1-02', name: 'Balintawak', lon: 121.0041, lat: 14.6571, ele: 22 },
      { id: 'L1-03', name: 'Monumento', lon: 120.9836, lat: 14.6543, ele: 15 },
      { id: 'L1-04', name: '5th Avenue', lon: 120.9839, lat: 14.6444, ele: 14 },
      { id: 'L1-05', name: 'R. Papa', lon: 120.9825, lat: 14.6360, ele: 12 },
      { id: 'L1-06', name: 'Abad Santos', lon: 120.9814, lat: 14.6305, ele: 10 },
      { id: 'L1-07', name: 'Blumentritt', lon: 120.9830, lat: 14.6226, ele: 9 },
      { id: 'L1-08', name: 'Tayuman', lon: 120.9829, lat: 14.6167, ele: 8 },
      { id: 'L1-09', name: 'Bambang', lon: 120.9823, lat: 14.6080, ele: 8 },
      { id: 'L1-10', name: 'Doroteo Jose', lon: 120.9818, lat: 14.6053, ele: 9, interchange: 'LRT-2 Recto' },
      { id: 'L1-11', name: 'Carriedo', lon: 120.9815, lat: 14.5998, ele: 7 },
      { id: 'L1-12', name: 'Central Terminal', lon: 120.9817, lat: 14.5928, ele: 8 },
      { id: 'L1-13', name: 'United Nations', lon: 120.9840, lat: 14.5826, ele: 7 },
      { id: 'L1-14', name: 'Pedro Gil', lon: 120.9880, lat: 14.5765, ele: 8 },
      { id: 'L1-15', name: 'Quirino', lon: 120.9917, lat: 14.5703, ele: 9 },
      { id: 'L1-16', name: 'Vito Cruz', lon: 120.9946, lat: 14.5634, ele: 9 },
      { id: 'L1-17', name: 'Gil Puyat', lon: 120.9972, lat: 14.5541, ele: 10 },
      { id: 'L1-18', name: 'Libertad', lon: 120.9988, lat: 14.5478, ele: 9 },
      { id: 'L1-19', name: 'EDSA', lon: 121.0006, lat: 14.5388, ele: 11, interchange: 'MRT-3 Taft Avenue' },
      { id: 'L1-20', name: 'Baclaran', lon: 120.9984, lat: 14.5342, ele: 8 },
    ],
  },
  LRT2: {
    id: 'LRT-2',
    name: 'Light Rail Transit Line 2 (Purple Corridor)',
    colorHex: '#c026d3', // Magenta / Purple (#ffaa00aa in KML)
    kmlColor: 'ffaa00aa', // aabbggrr
    stationCount: 13,
    terminals: 'Recto ➔ Antipolo',
    telemetryStatus: 'Active Simulation',
    trainId: 'TRAIN 001 - LRT-2',
    stations: [
      { id: 'L2-01', name: 'Recto', lon: 120.9835, lat: 14.6035, ele: 12, interchange: 'LRT-1 Doroteo Jose' },
      { id: 'L2-02', name: 'Legarda', lon: 120.9926, lat: 14.6008, ele: 14 },
      { id: 'L2-03', name: 'Pureza', lon: 121.0049, lat: 14.6016, ele: 16 },
      { id: 'L2-04', name: 'V. Mapa', lon: 121.0175, lat: 14.6041, ele: 18 },
      { id: 'L2-05', name: 'J. Ruiz', lon: 121.0263, lat: 14.6056, ele: 25 },
      { id: 'L2-06', name: 'Gilmore', lon: 121.0345, lat: 14.6135, ele: 32 },
      { id: 'L2-07', name: 'Betty Go-Belmonte', lon: 121.0427, lat: 14.6185, ele: 38 },
      { id: 'L2-08', name: 'Araneta-Cubao [L2]', lon: 121.0526, lat: 14.6225, ele: 42, interchange: 'MRT-3 Araneta-Cubao' },
      { id: 'L2-09', name: 'Anonas', lon: 121.0645, lat: 14.6281, ele: 48 },
      { id: 'L2-10', name: 'Katipunan', lon: 121.0725, lat: 14.6310, ele: 54 },
      { id: 'L2-11', name: 'Santolan', lon: 121.0858, lat: 14.6220, ele: 35 },
      { id: 'L2-12', name: 'Marikina-Pasig', lon: 121.1012, lat: 14.6235, ele: 32 },
      { id: 'L2-13', name: 'Antipolo', lon: 121.1214, lat: 14.6250, ele: 72 },
    ],
  },
  MRT3: {
    id: 'MRT-3',
    name: 'Metro Rail Transit Line 3 (Cyan Corridor)',
    colorHex: '#00e5ff', // Cyan (#ff00aaff in KML)
    kmlColor: 'ffaaff00', // aabbggrr
    stationCount: 13,
    terminals: 'North Avenue ➔ Taft Avenue',
    telemetryStatus: 'Active Simulation',
    trainId: 'TRAIN 002 - MRT-3',
    stations: [
      { id: 'M3-01', name: 'North Avenue', lon: 121.0326, lat: 14.6521, ele: 35 },
      { id: 'M3-02', name: 'Quezon Avenue', lon: 121.0384, lat: 14.6428, ele: 38 },
      { id: 'M3-03', name: 'GMA-Kamuning', lon: 121.0432, lat: 14.6346, ele: 40 },
      { id: 'M3-04', name: 'Araneta-Cubao', lon: 121.0526, lat: 14.6195, ele: 42, interchange: 'LRT-2 Cubao' },
      { id: 'M3-05', name: 'Santolan-Annapolis', lon: 121.0562, lat: 14.6078, ele: 44 },
      { id: 'M3-06', name: 'Ortigas', lon: 121.0583, lat: 14.5878, ele: 36 },
      { id: 'M3-07', name: 'Shaw Boulevard', lon: 121.0536, lat: 14.5813, ele: 30 },
      { id: 'M3-08', name: 'Boni', lon: 121.0468, lat: 14.5739, ele: 24 },
      { id: 'M3-09', name: 'Guadalupe', lon: 121.0407, lat: 14.5672, ele: 16 },
      { id: 'M3-10', name: 'Buendia', lon: 121.0337, lat: 14.5543, ele: 22 },
      { id: 'M3-11', name: 'Ayala', lon: 121.0280, lat: 14.5492, ele: 26 },
      { id: 'M3-12', name: 'Magallanes', lon: 121.0198, lat: 14.5420, ele: 18 },
      { id: 'M3-13', name: 'Taft Avenue', lon: 121.0006, lat: 14.5377, ele: 12, interchange: 'LRT-1 EDSA' },
    ],
  },
};

/**
 * Calculates bearing/heading between two points in degrees (0-360)
 */
function calculateHeading(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Generates continuous space-time trajectory samples for an active transit line
 * adhering to the 30-Second Dwell / 90-Second Transit rhythm across 13 stations.
 */
export function generateSpaceTimeTrajectory(lineConfig, sampleIntervalSec = 10) {
  const stations = lineConfig.stations;
  const samples = [];
  const segmentCount = stations.length - 1; // 12 segments
  const cycleDurationSec = 120; // 30s dwell + 90s transit

  for (let t = 0; t <= TOTAL_DURATION_SEC; t += sampleIntervalSec) {
    const timestampMs = SIMULATION_EPOCH_MS + t * 1000;
    const isoTime = new Date(timestampMs).toISOString();

    // Determine current station index & phase
    const segIdx = Math.min(Math.floor(t / cycleDurationSec), segmentCount - 1);
    const timeInCycle = t - segIdx * cycleDurationSec;

    const fromStation = stations[segIdx];
    const toStation = stations[Math.min(segIdx + 1, stations.length - 1)];

    let status = 'DWELL';
    let lat = fromStation.lat;
    let lon = fromStation.lon;
    let ele = fromStation.ele;
    let speedKph = 0;
    let heading = calculateHeading(fromStation.lat, fromStation.lon, toStation.lat, toStation.lon);
    let dwellRemaining = Math.max(0, 30 - timeInCycle);

    if (t >= segmentCount * cycleDurationSec) {
      // Arrived at final destination (Antipolo or Taft Avenue)
      const lastStation = stations[stations.length - 1];
      status = 'TERMINAL_DWELL';
      lat = lastStation.lat;
      lon = lastStation.lon;
      ele = lastStation.ele;
      speedKph = 0;
      dwellRemaining = 1470 - t;
    } else if (timeInCycle < 30) {
      // Station Dwell phase (0 - 30 seconds)
      status = 'DWELL';
      lat = fromStation.lat;
      lon = fromStation.lon;
      ele = fromStation.ele;
      speedKph = 0;
      dwellRemaining = 30 - timeInCycle;
    } else {
      // Transit phase (30 - 120 seconds, total 90 seconds movement)
      status = 'TRANSIT';
      dwellRemaining = 0;
      const transitElapsed = timeInCycle - 30;
      const progress = transitElapsed / 90; // 0.0 -> 1.0

      // Smooth S-curve acceleration / deceleration profile
      const smoothProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI);

      lat = fromStation.lat + (toStation.lat - fromStation.lat) * smoothProgress;
      lon = fromStation.lon + (toStation.lon - fromStation.lon) * smoothProgress;
      ele = fromStation.ele + (toStation.ele - fromStation.ele) * smoothProgress;

      // Bell curve speed profile peaking around 48-52 km/h
      speedKph = Math.round(50 * Math.sin(progress * Math.PI));
      heading = calculateHeading(fromStation.lat, fromStation.lon, toStation.lat, toStation.lon);
    }

    samples.push({
      timeSec: t,
      isoTime,
      timestampMs,
      vehicleId: lineConfig.trainId,
      lineId: lineConfig.id,
      status,
      currentStation: status === 'TRANSIT' ? `${fromStation.name} ➔ ${toStation.name}` : fromStation.name,
      nextStation: toStation.name,
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      ele: Math.round(ele),
      speedKph,
      speedKnots: Number((speedKph * 0.539957).toFixed(1)),
      heading: Math.round(heading),
      dwellRemainingSec: dwellRemaining,
    });
  }

  return samples;
}

/**
 * Generates KML 2.2 XML string containing:
 * - Placemarks for all 46 stations across LRT-1, LRT-2, and MRT-3
 * - Visual LineString corridors
 * - Dynamic gx:Track elements for LRT-2 (Train 001) and MRT-3 (Train 002) with timestamps
 */
export function generateManilaTransitKML() {
  const lrt2Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.LRT2, 10);
  const mrt3Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.MRT3, 10);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>The Living Network: Manila Transit Telemetry &amp; Simulation</name>
    <description>Space-Time Telemetry Digital Twin of Metro Manila Transit (LRT-1, LRT-2, MRT-3) based on the 2026-09-11 epoch with synchronized 30s-dwell / 90s-transit movement rhythms.</description>

    <!-- Style Definitions -->
    <Style id="stationPinYellow">
      <IconStyle>
        <color>ff00ffff</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/rail.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="stationPinPurple">
      <IconStyle>
        <color>ffaa00aa</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/subway.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="stationPinCyan">
      <IconStyle>
        <color>ffaaff00</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/subway.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="lrt1Corridor">
      <LineStyle><color>ff00ffff</color><width>4</width></LineStyle>
    </Style>
    <Style id="lrt2Corridor">
      <LineStyle><color>ffaa00aa</color><width>5</width></LineStyle>
    </Style>
    <Style id="mrt3Corridor">
      <LineStyle><color>ffaaff00</color><width>5</width></LineStyle>
    </Style>

    <!-- STATIC SPATIAL LAYER: 46 PLACEMARKS -->
    <Folder>
      <name>Static Geography [Space]</name>
      <description>Static station placemarks establishing the primary network nodes.</description>
`;

  // Render static stations for each line
  for (const lineKey of ['LRT1', 'LRT2', 'MRT3']) {
    const line = TRANSIT_LINES[lineKey];
    const styleId = lineKey === 'LRT1' ? '#stationPinYellow' : lineKey === 'LRT2' ? '#stationPinPurple' : '#stationPinCyan';
    xml += `      <Folder>\n        <name>${line.name} (${line.stationCount} Stations)</name>\n`;
    for (const st of line.stations) {
      xml += `        <Placemark id="${st.id}">
          <name>${st.name}</name>
          <styleUrl>${styleId}</styleUrl>
          <description>Line: ${line.id}&#10;Terminals: ${line.terminals}${st.interchange ? '&#10;Interchange: ' + st.interchange : ''}</description>
          <Point>
            <coordinates>${st.lon},${st.lat},${st.ele}</coordinates>
          </Point>
        </Placemark>\n`;
    }

    // Static track line
    const coordsStr = line.stations.map((s) => `${s.lon},${s.lat},${s.ele}`).join(' ');
    const lineStyle = lineKey === 'LRT1' ? '#lrt1Corridor' : lineKey === 'LRT2' ? '#lrt2Corridor' : '#mrt3Corridor';
    xml += `        <Placemark>
          <name>${line.id} Physical Alignment</name>
          <styleUrl>${lineStyle}</styleUrl>
          <LineString><coordinates>${coordsStr}</coordinates></LineString>
        </Placemark>
      </Folder>\n`;
  }
  xml += `    </Folder>\n\n`;

  // DYNAMIC TEMPORAL LAYER: gx:Track for LRT-2 and MRT-3
  xml += `    <!-- DYNAMIC TELEMETRY LAYER: [Space + Time] -->
    <Folder>
      <name>Dynamic Telemetry [Space + Time]</name>
      <description>Synchronized 24.5-minute space-time simulation tracks starting 2026-09-11T00:00:00Z.</description>

      <!-- Lead Train 001 - LRT-2 -->
      <Placemark id="train-001-lrt2">
        <name>TRAIN 001 - LRT-2 (Recto ➔ Antipolo)</name>
        <styleUrl>#lrt2Corridor</styleUrl>
        <gx:Track>
`;
  for (const s of lrt2Samples) {
    xml += `          <when>${s.isoTime}</when>\n`;
  }
  for (const s of lrt2Samples) {
    xml += `          <gx:coord>${s.lon} ${s.lat} ${s.ele}</gx:coord>\n`;
  }
  xml += `        </gx:Track>
      </Placemark>

      <!-- Lead Train 002 - MRT-3 -->
      <Placemark id="train-002-mrt3">
        <name>TRAIN 002 - MRT-3 (North Ave ➔ Taft Ave)</name>
        <styleUrl>#mrt3Corridor</styleUrl>
        <gx:Track>
`;
  for (const s of mrt3Samples) {
    xml += `          <when>${s.isoTime}</when>\n`;
  }
  for (const s of mrt3Samples) {
    xml += `          <gx:coord>${s.lon} ${s.lat} ${s.ele}</gx:coord>\n`;
  }
  xml += `        </gx:Track>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

  return xml;
}

/**
 * Generates GPX 1.1 XML string containing:
 * - Waypoints for all 46 stations
 * - Multi-segment tracks for LRT-2 Lead Train 001 and MRT-3 Lead Train 002 with elevation, speed, and time
 */
export function generateManilaTransitGPX() {
  const lrt2Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.LRT2, 10);
  const mrt3Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.MRT3, 10);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GodsEyeView Manila Transit Telemetry Engine" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Manila Transit Telemetry &amp; Space-Time Simulation</name>
    <desc>Synchronized telemetry for LRT-1, LRT-2, and MRT-3 transit corridors with 24.5-minute space-time profile.</desc>
    <time>${SIMULATION_EPOCH_ISO}</time>
  </metadata>
`;

  // Stations as Waypoints
  for (const lineKey of ['LRT1', 'LRT2', 'MRT3']) {
    const line = TRANSIT_LINES[lineKey];
    for (const s of line.stations) {
      xml += `  <wpt lat="${s.lat}" lon="${s.lon}">
    <ele>${s.ele}</ele>
    <name>${s.name}</name>
    <desc>${line.id} Station (${line.name})</desc>
    <type>Transit Station</type>
  </wpt>\n`;
    }
  }

  // LRT-2 Lead Train Track
  xml += `  <trk>
    <name>TRAIN 001 - LRT-2 (Recto ➔ Antipolo)</name>
    <desc>Eastward 24.5-minute simulated transit with 30s-dwell / 90s-transit rhythm.</desc>
    <type>Rail Transit</type>
    <trkseg>\n`;
  for (const s of lrt2Samples) {
    xml += `      <trkpt lat="${s.lat}" lon="${s.lon}">
        <ele>${s.ele}</ele>
        <time>${s.isoTime}</time>
        <speed>${(s.speedKph / 3.6).toFixed(2)}</speed>
        <course>${s.heading}</course>
        <extensions>
          <status>${s.status}</status>
          <currentStation>${s.currentStation}</currentStation>
        </extensions>
      </trkpt>\n`;
  }
  xml += `    </trkseg>
  </trk>
`;

  // MRT-3 Lead Train Track
  xml += `  <trk>
    <name>TRAIN 002 - MRT-3 (North Avenue ➔ Taft Avenue)</name>
    <desc>Southward EDSA corridor 24.5-minute simulated descent with 30s-dwell / 90s-transit rhythm.</desc>
    <type>Rail Transit</type>
    <trkseg>\n`;
  for (const s of mrt3Samples) {
    xml += `      <trkpt lat="${s.lat}" lon="${s.lon}">
        <ele>${s.ele}</ele>
        <time>${s.isoTime}</time>
        <speed>${(s.speedKph / 3.6).toFixed(2)}</speed>
        <course>${s.heading}</course>
        <extensions>
          <status>${s.status}</status>
          <currentStation>${s.currentStation}</currentStation>
        </extensions>
      </trkpt>\n`;
  }
  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}

/**
 * Calculates standard NMEA checksum for a sentence
 */
function computeNmeaChecksum(sentence) {
  let checksum = 0;
  for (let i = 0; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Formats lat/lon into standard NMEA DDMM.MMMM format
 */
function formatNmeaCoord(val, isLat) {
  const abs = Math.abs(val);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const degStr = isLat ? String(degrees).padStart(2, '0') : String(degrees).padStart(3, '0');
  const minStr = minutes.toFixed(4).padStart(7, '0');
  const hemi = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
  return { coord: `${degStr}${minStr}`, hemi };
}

/**
 * Generates NMEA-0183 raw GPS sentences ($GPRMC, $GPGGA)
 * representing both Train 001 (LRT-2) and Train 002 (MRT-3) on 2026-09-11
 */
export function generateManilaTransitNMEA() {
  const lrt2Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.LRT2, 10);
  const mrt3Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.MRT3, 10);
  const sentences = [];

  sentences.push('!AIVDM,1,1,,A,13aEO:0P000h010Q@4=000000000,0*15'); // Preamble
  sentences.push('$PGEV,INFO,MANILA_TRANSIT_SIMULATION,EPOCH=20260911T000000Z*00');

  // Interleave Train 001 and Train 002 telemetry
  for (let i = 0; i < lrt2Samples.length; i++) {
    const s1 = lrt2Samples[i];
    const s2 = mrt3Samples[i];

    // Format time HHMMSS.SS and date DDMMYY
    const d = new Date(s1.timestampMs);
    const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}.00`;
    const dateStr = '110926'; // 11 September 2026

    // --- Train 001 (LRT-2) ---
    const lat1 = formatNmeaCoord(s1.lat, true);
    const lon1 = formatNmeaCoord(s1.lon, false);
    const rmcBody1 = `GPRMC,${timeStr},A,${lat1.coord},${lat1.hemi},${lon1.coord},${lon1.hemi},${s1.speedKnots},${s1.heading}.0,${dateStr},,,A`;
    sentences.push(`$${rmcBody1}*${computeNmeaChecksum(rmcBody1)}`);

    const ggaBody1 = `GPGGA,${timeStr},${lat1.coord},${lat1.hemi},${lon1.coord},${lon1.hemi},1,08,1.2,${s1.ele}.0,M,0.0,M,,`;
    sentences.push(`$${ggaBody1}*${computeNmeaChecksum(ggaBody1)}`);

    // --- Train 002 (MRT-3) ---
    const lat2 = formatNmeaCoord(s2.lat, true);
    const lon2 = formatNmeaCoord(s2.lon, false);
    const rmcBody2 = `GPRMC,${timeStr},A,${lat2.coord},${lat2.hemi},${lon2.coord},${lon2.hemi},${s2.speedKnots},${s2.heading}.0,${dateStr},,,A`;
    sentences.push(`$${rmcBody2}*${computeNmeaChecksum(rmcBody2)}`);

    const ggaBody2 = `GPGGA,${timeStr},${lat2.coord},${lat2.hemi},${lon2.coord},${lon2.hemi},1,09,1.1,${s2.ele}.0,M,0.0,M,,`;
    sentences.push(`$${ggaBody2}*${computeNmeaChecksum(ggaBody2)}`);
  }

  return sentences.join('\r\n');
}

/**
 * Generates CSV tabular dataset containing:
 * 1. Station coordinates registry (all 46 stations)
 * 2. Space-time simulated dynamic telemetry rows for Train 001 and Train 002
 */
export function generateManilaTransitCSV() {
  const lrt2Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.LRT2, 10);
  const mrt3Samples = generateSpaceTimeTrajectory(TRANSIT_LINES.MRT3, 10);

  const headers = [
    'timestamp',
    'elapsed_sec',
    'vehicle_id',
    'line',
    'status',
    'current_location',
    'next_station',
    'latitude',
    'longitude',
    'elevation_m',
    'speed_kph',
    'heading_deg',
    'dwell_remaining_sec',
    'category',
  ];

  const rows = [headers.join(',')];

  // Static Station Placemark Registry
  for (const lineKey of ['LRT1', 'LRT2', 'MRT3']) {
    const line = TRANSIT_LINES[lineKey];
    for (const st of line.stations) {
      rows.push([
        SIMULATION_EPOCH_ISO,
        0,
        `STATION-${st.id}`,
        line.id,
        'STATION_NODE',
        `"${st.name}"`,
        `"${line.terminals}"`,
        st.lat,
        st.lon,
        st.ele,
        0,
        0,
        0,
        'Train Station',
      ].join(','));
    }
  }

  // Telemetry samples for LRT-2 Train 001
  for (const s of lrt2Samples) {
    rows.push([
      s.isoTime,
      s.timeSec,
      `"${s.vehicleId}"`,
      s.lineId,
      s.status,
      `"${s.currentStation}"`,
      `"${s.nextStation}"`,
      s.lat,
      s.lon,
      s.ele,
      s.speedKph,
      s.heading,
      s.dwellRemainingSec,
      'transit_telemetry',
    ].join(','));
  }

  // Telemetry samples for MRT-3 Train 002
  for (const s of mrt3Samples) {
    rows.push([
      s.isoTime,
      s.timeSec,
      `"${s.vehicleId}"`,
      s.lineId,
      s.status,
      `"${s.currentStation}"`,
      `"${s.nextStation}"`,
      s.lat,
      s.lon,
      s.ele,
      s.speedKph,
      s.heading,
      s.dwellRemainingSec,
      'transit_telemetry',
    ].join(','));
  }

  return rows.join('\n');
}
