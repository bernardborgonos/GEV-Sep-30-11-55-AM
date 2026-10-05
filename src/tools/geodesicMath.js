/**
 * GEODESIC MATH FACADE
 * High-performance, self-contained geospatial mathematics engine with zero foreign dependencies.
 * Implements spherical geodesy, geodesic path and polygon metrics, ray-casting containment,
 * and concentric range-ring generation based on standard ellipsoidal/spherical Earth models.
 *
 * @module src/tools/geodesicMath.js
 */

/** Standard IUGG Mean Earth Radius in meters (R1) */
export const EARTH_RADIUS_METERS = 6371008.8;

/** Standard IUGG Mean Earth Radius in kilometers */
export const EARTH_RADIUS_KM = 6371.0088;

/** Standard IUGG Mean Earth Radius in nautical miles */
export const EARTH_RADIUS_NM = 6371008.8 / 1852; // ~3440.069546

/** Exact meters per international nautical mile (defined in 1929) */
export const METERS_PER_NM = 1852;

/** Meters per kilometer */
export const METERS_PER_KM = 1000;

/** Radians to Degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;

/** Degrees to Radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/**
 * Normalizes an input coordinate into a uniform [lon, lat, alt?] tuple.
 * Accepts:
 *  - [lon, lat] or [lon, lat, alt]
 *  - { lon, lat, alt? }
 *  - { lng, lat, alt? }
 *  - { longitude, latitude, altitude? }
 *
 * @param {Array<number>|Object} coord
 * @returns {[number, number, number|undefined]} [longitude, latitude, altitude]
 */
export function normalizeCoordinate(coord) {
  if (!coord) {
    throw new TypeError('Invalid coordinate: coordinate is null or undefined');
  }

  let lon;
  let lat;
  let alt;

  if (Array.isArray(coord)) {
    if (coord.length < 2) {
      throw new TypeError(`Invalid coordinate array: expected at least 2 elements, received ${coord.length}`);
    }
    lon = Number(coord[0]);
    lat = Number(coord[1]);
    alt = coord.length >= 3 && coord[2] !== undefined ? Number(coord[2]) : undefined;
  } else if (typeof coord === 'object') {
    lon = Number(coord.lon ?? coord.lng ?? coord.longitude);
    lat = Number(coord.lat ?? coord.latitude);
    alt = coord.alt !== undefined ? Number(coord.alt) : (coord.altitude !== undefined ? Number(coord.altitude) : undefined);
  } else {
    throw new TypeError(`Invalid coordinate type: expected array or object, received ${typeof coord}`);
  }

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new TypeError(`Invalid coordinate values: non-finite lon (${lon}) or lat (${lat})`);
  }

  // Normalize longitude to [-180, 180]
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;

  // Clamp latitude to [-90, 90]
  if (lat > 90) lat = 90;
  if (lat < -90) lat = -90;

  return alt !== undefined ? [lon, lat, alt] : [lon, lat];
}

/**
 * Calculates great-circle distance between two coordinates using the Haversine formula.
 *
 * @param {Array<number>|Object} p1 - First coordinate [lon, lat]
 * @param {Array<number>|Object} p2 - Second coordinate [lon, lat]
 * @param {string} [unit='m'] - Unit of distance: 'm' | 'km' | 'nm' | 'all'
 * @param {number} [radius=EARTH_RADIUS_METERS] - Spherical Earth radius in meters
 * @returns {number|{meters: number, kilometers: number, nauticalMiles: number}} Distance in requested unit
 */
