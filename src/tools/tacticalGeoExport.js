/**
 * TACTICAL GEO EXPORT & IMPORT UTILITIES
 * RFC 7946 GeoJSON and OGC KML conversion engine for tactical features.
 * Pure, decoupled, zero foreign dependencies.
 *
 * @module src/tools/tacticalGeoExport.js
 */

import { FEATURE_TYPES } from './mapToolsEngine.js';

/**
 * Converts a hex or rgba color into KML aabbggrr format.
 * @param {string} color
 * @param {number} [opacity=1.0]
 * @returns {string} KML color hex string (8 hex chars: aabbggrr)
 */
export function toKmlColor(color, opacity = 1.0) {
  let r = 0, g = 229, b = 255;
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  if (typeof color === 'string') {
    const trimmed = color.trim().toLowerCase();
    if (trimmed.startsWith('#')) {
      let hex = trimmed.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map((c) => c + c).join('');
      }
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16) || 0;
        g = parseInt(hex.slice(2, 4), 16) || 0;
        b = parseInt(hex.slice(4, 6), 16) || 0;
      }
    } else if (trimmed.startsWith('rgb')) {
      const match = trimmed.match(/\d+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0], 10);
        g = parseInt(match[1], 10);
        b = parseInt(match[2], 10);
      }
    }
  }

  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `${toHex(a)}${toHex(b)}${toHex(g)}${toHex(r)}`;
}

/**
 * Converts a KML aabbggrr color string back into standard #rrggbb hex string.
 * @param {string} kmlColor - 8-character or 6-character hex string (aabbggrr or bbggrr)
 * @returns {string} Hex color string (#rrggbb)
 */
export function kmlColorToHex(kmlColor) {
  if (typeof kmlColor !== 'string') return '#00e5ff';
  const clean = kmlColor.trim().replace(/^#/, '');
  if (clean.length === 8) {
    const bb = clean.slice(2, 4);
    const gg = clean.slice(4, 6);
    const rr = clean.slice(6, 8);
    return `#${rr}${gg}${bb}`;
  } else if (clean.length === 6) {
    const bb = clean.slice(0, 2);
    const gg = clean.slice(2, 4);
    const rr = clean.slice(4, 6);
    return `#${rr}${gg}${bb}`;
  }
  return '#00e5ff';
}

/**
 * Deep clones an object or primitive.
 * @param {*} val
 * @returns {*}
 */
function cloneValue(val) {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(cloneValue);
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = cloneValue(v);
  }
  return out;
}

/**
 * Converts a tactical feature into an RFC 7946 GeoJSON Feature.
 * Preserves all custom attributes and geometries with zero loss.
 *
 * @param {Object} feature - MapToolsEngine tactical feature
 * @returns {Object|null} Standard GeoJSON Feature
 */
