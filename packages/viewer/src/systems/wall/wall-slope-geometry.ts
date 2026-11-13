import { BufferGeometry, Float32BufferAttribute } from 'three'

type Vertex = { x: number; y: number; z: number; u: number; v: number }

/** Split an extruded wall at the slope's height clamp, preserving its texture coordinates. */
export function splitWallAtSlopeClamp(
  geometry: BufferGeometry,
  plane: number | { x: number; z: number; offset: number },
): BufferGeometry {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  if (!position || !uv || geometry.index) return geometry
  const coordinates: number[] = []
  const textures: number[] = []
  const distance = (vertex: Vertex) =>
    typeof plane === 'number'
      ? vertex.x - plane
      : vertex.x * plane.x + vertex.z * plane.z - plane.offset
  const append = (vertex: Vertex) => {
    coordinates.push(vertex.x, vertex.y, vertex.z)
    textures.push(vertex.u, vertex.v)
  }
  const clip = (polygon: Vertex[], below: boolean) => {
    const result: Vertex[] = []
    const samePoint = (a: Vertex, b: Vertex) =>
      Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9
    const add = (vertex: Vertex) => {
      if (!result.length || !samePoint(result[result.length - 1]!, vertex)) result.push(vertex)
    }
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i]!
      const previous = polygon[(i + polygon.length - 1) % polygon.length]!
      const currentDistance = distance(current)
      const previousDistance = distance(previous)
      const inside = below ? currentDistance <= 0 : currentDistance >= 0
      const previousInside = below ? previousDistance <= 0 : previousDistance >= 0
      if (inside !== previousInside) {
        const t = previousDistance / (previousDistance - currentDistance)
        add({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
          z: previous.z + (current.z - previous.z) * t,
          u: previous.u + (current.u - previous.u) * t,
          v: previous.v + (current.v - previous.v) * t,
        })
      }
      if (inside) add(current)
    }
    if (result.length > 1 && samePoint(result[0]!, result[result.length - 1]!)) result.pop()
    return result
  }
  for (let i = 0; i < position.count; i += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const index = i + offset
      return {
        x: position.getX(index),
        y: position.getY(index),
        z: position.getZ(index),
        u: uv.getX(index),
        v: uv.getY(index),
      }
    })
    const min = Math.min(...triangle.map(distance))
    const max = Math.max(...triangle.map(distance))
    const polygons =
      min < -1e-7 && max > 1e-7 ? [clip(triangle, true), clip(triangle, false)] : [triangle]
    for (const polygon of polygons)
      for (let corner = 1; corner + 1 < polygon.length; corner++) {
        append(polygon[0]!)
        append(polygon[corner]!)
        append(polygon[corner + 1]!)
      }
  }
  const result = new BufferGeometry()
  result.setAttribute('position', new Float32BufferAttribute(coordinates, 3))
  result.setAttribute('uv', new Float32BufferAttribute(textures, 2))
  result.computeVertexNormals()
  return result
}