export function haversineDistance(p1, p2, unit = 'm', radius = EARTH_RADIUS_METERS) {
  const [lon1, lat1] = normalizeCoordinate(p1);
  const [lon2, lat2] = normalizeCoordinate(p2);

  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaPhi = (lat2 - lat1) * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const sinDeltaPhiHalf = Math.sin(deltaPhi / 2);
  const sinDeltaLambdaHalf = Math.sin(deltaLambda / 2);

  const a = sinDeltaPhiHalf * sinDeltaPhiHalf
    + Math.cos(phi1) * Math.cos(phi2) * sinDeltaLambdaHalf * sinDeltaLambdaHalf;

  // Numerical safeguard for antipodal or identical points
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  const distanceMeters = radius * c;

  const normalizedUnit = String(unit).toLowerCase();
  switch (normalizedUnit) {
    case 'km':
    case 'kilometers':
      return distanceMeters / METERS_PER_KM;
    case 'nm':
    case 'nauticalmiles':
      return distanceMeters / METERS_PER_NM;
    case 'all':
      return {
        meters: distanceMeters,
        kilometers: distanceMeters / METERS_PER_KM,
        nauticalMiles: distanceMeters / METERS_PER_NM,
      };
    case 'm':
    case 'meters':
    default:
      return distanceMeters;
  }
}

/**
 * Calculates Haversine distance in meters.
 * @param {Array<number>|Object} p1
 * @param {Array<number>|Object} p2
 * @param {number} [radius=EARTH_RADIUS_METERS]
 * @returns {number} Distance in meters
 */
export function haversineDistanceMeters(p1, p2, radius = EARTH_RADIUS_METERS) {
  return haversineDistance(p1, p2, 'm', radius);
}

/**
 * Calculates Haversine distance in kilometers.
 * @param {Array<number>|Object} p1
 * @param {Array<number>|Object} p2
 * @param {number} [radius=EARTH_RADIUS_METERS]
 * @returns {number} Distance in kilometers
 */
export function haversineDistanceKm(p1, p2, radius = EARTH_RADIUS_METERS) {
  return haversineDistance(p1, p2, 'km', radius);
}

/**
 * Calculates Haversine distance in nautical miles.
 * @param {Array<number>|Object} p1
 * @param {Array<number>|Object} p2
 * @param {number} [radius=EARTH_RADIUS_METERS]
 * @returns {number} Distance in nautical miles
 */
export function haversineDistanceNm(p1, p2, radius = EARTH_RADIUS_METERS) {
  return haversineDistance(p1, p2, 'nm', radius);
}

/**
 * Computes initial great-circle bearing from p1 to p2 in degrees [0, 360).
 *
 * @param {Array<number>|Object} p1
 * @param {Array<number>|Object} p2
 * @returns {number} Bearing in degrees from true North [0, 360)
 */
export function initialBearing(p1, p2) {
  const [lon1, lat1] = normalizeCoordinate(p1);
  const [lon2, lat2] = normalizeCoordinate(p2);

  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  const bearing = (theta * RAD_TO_DEG + 360) % 360;
  return bearing;
}

/**
 * Computes the geodesic destination point starting from an origin coordinate,
 * traveling a given distance at a given bearing along a great circle.
 *
 * @param {Array<number>|Object} origin - Starting coordinate [lon, lat]
 * @param {number} distanceMeters - Distance in meters
 * @param {number} bearingDegrees - Bearing from true North in degrees
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {[number, number]} Destination coordinate [lon, lat]
 */
export function destinationPoint(origin, distanceMeters, bearingDegrees, radius = EARTH_RADIUS_METERS) {
  const [lon1, lat1] = normalizeCoordinate(origin);

  const delta = distanceMeters / radius;
  const theta = bearingDegrees * DEG_TO_RAD;
  const phi1 = lat1 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;

  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const destLat = phi2 * RAD_TO_DEG;
  let destLon = (lambda2 * RAD_TO_DEG + 540) % 360 - 180;

  return [destLon, destLat];
}

/**
 * Computes the bounding box of a collection of coordinates.
 *
 * @param {Array<Array<number>|Object>} coordinates
 * @returns {{minLon: number, minLat: number, maxLon: number, maxLat: number, centerLon: number, centerLat: number, spanLon: number, spanLat: number}}
 */