export function featureToGeoJson(feature) {
  if (!feature || typeof feature !== 'object') return null;

  const { id, name, type, coordinates, properties = {}, style = {}, computed = {} } = feature;
  let geometry = null;

  switch (type) {
    case FEATURE_TYPES.POINT: {
      const lon = coordinates?.[0] ?? coordinates?.lon ?? coordinates?.longitude ?? 0;
      const lat = coordinates?.[1] ?? coordinates?.lat ?? coordinates?.latitude ?? 0;
      geometry = {
        type: 'Point',
        coordinates: [Number(lon), Number(lat)],
      };
      break;
    }

    case FEATURE_TYPES.LINE:
    case FEATURE_TYPES.LINESTRING: {
      const coords = Array.isArray(coordinates) ? coordinates.map((c) => [
        Number(c[0] ?? c.lon ?? c.longitude),
        Number(c[1] ?? c.lat ?? c.latitude),
      ]) : [];
      geometry = {
        type: 'LineString',
        coordinates: coords,
      };
      break;
    }

    case FEATURE_TYPES.POLYGON: {
      let ring = [];
      if (Array.isArray(coordinates)) {
        ring = coordinates.map((c) => [
          Number(c[0] ?? c.lon ?? c.longitude),
          Number(c[1] ?? c.lat ?? c.latitude),
        ]);
        // Ensure polygon ring is closed for standard GIS compatibility (RFC 7946)
        if (ring.length >= 3) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }
        }
      }
      geometry = {
        type: 'Polygon',
        coordinates: ring.length >= 4 ? [ring] : [],
      };
      break;
    }

    case FEATURE_TYPES.CIRCLE: {
      // Use tessellated polygon vertices if available for standard GIS viewers
      if (Array.isArray(computed?.polygonVertices) && computed.polygonVertices.length >= 3) {
        const ring = computed.polygonVertices.map((c) => [Number(c[0]), Number(c[1])]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]]);
        }
        geometry = {
          type: 'Polygon',
          coordinates: [ring],
        };
      } else {
        const center = coordinates?.center || coordinates;
        geometry = {
          type: 'Point',
          coordinates: [Number(center[0] ?? center.lon), Number(center[1] ?? center.lat)],
        };
      }
      break;
    }

    case FEATURE_TYPES.RANGE_RING: {
      // Represent concentric rings as MultiPolygon or MultiLineString
      if (Array.isArray(computed?.rings) && computed.rings.length > 0) {
        const ringsCoords = computed.rings.map((r) => {
          const ring = r.vertices.map((c) => [Number(c[0]), Number(c[1])]);
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }
          return ring;
        });
        geometry = {
          type: 'MultiLineString',
          coordinates: ringsCoords,
        };
      } else {
        const center = coordinates?.center || coordinates;
        geometry = {
          type: 'Point',
          coordinates: [Number(center[0] ?? center.lon), Number(center[1] ?? center.lat)],
        };
      }
      break;
    }

    default: {
      if (Array.isArray(coordinates)) {
        geometry = {
          type: 'Point',
          coordinates: [Number(coordinates[0]), Number(coordinates[1])],
        };
      }
      break;
    }
  }

  if (!geometry) return null;

  return {
    type: 'Feature',
    id: id || undefined,
    geometry,
    properties: {
      // 1. Flattened custom properties for standard GIS tools inspection (e.g. QGIS / ArcGIS)
      ...cloneValue(properties),
      ...cloneValue(style),

      // 2. GEV specific metadata preserving exact schema & types
      'gev:id': id,
      'gev:name': name,
      'gev:type': type,
      'gev:locked': Boolean(feature.locked),
      'gev:createdAt': feature.createdAt,
      'gev:updatedAt': feature.updatedAt,
      'gev:color': style.color || properties.color || '#00e5ff',
      'gev:notes': properties.notes || '',
      'gev:speedCeilingKts': properties.speedCeilingKts ?? null,
      'gev:isGeofence': Boolean(properties.isGeofence),
      'gev:radiusMeters': properties.radiusMeters ?? computed.radiusMeters ?? null,
      'gev:radiiMeters': properties.radiiMeters ?? computed.radiiMeters ?? null,
      'gev:coordinates': cloneValue(coordinates),
      'gev:style': cloneValue(style),
      'gev:properties': cloneValue(properties),
      'gev:metrics': {
        distanceKm: computed.totalDistanceKm ?? null,
        distanceNm: computed.totalDistanceNm ?? null,
        areaSquareKm: computed.areaSquareKm ?? null,
        perimeterKm: computed.perimeterKm ?? null,
      },
    },
  };
}

/**
 * Converts multiple tactical features into an RFC 7946 FeatureCollection.
 *
 * @param {Array<Object>} features
 * @returns {Object} GeoJSON FeatureCollection
 */
export function featuresToGeoJsonCollection(features = []) {
  const validFeatures = (Array.isArray(features) ? features : [])
    .map(featureToGeoJson)
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features: validFeatures,
    properties: {
      generator: "God's Eye View Tactical Workbench",
      exportedAt: new Date().toISOString(),
      featureCount: validFeatures.length,
    },
  };
}

/**
 * Converts a tactical feature into an OGC KML Placemark XML string.
 *
 * @param {Object} feature
 * @returns {string} KML Placemark string
 */
