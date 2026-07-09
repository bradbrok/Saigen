import { describe, expect, it } from 'vitest'
import {
  fitCameraToBounds,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  viewportToWorld,
  zoomCameraAround,
} from './viewport'

describe('viewport camera', () => {
  it('converts viewport points into unbounded world coordinates', () => {
    expect(viewportToWorld({ x: 100, y: -40, zoom: 2 }, { x: -300, y: 160 }))
      .toEqual({ x: -200, y: 100 })
  })

  it('keeps the world point under the cursor fixed while zooming', () => {
    const focalPoint = { x: 420, y: 210 }
    const before = { x: -180, y: 75, zoom: 0.8 }
    const worldPoint = viewportToWorld(before, focalPoint)
    const after = zoomCameraAround(before, 5.5, focalPoint)

    expect(viewportToWorld(after, focalPoint).x).toBeCloseTo(worldPoint.x)
    expect(viewportToWorld(after, focalPoint).y).toBeCloseTo(worldPoint.y)
  })

  it('fits and centers arbitrary negative and positive world bounds', () => {
    const camera = fitCameraToBounds(
      { minX: -600, minY: -200, maxX: 600, maxY: 400 },
      { width: 1200, height: 800 },
      100,
    )
    const topLeft = {
      x: camera.x + -600 * camera.zoom,
      y: camera.y + -200 * camera.zoom,
    }
    const bottomRight = {
      x: camera.x + 600 * camera.zoom,
      y: camera.y + 400 * camera.zoom,
    }

    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(600)
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(400)
    expect(topLeft.x).toBeGreaterThanOrEqual(100)
    expect(bottomRight.x).toBeLessThanOrEqual(1100)
  })

  it('only clamps at numeric-stability extremes', () => {
    expect(zoomCameraAround({ x: 0, y: 0, zoom: 1 }, 0, { x: 0, y: 0 }).zoom)
      .toBe(MIN_VIEWPORT_ZOOM)
    expect(zoomCameraAround({ x: 0, y: 0, zoom: 1 }, 1_000, { x: 0, y: 0 }).zoom)
      .toBe(MAX_VIEWPORT_ZOOM)
  })
})