export function calculateBoundingBox(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return { minLon: 0, minLat: 0, maxLon: 0, maxLat: 0, centerLon: 0, centerLat: 0, spanLon: 0, spanLat: 0 };
  }

  // Handle single [lon, lat] coordinate pair
  if (Array.isArray(coordinates) && coordinates.length === 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    const [lon, lat] = coordinates;
    return {
      minLon: lon,
      minLat: lat,
      maxLon: lon,
      maxLat: lat,
      centerLon: lon,
      centerLat: lat,
      spanLon: 0,
      spanLat: 0,
    };
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const rawCoord of coordinates) {
    // Handle nested rings if array of arrays of coords
    if (Array.isArray(rawCoord) && Array.isArray(rawCoord[0])) {
      const subBox = calculateBoundingBox(rawCoord);
      minLon = Math.min(minLon, subBox.minLon);
      minLat = Math.min(minLat, subBox.minLat);
      maxLon = Math.max(maxLon, subBox.maxLon);
      maxLat = Math.max(maxLat, subBox.maxLat);
      continue;
    }

    const [lon, lat] = normalizeCoordinate(rawCoord);
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  const centerLon = minLon + spanLon / 2;
  const centerLat = minLat + spanLat / 2;

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
    centerLon,
    centerLat,
    spanLon,
    spanLat,
  };
}

/**
 * Computes geographic centroid of a collection of coordinates on the sphere.
 * Uses 3D Cartesian vector averaging to avoid polar and antimeridian distortions.
 *
 * @param {Array<Array<number>|Object>} coordinates
 * @returns {[number, number]} [lon, lat] centroid
 */
export function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return [0, 0];
  }

  let xSum = 0;
  let ySum = 0;
  let zSum = 0;
  let count = 0;

  for (const rawCoord of coordinates) {
    if (Array.isArray(rawCoord) && Array.isArray(rawCoord[0])) {
      const [cLon, cLat] = calculateCentroid(rawCoord);
      const phi = cLat * DEG_TO_RAD;
      const lam = cLon * DEG_TO_RAD;
      xSum += Math.cos(phi) * Math.cos(lam);
      ySum += Math.cos(phi) * Math.sin(lam);
      zSum += Math.sin(phi);
      count += 1;
      continue;
    }

    const [lon, lat] = normalizeCoordinate(rawCoord);
    const phi = lat * DEG_TO_RAD;
    const lam = lon * DEG_TO_RAD;
    xSum += Math.cos(phi) * Math.cos(lam);
    ySum += Math.cos(phi) * Math.sin(lam);
    zSum += Math.sin(phi);
    count += 1;
  }

  if (count === 0) return [0, 0];

  const x = xSum / count;
  const y = ySum / count;
  const z = zSum / count;

  const hyp = Math.sqrt(x * x + y * y);
  const lon = Math.atan2(y, x) * RAD_TO_DEG;
  const lat = Math.atan2(z, hyp) * RAD_TO_DEG;

  return [lon, lat];
}

/**
 * Calculates path distance summation across multi-node line segments.
 *
 * @param {Array<Array<number>|Object>} nodes - Ordered list of waypoints
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {{
 *   totalMeters: number,
 *   totalKm: number,
 *   totalNm: number,
 *   nodeCount: number,
 *   segmentDistances: Array<{
 *     fromIndex: number,
 *     toIndex: number,
 *     from: [number, number],
 *     to: [number, number],
 *     distanceMeters: number,
 *     distanceKm: number,
 *     distanceNm: number,
 *     bearingDeg: number
 *   }>,
 *   cumulativeDistancesMeters: Array<number>,
 *   boundingBox: Object,
 *   midpoint: [number, number]
 * }}
 */