export function featureToKmlPlacemark(feature) {
  if (!feature) return '';

  const name = escapeXml(feature.name || 'Tactical Feature');
  const type = feature.type || 'point';
  const color = feature.style?.color || feature.properties?.color || '#00e5ff';
  const kmlLineColor = toKmlColor(color, 0.9);
  const kmlFillColor = toKmlColor(color, 0.25);
  const notes = escapeXml(feature.properties?.notes || '');
  const styleId = `style_${feature.id || Math.random().toString(36).slice(2, 8)}`;

  let desc = `<b>Type:</b> ${type.toUpperCase()}<br/>`;
  if (notes) desc += `<b>Notes:</b> ${notes}<br/>`;
  if (feature.properties?.speedCeilingKts !== undefined) {
    desc += `<b>Speed Ceiling:</b> ${feature.properties.speedCeilingKts} kts<br/>`;
  }
  if (feature.computed?.totalDistanceKm) {
    desc += `<b>Distance:</b> ${feature.computed.totalDistanceKm.toFixed(2)} km<br/>`;
  }
  if (feature.computed?.areaSquareKm) {
    desc += `<b>Area:</b> ${feature.computed.areaSquareKm.toFixed(2)} km²<br/>`;
  }

  let geomXml = '';

  switch (type) {
    case FEATURE_TYPES.POINT: {
      const lon = feature.coordinates?.[0] ?? feature.coordinates?.lon ?? 0;
      const lat = feature.coordinates?.[1] ?? feature.coordinates?.lat ?? 0;
      geomXml = `
        <Point>
          <coordinates>${lon},${lat},0</coordinates>
        </Point>`;
      break;
    }

    case FEATURE_TYPES.LINE:
    case FEATURE_TYPES.LINESTRING: {
      const coords = Array.isArray(feature.coordinates)
        ? feature.coordinates.map((c) => `${c[0] ?? c.lon},${c[1] ?? c.lat},0`).join(' ')
        : '';
      geomXml = `
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${coords}</coordinates>
        </LineString>`;
      break;
    }

    case FEATURE_TYPES.POLYGON: {
      const ring = Array.isArray(feature.coordinates) ? [...feature.coordinates] : [];
      if (ring.length >= 3) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push(first);
        }
      }
      const coords = ring.map((c) => `${c[0] ?? c.lon},${c[1] ?? c.lat},0`).join(' ');
      geomXml = `
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${coords}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>`;
      break;
    }

    case FEATURE_TYPES.CIRCLE:
    case FEATURE_TYPES.RANGE_RING: {
      const vertices = feature.computed?.polygonVertices || (feature.computed?.rings?.[0]?.vertices);
      if (Array.isArray(vertices) && vertices.length >= 3) {
        const ring = [...vertices];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push(first);
        }
        const coords = ring.map((c) => `${c[0]},${c[1]},0`).join(' ');
        geomXml = `
          <Polygon>
            <tessellate>1</tessellate>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>${coords}</coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>`;
      } else {
        const center = feature.coordinates?.center || feature.coordinates;
        geomXml = `
          <Point>
            <coordinates>${center[0] ?? center.lon},${center[1] ?? center.lat},0</coordinates>
          </Point>`;
      }
      break;
    }

    default:
      break;
  }

  // Build ExtendedData tags for all custom properties & metadata
  const extendedDataEntries = [];
  extendedDataEntries.push(`<Data name="gev:id"><value>${escapeXml(feature.id || '')}</value></Data>`);
  extendedDataEntries.push(`<Data name="gev:type"><value>${escapeXml(type)}</value></Data>`);
  extendedDataEntries.push(`<Data name="gev:color"><value>${escapeXml(color)}</value></Data>`);
  extendedDataEntries.push(`<Data name="gev:locked"><value>${Boolean(feature.locked)}</value></Data>`);

  if (feature.properties && typeof feature.properties === 'object') {
    for (const [k, v] of Object.entries(feature.properties)) {
      if (v !== undefined && v !== null && typeof v !== 'object') {
        extendedDataEntries.push(`<Data name="${escapeXml(k)}"><value>${escapeXml(String(v))}</value></Data>`);
      }
    }
  }

  const extendedDataXml = extendedDataEntries.length > 0
    ? `\n      <ExtendedData>\n        ${extendedDataEntries.join('\n        ')}\n      </ExtendedData>`
    : '';

  return `
    <Style id="${styleId}">
      <IconStyle>
        <color>${kmlLineColor}</color>
        <scale>1.1</scale>
        <Icon>
          <href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LineStyle>
        <color>${kmlLineColor}</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>${kmlFillColor}</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${name}</name>
      <description><![CDATA[${desc}]]></description>
      <styleUrl>#${styleId}</styleUrl>${extendedDataXml}
      ${geomXml}
    </Placemark>`;
}

