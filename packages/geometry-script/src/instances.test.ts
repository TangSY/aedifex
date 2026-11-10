import { expect, test } from 'bun:test'
import { Box3, Color, type Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { compileGeometryScript } from './compile'

const crates = (end: number) => `
export default function build({ THREE }) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 3)
  for (let i = 0; i < 3; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * ${end} / 2, 0, 0))
  return mesh
}`

test('compiles every drawn instance at its position', async () => {
  const result = await compileGeometryScript({ code: crates(6) })
  expect(result.manifest.triangles).toBe(36)
  expect(result.manifest.bounds.max[0] - result.manifest.bounds.min[0]).toBeCloseTo(7)
  const scene = (await new GLTFLoader().parseAsync(result.glb, '')).scene
  expect(new Box3().setFromObject(scene).getSize(new Vector3()).x).toBeCloseTo(7)
})

test('checks the extent of all instances', async () => {
  await expect(compileGeometryScript({ code: crates(80) })).rejects.toThrow('limit is 60')
})

test('normalizes a root instance mesh with a manually supplied matrix', async () => {
  const code = `export default function build({ THREE }) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1)
    mesh.setMatrixAt(0, new THREE.Matrix4())
    mesh.matrixAutoUpdate = false
    mesh.matrix.makeTranslation(5, 0, 0)
    return mesh
  }`
  const result = await compileGeometryScript({ code })
  expect(result.manifest.bounds.min).toEqual([-0.5, 0, -0.5])
  expect(result.manifest.bounds.max).toEqual([0.5, 1, 0.5])
})

test('rejects too many instances before expanding them', async () => {
  const code = `export default function build({ THREE }) {
    return new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 10001)
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('10000')
})

test('retains instance colours in the exported geometry', async () => {
  const code = `export default function build({ THREE }) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0))
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0))
    mesh.setColorAt(0, new THREE.Color(1, 0, 0))
    mesh.setColorAt(1, new THREE.Color(0, 0, 1))
    return mesh
  }`
  const result = await compileGeometryScript({ code })
  const scene = (await new GLTFLoader().parseAsync(result.glb, '')).scene
  const colors: Color[] = []
  scene.traverse((obj) => {
    const attr = (obj as Mesh).geometry?.getAttribute('color')
    if (attr)
      for (let i = 0; i < attr.count; i++)
        colors.push(new Color(attr.getX(i), attr.getY(i), attr.getZ(i)))
  })
  expect(colors.some((c) => c.r > 0.9 && c.b < 0.1)).toBe(true)
  expect(colors.some((c) => c.b > 0.9 && c.r < 0.1)).toBe(true)
})

test('counts both sides for every instance sharing a double-sided material', async () => {
  const code = `export default function build({ THREE }) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }), 2)
    m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0))
    m.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0))
    return m
  }`
  const result = await compileGeometryScript({ code })
  expect(result.manifest.triangles).toBe(8)
})

test('does not treat zero drawn instances as visible geometry', async () => {
  const code = `export default function build({ THREE }) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1)
    mesh.count = 0
    return mesh
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('no visible meshes')
})

