/**
 * @module src/data/firebaseMapsStore.js
 * Cloud-synchronized (Firebase Firestore) & Local-cached Map Projects & Spatial Items Store.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { openConfirmModal, openAlertModal } from '../ui/confirmModal.js';

export { openConfirmModal, openAlertModal };

const LOCAL_MAPS_KEY = 'gev_my_maps_projects_v1';
const LOCAL_ITEMS_KEY_PREFIX = 'gev_map_items_v1_';

let _firestore = null;
let _auth = null;
let _currentUser = null;
let _isOnline = false;
let _initPromise = null;

/**
 * Initializes Firebase with configuration from firebase-applet-config.json.
 */
export async function initFirebaseStore() {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const initTask = async () => {
        const resp = await fetch('/firebase-applet-config.json', { cache: 'no-store' });
        if (!resp.ok) {
          console.warn('[MapsStore] No firebase-applet-config.json available, running local-first mode.');
          return false;
        }
        const config = await resp.json();
        if (!config.apiKey || !config.projectId) {
          console.warn('[MapsStore] Incomplete Firebase configuration, using local storage.');
          return false;
        }

        const app = getApps().length === 0 ? initializeApp(config) : getApp();
        _firestore = getFirestore(app);
        _auth = getAuth(app);

        // Listen to auth state or sign in anonymously
        onAuthStateChanged(_auth, (user) => {
          _currentUser = user;
        });

        try {
          await signInAnonymously(_auth);
        } catch (authErr) {
          console.warn('[MapsStore] Anonymous auth note:', authErr.message);
        }

        // Connection verification with short timeout
        try {
          const pingPromise = getDocFromServer(doc(_firestore, 'maps', '__connection_ping__'));
          const pingTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
          await Promise.race([pingPromise, pingTimeout]);
        } catch (pingErr) {
          console.warn('[MapsStore] Firestore backend unavailable or unreachable (' + (pingErr.code || pingErr.message) + '), using offline-first local store.');
          return false;
        }

        return true;
      };

      // Ensure init cannot hang the application beyond 2000ms
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 2000));
      const connected = await Promise.race([initTask(), timeoutPromise]);

      _isOnline = Boolean(connected);
      if (_isOnline) {
        console.log('[MapsStore] Firebase Firestore connected successfully.');
      } else {
        console.warn('[MapsStore] Running in offline-first local storage mode.');
      }
      return _isOnline;
    } catch (err) {
      console.warn('[MapsStore] Firebase initialization fallback to local storage:', err);
      _isOnline = false;
      return false;
    }
  })();

  return _initPromise;
}

/**
 * Generates an alphanumeric identifier safe for Firestore IDs.
 */