export function calculatePathDistance(nodes, radius = EARTH_RADIUS_METERS) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return {
      totalMeters: 0,
      totalKm: 0,
      totalNm: 0,
      nodeCount: 0,
      segmentDistances: [],
      cumulativeDistancesMeters: [0],
      boundingBox: calculateBoundingBox([]),
      midpoint: [0, 0],
    };
  }

  const normalizedNodes = nodes.map(normalizeCoordinate);
  const segmentDistances = [];
  const cumulativeDistancesMeters = [0];
  let runningMeters = 0;

  for (let i = 0; i < normalizedNodes.length - 1; i += 1) {
    const from = normalizedNodes[i];
    const to = normalizedNodes[i + 1];
    const segMeters = haversineDistanceMeters(from, to, radius);
    const bearing = initialBearing(from, to);

    runningMeters += segMeters;
    cumulativeDistancesMeters.push(runningMeters);

    segmentDistances.push({
      fromIndex: i,
      toIndex: i + 1,
      from,
      to,
      distanceMeters: segMeters,
      distanceKm: segMeters / METERS_PER_KM,
      distanceNm: segMeters / METERS_PER_NM,
      bearingDeg: bearing,
    });
  }

  const totalMeters = runningMeters;
  const boundingBox = calculateBoundingBox(normalizedNodes);
  const midpoint = calculateCentroid(normalizedNodes);

  return {
    totalMeters,
    totalKm: totalMeters / METERS_PER_KM,
    totalNm: totalMeters / METERS_PER_NM,
    nodeCount: normalizedNodes.length,
    segmentDistances,
    cumulativeDistancesMeters,
    boundingBox,
    midpoint,
  };
}

/**
 * Computes geodesic perimeter of a spherical polygon in meters.
 *
 * @param {Array<Array<number>|Object>} coordinates - Polygon vertices
 * @param {number} [radius=EARTH_RADIUS_METERS]
 * @returns {{perimeterMeters: number, perimeterKm: number, perimeterNm: number}}
 */
export function calculatePolygonPerimeter(coordinates, radius = EARTH_RADIUS_METERS) {
  if (!coordinates || coordinates.length < 3) {
    return { perimeterMeters: 0, perimeterKm: 0, perimeterNm: 0 };
  }

  const pts = coordinates.map(normalizeCoordinate);
  let totalMeters = 0;
  const n = pts.length;

  for (let i = 0; i < n; i += 1) {
    const nextIdx = (i + 1) % n;
    // If polygon is explicitly closed (last vertex === first vertex), don't double count closing segment
    if (i === n - 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) {
      continue;
    }
    totalMeters += haversineDistanceMeters(pts[i], pts[nextIdx], radius);
  }

  return {
    perimeterMeters: totalMeters,
    perimeterKm: totalMeters / METERS_PER_KM,
    perimeterNm: totalMeters / METERS_PER_NM,
  };
}

/**
 * Helper to convert (lon, lat) degrees to a 3D unit vector on the unit sphere.
 * @private
 */
function toUnitVector(lonDeg, latDeg) {
  const phi = latDeg * DEG_TO_RAD;
  const lambda = lonDeg * DEG_TO_RAD;
  const cosPhi = Math.cos(phi);
  return [
    cosPhi * Math.cos(lambda),
    cosPhi * Math.sin(lambda),
    Math.sin(phi),
  ];
}

/**
 * Vector dot product
 * @private
 */
function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Vector cross product
 * @private
 */
function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Computes signed solid angle (spherical excess) of a spherical triangle
 * subtended by three unit vectors using the van Oosterom & Strackee (1983) formula.
 * @private
 */
function sphericalTriangleExcess(a, b, c) {
  const cross = crossProduct(b, c);
  const det = dotProduct(a, cross);
  const den = 1 + dotProduct(a, b) + dotProduct(a, c) + dotProduct(b, c);
  return 2 * Math.atan2(det, den);
}

/**
 * Computes spherical polygon geodesic area using the exact spherical excess integration
 * across all triangulated great-circle sectors.
 *
 * @param {Array<Array<number>|Object>} coordinates - Ring vertices
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {{
 *   areaSquareMeters: number,
 *   areaSquareKm: number,
 *   areaSquareNm: number,
 *   areaHectares: number
 * }}
 */
