import type { Point } from './types'

export interface ViewportCamera {
  x: number
  y: number
  zoom: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// These are intentionally far beyond normal editor zoom levels. The limits only
// protect SVG/browser numeric stability; the workspace has no page-like boundary.
export const MIN_VIEWPORT_ZOOM = 0.01
export const MAX_VIEWPORT_ZOOM = 128

export function clampViewportZoom(zoom: number): number {
  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, zoom))
}

export function viewportToWorld(camera: ViewportCamera, point: Point): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  }
}

export function zoomCameraAround(
  camera: ViewportCamera,
  requestedZoom: number,
  focalPoint: Point,
): ViewportCamera {
  const zoom = clampViewportZoom(requestedZoom)
  const worldPoint = viewportToWorld(camera, focalPoint)
  return {
    x: focalPoint.x - worldPoint.x * zoom,
    y: focalPoint.y - worldPoint.y * zoom,
    zoom,
  }
}

export function fitCameraToBounds(
  bounds: WorldBounds,
  viewport: ViewportSize,
  padding = 72,
): ViewportCamera {
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX)
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY)
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const zoom = clampViewportZoom(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight))
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return {
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    zoom,
  }
}
