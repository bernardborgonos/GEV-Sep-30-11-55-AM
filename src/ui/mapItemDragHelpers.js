import { calculateCentroid } from '../tools/geodesicMath.js';

export const HANDLE_TYPES = Object.freeze({
  VERTEX: 'VERTEX',
  CENTROID: 'CENTROID',
});

export function translateCoordinates(coords, deltaLng, deltaLat) {
  if (!Array.isArray(coords)) return [];
  return coords.map((pt) => ({
    ...pt,
    lng: Number(pt.lng) + deltaLng,
    lat: Number(pt.lat) + deltaLat,
  }));
}

export function updateVertexCoordinate(coords, vertexIndex, nextPoint) {
  if (!Array.isArray(coords)) return [];
  const next = coords.map((pt) => ({ ...pt }));
  if (vertexIndex < 0 || vertexIndex >= next.length) return next;
  next[vertexIndex] = {
    ...next[vertexIndex],
    ...nextPoint,
  };
  return next;
}

export function computeHandleCentroid(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const [lng, lat] = calculateCentroid(coords);
  const finiteAlts = coords
    .map((pt) => Number(pt?.alt))
    .filter((alt) => Number.isFinite(alt));
  const alt = finiteAlts.length > 0
    ? finiteAlts.reduce((sum, value) => sum + value, 0) / finiteAlts.length
    : 0;
  return { lng, lat, alt };
}

export function snapshotCameraControlState(controller) {
  if (!controller) return null;
  return {
    enableRotate: controller.enableRotate,
    enableTranslate: controller.enableTranslate,
    enableZoom: controller.enableZoom,
    enableTilt: controller.enableTilt,
    enableLook: controller.enableLook,
  };
}

export function setCameraControlState(controller, value) {
  if (!controller) return;
  controller.enableRotate = value;
  controller.enableTranslate = value;
  controller.enableZoom = value;
  controller.enableTilt = value;
  controller.enableLook = value;
}

export function restoreCameraControlState(controller, state) {
  if (!controller || !state) return;
  controller.enableRotate = Boolean(state.enableRotate);
  controller.enableTranslate = Boolean(state.enableTranslate);
  controller.enableZoom = Boolean(state.enableZoom);
  controller.enableTilt = Boolean(state.enableTilt);
  controller.enableLook = Boolean(state.enableLook);
}