export function calculatePolygonGeodesicArea(coordinates, radius = EARTH_RADIUS_METERS) {
  if (!coordinates || coordinates.length < 3) {
    return {
      areaSquareMeters: 0,
      areaSquareKm: 0,
      areaSquareNm: 0,
      areaHectares: 0,
    };
  }

  // Handle GeoJSON multi-ring [[outer], [hole1], ...] if passed
  if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    const outerMetrics = calculatePolygonGeodesicArea(coordinates[0], radius);
    let totalHoleM2 = 0;
    for (let h = 1; h < coordinates.length; h += 1) {
      const holeMetrics = calculatePolygonGeodesicArea(coordinates[h], radius);
      totalHoleM2 += holeMetrics.areaSquareMeters;
    }
    const netAreaM2 = Math.max(0, outerMetrics.areaSquareMeters - totalHoleM2);
    return {
      areaSquareMeters: netAreaM2,
      areaSquareKm: netAreaM2 / 1e6,
      areaSquareNm: netAreaM2 / (METERS_PER_NM * METERS_PER_NM),
      areaHectares: netAreaM2 / 10000,
    };
  }

  const rawPts = coordinates.map(normalizeCoordinate);

  // If closed ring (last point == first point), slice out last point for triangulation
  let pts = rawPts;
  if (
    pts.length > 3
    && pts[0][0] === pts[pts.length - 1][0]
    && pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts = pts.slice(0, pts.length - 1);
  }

  if (pts.length < 3) {
    return {
      areaSquareMeters: 0,
      areaSquareKm: 0,
      areaSquareNm: 0,
      areaHectares: 0,
    };
  }

  const unitVectors = pts.map((p) => toUnitVector(p[0], p[1]));
  let totalExcess = 0;

  // Triangulate from unitVectors[0]
  for (let i = 1; i < unitVectors.length - 1; i += 1) {
    totalExcess += sphericalTriangleExcess(unitVectors[0], unitVectors[i], unitVectors[i + 1]);
  }

  const absExcess = Math.abs(totalExcess);
  const areaSquareMeters = absExcess * radius * radius;

  return {
    areaSquareMeters,
    areaSquareKm: areaSquareMeters / 1e6,
    areaSquareNm: areaSquareMeters / (METERS_PER_NM * METERS_PER_NM),
    areaHectares: areaSquareMeters / 10000,
  };
}

/**
 * Computes complete geodesic polygon metrics (area, perimeter, centroid, bounding box).
 *
 * @param {Array<Array<number>|Object>} coordinates
 * @param {number} [radius=EARTH_RADIUS_METERS]
 * @returns {Object} Comprehensive polygon metrics
 */
export function calculatePolygonMetrics(coordinates, radius = EARTH_RADIUS_METERS) {
  const area = calculatePolygonGeodesicArea(coordinates, radius);
  const perimeter = calculatePolygonPerimeter(coordinates, radius);
  const boundingBox = calculateBoundingBox(coordinates);
  const centroid = calculateCentroid(coordinates);

  return {
    ...area,
    ...perimeter,
    boundingBox,
    centroid,
    nodeCount: Array.isArray(coordinates) ? coordinates.length : 0,
  };
}

/**
 * Generates equidistant great-circle vertices forming a range ring around a center coordinate.
 *
 * @param {Array<number>|Object} center - [lon, lat] center
 * @param {number} radiusMeters - Radius in meters
 * @param {number} [segments=64] - Number of radial vertices (default: 64)
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {Array<[number, number]>} Closed loop array of [lon, lat] vertices (length: segments + 1)
 */
export function generateRangeRingVertices(center, radiusMeters, segments = 64, radius = EARTH_RADIUS_METERS) {
  const normCenter = normalizeCoordinate(center);
  const ringVertices = [];
  const count = Math.max(8, Math.min(360, segments));
  const step = 360 / count;

  for (let i = 0; i <= count; i += 1) {
    const bearing = (i * step) % 360;
    const vertex = destinationPoint(normCenter, radiusMeters, bearing, radius);
    ringVertices.push(vertex);
  }

  return ringVertices;
}

