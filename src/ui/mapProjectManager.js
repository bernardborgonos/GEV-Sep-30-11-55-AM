/**
 * @module src/ui/mapProjectManager.js
 * Master orchestrator connecting Cesium 3D Globe, Firebase / Local Maps Store,
 * Interactive Item Drafting, the 4-Tab Inspector, and Active Map HUD.
 */

import * as Cesium from 'cesium';
import {
  getMap,
  saveItem,
  deleteItem,
  duplicateMap,
  deleteMap,
  combineMaps,
  listMaps,
  subscribeToMapItems,
  exportMapToGeoJson,
} from '../data/firebaseMapsStore.js';
import { openItemInspectorModal, openQuickColorPicker } from './itemInspectorModal.js';
import { openMyMapsDirectoryModal, openCreateMapModal } from './myMapsDirectoryModal.js';
import { openConfirmModal, openAlertModal } from './confirmModal.js';
import {
  renderActiveMapHud,
  openMapDescriptionModal,
  showItemCalloutCard,
  showPoiCalloutCard,
  hidePoiCalloutCard,
} from './activeMapHud.js';
import {
  initShaperCadToolbar,
  setShaperMode,
  getShaperMode,
  SHAPER_MODES,
} from './shaperCadToolbar.js';
import { MapTourController } from '../data/urlLayerTour.js';
import { openCustomTileModal } from './customTileModal.js';
import {
  showGeodeticMeasurementHud,
  updateGeodeticMeasurementCoords,
  hideGeodeticMeasurementHud,
  getCompassCardinal,
} from './geodeticMeasurementHud.js';
import {
  calculatePathDistance,
  calculatePolygonGeodesicArea,
  initialBearing,
  haversineDistanceMeters,
} from '../tools/geodesicMath.js';
import { updateItemGeodeticData } from '../tools/geodeticItemExtractor.js';
import { getSharedMapToolsEngine } from '../tools/mapToolsEngine.js';
import { getCustomIconForPreset, getDomainColor } from '../data/itemCategories.js';
import {
  showTacticalHoverTooltip,
  hideTacticalHoverTooltip,
} from './tacticalHoverTooltip.js';
import {
  HANDLE_TYPES,
  computeHandleCentroid,
  restoreCameraControlState,
  setCameraControlState,
  snapshotCameraControlState,
  translateCoordinates,
  updateVertexCoordinate,
} from './mapItemDragHelpers.js';

const ACTIVE_MAP_STORAGE_KEY = 'gev_current_active_map_id';

export class MapProjectManager {
  /**
   * @param {import('cesium').Viewer} viewer
   */
  constructor(viewer) {
    this.viewer = viewer;
    this.activeMapId = null;
    this.activeMap = null;
    this.items = [];
    this.isCombinedMode = false;
    this.combinedMapTitles = [];
    this.unsubscribeItems = null;

    // Filter & Visibility State for Map Categories (Level 1 & Level 2)
    this.hiddenCategories = new Set();
    this.hiddenSubcategories = new Set();
    this.selectedCategoryFilter = 'All';
    this.selectedSubcategoryFilter = 'All';

    // Map Tour Controller for Active Map Items
    this.tourController = new MapTourController(this.viewer, {
      onSelectCallback: (item) => {
        const entity = this.dataSource.entities.getById(item.id);
        if (entity) {
          this.flyToItem(item.rawRef || item, entity);
        }
      },
    });

    this.tourController.subscribe((state) => {
      this.updateHud();
    });

    // Dedicated Cesium DataSource for Map Project layers
    this.dataSource = new Cesium.CustomDataSource('MyMapsProjectLayers');
    this.viewer.dataSources.add(this.dataSource);

    // Dedicated DataSource for interactive vertex modification handles
    this.handlesDataSource = new Cesium.CustomDataSource('SelectedShapeVertexHandles');
    this.viewer.dataSources.add(this.handlesDataSource);

    // Shaper & CAD state
    this.currentShaperMode = SHAPER_MODES.SELECT_MODIFY;
    this.selectedItem = null;
    this.dragState = {
      isDragging: false,
      dragMode: null,
      itemId: null,
      vertexIndex: -1,
      item: null,
      initialCoordinates: [],
      currentCoordinates: [],
      lastCartographic: null,
      cameraState: null,
    };

    // Entity picking handler for POIs, lines, polygons
    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.setupPicking();

    // Drawing state
    this.isDrawing = false;
    this.drawType = null; // 'marker' | 'polyline' | 'polygon'
    this.draftCoords = [];
    this.drawEntity = null;
    this.drawHandler = null;
  }

  /**
   * Initializes the manager on app startup.
   */
  async init() {
    this.shaperToolbar = initShaperCadToolbar({
      onModeChange: (mode) => this.handleShaperModeChange(mode),
    });

    // Determine active map from storage or default
    let storedId = null;
    try {
      storedId = localStorage.getItem(ACTIVE_MAP_STORAGE_KEY);
    } catch (_e) {}

    const { all } = await listMaps();
    if (!storedId && all.length > 0) {
      storedId = all[0].id;
    }

    if (storedId) {
      await this.loadMap(storedId);
    } else {
      this.updateHud();
    }

    // Global listener for measurement actions from Workbench or other plugins
    window.addEventListener('gev:start-drafting', (e) => {
      const draftType = e.detail?.type || 'polygon';
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing(draftType);
    });
  }

  /**
   * Loads a specific map project onto the 3D globe.
   */
  async loadMap(mapId) {
    hidePoiCalloutCard();
    this.clearVertexHandles();
    this.isCombinedMode = false;
    this.combinedMapTitles = [];
    this.hiddenCategories.clear();
    this.hiddenSubcategories.clear();
    this.selectedCategoryFilter = 'All';
    this.selectedSubcategoryFilter = 'All';

    if (this.unsubscribeItems) {
      this.unsubscribeItems();
      this.unsubscribeItems = null;
    }

    const { map, items } = await getMap(mapId);
    if (!map) {
      console.warn(`[MapProjectManager] Map ${mapId} not found.`);
      return;
    }

    this.activeMapId = mapId;
    this.activeMap = map;
    this.items = items || [];

    try {
      localStorage.setItem(ACTIVE_MAP_STORAGE_KEY, mapId);
    } catch (_e) {}

    this.renderItemsToGlobe(this.items);
    this.updateHud();

    // Attach real-time sync listener
    this.unsubscribeItems = subscribeToMapItems(mapId, (liveItems) => {
      if (this.activeMapId === mapId && !this.isCombinedMode) {
        this.items = liveItems;
        this.renderItemsToGlobe(this.items);
        this.updateHud();
      }
    });
  }

  /**
   * Combines multiple maps into the active view simultaneously.
   */
  async combineMultipleMaps(mapIds) {
    hidePoiCalloutCard();
    const result = await combineMaps(mapIds);
    this.items = result.items;
    this.isCombinedMode = true;
    this.combinedMapTitles = result.maps.map((m) => m.name);

    this.renderItemsToGlobe(this.items);
    this.updateHud();
    this.flyToCurrentExtent();
  }