test('rejects non-finite instance transforms', async () => {
  const code = `export default function build({ THREE }) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1)
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(NaN, 0, 0))
    return mesh
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('Instance matrix is not finite')
})

test('rejects expanded geometry over the triangle limit before materializing it', async () => {
  const code = `export default function build({ THREE }) {
    return new THREE.InstancedMesh(new THREE.SphereGeometry(1, 64, 64), new THREE.MeshBasicMaterial(), 40)
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('triangles exceeds')
})

test('clips and measures instanced geometry on a host floor like separate meshes', async () => {
  const script = (instanced: boolean) => `export default function build({ THREE }) {
    const geometry = new THREE.BoxGeometry(2, 0.1, 1)
    const material = new THREE.MeshStandardMaterial()
    const group = new THREE.Group()
    if (${instanced}) {
      const mesh = new THREE.InstancedMesh(geometry, material, 2)
      for (let i = 0; i < 2; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(1 + i * 2, 0.05, 0.5))
      group.add(mesh)
    } else {
      for (let i = 0; i < 2; i++) {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(1 + i * 2, 0.05, 0.5)
        group.add(mesh)
      }
    }
    return group
  }`
  const inputs = {
    polygon: [
      [0, 0],
      [3, 0],
      [3, 1],
      [0, 1],
    ],
    holes: [],
    elevation: 0,
  }
  const regular = await compileGeometryScript({ code: script(false), inputs })
  const instanced = await compileGeometryScript({ code: script(true), inputs })
  for (const edge of ['min', 'max'] as const) {
    for (let axis = 0; axis < 3; axis++)
      expect(instanced.manifest.bounds[edge][axis]).toBeCloseTo(
        regular.manifest.bounds[edge][axis]!,
      )
  }
  expect(instanced.manifest.triangles).toBe(regular.manifest.triangles)
  expect(instanced.manifest.coverage).toBe(regular.manifest.coverage)
})

test('preserves a root instance animation and part metadata', async () => {
  const code = `export default function build({ THREE }) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2)
    m.name = 'part:door'
    m.userData.label = 'Door'
    m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0))
    m.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0))
    m.animations = [new THREE.AnimationClip('open', 1, [new THREE.VectorKeyframeTrack('part:door.position', [0, 1], [0, 0, 0, 0, 1, 0])])]
    return m
  }`
  const result = await compileGeometryScript({ code })
  expect(result.manifest.parts).toMatchObject([{ id: 'door', label: 'Door' }])
  expect(result.manifest.animations).toMatchObject([{ name: 'open' }])
  expect((await new GLTFLoader().parseAsync(result.glb, '')).animations).toHaveLength(1)
})

test('rejects a colour buffer shorter than the drawn instance count', async () => {
  const code = `export default function build({ THREE }) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2)
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3)
    return m
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('colour buffer is shorter')
})

test('rejects colour expansion exceeding its memory budget', async () => {
  const code = `export default function build({ THREE }) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3000000), 3))
    geometry.setIndex([0, 1, 2])
    const m = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 12)
    m.setColorAt(0, new THREE.Color(1, 1, 1))
    return m
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('128 MiB')
})

test('retains instance shear in an animated model', async () => {
  const code = `export default function build({ THREE }) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 1)
    m.name = 'part:door'
    m.setMatrixAt(0, new THREE.Matrix4().makeShear(1, 0, 0, 0, 0, 0))
    m.animations = [new THREE.AnimationClip('open', 1, [new THREE.VectorKeyframeTrack('part:door.position', [0, 1], [0, 0, 0, 0, 1, 0])])]
    return m
  }`
  const result = await compileGeometryScript({ code })
  const scene = (await new GLTFLoader().parseAsync(result.glb, '')).scene
  const actual = new Box3().setFromObject(scene).getSize(new Vector3())
  const bounds = result.manifest.bounds
  expect(actual.x).toBeCloseTo(bounds.max[0] - bounds.min[0], 4)
  expect(actual.y).toBeCloseTo(bounds.max[1] - bounds.min[1], 4)
})

test('rejects reflected shear rather than silently reversing a surface', async () => {
  const code = `export default function build({ THREE }) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1)
    m.setMatrixAt(0, new THREE.Matrix4().makeShear(1, 0, 0, 0, 0, 0).multiply(new THREE.Matrix4().makeScale(-1, 1, 1)))
    return m
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('Reflected shear')
})

test('rejects mixed vertex-colour modes for tinted multi-material instances', async () => {
  const code = `export default function build({ THREE }) {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3))
    const materials = [new THREE.MeshBasicMaterial({ vertexColors: true }), new THREE.MeshBasicMaterial()]
    const m = new THREE.InstancedMesh(geometry, materials, 1)
    m.setColorAt(0, new THREE.Color(1, 0, 0))
    return m
  }`
  await expect(compileGeometryScript({ code })).rejects.toThrow('Mixed vertex-colour')
})

test('counts shared source materials once across tinted and ordinary meshes', async () => {
  const code = `export default function build({ THREE }) {
    const group = new THREE.Group()
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    for (let i = 0; i < 32; i++) {
      const material = new THREE.MeshStandardMaterial({ name: 'slot_' + i })
      const plain = new THREE.Mesh(geometry, material)
      plain.position.x = i * 0.2
      group.add(plain)
      const m = new THREE.InstancedMesh(geometry, material, 1)
      m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(i * 0.2, 1, 0))
      m.setColorAt(0, new THREE.Color(1, 0, 0))
      group.add(m)
    }
    return group
  }`
  const result = await compileGeometryScript({ code })
  expect(result.manifest.slots).toHaveLength(32)
  expect(result.manifest.triangles).toBe(64 * 12)
})