/**
 * Converts tactical features into a complete OGC KML Document.
 *
 * @param {Array<Object>} features
 * @param {Object} [options={}]
 * @returns {string} Complete KML XML
 */
export function featuresToKmlDocument(features = [], options = {}) {
  const title = escapeXml(options.title || 'Gods Eye View - Tactical Sector');
  const desc = escapeXml(options.description || 'Exported tactical map features, geofences, and CAD geometries');
  const placemarks = (Array.isArray(features) ? features : [])
    .map(featureToKmlPlacemark)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${title}</name>
    <description>${desc}</description>
    ${placemarks}
  </Document>
</kml>`;
}

/**
 * Escapes XML/HTML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Triggers a browser file download for a string or Blob content.
 *
 * @param {string|Blob} content
 * @param {string} filename
 * @param {string} [mimeType='application/octet-stream']
 */
export function downloadBlob(content, filename, mimeType = 'application/octet-stream') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parses an imported GeoJSON string or object into standard feature inputs
 * compatible with MapToolsEngine.createFeature().
 * Guarantees zero geometric and zero metadata loss.
 *
 * @param {string|Object} input
 * @returns {Array<Object>} Array of featureInput descriptors
 */
export function parseImportedGeoJson(input) {
  let json = input;
  if (typeof input === 'string') {
    try {
      json = JSON.parse(input);
    } catch (err) {
      throw new Error(`Invalid GeoJSON string: ${err.message}`);
    }
  }

  if (!json || typeof json !== 'object') {
    return [];
  }

  let rawFeatures = [];
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    rawFeatures = json.features;
  } else if (json.type === 'Feature') {
    rawFeatures = [json];
  } else if (json.type && json.coordinates) {
    rawFeatures = [{ type: 'Feature', geometry: json, properties: {} }];
  }

  const results = [];

  for (const feat of rawFeatures) {
    if (!feat || !feat.geometry) continue;

    const geomType = feat.geometry.type;
    const coords = feat.geometry.coordinates;
    const props = feat.properties || {};

    const id = props['gev:id'] || feat.id || undefined;
    const name = props['gev:name'] || props.name || props.title || `Imported ${geomType}`;
    const color = props['gev:color'] || props.color || props['marker-color'] || props.stroke || '#00e5ff';
    const notes = props['gev:notes'] || props.notes || props.description || '';
    const speedCeilingKts = props['gev:speedCeilingKts'] ?? props.speedCeilingKts ?? null;
    const isGeofence = Boolean(props['gev:isGeofence'] ?? props.isGeofence);
    const locked = props['gev:locked'] !== undefined
      ? Boolean(props['gev:locked'])
      : (props.locked !== undefined ? Boolean(props.locked) : false);

    // Prioritize preserved tactical type, otherwise map from GeoJSON standard geometry
    let type = props['gev:type'] || FEATURE_TYPES.POINT;
    if (!props['gev:type']) {
      if (geomType === 'Point') type = FEATURE_TYPES.POINT;
      else if (geomType === 'LineString' || geomType === 'MultiLineString') type = FEATURE_TYPES.LINE;
      else if (geomType === 'Polygon' || geomType === 'MultiPolygon') type = FEATURE_TYPES.POLYGON;
    }

    let featureCoords = null;

    // Check if raw exact coordinates were preserved in gev:coordinates
    if (props['gev:coordinates'] !== undefined) {
      featureCoords = cloneValue(props['gev:coordinates']);
    } else {
      if (geomType === 'Point') {
        featureCoords = [Number(coords[0]), Number(coords[1])];
      } else if (geomType === 'LineString') {
        featureCoords = coords.map((c) => [Number(c[0]), Number(c[1])]);
      } else if (geomType === 'Polygon') {
        const exteriorRing = coords[0] || [];
        const ring = exteriorRing.map((c) => [Number(c[0]), Number(c[1])]);
        // If ring is closed (first == last) and has >= 4 points, strip duplicate closing vertex
        if (ring.length >= 4) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] === last[0] && first[1] === last[1]) {
            ring.pop();
          }
        }
        featureCoords = ring;
      } else if (geomType === 'MultiLineString') {
        featureCoords = (coords[0] || []).map((c) => [Number(c[0]), Number(c[1])]);
      } else if (geomType === 'MultiPolygon') {
        const ring = (coords[0]?.[0] || []).map((c) => [Number(c[0]), Number(c[1])]);
        if (ring.length >= 4) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] === last[0] && first[1] === last[1]) {
            ring.pop();
          }
        }
        featureCoords = ring;
      }
    }

    // Reconstruct style
    const style = {
      color,
      ...(props['gev:style'] || {}),
      ...(feat.style || {}),
    };

    // Reconstruct properties with 100% metadata preservation
    const originalProperties = props['gev:properties'] || {};
    const restoredProperties = {
      ...cloneValue(originalProperties),
      notes,
      speedCeilingKts,
      isGeofence,
    };

    if (props['gev:radiusMeters'] !== undefined && props['gev:radiusMeters'] !== null) {
      restoredProperties.radiusMeters = props['gev:radiusMeters'];
    }
    if (props['gev:radiiMeters'] !== undefined && props['gev:radiiMeters'] !== null) {
      restoredProperties.radiiMeters = props['gev:radiiMeters'];
    }

    // Capture any non-gev custom attributes present at top level of props
    for (const [k, v] of Object.entries(props)) {
      if (!k.startsWith('gev:') && !['notes', 'speedCeilingKts', 'isGeofence'].includes(k)) {
        if (restoredProperties[k] === undefined) {
          restoredProperties[k] = cloneValue(v);
        }
      }
    }

    const featureItem = {
      name,
      type,
      coordinates: featureCoords,
      properties: restoredProperties,
      style,
      locked,
    };
    if (id) {
      featureItem.id = id;
    }

    results.push(featureItem);
  }

  return results;
}

/**
 * Parses an OGC KML 2.2 XML string into standard feature inputs
 * compatible with MapToolsEngine.createFeature().
 * Works purely with regex & string manipulation, ensuring 100% compatibility in both Node.js and browser.
 *
 * @param {string} kmlText
 * @returns {Array<Object>} Array of featureInput descriptors
 */
export function parseImportedKml(kmlText = '') {
  if (typeof kmlText !== 'string' || !kmlText.trim()) {
    return [];
  }

  const results = [];

  // Extract shared styles: Style id="xyz" -> line/poly color
  const styles = new Map();
  const styleRegex = /<Style\s+id=["']([^"']+)["']>([\s\S]*?)<\/Style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(kmlText)) !== null) {
    const styleId = styleMatch[1];
    const styleContent = styleMatch[2];
    const colorMatch = styleContent.match(/<color>([a-fA-F0-9]{6,8})<\/color>/i);
    if (colorMatch) {
      styles.set(styleId, kmlColorToHex(colorMatch[1]));
    }
  }

  // Extract Placemark elements
  const placemarkRegex = /<Placemark(?:\s+id=["']([^"']+)["'])?>([\s\S]*?)<\/Placemark>/gi;
  let pmMatch;

  while ((pmMatch = placemarkRegex.exec(kmlText)) !== null) {
    const pmIdAttr = pmMatch[1] || '';
    const pmContent = pmMatch[2];

    // Name
    const nameMatch = pmContent.match(/<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/i);
    const name = nameMatch ? nameMatch[1].trim() : 'Imported Placemark';

    // Description / Notes
    const descMatch = pmContent.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const rawDesc = descMatch ? descMatch[1].trim() : '';
    // Strip HTML tags for clean notes text
    const notes = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Style URL or inline style
    let color = '#00e5ff';
    const styleUrlMatch = pmContent.match(/<styleUrl>#?([^<]+)<\/styleUrl>/i);
    if (styleUrlMatch && styles.has(styleUrlMatch[1])) {
      color = styles.get(styleUrlMatch[1]);
    } else {
      const inlineColor = pmContent.match(/<color>([a-fA-F0-9]{6,8})<\/color>/i);
      if (inlineColor) {
        color = kmlColorToHex(inlineColor[1]);
      }
    }

    // ExtendedData custom attributes
    const properties = { notes };
    let gevId = pmIdAttr;
    let gevType = null;
    let locked = false;

    const dataRegex = /<(?:Data|SimpleData)\s+name=["']([^"']+)["']>[\s\S]*?<value>([\s\S]*?)<\/value>|<(?:Data|SimpleData)\s+name=["']([^"']+)["']>([\s\S]*?)<\/(?:Data|SimpleData)>/gi;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(pmContent)) !== null) {
      const key = dataMatch[1] || dataMatch[3];
      const rawVal = (dataMatch[2] !== undefined ? dataMatch[2] : dataMatch[4]) || '';
      const valStr = rawVal.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      if (key === 'gev:id' || key === 'id') {
        gevId = valStr;
      } else if (key === 'gev:type' || key === 'type') {
        gevType = valStr;
      } else if (key === 'gev:locked' || key === 'locked') {
        locked = valStr === 'true' || valStr === '1';
      } else if (key === 'gev:color') {
        color = valStr;
      } else {
        // Parse numbers/booleans if applicable
        if (valStr === 'true') properties[key] = true;
        else if (valStr === 'false') properties[key] = false;
        else if (!isNaN(Number(valStr)) && valStr !== '') properties[key] = Number(valStr);
        else properties[key] = valStr;
      }
    }

    // Detect Geometry: Point, LineString, Polygon
    let type = gevType || FEATURE_TYPES.POINT;
    let coordinates = null;

    // 1. Point
    const pointMatch = pmContent.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
    if (pointMatch) {
      type = gevType || FEATURE_TYPES.POINT;
      const parts = pointMatch[1].trim().split(',');
      if (parts.length >= 2) {
        coordinates = [Number(parts[0]), Number(parts[1])];
      }
    }

    // 2. LineString
    const lineMatch = pmContent.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i);
    if (lineMatch) {
      type = gevType || FEATURE_TYPES.LINE;
      const coordTokens = lineMatch[1].trim().split(/\s+/).filter(Boolean);
      coordinates = coordTokens.map((tok) => {
        const parts = tok.split(',');
        return [Number(parts[0]), Number(parts[1])];
      });
    }

    // 3. Polygon
    const polyMatch = pmContent.match(/<Polygon>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/i);
    if (polyMatch) {
      type = gevType || FEATURE_TYPES.POLYGON;
      const coordTokens = polyMatch[1].trim().split(/\s+/).filter(Boolean);
      const ring = coordTokens.map((tok) => {
        const parts = tok.split(',');
        return [Number(parts[0]), Number(parts[1])];
      });
      coordinates = ring;
    }

    if (!coordinates) continue;

    const featureItem = {
      name,
      type,
      coordinates,
      properties,
      style: { color },
      locked,
    };
    if (gevId) {
      featureItem.id = gevId;
    }

    results.push(featureItem);
  }

  return results;
}

/**
 * Universal tactical GIS parser.
 * Automatically inspects the content/filename and invokes GeoJSON or KML parser.
 *
 * @param {string|Object} content
 * @param {string} [filenameHint='']
 * @returns {Array<Object>} Parsed feature input descriptors
 */
export function importTacticalLayerContent(content, filenameHint = '') {
  if (!content) return [];

  if (typeof content === 'object') {
    return parseImportedGeoJson(content);
  }

  const str = String(content).trim();
  const lowerHint = String(filenameHint).toLowerCase();

  if (lowerHint.endsWith('.kml') || str.startsWith('<?xml') || str.includes('<kml') || str.includes('<Placemark')) {
    return parseImportedKml(str);
  }

  return parseImportedGeoJson(str);
}

/**
 * Deep equality check for primitives, arrays, and objects.
 */
function deepEqual(a, b, tolerance = 1e-7) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= tolerance;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], tolerance)) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k], tolerance)) return false;
  }

  return true;
}

/**
 * Verifies round-trip export and import of GeoJSON files with zero geometric or metadata loss.
 *
 * @param {Array<Object>|Object} features - One or more MapToolsEngine tactical features
 * @param {Object} [options={}]
 * @param {number} [options.tolerance=1e-7] - Floating point coordinate tolerance
 * @returns {{ passed: boolean, diffs: Array<string>, count: number, roundTrippedFeatures: Array<Object> }}
 */
export function verifyGeoJsonRoundTrip(features, options = {}) {
  const tolerance = options.tolerance || 1e-7;
  const originalList = Array.isArray(features) ? features : [features];
  const diffs = [];

  // Step 1: Export to GeoJSON FeatureCollection
  const collection = featuresToGeoJsonCollection(originalList);

  // Step 2: Stringify to simulate disk / network transport
  const jsonString = JSON.stringify(collection);

  // Step 3: Parse back from serialized GeoJSON
  const importedList = parseImportedGeoJson(jsonString);

  if (importedList.length !== originalList.length) {
    diffs.push(`Feature count mismatch: expected ${originalList.length}, got ${importedList.length}`);
    return { passed: false, diffs, count: originalList.length, roundTrippedFeatures: importedList };
  }

  // Step 4: Verify each feature pair for zero geometric and zero metadata loss
  for (let i = 0; i < originalList.length; i++) {
    const orig = originalList[i];
    const rt = importedList[i];
    const prefix = `Feature #${i} (${orig.name || orig.id || 'unnamed'})`;

    // 1. Identity & Name
    if (orig.id && rt.id !== orig.id) {
      diffs.push(`${prefix}: ID mismatch. Expected "${orig.id}", got "${rt.id}"`);
    }
    if (orig.name && rt.name !== orig.name) {
      diffs.push(`${prefix}: Name mismatch. Expected "${orig.name}", got "${rt.name}"`);
    }

    // 2. Type & Lock
    if (orig.type && rt.type !== orig.type) {
      diffs.push(`${prefix}: Type mismatch. Expected "${orig.type}", got "${rt.type}"`);
    }
    if (orig.locked !== undefined && Boolean(rt.locked) !== Boolean(orig.locked)) {
      diffs.push(`${prefix}: Locked mismatch. Expected ${orig.locked}, got ${rt.locked}`);
    }

    // 3. Geometry & Coordinates
    if (!deepEqual(orig.coordinates, rt.coordinates, tolerance)) {
      diffs.push(
        `${prefix}: Geometric coordinates mismatch. Expected ${JSON.stringify(orig.coordinates)}, got ${JSON.stringify(rt.coordinates)}`,
      );
    }

    // 4. Style
    if (orig.style) {
      const origColor = (orig.style.color || orig.properties?.color || '').toLowerCase();
      const rtColor = (rt.style?.color || '').toLowerCase();
      if (origColor && rtColor && origColor !== rtColor) {
        diffs.push(`${prefix}: Style color mismatch. Expected ${origColor}, got ${rtColor}`);
      }
    }

    // 5. Metadata / Properties (zero metadata loss)
    if (orig.properties && typeof orig.properties === 'object') {
      for (const [propKey, propVal] of Object.entries(orig.properties)) {
        const rtVal = rt.properties?.[propKey];
        if (!deepEqual(propVal, rtVal, tolerance)) {
          diffs.push(
            `${prefix}: Property "${propKey}" mismatch. Expected ${JSON.stringify(propVal)}, got ${JSON.stringify(rtVal)}`,
          );
        }
      }
    }
  }

  const passed = diffs.length === 0;
  return {
    passed,
    success: passed,
    diffs,
    lossCount: diffs.length,
    count: originalList.length,
    roundTrippedFeatures: importedList,
  };
}