  /**
   * Clears and draws all spatial items to the 3D Cesium DataSource.
   */
  renderItemsToGlobe(items) {
    this.dataSource.entities.removeAll();

    for (const item of items) {
      let coords = [];
      try {
        coords = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
      } catch (_e) {
        continue;
      }
      if (!coords || coords.length === 0) continue;

      const itemCategory = item.category || 'General';
      const isVisible = !this.hiddenCategories.has(itemCategory);

      const itemColor = Cesium.Color.fromCssColorString(item.color || '#ef4444');
      const fillColor = Cesium.Color.fromCssColorString(item.fillColor || '#3b82f6').withAlpha(item.fillOpacity ?? 0.45);

      if (item.type === 'marker') {
        const pt = coords[0];
        const position = Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, pt.alt || 0);

        const entityConfig = {
          id: item.id,
          name: item.name,
          show: isVisible,
          position,
          label: {
            text: item.name,
            font: '12px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, item.customIconUrl ? -22 : -14),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            mapItem: item,
            category: itemCategory,
          },
        };

        const iconPath = item.customIconUrl || getCustomIconForPreset(item.level3, item.category, item.color);
        if (iconPath) {
          const domainAccent = item.color || getDomainColor(item.category) || '#ffffff';
          let billboardColor = Cesium.Color.WHITE;
          try {
            billboardColor = Cesium.Color.fromCssColorString(domainAccent);
          } catch (_e) {
            billboardColor = Cesium.Color.WHITE;
          }

          entityConfig.billboard = {
            image: iconPath,
            width: 32,
            height: 32,
            color: billboardColor,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          };
          entityConfig.label.pixelOffset = new Cesium.Cartesian2(0, -22);
        } else {
          entityConfig.point = {
            pixelSize: 14,
            color: itemColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          };
        }

        this.dataSource.entities.add(entityConfig);
      } else if (item.type === 'polyline') {
        const positions = coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));