export function generateSafeId(prefix = 'map') {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Default initial seed maps matching the system demo.
 */
export function getInitialSeedMaps() {
  return [
    {
      id: 'map_manila_surveillance_2026',
      name: 'Sample Map Sept 21 2026',
      shortCode: 'asd34545656',
      description: 'Operational survey of South Harbor Container Terminal and Manila arterial corridors.',
      group: 'Admins',
      visibility: 'private',
      mapStyle: 'osm',
      author: 'admin',
      authorUid: 'admin_local',
      itemsCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'map_public_connect_me_demo',
      name: 'Publicly Shared Connect-Me Operations',
      shortCode: 'pub2026ops',
      description: 'Civil protection, port logistics and maritime navigation checkpoints.',
      group: 'Registered',
      visibility: 'public',
      author: 'admin',
      authorUid: 'admin_local',
      itemsCount: 2,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'map_group_maritime_patrol',
      name: 'Group Shared Maritime Logistics Map',
      shortCode: 'grp_maritime_01',
      description: 'Shared tactical patrol sectors and anchorage zones.',
      group: 'CoastGuard',
      visibility: 'group',
      author: 'admin',
      authorUid: 'admin_local',
      itemsCount: 1,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

/**
 * Seeds initial items for default demonstration.
 */
function seedInitialItems() {
  setLocalItems('map_manila_surveillance_2026', [
    {
      id: 'item_sample_poi_1',
      mapId: 'map_manila_surveillance_2026',
      name: 'point of interest',
      type: 'marker',
      description: 'Primary checkpoint surveillance overlooking the shipping channel.',
      icon: 'pin_drop',
      category: 'Maritime & Coastal',
      subcategory: 'Coast Guard / Checkpoint',
      color: '#dc2626',
      fillColor: '#dc2626',
      fillOpacity: 0.8,
      imageUrl: '',
      author: 'admin',
      authorUid: 'admin_local',
      coordinates: JSON.stringify([{ lat: 14.5898, lng: 120.9745, alt: 15 }]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item_sample_polyline_1',
      mapId: 'map_manila_surveillance_2026',
      name: 'polyline',
      type: 'polyline',
      description: 'Road arterial route for quick emergency vehicle transit.',
      icon: 'timeline',
      category: 'Logistics & Transport',
      subcategory: 'Aviation Runway / Helipad',
      color: '#8b5cf6',
      fillColor: '#8b5cf6',
      fillOpacity: 1.0,
      imageUrl: '',
      author: 'admin',
      authorUid: 'admin_local',
      coordinates: JSON.stringify([
        { lat: 14.595, lng: 120.971 },
        { lat: 14.591, lng: 120.978 },
        { lat: 14.584, lng: 120.985 },
      ]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item_sample_polygon_1',
      mapId: 'map_manila_surveillance_2026',
      name: 'polygon',
      type: 'polygon',
      description: 'South Harbor Container Terminal security inspection perimeter.',
      icon: 'crop_square',
      category: 'Maritime & Coastal',
      subcategory: 'Container Terminal',
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.45,
      imageUrl: '',
      author: 'admin',
      authorUid: 'admin_local',
      coordinates: JSON.stringify([
        { lat: 14.582, lng: 120.965 },
        { lat: 14.585, lng: 120.972 },
        { lat: 14.577, lng: 120.975 },
        { lat: 14.575, lng: 120.968 },
      ]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
}

/**
 * Splits a list of maps into private, public, and group buckets.
 */
function categorizeMaps(maps, isOnline = false) {
  const privateMaps = maps.filter((m) => m.visibility === 'private' || !m.visibility);
  const publicMaps = maps.filter((m) => m.visibility === 'public');
  const groupMaps = maps.filter((m) => m.visibility === 'group');

  return {
    all: maps,
    privateMaps,
    publicMaps,
    groupMaps,
    isCloudSynced: isOnline,
  };
}

/**
 * Synchronous snapshot of currently cached maps for instantaneous modal opening.
 */
export function getLocalMapsSnapshot() {
  let maps = getLocalMaps();
  if (!maps || maps.length === 0) {
    maps = getInitialSeedMaps();
    setLocalMaps(maps);
    seedInitialItems();
  }
  return categorizeMaps(maps, _isOnline);
}

/**
 * Reads local maps from localStorage.
 */
function getLocalMaps() {
  try {
    const raw = localStorage.getItem(LOCAL_MAPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

/**
 * Saves local maps to localStorage.
 */
function setLocalMaps(maps) {
  try {
    localStorage.setItem(LOCAL_MAPS_KEY, JSON.stringify(maps));
  } catch (_e) {}
}

/**
 * Reads local items for a specific map.
 */
function getLocalItems(mapId) {
  try {
    const raw = localStorage.getItem(`${LOCAL_ITEMS_KEY_PREFIX}${mapId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

/**
 * Saves local items for a specific map.
 */
function setLocalItems(mapId, items) {
  try {
    localStorage.setItem(`${LOCAL_ITEMS_KEY_PREFIX}${mapId}`, JSON.stringify(items));
  } catch (_e) {}
}

/**
 * Lists all map projects, categorized into Private, Public, and Group.
 */
export async function listMaps() {
  // Offline-first: return local cache immediately to eliminate startup latency
  let maps = getLocalMaps();

  // If completely empty on first run, seed initial demo maps matching the video
  if (maps.length === 0) {
    const initialSeed = getInitialSeedMaps();
    setLocalMaps(initialSeed);
    seedInitialItems();
    maps = initialSeed;
  }

  // Non-blocking background sync with Firestore if online
  if (_firestore) {
    (async () => {
      try {
        const q = query(collection(_firestore, 'maps'));
        const snapshot = await getDocs(q);
        const fetched = [];
        snapshot.forEach((d) => {
          fetched.push(d.data());
        });
        if (fetched.length > 0) {
          setLocalMaps(fetched);
        }
      } catch (_err) {
        // Silently retain cached local maps
      }
    })();
  } else {
    // Initiate background Firebase connection check without awaiting
    void initFirebaseStore().catch(() => {});
  }

  return categorizeMaps(maps, _isOnline);
}

/**
 * Creates a new map project.
 */
export async function createMap(mapData) {
  await initFirebaseStore();
  const id = generateSafeId('map');
  const now = new Date().toISOString();

  const newMap = {
    id,
    name: mapData.name?.trim() || 'Untitled Map',
    shortCode: mapData.shortCode?.trim() || `map_${Date.now().toString(36)}`,
    description: mapData.description?.trim() || '',
    group: mapData.group || 'Admins',
    visibility: mapData.visibility || 'private',
    mapStyle: mapData.mapStyle || 'osm',
    author: mapData.author || 'admin',
    authorUid: _currentUser?.uid || 'admin_local',
    itemsCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Save to local
  const localMaps = getLocalMaps();
  localMaps.unshift(newMap);
  setLocalMaps(localMaps);
  setLocalItems(id, []);

  // Sync to Firestore
  if (_isOnline && _firestore) {
    try {
      await setDoc(doc(_firestore, 'maps', id), newMap);
    } catch (err) {
      console.warn('[MapsStore] Firestore createMap error:', err);
    }
  }

  return newMap;
}

/**
 * Gets a map by ID along with its spatial items.
 */
export async function getMap(mapId) {
  const local = getLocalMaps();
  let mapData = local.find((m) => m.id === mapId) || null;

  // Background refresh from Firestore if available
  if (_isOnline && _firestore) {
    (async () => {
      try {
        const snap = await getDoc(doc(_firestore, 'maps', mapId));
        if (snap.exists()) {
          const fresh = snap.data();
          const currentList = getLocalMaps();
          const idx = currentList.findIndex((m) => m.id === mapId);
          if (idx !== -1) {
            currentList[idx] = fresh;
            setLocalMaps(currentList);
          }
        }
      } catch (_e) {}
    })();
  }

  const items = await getItems(mapId);
  return { map: mapData, items };
}

/**
 * Updates a map project's metadata.
 */
export async function updateMap(mapId, updates) {
  await initFirebaseStore();
  const now = new Date().toISOString();
  const patch = { ...updates, updatedAt: now };

  const local = getLocalMaps();
  const idx = local.findIndex((m) => m.id === mapId);
  if (idx !== -1) {
    local[idx] = { ...local[idx], ...patch };
    setLocalMaps(local);
  }

  if (_isOnline && _firestore) {
    try {
      await updateDoc(doc(_firestore, 'maps', mapId), patch);
    } catch (err) {
      console.warn('[MapsStore] Firestore updateMap error:', err);
    }
  }

  return local[idx] || patch;
}

/**
 * Clones a map project and all its spatial items.
 */
export async function duplicateMap(mapId) {
  const { map, items } = await getMap(mapId);
  if (!map) throw new Error(`Map with ID ${mapId} not found`);

  const clonedMap = await createMap({
    ...map,
    name: `${map.name} (Copy)`,
    shortCode: `${map.shortCode || 'map'}_copy`,
  });

  for (const it of items) {
    await saveItem(clonedMap.id, {
      ...it,
      id: generateSafeId('item'),
      name: it.name,
    });
  }

  return clonedMap;
}

/**
 * Deletes a map project and its items.
 */
export async function deleteMap(mapId) {
  const local = getLocalMaps().filter((m) => m.id !== mapId);
  setLocalMaps(local);
  try {
    localStorage.removeItem(`${LOCAL_ITEMS_KEY_PREFIX}${mapId}`);
  } catch (_e) {}

  if (_isOnline && _firestore) {
    try {
      await deleteDoc(doc(_firestore, 'maps', mapId));
    } catch (err) {
      console.warn('[MapsStore] Firestore deleteMap error:', err);
    }
  } else {
    void initFirebaseStore().then(() => {
      if (_firestore) {
        deleteDoc(doc(_firestore, 'maps', mapId)).catch(() => {});
      }
    });
  }

  return true;
}

/**
 * Retrieves all spatial items (markers, polylines, polygons) for a map.
 */
export async function getItems(mapId) {
  const items = getLocalItems(mapId);

  if (_isOnline && _firestore) {
    (async () => {
      try {
        const q = query(collection(_firestore, 'maps', mapId, 'items'));
        const snapshot = await getDocs(q);
        const remoteItems = [];
        snapshot.forEach((d) => {
          remoteItems.push(d.data());
        });
        if (remoteItems.length > 0) {
          setLocalItems(mapId, remoteItems);
        }
      } catch (err) {
        // Silently preserve local items
      }
    })();
  }

  return items;
}

/**
 * Subscribes to real-time updates for map items.
 */
export function subscribeToMapItems(mapId, onUpdate) {
  if (!_isOnline || !_firestore) {
    return () => {};
  }

  try {
    const q = query(collection(_firestore, 'maps', mapId, 'items'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((d) => items.push(d.data()));
      setLocalItems(mapId, items);
      onUpdate(items);
    }, (err) => {
      console.warn('[MapsStore] Real-time listener error:', err);
    });
    return unsubscribe;
  } catch (err) {
    console.warn('[MapsStore] Failed to attach real-time listener:', err);
    return () => {};
  }
}

/**
 * Creates or updates a spatial item within a map project.
 * Synchronously writes to LocalStorage caches (gev_map_items_v1_{mapId}) for immediate 0ms UI responsiveness,
 * followed by asynchronous Firestore cloud syncing in the background.
 */
export async function saveItem(mapIdOrItemData, maybeItemData) {
  let mapId;
  let itemData;
  if (maybeItemData !== undefined) {
    mapId = mapIdOrItemData;
    itemData = maybeItemData || {};
  } else if (mapIdOrItemData && typeof mapIdOrItemData === 'object') {
    itemData = mapIdOrItemData;
    mapId = itemData.mapId;
  } else {
    mapId = mapIdOrItemData;
    itemData = {};
  }

  const id = itemData.id || generateSafeId('item');
  const now = new Date().toISOString();

  let coordsStr = '[]';
  if (typeof itemData.coordinates === 'string') {
    coordsStr = itemData.coordinates;
  } else if (Array.isArray(itemData.coordinates)) {
    coordsStr = JSON.stringify(itemData.coordinates);
  }

  const payload = {
    ...itemData,
    id,
    mapId,
    name: itemData.name?.trim() || 'Untitled Item',
    type: itemData.type || 'marker',
    description: itemData.description?.trim() || '',
    icon: itemData.icon || (itemData.type === 'marker' ? 'pin_drop' : itemData.type === 'polyline' ? 'timeline' : 'crop_square'),
    color: itemData.color || (itemData.type === 'marker' ? '#ef4444' : itemData.type === 'polyline' ? '#8b5cf6' : '#3b82f6'),
    fillColor: itemData.fillColor || '#3b82f6',
    fillOpacity: typeof itemData.fillOpacity === 'number' ? itemData.fillOpacity : 0.5,
    imageUrl: itemData.imageUrl || '',
    author: itemData.author || 'admin',
    authorUid: _currentUser?.uid || 'admin_local',
    category: itemData.category || '',
    subcategory: itemData.subcategory || '',
    level3: itemData.level3 || '',
    customIconUrl: itemData.customIconUrl || null,
    coordinates: coordsStr,
    extrudedHeight: Number(itemData.extrudedHeight) || 0,
    altitudeMode: itemData.altitudeMode || 'clamp',
    geodeticMetrics: itemData.geodeticMetrics || null,
    measurementType: itemData.measurementType || '',
    userData: itemData.userData || { text: '', videoUrl: '', audioUrl: '', calls: [] },
    properties: itemData.properties || {},
    createdAt: itemData.createdAt || now,
    updatedAt: now,
  };

  // Immediate synchronous Local Storage update for 0ms UI responsiveness
  const localItems = getLocalItems(mapId);
  const idx = localItems.findIndex((i) => i.id === id);
  if (idx !== -1) {
    localItems[idx] = payload;
  } else {
    localItems.push(payload);
  }
  setLocalItems(mapId, localItems);

  // Synchronously update item count on parent map
  const localMaps = getLocalMaps();
  const m = localMaps.find((map) => map.id === mapId);
  if (m) {
    m.itemsCount = localItems.length;
    setLocalMaps(localMaps);
  }

  // Non-blocking asynchronous Firestore cloud sync in the background
  (async () => {
    try {
      if (!_firestore) {
        await initFirebaseStore();
      }
      if (_isOnline && _firestore) {
        await setDoc(doc(_firestore, 'maps', mapId, 'items', id), payload);
        await updateDoc(doc(_firestore, 'maps', mapId), { itemsCount: localItems.length }).catch(() => {});
      }
    } catch (err) {
      console.warn('[MapsStore] Background Firestore saveItem sync note:', err);
    }
  })();

  return payload;
}

/**
 * Deletes a spatial item.
 * Writes synchronously to LocalStorage caches for 0ms UI responsiveness,
 * followed by asynchronous Firestore cloud syncing.
 */
export async function deleteItem(mapId, itemId) {
  const localItems = getLocalItems(mapId).filter((i) => i.id !== itemId);
  setLocalItems(mapId, localItems);

  const localMaps = getLocalMaps();
  const m = localMaps.find((map) => map.id === mapId);
  if (m) {
    m.itemsCount = localItems.length;
    setLocalMaps(localMaps);
  }

  // Non-blocking asynchronous Firestore cloud sync in the background
  (async () => {
    try {
      if (!_firestore) {
        await initFirebaseStore();
      }
      if (_isOnline && _firestore) {
        await deleteDoc(doc(_firestore, 'maps', mapId, 'items', itemId));
        await updateDoc(doc(_firestore, 'maps', mapId), { itemsCount: localItems.length }).catch(() => {});
      }
    } catch (err) {
      console.warn('[MapsStore] Background Firestore deleteItem sync note:', err);
    }
  })();

  return true;
}

/**
 * Internal helper to keep items count accurate on map record.
 */
async function updateMapItemCount(mapId, count) {
  const local = getLocalMaps();
  const m = local.find((map) => map.id === mapId);
  if (m) {
    m.itemsCount = count;
    setLocalMaps(local);
  }
  if (_isOnline && _firestore) {
    try {
      await updateDoc(doc(_firestore, 'maps', mapId), { itemsCount: count });
    } catch (_e) {}
  }
}

/**
 * Combines multiple maps into an aggregated layer collection.
 */
export async function combineMaps(mapIds) {
  const combinedItems = [];
  const mapSummaries = [];

  for (const mapId of mapIds) {
    const { map, items } = await getMap(mapId);
    if (map) {
      mapSummaries.push(map);
      items.forEach((it) => {
        combinedItems.push({
          ...it,
          sourceMapName: map.name,
          sourceMapId: map.id,
        });
      });
    }
  }

  return {
    maps: mapSummaries,
    items: combinedItems,
    totalItems: combinedItems.length,
  };
}

/**
 * Converts a Map Project and its items into GeoJSON format.
 */
export async function exportMapToGeoJson(mapId) {
  const { map, items } = await getMap(mapId);
  if (!map) throw new Error('Map not found');

  const features = (items || []).map((it) => {
    let coords = [];
    try {
      coords = typeof it.coordinates === 'string' ? JSON.parse(it.coordinates) : it.coordinates;
    } catch (_e) {
      coords = [];
    }

    let geometry = null;
    if (it.type === 'marker') {
      const pt = coords[0] || { lng: 0, lat: 0, alt: 0 };
      geometry = {
        type: 'Point',
        coordinates: [pt.lng, pt.lat, pt.alt || 0],
      };
    } else if (it.type === 'polyline') {
      geometry = {
        type: 'LineString',
        coordinates: coords.map((c) => [c.lng, c.lat, c.alt || 0]),
      };
    } else if (it.type === 'polygon') {
      const ring = coords.map((c) => [c.lng, c.lat, c.alt || 0]);
      if (ring.length > 0) {
        ring.push([...ring[0]]);
      }
      geometry = {
        type: 'Polygon',
        coordinates: [ring],
      };
    }

    return {
      type: 'Feature',
      id: it.id,
      properties: {
        name: it.name,
        description: it.description || '',
        type: it.type,
        color: it.color,
        fillColor: it.fillColor,
        fillOpacity: it.fillOpacity,
        icon: it.icon,
        author: it.author,
        imageUrl: it.imageUrl || '',
      },
      geometry,
    };
  });

  return {
    type: 'FeatureCollection',
    metadata: {
      id: map.id,
      name: map.name,
      shortCode: map.shortCode,
      description: map.description,
      author: map.author,
      exportedAt: new Date().toISOString(),
    },
    features,
  };
}

/**
 * Imports GeoJSON file data into a new or existing map project.
 */
export async function importGeoJsonToMap(geoJsonData, targetMapName = null) {
  const meta = geoJsonData.metadata || {};
  const mapName = targetMapName || meta.name || `Imported Map (${new Date().toLocaleDateString()})`;

  const newMap = await createMap({
    name: mapName,
    shortCode: meta.shortCode || `imp_${Date.now().toString(36)}`,
    description: meta.description || 'Imported via GeoJSON feature collection',
    visibility: 'private',
  });

  const features = geoJsonData.features || [];
  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;

    let itemType = 'marker';
    let coords = [];

    if (geom.type === 'Point') {
      itemType = 'marker';
      coords = [{ lng: geom.coordinates[0], lat: geom.coordinates[1], alt: geom.coordinates[2] || 0 }];
    } else if (geom.type === 'LineString') {
      itemType = 'polyline';
      coords = geom.coordinates.map((c) => ({ lng: c[0], lat: c[1], alt: c[2] || 0 }));
    } else if (geom.type === 'Polygon') {
      itemType = 'polygon';
      const outerRing = geom.coordinates[0] || [];
      coords = outerRing.slice(0, -1).map((c) => ({ lng: c[0], lat: c[1], alt: c[2] || 0 }));
    }

    if (coords.length > 0) {
      await saveItem(newMap.id, {
        name: f.properties?.name || `${itemType} item`,
        type: itemType,
        description: f.properties?.description || '',
        color: f.properties?.color || '#3b82f6',
        fillColor: f.properties?.fillColor || '#3b82f6',
        fillOpacity: f.properties?.fillOpacity ?? 0.5,
        icon: f.properties?.icon || (itemType === 'marker' ? 'pin_drop' : itemType === 'polyline' ? 'timeline' : 'crop_square'),
        imageUrl: f.properties?.imageUrl || '',
        coordinates: JSON.stringify(coords),
      });
    }
  }

  return newMap;
}