/**
 * Generates concentric range rings equidistant to a center point.
 *
 * @param {Array<number>|Object} center - [lon, lat] center
 * @param {Array<number>|{count: number, spacingMeters: number, startRadiusMeters?: number}} radiiConfig
 *        List of radii in meters or configuration object
 * @param {number} [segments=64] - Vertices per ring
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {Array<{
 *   ringIndex: number,
 *   radiusMeters: number,
 *   radiusKm: number,
 *   radiusNm: number,
 *   circumferenceMeters: number,
 *   areaSquareMeters: number,
 *   vertices: Array<[number, number]>
 * }>}
 */
export function generateConcentricRangeRings(center, radiiConfig, segments = 64, radius = EARTH_RADIUS_METERS) {
  const normCenter = normalizeCoordinate(center);
  let radiiList = [];

  if (Array.isArray(radiiConfig)) {
    radiiList = radiiConfig.map(Number).filter((r) => Number.isFinite(r) && r > 0);
  } else if (typeof radiiConfig === 'object' && radiiConfig !== null) {
    const count = Math.max(1, Number(radiiConfig.count) || 3);
    const spacing = Number(radiiConfig.spacingMeters) || 10000;
    const start = Number(radiiConfig.startRadiusMeters) || spacing;
    for (let i = 0; i < count; i += 1) {
      radiiList.push(start + i * spacing);
    }
  }

  // Sort radii ascending
  radiiList.sort((a, b) => a - b);

  return radiiList.map((radiusMeters, index) => {
    const vertices = generateRangeRingVertices(normCenter, radiusMeters, segments, radius);

    // Spherical cap area: A = 2 * PI * R^2 * (1 - cos(theta)), where theta = r / R
    const theta = radiusMeters / radius;
    const capAreaM2 = 2 * Math.PI * radius * radius * (1 - Math.cos(theta));
    // Geodesic circumference along small circle: C = 2 * PI * R * sin(theta)
    const circumMeters = 2 * Math.PI * radius * Math.sin(theta);

    return {
      ringIndex: index,
      radiusMeters,
      radiusKm: radiusMeters / METERS_PER_KM,
      radiusNm: radiusMeters / METERS_PER_NM,
      circumferenceMeters: circumMeters,
      areaSquareMeters: capAreaM2,
      vertices,
    };
  });
}

/**
 * Robust Point-in-Polygon (PIP) ray-casting test.
 * Determines whether a given point (lon, lat) falls strictly within or on the boundary of a polygon.
 * Supports simple rings and polygons with holes.
 *
 * @param {Array<number>|Object} point - Test point [lon, lat]
 * @param {Array<Array<number>>|Array<Array<Array<number>>>} polygonCoordinates - Outer ring or GeoJSON rings
 * @returns {boolean} True if point is inside polygon
 */
export function pointInPolygon(point, polygonCoordinates) {
  if (!point || !polygonCoordinates || polygonCoordinates.length === 0) {
    return false;
  }

  const [px, py] = normalizeCoordinate(point);

  // Check if GeoJSON Polygon coordinates: [[[lon, lat], ...], [hole...]]
  if (Array.isArray(polygonCoordinates[0]) && Array.isArray(polygonCoordinates[0][0])) {
    const outerRing = polygonCoordinates[0];
    const isInsideOuter = pointInPolygonRing(px, py, outerRing);
    if (!isInsideOuter) return false;

    // Must NOT be inside any hole
    for (let h = 1; h < polygonCoordinates.length; h += 1) {
      if (pointInPolygonRing(px, py, polygonCoordinates[h])) {
        return false;
      }
    }
    return true;
  }

  return pointInPolygonRing(px, py, polygonCoordinates);
}

/**
 * Inner Ray-Casting algorithm for a single ring of vertices.
 * @private
 */