        this.dataSource.entities.add({
          id: item.id,
          name: item.name,
          show: isVisible,
          polyline: {
            positions,
            width: 4,
            material: new Cesium.PolylineOutlineMaterialProperty({
              color: itemColor,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
              outlineWidth: 1.5,
            }),
            clampToGround: true,
          },
          properties: {
            mapItem: item,
            category: itemCategory,
          },
        });
      } else if (item.type === 'polygon') {
        const hierarchyPositions = coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));
        const extHeight = Number(item.extrudedHeight) || 0;

        const polygonConfig = {
          hierarchy: new Cesium.PolygonHierarchy(hierarchyPositions),
          material: fillColor,
        };

        if (extHeight > 0) {
          polygonConfig.extrudedHeight = extHeight;
          polygonConfig.height = coords[0]?.alt || 0;
          polygonConfig.outline = true;
          polygonConfig.outlineColor = itemColor;
          polygonConfig.closeTop = true;
          polygonConfig.closeBottom = true;
        } else {
          polygonConfig.classificationType = Cesium.ClassificationType.TERRAIN;
        }

        this.dataSource.entities.add({
          id: item.id,
          name: item.name,
          show: isVisible,
          polygon: polygonConfig,
          polyline: {
            positions: [...hierarchyPositions, hierarchyPositions[0]],
            width: 3,
            material: itemColor,
            clampToGround: extHeight <= 0,
          },
          properties: {
            mapItem: item,
            category: itemCategory,
          },
        });
      }
    }
  }

  /**
   * Applies the current category and subcategory visibility filters without re-creating all entities.
   */
  applyCategoryVisibility() {
    for (const entity of this.dataSource.entities.values) {
      const mapItem = entity.properties?.mapItem?.getValue?.() || entity.properties?.mapItem;
      const cat = mapItem?.category || entity.properties?.category?.getValue?.() || entity.properties?.category || 'General';
      const sub = mapItem?.subcategory || entity.properties?.subcategory?.getValue?.() || entity.properties?.subcategory || '';

      // 1. Check if category is explicitly hidden
      if (this.hiddenCategories.has(cat)) {
        entity.show = false;
        continue;
      }

      // 2. Check if single-focus category filter is active (URL Intelligence focus mode)
      if (this.selectedCategoryFilter !== 'All' && cat !== this.selectedCategoryFilter) {
        entity.show = false;
        continue;
      }

      // 3. Check if subcategory filter is active
      if (this.selectedSubcategoryFilter !== 'All' && sub !== this.selectedSubcategoryFilter) {
        entity.show = false;
        continue;
      }

      entity.show = true;
    }
  }

  resolveCartographicPosition(screenPosition) {
    if (!screenPosition) return null;
    let cartesian = null;
    const { scene, camera } = this.viewer;

    if (scene?.pickPositionSupported && typeof scene.pickPosition === 'function') {
      cartesian = scene.pickPosition(screenPosition);
    }

    if (!Cesium.defined(cartesian) && scene?.globe && typeof camera?.getPickRay === 'function') {
      const ray = camera.getPickRay(screenPosition);
      if (ray) {
        cartesian = scene.globe.pick(ray, scene);
      }
    }

    if (!Cesium.defined(cartesian) && typeof camera?.pickEllipsoid === 'function') {
      cartesian = camera.pickEllipsoid(screenPosition, Cesium.Ellipsoid.WGS84);
    }

    if (!Cesium.defined(cartesian)) return null;
    return Cesium.Cartographic.fromCartesian(cartesian);
  }

  updateMainEntityGeometry(itemId, coords) {
    const mainEntity = this.dataSource.entities.getById(itemId);
    if (!mainEntity || !Array.isArray(coords)) return;
    const newPositions = coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));
    if (mainEntity.polyline) {
      mainEntity.polyline.positions = mainEntity.polygon ? [...newPositions, newPositions[0]] : newPositions;
    }
    if (mainEntity.polygon) {
      mainEntity.polygon.hierarchy = new Cesium.PolygonHierarchy(newPositions);
    }
  }

  updateHandleGeometry(item, coords) {
    if (!item || !Array.isArray(coords)) return;

    coords.forEach((pt, idx) => {
      const handle = this.handlesDataSource.entities.getById(`handle-${item.id}-${idx}`);
      if (handle) {
        handle.position = Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, (pt.alt || 0) + 1);
      }
    });

    const centroidHandle = this.handlesDataSource.entities.getById(`handle-centroid-${item.id}`);
    const centroid = computeHandleCentroid(coords);
    if (centroidHandle && centroid) {
      centroidHandle.position = Cesium.Cartesian3.fromDegrees(
        centroid.lng,
        centroid.lat,
        (centroid.alt || 0) + 2,
      );
    }
  }

  _isMapToolsFeatureLocked(itemId) {
    try {
      const feature = getSharedMapToolsEngine(this.viewer).getFeature(itemId);
      return Boolean(feature?.locked);
    } catch (_e) {
      return false;
    }
  }

  _syncMapToolsFeatureCoordinates(itemId, coords) {
    try {
      const engine = getSharedMapToolsEngine(this.viewer);
      const feature = engine.getFeature(itemId);
      if (!feature) return;
      if (feature.locked) {
        console.warn(`[MapProjectManager] Skipping locked MapTools feature update for "${itemId}".`);
        return;
      }
      const normalizedCoords = coords.map((pt) => (
        Number.isFinite(Number(pt.alt))
          ? [Number(pt.lng), Number(pt.lat), Number(pt.alt)]
          : [Number(pt.lng), Number(pt.lat)]
      ));
      engine.updateFeature(itemId, { coordinates: normalizedCoords });
    } catch (_e) {
      // Best-effort sync only.
    }
  }

  /**
   * Sets up 3D entity picking for clicking markers, lines, polygons,
   * rendering interactive vertex modify handles, and dragging vertices.
   */
  setupPicking() {
    // Hide hover tooltip on camera movement
    if (this.viewer?.camera?.moveStart) {
      this.viewer.camera.moveStart.addEventListener(() => {
        hideTacticalHoverTooltip();
      });
    }

    // 1. LEFT_CLICK: Item selection & Unified Intelligence Callout
    this.clickHandler.setInputAction((click) => {
      hideTacticalHoverTooltip();
      if (this.isDrawing) return; // Ignore when actively drawing new geometry

      const pickedObject = this.viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const handleType = pickedObject.id.properties?.handleType?.getValue?.()
          || pickedObject.id.properties?.handleType;
        if (handleType === HANDLE_TYPES.VERTEX || handleType === HANDLE_TYPES.CENTROID) return;

        if (pickedObject.id.properties?.mapItem) {
          const item = pickedObject.id.properties.mapItem.getValue();
          hidePoiCalloutCard();
          this.openItemCallout({
            screenPosition: click.position,
            item,
            pickedEntity: pickedObject.id,
          });
          return;
        }
      }

      // Clicked on empty terrain/sky: close callout card and clear selection handles
      hidePoiCalloutCard();
      this.clearVertexHandles();
      this.selectedItem = null;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 2. LEFT_DOWN: Start dragging a vertex handle if clicked
    this.clickHandler.setInputAction((click) => {
      hideTacticalHoverTooltip();
      if (this.isDrawing) return;

      const picked = this.viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id) {
        const handleType = picked.id.properties?.handleType?.getValue?.()
          || picked.id.properties?.handleType;
        if (handleType !== HANDLE_TYPES.VERTEX && handleType !== HANDLE_TYPES.CENTROID) return;

        const itemId = picked.id.properties?.itemId?.getValue?.() ?? picked.id.properties?.itemId;
        const vertexIndex = Number(picked.id.properties?.vertexIndex?.getValue?.() ?? picked.id.properties?.vertexIndex ?? -1);
        const item = this.items.find((it) => it.id === itemId) || this.selectedItem;
        if (!item || this._isMapToolsFeatureLocked(itemId)) return;

        let coordinates = [];
        try {
          coordinates = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
        } catch (_e) {
          coordinates = [];
        }
        if (!Array.isArray(coordinates) || coordinates.length === 0) return;

        const cartographic = this.resolveCartographicPosition(click.position);
        if (!cartographic) return;

        const cameraController = this.viewer.scene.screenSpaceCameraController;
        this.dragState = {
          isDragging: true,
          dragMode: handleType,
          itemId,
          vertexIndex,
          item,
          initialCoordinates: coordinates.map((coord) => ({ ...coord })),
          currentCoordinates: coordinates.map((coord) => ({ ...coord })),
          lastCartographic: cartographic,
          cameraState: snapshotCameraControlState(cameraController),
        };
        setCameraControlState(cameraController, false);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    // 3. MOUSE_MOVE: Real-time vertex position adjustment on 3D globe & Tactical Hover Tooltips
    this.clickHandler.setInputAction((movement) => {
      if (this.dragState.isDragging && this.dragState.item) {
        hideTacticalHoverTooltip();
        const carto = this.resolveCartographicPosition(movement.endPosition);
        if (!carto || !this.dragState.lastCartographic) return;

        const currentLng = Cesium.Math.toDegrees(carto.longitude);
        const currentLat = Cesium.Math.toDegrees(carto.latitude);
        const deltaLng = currentLng - Cesium.Math.toDegrees(this.dragState.lastCartographic.longitude);
        const deltaLat = currentLat - Cesium.Math.toDegrees(this.dragState.lastCartographic.latitude);

        if (!Number.isFinite(deltaLng) || !Number.isFinite(deltaLat)) return;

        if (this.dragState.dragMode === HANDLE_TYPES.CENTROID) {
          this.dragState.currentCoordinates = translateCoordinates(
            this.dragState.currentCoordinates,
            deltaLng,
            deltaLat,
          );
        } else if (this.dragState.dragMode === HANDLE_TYPES.VERTEX) {
          const alt = Number.isFinite(carto.height)
            ? carto.height
            : this.dragState.currentCoordinates[this.dragState.vertexIndex]?.alt || 0;
          this.dragState.currentCoordinates = updateVertexCoordinate(
            this.dragState.currentCoordinates,
            this.dragState.vertexIndex,
            { lng: currentLng, lat: currentLat, alt },
          );
        }

        this.dragState.lastCartographic = carto;
        this.dragState.item.coordinates = JSON.stringify(this.dragState.currentCoordinates);
        this.updateMainEntityGeometry(this.dragState.itemId, this.dragState.currentCoordinates);
        this.updateHandleGeometry(this.dragState.item, this.dragState.currentCoordinates);
        return;
      }

      if (this.isDrawing) {
        hideTacticalHoverTooltip();
        return;
      }

      // Check for hover over map items on the 3D globe
      try {
        const pickedObject = this.viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties?.mapItem) {
          const item = pickedObject.id.properties.mapItem.getValue();
          showTacticalHoverTooltip({
            x: movement.endPosition.x,
            y: movement.endPosition.y,
            item,
          });
        } else {
          hideTacticalHoverTooltip();
        }
      } catch (_e) {
        hideTacticalHoverTooltip();
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 4. LEFT_UP: Release drag, restore camera, and save updated coordinates
    this.clickHandler.setInputAction(async () => {
      if (this.dragState.isDragging) {
        const cameraController = this.viewer.scene.screenSpaceCameraController;
        restoreCameraControlState(cameraController, this.dragState.cameraState);

        if (this.dragState.item && this.activeMapId && Array.isArray(this.dragState.currentCoordinates)) {
          const finalItem = {
            ...this.dragState.item,
            coordinates: JSON.stringify(this.dragState.currentCoordinates),
          };
          // Dynamically recalculate and persist fresh geodetic metrics for the updated vertices
          const updatedWithMetrics = updateItemGeodeticData(
            finalItem,
            this.dragState.currentCoordinates,
            finalItem.measurementType || finalItem.type
          );
          await saveItem(this.activeMapId, updatedWithMetrics);
          this._syncMapToolsFeatureCoordinates(updatedWithMetrics.id, this.dragState.currentCoordinates);
          this.selectedItem = updatedWithMetrics;

          // If POI callout card is open, refresh it dynamically with the new measurements
          const existingCard = document.getElementById('in-canvas-poi-callout');
          if (existingCard) {
            this.openItemCallout({
              screenPosition: null,
              item: updatedWithMetrics,
              pickedEntity: null,
            });
          }
        }
        this.dragState = {
          isDragging: false,
          dragMode: null,
          itemId: null,
          vertexIndex: -1,
          item: null,
          initialCoordinates: [],
          currentCoordinates: [],
          lastCartographic: null,
          cameraState: null,
        };
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
  }

  /**
   * Opens the unified Intelligence Callout Card for any geometry type
   * (Point of Interest, Polyline / Road, Polygon / Perimeter Zone) with
   * Name, Description, Tactical Icon, Color Palette swatches, Center, Edit, and Delete.
   */
  openItemCallout({ screenPosition, item, pickedEntity }) {
    this.selectedItem = item;

    // Render vertex handles if it's a polyline or polygon
    this.renderVertexHandles(item);

    showItemCalloutCard({
      screenPosition,
      item,
      onColorChange: async (newColor) => {
        const updated = { ...item, color: newColor, fillColor: newColor };
        await saveItem(this.activeMapId, updated);
        this.selectedItem = updated;
        await this.loadMap(this.activeMapId);
        this.renderVertexHandles(updated);
      },
      onFlyTo: () => {
        this.flyToItem(item, pickedEntity);
      },
      onEdit: () => {
        openItemInspectorModal({
          item,
          mapId: this.activeMapId,
          mapProjectManager: this,
          viewer: this.viewer,
          onSave: async (updated) => {
            await saveItem(this.activeMapId, updated);
            this.selectedItem = updated;
            await this.loadMap(this.activeMapId);
            this.renderVertexHandles(updated);
          },
          onDelete: async (itemId) => {
            this.clearVertexHandles();
            this.selectedItem = null;
            await deleteItem(this.activeMapId, itemId);
            await this.loadMap(this.activeMapId);
          },
        });
      },
      onDelete: () => {
        openConfirmModal({
          title: 'Delete Item',
          message: `Delete ${item.type || 'item'} "${item.name}"?`,
          details: 'This shape or marker will be permanently removed from this map project.',
          confirmText: 'Delete',
          confirmColor: 'rose',
          onConfirm: async () => {
            this.clearVertexHandles();
            this.selectedItem = null;
            await deleteItem(this.activeMapId, item.id);
            await this.loadMap(this.activeMapId);
          },
        });
      },
    });
  }

  /**
   * Centers the camera on an item (marker or polyline/polygon extent).
   */
  flyToItem(item, entity) {
    if (item.type === 'marker' && entity) {
      this.viewer.flyTo(entity, { duration: 1.5 });
      return;
    }

    try {
      const pts = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
      if (pts && pts.length > 0) {
        const cartesians = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 0));
        const bSphere = Cesium.BoundingSphere.fromPoints(cartesians);
        this.viewer.camera.flyToBoundingSphere(bSphere, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(500, bSphere.radius * 2.5)),
          duration: 1.5,
        });
        return;
      }
    } catch (_e) {}

    if (entity) this.viewer.flyTo(entity, { duration: 1.5 });
  }

  /**
   * Clears interactive vertex modification handles.
   */
  clearVertexHandles() {
    if (this.dragState?.isDragging) {
      restoreCameraControlState(this.viewer.scene.screenSpaceCameraController, this.dragState.cameraState);
      this.dragState = {
        isDragging: false,
        dragMode: null,
        itemId: null,
        vertexIndex: -1,
        item: null,
        initialCoordinates: [],
        currentCoordinates: [],
        lastCartographic: null,
        cameraState: null,
      };
    }
    this.handlesDataSource.entities.removeAll();
  }

  /**
   * Renders interactive vertex control handles along the perimeter or route of a shape.
   */
  renderVertexHandles(item) {
    this.clearVertexHandles();
    if (!item || (item.type !== 'polyline' && item.type !== 'polygon')) return;

    let coords = [];
    try {
      coords = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
    } catch (_e) {
      return;
    }

    if (!Array.isArray(coords)) return;

    const centroid = computeHandleCentroid(coords);
    if (centroid && (item.type === 'polygon' || item.type === 'polyline')) {
      this.handlesDataSource.entities.add({
        id: `handle-centroid-${item.id}`,
        name: 'MOVE',
        position: Cesium.Cartesian3.fromDegrees(centroid.lng, centroid.lat, (centroid.alt || 0) + 2),
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#f59e0b'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: 'MOVE',
          font: 'bold 12px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        properties: {
          handleType: HANDLE_TYPES.CENTROID,
          itemId: item.id,
          vertexIndex: -1,
        },
      });
    }

    coords.forEach((pt, idx) => {
      this.handlesDataSource.entities.add({
        id: `handle-${item.id}-${idx}`,
        position: Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, (pt.alt || 0) + 1),
        point: {
          pixelSize: 12,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString(item.color || '#0284c7'),
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          handleType: HANDLE_TYPES.VERTEX,
          isVertexHandle: true,
          vertexIndex: idx,
          itemId: item.id,
        },
      });
    });
  }

  /**
   * Handles Shaper & CAD toolbar mode transitions.
   */
  handleShaperModeChange(mode) {
    if (this.isDrawing && (mode === SHAPER_MODES.DRAW_POLYGON || mode === SHAPER_MODES.DRAW_POLYLINE || mode === SHAPER_MODES.DRAW_MARKER)) {
      return;
    }
    this.currentShaperMode = mode;

    if (mode === SHAPER_MODES.PAN) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.viewer.scene.canvas.style.cursor = 'grab';
    } else if (mode === SHAPER_MODES.SELECT_MODIFY) {
      this.viewer.scene.canvas.style.cursor = 'default';
      if (this.selectedItem) {
        this.renderVertexHandles(this.selectedItem);
      }
    } else if (mode === SHAPER_MODES.DRAW_POLYGON) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing('polygon');
    } else if (mode === SHAPER_MODES.DRAW_POLYLINE) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing('polyline');
    } else if (mode === SHAPER_MODES.DRAW_MARKER) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing('marker');
    } else if (mode === SHAPER_MODES.DRAW_BEARING) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing('bearing');
    } else if (mode === SHAPER_MODES.DRAW_ELEVATION) {
      this.clearVertexHandles();
      hidePoiCalloutCard();
      this.startInteractiveDrawing('elevation');
    } else if (mode === SHAPER_MODES.GROUND_OBSERVER) {
      this.activateGroundObserver();
    }
  }

  /**
   * Immersive Ground / Street View eye-level perspective.
   */
  activateGroundObserver() {
    let target = null;
    if (this.selectedItem) {
      try {
        const pts = typeof this.selectedItem.coordinates === 'string' ? JSON.parse(this.selectedItem.coordinates) : this.selectedItem.coordinates;
        if (pts && pts.length > 0) target = pts[0];
      } catch (_e) {}
    }

    if (target) {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(target.lng, target.lat - 0.0015, Math.max(40, (target.alt || 0) + 75)),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-15),
          roll: 0,
        },
        duration: 2.0,
      });
    } else {
      const carto = this.viewer.camera.positionCartographic;
      const curLng = Cesium.Math.toDegrees(carto.longitude);
      const curLat = Cesium.Math.toDegrees(carto.latitude);
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(curLng, curLat, Math.min(150, carto.height)),
        orientation: {
          heading: this.viewer.camera.heading,
          pitch: Cesium.Math.toRadians(-15),
          roll: 0,
        },
        duration: 1.8,
      });
    }
    this.currentShaperMode = SHAPER_MODES.SELECT_MODIFY;
    setShaperMode(SHAPER_MODES.SELECT_MODIFY, false);
  }

  /**
   * Updates the top-right Active Map HUD.
   */
  updateHud() {
    // Group active items by category and subcategory to compute counts for filtering
    const categoryCounts = new Map();
    const categorySubCounts = new Map(); // Map<category, Map<subcat, count>>

    for (const item of this.items) {
      const cat = item.category || 'General';
      const sub = item.subcategory || 'General';

      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);

      if (!categorySubCounts.has(cat)) {
        categorySubCounts.set(cat, new Map());
      }
      const subMap = categorySubCounts.get(cat);
      subMap.set(sub, (subMap.get(sub) || 0) + 1);
    }

    const categoriesList = Array.from(categoryCounts.entries()).map(([name, count]) => {
      const subMap = categorySubCounts.get(name) || new Map();
      const subcategories = Array.from(subMap.entries()).map(([subName, subCount]) => ({
        name: subName,
        count: subCount,
      }));
      return {
        name,
        count,
        subcategories,
      };
    });

    const isTouring = this.tourController && this.tourController.status === 'playing';

    const currentMapDisplay = this.isCombinedMode
      ? {
          name: `Combined (${this.combinedMapTitles.length} Maps)`,
          visibility: 'multi-layer',
          shortCode: 'COMBINED',
          description: `Active layers combined:\n${this.combinedMapTitles.map((t) => `• ${t}`).join('\n')}`,
        }
      : this.activeMap;

    renderActiveMapHud({
      map: currentMapDisplay,
      itemsCount: this.items.length,
      categories: categoriesList,
      hiddenCategories: this.hiddenCategories,
      hiddenSubcategories: this.hiddenSubcategories,
      selectedCategoryFilter: this.selectedCategoryFilter,
      selectedSubcategoryFilter: this.selectedSubcategoryFilter,
      onSelectCategoryFilter: (catName) => {
        if (catName === 'All') {
          this.selectedCategoryFilter = 'All';
          this.selectedSubcategoryFilter = 'All';
          this.hiddenCategories.clear();
        } else if (this.selectedCategoryFilter === catName) {
          // Clicking active category toggles back to All
          this.selectedCategoryFilter = 'All';
          this.selectedSubcategoryFilter = 'All';
        } else {
          // Focus single category (URL Intelligence style)
          this.selectedCategoryFilter = catName;
          this.selectedSubcategoryFilter = 'All';
          this.hiddenCategories.delete(catName);
        }
        this.applyCategoryVisibility();
        this.updateHud();
      },
      onSelectSubcategoryFilter: (subName) => {
        if (subName === 'All' || this.selectedSubcategoryFilter === subName) {
          this.selectedSubcategoryFilter = 'All';
        } else {
          this.selectedSubcategoryFilter = subName;
        }
        this.applyCategoryVisibility();
        this.updateHud();
      },
      onToggleCategory: (catName, isVisible) => {
        if (isVisible) {
          this.hiddenCategories.delete(catName);
        } else {
          this.hiddenCategories.add(catName);
        }
        this.applyCategoryVisibility();
        this.updateHud();
      },
      onShowAllCategories: () => {
        this.hiddenCategories.clear();
        this.selectedCategoryFilter = 'All';
        this.selectedSubcategoryFilter = 'All';
        this.applyCategoryVisibility();
        this.updateHud();
      },
      onHideAllCategories: () => {
        categoriesList.forEach((c) => this.hiddenCategories.add(c.name));
        this.applyCategoryVisibility();
        this.updateHud();
      },
      onFlyToExtent: () => {
        this.flyToFilteredExtent();
      },
      onStartTour: () => {
        if (this.tourController.status === 'playing') {
          this.tourController.stop();
          this.updateHud();
          return;
        }

        // Tour active visible items (respecting Category & Subcategory filters)
        const visibleItems = this.items.filter((it) => {
          const cat = it.category || 'General';
          const sub = it.subcategory || '';
          if (this.hiddenCategories.has(cat)) return false;
          if (this.selectedCategoryFilter !== 'All' && cat !== this.selectedCategoryFilter) return false;
          if (this.selectedSubcategoryFilter !== 'All' && sub !== this.selectedSubcategoryFilter) return false;
          return true;
        });

        if (visibleItems.length === 0) {
          openAlertModal({
            title: 'Tour Notice',
            message: 'No visible items to tour. Please enable at least one category filter.',
            alertType: 'amber',
          });
          return;
        }

        // Convert item geometry into tour stops
        const tourItems = [];
        for (const it of visibleItems) {
          let coords = [];
          try {
            coords = typeof it.coordinates === 'string' ? JSON.parse(it.coordinates) : it.coordinates;
          } catch (_e) {
            continue;
          }
          if (!coords || coords.length === 0) continue;

          // For point, use coordinates[0]; for line or polygon, compute centroid/first point
          const center = coords[0];
          tourItems.push({
            id: it.id,
            name: it.name,
            category: it.category || 'General',
            subcategory: it.subcategory || '',
            lat: center.lat,
            lon: center.lng,
            icon: it.icon || 'location_on',
            details: it.description || '',
            rawRef: it,
          });
        }

        if (tourItems.length > 0) {
          const filterTitle = this.selectedCategoryFilter !== 'All' ? ` (${this.selectedCategoryFilter})` : '';
          this.tourController.startTour({
            mode: 'all',
            items: tourItems,
            title: `Tour: ${this.activeMap?.name || 'Active Map'}${filterTitle}`,
          });
          this.updateHud();
        }
      },
      onOpenMyMaps: () => this.openDirectoryModal(),
      onOpenCreateItem: () => this.promptCreateItem(),
      onOpenDescription: () => {
        if (this.activeMap) {
          openMapDescriptionModal(this.activeMap, this.items, () => {
            // Edit details
            openCreateMapModal(async (created) => {
              await this.loadMap(created.id);
            });
          });
        }
      },
      onDuplicate: async () => {
        if (this.activeMapId) {
          const dup = await duplicateMap(this.activeMapId);
          await this.loadMap(dup.id);
        }
      },
      onExport: async () => {
        if (!this.activeMapId) return;
        try {
          const geoJson = await exportMapToGeoJson(this.activeMapId);
          const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/geo+json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(this.activeMap?.name || 'map').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.geojson`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Failed to export active map:', err);
        }
      },
      onDelete: () => {
        if (!this.activeMapId) return;
        const currentMapName = this.activeMap?.name || 'this map';
        const targetMapId = this.activeMapId;
        openConfirmModal({
          title: 'Delete Active Map',
          message: `Are you sure you want to delete map "${currentMapName}"?`,
          details: 'All spatial layers, markers, polylines, and polygons in this map project will be permanently removed.',
          confirmText: 'Delete Map',
          confirmColor: 'rose',
          onConfirm: async () => {
            await deleteMap(targetMapId);
            const { all } = await listMaps();
            if (all.length > 0) {
              await this.loadMap(all[0].id);
            } else {
              this.activeMap = null;
              this.activeMapId = null;
              this.items = [];
              this.dataSource.entities.removeAll();
              this.updateHud();
            }
          },
        });
      },
      onCombine: () => this.openDirectoryModal(),
      onOpenCustomTiles: () => {
        openCustomTileModal(this.viewer);
      },
    });
  }

  /**
   * Opens the full My Maps Directory modal.
   */
  openDirectoryModal() {
    openMyMapsDirectoryModal({
      activeMapId: this.activeMapId,
      onSelectMap: async (mapId) => {
        await this.loadMap(mapId);
        this.flyToCurrentExtent();
      },
      onCombineMaps: async (mapIds) => {
        await this.combineMultipleMaps(mapIds);
      },
    });
  }

  /**
   * Prompts user to pick item type (Marker, Polyline, Polygon) to draft.
   */
  promptCreateItem() {
    let picker = document.getElementById('item-type-quick-picker');
    if (picker) picker.remove();

    picker = document.createElement('div');
    picker.id = 'item-type-quick-picker';
    picker.className = 'fixed top-20 right-4 z-[9500] bg-[#1e293b] border border-slate-700 rounded-xl p-3 shadow-2xl animate-fade-in font-sans text-slate-100 flex flex-col gap-2 min-w-[200px]';
    picker.innerHTML = `
      <div class="text-xs font-bold text-slate-300 uppercase tracking-wider flex justify-between items-center pb-1 border-b border-slate-800">
        <span>Draft New Item</span>
        <button id="close-type-picker" class="text-slate-400 hover:text-white"><span class="material-symbols-outlined text-sm">close</span></button>
      </div>
      <button class="draft-choice-btn flex items-center gap-2 px-3 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold transition text-left" data-type="marker">
        <span class="material-symbols-outlined text-emerald-400 text-lg">pin_drop</span> Point of Interest (POI)
      </button>
      <button class="draft-choice-btn flex items-center gap-2 px-3 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold transition text-left" data-type="polyline">
        <span class="material-symbols-outlined text-purple-400 text-lg">timeline</span> Polyline / Road
      </button>
      <button class="draft-choice-btn flex items-center gap-2 px-3 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold transition text-left" data-type="polygon">
        <span class="material-symbols-outlined text-sky-400 text-lg">crop_square</span> Polygon / Perimeter Zone
      </button>
    `;

    document.body.appendChild(picker);
    picker.querySelector('#close-type-picker')?.addEventListener('click', () => picker.remove());

    picker.querySelectorAll('.draft-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        picker.remove();
        this.startInteractiveDrawing(type);
      });
    });
  }

  /**
   * Starts interactive clicking on 3D globe to draft coordinates.
   */
  startInteractiveDrawing(type) {
    this.isDrawing = true;
    this.drawType = type;
    this.draftCoords = [];

    // Sync toolbar mode without triggering callback loop
    let mode = SHAPER_MODES.DRAW_POLYGON;
    if (type === 'marker') mode = SHAPER_MODES.DRAW_MARKER;
    else if (type === 'polyline' || type === 'distance') mode = SHAPER_MODES.DRAW_POLYLINE;
    else if (type === 'bearing') mode = SHAPER_MODES.DRAW_BEARING;
    else if (type === 'elevation') mode = SHAPER_MODES.DRAW_ELEVATION;

    this.currentShaperMode = mode;
    setShaperMode(mode, false);

    let cursorCoord = null;

    // Toast guide
    let guideText = 'Click points to draw vertices. Press ENTER, Double Click, or click Save to finish.';
    if (type === 'marker') {
      guideText = 'Click anywhere on the 3D globe to place Point of Interest';
    } else if (type === 'bearing') {
      guideText = 'Click Origin Point A, then click Target Point B to measure Compass Bearing & Azimuth';
    } else if (type === 'elevation') {
      guideText = 'Click points along 3D terrain to measure Elevation Profile, Gain, and Slope';
    } else if (type === 'polyline' || type === 'distance') {
      guideText = 'Click points to measure Distance path. Press ENTER, Double Click, or click Save to finish.';
    }

    const banner = document.createElement('div');
    banner.id = 'drafting-active-banner';
    banner.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[10000] bg-slate-900/95 border border-emerald-500/60 px-5 py-2.5 rounded-full shadow-2xl text-slate-100 font-sans text-xs flex items-center gap-3 backdrop-blur-md animate-fade-in';
    banner.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
      <span>${guideText}</span>
      <button id="cancel-drafting-btn" class="ml-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[11px]">Cancel</button>
    `;
    document.body.appendChild(banner);

    const endDrafting = () => {
      this.isDrawing = false;
      hideGeodeticMeasurementHud();
      if (this.drawHandler) {
        this.drawHandler.destroy();
        this.drawHandler = null;
      }
      banner.remove();
      if (this.drawEntity) {
        this.viewer.entities.remove(this.drawEntity);
        this.drawEntity = null;
      }
      this.currentShaperMode = SHAPER_MODES.SELECT_MODIFY;
      setShaperMode(SHAPER_MODES.SELECT_MODIFY, false);
    };

    banner.querySelector('#cancel-drafting-btn')?.addEventListener('click', endDrafting);

    // Helper to generate descriptive name
    const getDescriptiveName = (coords, itemType) => {
      try {
        if (itemType === 'bearing' && coords.length >= 2) {
          const fwd = initialBearing(coords[0], coords[1]);
          const card = getCompassCardinal(fwd);
          const distM = haversineDistanceMeters(coords[0], coords[1]);
          return `Bearing ${fwd.toFixed(0)}° ${card} (${distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${Math.round(distM)} m`})`;
        }
        if (itemType === 'elevation' && coords.length >= 2) {
          const h1 = coords[0].alt || 0;
          const h2 = coords[coords.length - 1].alt || 0;
          const deltaH = h2 - h1;
          const distMetrics = calculatePathDistance(coords);
          const slopeDeg = distMetrics.totalMeters > 0 ? (Math.atan(Math.abs(deltaH) / distMetrics.totalMeters) * 180 / Math.PI) : 0;
          return `Elevation (Δh ${deltaH >= 0 ? '+' : ''}${Math.round(deltaH)} m, ${slopeDeg.toFixed(1)}°)`;
        }
        if (itemType === 'polygon' && coords.length >= 3) {
          const areaMetrics = calculatePolygonGeodesicArea(coords);
          return `Area (${areaMetrics.areaHectares.toFixed(2)} ha)`;
        }
        if ((itemType === 'polyline' || itemType === 'distance') && coords.length >= 2) {
          const distMetrics = calculatePathDistance(coords);
          return `Distance (${distMetrics.totalKm >= 1 ? `${distMetrics.totalKm.toFixed(2)} km` : `${Math.round(distMetrics.totalMeters)} m`})`;
        }
      } catch (_e) {}
      return itemType === 'bearing' ? 'Bearing Vector' : itemType === 'elevation' ? 'Elevation Profile' : itemType === 'polyline' ? 'Measured Distance' : 'Measured Area';
    };

    // Show Geodetic Measurement HUD for polygon area, distance, bearing, or elevation
    const isMeasureMode = ['polygon', 'polyline', 'distance', 'bearing', 'elevation'].includes(type);
    if (isMeasureMode) {
      showGeodeticMeasurementHud({
        type,
        onClear: () => {
          this.draftCoords = [];
          cursorCoord = null;
          if (this.drawEntity) {
            this.viewer.entities.remove(this.drawEntity);
            this.drawEntity = null;
          }
          updateGeodeticMeasurementCoords([], type);
        },
        onSave: async (coords, finalType) => {
          const minPts = finalType === 'polygon' ? 3 : 2;
          const targetCoords = (coords && coords.length >= minPts)
            ? coords
            : this.draftCoords;

          if (targetCoords.length >= minPts) {
            const finalCoords = [...targetCoords];
            endDrafting();

            const initialItem = updateItemGeodeticData({
              type: finalType === 'polygon' ? 'polygon' : 'polyline',
              coordinates: JSON.stringify(finalCoords),
              category: finalType === 'bearing' ? 'Navigation & Vectors' : finalType === 'elevation' ? 'Topography & Relief' : 'Tactical Drafting',
            }, finalCoords, finalType);

            openItemInspectorModal({
              item: initialItem,
              mapId: this.activeMapId,
              mapProjectManager: this,
              viewer: this.viewer,
              onSave: async (newItem) => {
                await saveItem(this.activeMapId, newItem);
                await this.loadMap(this.activeMapId);
              },
            });
          }
        },
        onClose: () => {
          endDrafting();
        },
      });
    }

    this.drawHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    // Mouse move handler for live rubber-band preview & metrics
    this.drawHandler.setInputAction((movement) => {
      if (this.draftCoords.length >= 1 && isMeasureMode) {
        const ray = this.viewer.camera.getPickRay(movement.endPosition);
        const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          cursorCoord = {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lng: Cesium.Math.toDegrees(carto.longitude),
            alt: carto.height || 0,
          };
          updateGeodeticMeasurementCoords([...this.draftCoords, cursorCoord], type);
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Click handler
    this.drawHandler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const alt = carto.height || 0;

      this.draftCoords.push({ lat, lng, alt });
      cursorCoord = null;
      updateGeodeticMeasurementCoords(this.draftCoords, type);

      if (type === 'marker') {
        endDrafting();
        openItemInspectorModal({
          item: {
            type: 'marker',
            name: 'point of interest',
            coordinates: JSON.stringify(this.draftCoords),
          },
          mapId: this.activeMapId,
          mapProjectManager: this,
          viewer: this.viewer,
          onSave: async (newItem) => {
            await saveItem(this.activeMapId, newItem);
            await this.loadMap(this.activeMapId);
          },
        });
        return;
      }

      // If bearing mode and 2 points placed, user has defined the bearing vector
      if (type === 'bearing' && this.draftCoords.length === 2) {
        // Keep interactive or allow save
      }

      // Multi-point polyline, polygon, bearing or elevation preview
      if (!this.drawEntity) {
        if (type === 'polygon') {
          this.drawEntity = this.viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.CallbackProperty(() => {
                const pts = cursorCoord ? [...this.draftCoords, cursorCoord] : this.draftCoords;
                return new Cesium.PolygonHierarchy(pts.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt)));
              }, false),
              material: Cesium.Color.CYAN.withAlpha(0.4),
              classificationType: Cesium.ClassificationType.TERRAIN,
            },
          });
        } else if (type === 'bearing') {
          this.drawEntity = this.viewer.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => {
                const pts = cursorCoord ? [...this.draftCoords, cursorCoord] : this.draftCoords;
                return pts.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt + 2));
              }, false),
              width: 4,
              material: Cesium.Color.fromCssColorString('#f59e0b'), // Amber compass vector
              clampToGround: true,
            },
          });
        } else if (type === 'elevation') {
          this.drawEntity = this.viewer.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => {
                const pts = cursorCoord ? [...this.draftCoords, cursorCoord] : this.draftCoords;
                return pts.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt));
              }, false),
              width: 4,
              material: Cesium.Color.fromCssColorString('#10b981'), // Recon green transect
              clampToGround: true,
            },
          });
        } else {
          // Standard polyline / distance
          this.drawEntity = this.viewer.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(() => {
                const pts = cursorCoord ? [...this.draftCoords, cursorCoord] : this.draftCoords;
                return pts.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt));
              }, false),
              width: 3,
              material: Cesium.Color.YELLOW,
              clampToGround: true,
            },
          });
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Double click to finish
    this.drawHandler.setInputAction(() => {
      const minPts = type === 'polygon' ? 3 : 2;
      if (this.draftCoords.length >= minPts) {
        const finalCoords = [...this.draftCoords];
        endDrafting();
        const initialItem = updateItemGeodeticData({
          type: type === 'polygon' ? 'polygon' : 'polyline',
          coordinates: JSON.stringify(finalCoords),
          category: type === 'bearing' ? 'Navigation & Vectors' : type === 'elevation' ? 'Topography & Relief' : 'Tactical Drafting',
        }, finalCoords, type);

        openItemInspectorModal({
          item: initialItem,
          mapId: this.activeMapId,
          mapProjectManager: this,
          viewer: this.viewer,
          onSave: async (newItem) => {
            await saveItem(this.activeMapId, newItem);
            await this.loadMap(this.activeMapId);
          },
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Keyboard ENTER to finish
    const keyListener = (e) => {
      const minPts = type === 'polygon' ? 3 : 2;
      if (e.key === 'Enter' && this.draftCoords.length >= minPts) {
        window.removeEventListener('keydown', keyListener);
        const finalCoords = [...this.draftCoords];
        endDrafting();
        const initialItem = updateItemGeodeticData({
          type: type === 'polygon' ? 'polygon' : 'polyline',
          coordinates: JSON.stringify(finalCoords),
          category: type === 'bearing' ? 'Navigation & Vectors' : type === 'elevation' ? 'Topography & Relief' : 'Tactical Drafting',
        }, finalCoords, type);

        openItemInspectorModal({
          item: initialItem,
          mapId: this.activeMapId,
          mapProjectManager: this,
          viewer: this.viewer,
          onSave: async (newItem) => {
            await saveItem(this.activeMapId, newItem);
            await this.loadMap(this.activeMapId);
          },
        });
      } else if (e.key === 'Escape') {
        window.removeEventListener('keydown', keyListener);
        endDrafting();
      }
    };
    window.addEventListener('keydown', keyListener);
  }

  /**
   * Starts an in-canvas interactive vertex dragging session for a polygon or polyline.
   * Places interactive numbered node handles on the 3D globe and updates geometry in real-time.
   */
  startVertexEditSession(item, onFinish) {
    if (!item) return;
    let coords = [];
    try {
      coords = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates || '[]') : [...(item.coordinates || [])];
    } catch (_e) {
      coords = [];
    }
    if (coords.length < 2) return;

    // Smoothly fly camera to encompass all vertices in the intended viewport
    const cartesians = coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));
    if (cartesians.length > 0) {
      const bSphere = Cesium.BoundingSphere.fromPoints(cartesians);
      const targetRadius = Math.max(1200, bSphere.radius * 2.5);
      this.viewer.camera.flyToBoundingSphere(bSphere, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          this.viewer.camera.heading,
          Cesium.Math.toRadians(-50),
          targetRadius
        ),
      });
    }

    // Temporarily hide the saved entity
    const existingEntity = this.dataSource.entities.getById(item.id);
    if (existingEntity) existingEntity.show = false;

    const itemColor = Cesium.Color.fromCssColorString(item.color || '#3b82f6');
    const fillColor = Cesium.Color.fromCssColorString(item.fillColor || item.color || '#3b82f6').withAlpha(item.fillOpacity ?? 0.45);

    let editEntity;
    const isPolygon = item.type === 'polygon';
    if (isPolygon) {
      editEntity = this.viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            return new Cesium.PolygonHierarchy(coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0)));
          }, false),
          material: fillColor,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const pts = coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));
            return pts.length > 0 ? [...pts, pts[0]] : [];
          }, false),
          width: 3,
          material: itemColor,
          clampToGround: true,
        },
      });
    } else {
      editEntity = this.viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            return coords.map((c) => Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.alt || 0));
          }, false),
          width: 4,
          material: itemColor,
          clampToGround: true,
        },
      });
    }

    // Numbered draggable handles
    const handleEntities = coords.map((c, idx) => {
      return this.viewer.entities.add({
        position: new Cesium.CallbackProperty(() => {
          const pt = coords[idx];
          return pt ? Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, (pt.alt || 0) + 1.5) : Cesium.Cartesian3.ZERO;
        }, false),
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#06b6d4'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${idx + 1}`,
          font: 'bold 11px monospace',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.75),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          isVertexHandle: true,
          vertexIndex: idx,
        },
      });
    });

    // Mount top HUD banner
    let banner = document.getElementById('gev-vertex-editor-banner');
    if (!banner) {
      banner = document.createElement('aside');
      banner.id = 'gev-vertex-editor-banner';
      banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[10005] animate-fade-in select-none';
      document.body.appendChild(banner);
    }
    banner.style.display = 'block';
    banner.innerHTML = `
      <div class="px-4 py-2.5 rounded-xl bg-slate-950/95 border border-cyan-500/80 shadow-2xl backdrop-blur-md flex items-center gap-3 font-sans text-xs text-slate-100">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <div>
            <div class="font-bold text-cyan-300 font-mono uppercase tracking-wider text-[11px]">
              CANVAS VERTEX EDIT MODE
            </div>
            <div class="text-[10px] text-slate-400 font-mono">
              ${item.name || 'Geometry'} · ${coords.length} NODES
            </div>
          </div>
        </div>

        <div class="h-6 w-px bg-slate-800"></div>

        <!-- Globe Camera & Street View Tools -->
        <div class="flex items-center gap-1">
          <button type="button" id="vex-zoom-in-btn" class="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition" title="Zoom In">+</button>
          <button type="button" id="vex-zoom-out-btn" class="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition" title="Zoom Out">-</button>
          <button type="button" id="vex-recenter-btn" class="px-2 h-7 flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition" title="Re-frame Extent">
            <span class="material-symbols-outlined text-sm">filter_center_focus</span>
            <span class="hidden md:inline">Focus</span>
          </button>
          <button type="button" id="vex-streetview-btn" class="px-2 h-7 flex items-center justify-center gap-1 rounded bg-amber-500/90 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition" title="Open Google Street View for this location">
            <span class="material-symbols-outlined text-sm">streetview</span>
            <span class="hidden md:inline">Street View</span>
          </button>
        </div>

        <div class="h-6 w-px bg-slate-800"></div>

        <span class="text-[11px] text-slate-300 hidden lg:inline">Drag any numbered node handle on the globe to adjust coordinates.</span>

        <div class="flex items-center gap-2 ml-auto">
          <button type="button" id="vex-finish-btn" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-1">
            <span>✓</span> Finish &amp; Re-inspect
          </button>
          <button type="button" id="vex-cancel-btn" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition">
            Cancel
          </button>
        </div>
      </div>
    `;

    // Tool listeners in banner
    banner.querySelector('#vex-zoom-in-btn')?.addEventListener('click', () => {
      const height = this.viewer.camera.positionCartographic.height;
      this.viewer.camera.zoomIn(Math.max(100, height * 0.35));
    });
    banner.querySelector('#vex-zoom-out-btn')?.addEventListener('click', () => {
      const height = this.viewer.camera.positionCartographic.height;
      this.viewer.camera.zoomOut(Math.max(100, height * 0.45));
    });
    banner.querySelector('#vex-recenter-btn')?.addEventListener('click', () => {
      if (cartesians.length > 0) {
        const bSphere = Cesium.BoundingSphere.fromPoints(cartesians);
        this.viewer.camera.flyToBoundingSphere(bSphere, {
          duration: 1.2,
          offset: new Cesium.HeadingPitchRange(this.viewer.camera.heading, Cesium.Math.toRadians(-50), Math.max(1200, bSphere.radius * 2.5)),
        });
      }
    });
    banner.querySelector('#vex-streetview-btn')?.addEventListener('click', () => {
      const activePt = coords[draggedIndex >= 0 ? draggedIndex : 0] || coords[0];
      if (activePt) {
        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activePt.lat},${activePt.lng}`, '_blank');
      }
    });

    let draggedIndex = -1;
    const vexHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    vexHandler.setInputAction((click) => {
      const picked = this.viewer.scene.pick(click.position);
      if (picked && picked.id && picked.id.properties?.isVertexHandle?.getValue?.()) {
        draggedIndex = picked.id.properties.vertexIndex.getValue();
        this.viewer.scene.screenSpaceCameraController.enableRotate = false;
        this.viewer.scene.screenSpaceCameraController.enableTranslate = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    vexHandler.setInputAction((movement) => {
      if (draggedIndex < 0 || draggedIndex >= coords.length) return;
      const ray = this.viewer.camera.getPickRay(movement.endPosition);
      const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        coords[draggedIndex].lat = Cesium.Math.toDegrees(carto.latitude);
        coords[draggedIndex].lng = Cesium.Math.toDegrees(carto.longitude);
        coords[draggedIndex].alt = carto.height || 0;
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const endDrag = () => {
      if (draggedIndex !== -1) {
        draggedIndex = -1;
        this.viewer.scene.screenSpaceCameraController.enableRotate = true;
        this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
      }
    };
    vexHandler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.LEFT_UP);

    const cleanup = () => {
      vexHandler.destroy();
      banner.style.display = 'none';
      this.viewer.entities.remove(editEntity);
      for (const h of handleEntities) {
        this.viewer.entities.remove(h);
      }
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
      if (existingEntity) existingEntity.show = true;
    };

    banner.querySelector('#vex-finish-btn')?.addEventListener('click', () => {
      cleanup();
      const updatedItem = {
        ...item,
        coordinates: JSON.stringify(coords),
      };
      if (onFinish) onFinish(updatedItem, coords, false);
    });

    banner.querySelector('#vex-cancel-btn')?.addEventListener('click', () => {
      cleanup();
      if (onFinish) onFinish(item, null, true);
    });
  }

  /**
   * Smoothly flies camera to encompass current map's coordinates.
   */
  flyToCurrentExtent() {
    if (!this.items || this.items.length === 0) return;

    const allCartesians = [];
    for (const it of this.items) {
      try {
        const pts = typeof it.coordinates === 'string' ? JSON.parse(it.coordinates) : it.coordinates;
        pts.forEach((p) => {
          allCartesians.push(Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 0));
        });
      } catch (_e) {}
    }

    if (allCartesians.length > 0) {
      const bSphere = Cesium.BoundingSphere.fromPoints(allCartesians);
      this.viewer.camera.flyToBoundingSphere(bSphere, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(1500, bSphere.radius * 2.5)),
        duration: 2.0,
      });
    }
  }

  /**
   * Smoothly flies camera to encompass only currently filtered and visible map items.
   */
  flyToFilteredExtent() {
    if (!this.items || this.items.length === 0) return;

    const visibleItems = this.items.filter((it) => {
      const cat = it.category || 'General';
      const sub = it.subcategory || '';
      if (this.hiddenCategories.has(cat)) return false;
      if (this.selectedCategoryFilter !== 'All' && cat !== this.selectedCategoryFilter) return false;
      if (this.selectedSubcategoryFilter !== 'All' && sub !== this.selectedSubcategoryFilter) return false;
      return true;
    });

    const targetList = visibleItems.length > 0 ? visibleItems : this.items;
    const allCartesians = [];

    for (const it of targetList) {
      try {
        const pts = typeof it.coordinates === 'string' ? JSON.parse(it.coordinates) : it.coordinates;
        pts.forEach((p) => {
          allCartesians.push(Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 0));
        });
      } catch (_e) {}
    }

    if (allCartesians.length > 0) {
      const bSphere = Cesium.BoundingSphere.fromPoints(allCartesians);
      this.viewer.camera.flyToBoundingSphere(bSphere, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), Math.max(1200, bSphere.radius * 2.2)),
        duration: 1.8,
      });
    }
  }
}

let _instance = null;

export function initMapProjectManager(viewer) {
  if (!_instance) {
    _instance = new MapProjectManager(viewer);
    _instance.init();
  }
  if (typeof window !== 'undefined') {
    window.__mapProjectManager = _instance;
    window.__cesiumViewer = viewer;
  }
  return _instance;
}

export function getMapProjectManager() {
  return _instance;
}