function pointInPolygonRing(px, py, ring) {
  if (!ring || ring.length < 3) return false;

  // Fast bounding box rejection
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < ring.length; i += 1) {
    const [x, y] = ring[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false;
  }

  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Check if point is exactly on vertex
    if ((px === xi && py === yi) || (px === xj && py === yj)) {
      return true;
    }

    // Check if ray crosses edge
    const intersect = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Determines whether a coordinate falls inside a geodesic spherical circle.
 *
 * @param {Array<number>|Object} point - Coordinate to test
 * @param {Array<number>|Object} center - Circle center
 * @param {number} radiusMeters - Circle radius in meters
 * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius
 * @returns {{
 *   inside: boolean,
 *   distanceMeters: number,
 *   radiusMeters: number,
 *   marginMeters: number
 * }}
 */
export function pointInCircle(point, center, radiusMeters, radius = EARTH_RADIUS_METERS) {
  const normPoint = normalizeCoordinate(point);
  const normCenter = normalizeCoordinate(center);

  const distM = haversineDistanceMeters(normPoint, normCenter, radius);
  const inside = distM <= radiusMeters;
  const marginMeters = radiusMeters - distM;

  return {
    inside,
    distanceMeters: distM,
    radiusMeters,
    marginMeters,
  };
}

/**
 * Checks whether two planar geographic line segments (p1-p2 and p3-p4) intersect.
 * Uses orientation-based counter-clockwise cross products.
 *
 * @param {{lat: number, lng: number}} p1
 * @param {{lat: number, lng: number}} p2
 * @param {{lat: number, lng: number}} p3
 * @param {{lat: number, lng: number}} p4
 * @returns {boolean}
 */
export function doSegmentsIntersect(p1, p2, p3, p4) {
  const getLat = (p) => p.lat ?? p.latitude ?? (Array.isArray(p) ? p[1] : 0);
  const getLng = (p) => p.lng ?? p.lon ?? p.longitude ?? (Array.isArray(p) ? p[0] : 0);

  const aLat = getLat(p1);
  const aLng = getLng(p1);
  const bLat = getLat(p2);
  const bLng = getLng(p2);
  const cLat = getLat(p3);
  const cLng = getLng(p3);
  const dLat = getLat(p4);
  const dLng = getLng(p4);

  // If endpoints are identical, they touch at a shared vertex rather than cross
  if ((aLat === cLat && aLng === cLng) ||
      (aLat === dLat && aLng === dLng) ||
      (bLat === cLat && bLng === cLng) ||
      (bLat === dLat && bLng === dLng)) {
    return false;
  }

  function ccw(l1, g1, l2, g2, l3, g3) {
    return (l3 - l1) * (g2 - g1) > (l2 - l1) * (g3 - g1);
  }

  const o1 = ccw(aLat, aLng, cLat, cLng, dLat, dLng);
  const o2 = ccw(bLat, bLng, cLat, cLng, dLat, dLng);
  const o3 = ccw(aLat, aLng, bLat, bLng, cLat, cLng);
  const o4 = ccw(aLat, aLng, bLat, bLng, dLat, dLng);

  return (o1 !== o2) && (o3 !== o4);
}

/**
 * Checks if a polygon boundary has self-intersecting non-adjacent edges (bowtie / complex polygon).
 *
 * @param {Array<{lat: number, lng: number}>} coords
 * @returns {{ isSelfIntersecting: boolean, count: number }}
 */
export function checkPolygonSelfIntersection(coords = []) {
  if (!Array.isArray(coords) || coords.length < 4) {
    return { isSelfIntersecting: false, count: 0 };
  }
  const n = coords.length;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip if adjacent wrap-around
      if (i === 0 && j === n - 1) continue;

      const p3 = coords[j];
      const p4 = coords[(j + 1) % n];

      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        count++;
      }
    }
  }

  return {
    isSelfIntersecting: count > 0,
    count,
  };
}
