/** Physical metres, in wrist-local space: Y follows the forearm, +Z is the palm. */
export const WRIST_BAND = {
  radiusX: 0.035,
  radiusZ: 0.028,
  width: 0.034,
  buttonWidth: 0.025,
  buttonHeight: 0.027,
  cornerRadius: 0.002,
}

export function wristBandTile(angle: number) {
  const { radiusX, radiusZ } = WRIST_BAND
  return {
    position: [radiusX * Math.sin(angle), 0, radiusZ * Math.cos(angle)] as [
      number,
      number,
      number,
    ],
    rotation: [
      0,
      Math.atan2(Math.sin(angle) / radiusX, Math.cos(angle) / radiusZ),
      0,
    ] as [number, number, number],
  }
}

export const WRIST_BAND_TILES = [-0.9, 0, 0.9].map(wristBandTile)

export const WRIST_BAND_EDGES = [-1, 1].map((side) =>
  Array.from({ length: 65 }, (_, i): [number, number, number] => {
    const angle = (i / 64) * Math.PI * 2
    return [
      (WRIST_BAND.radiusX + 0.0002) * Math.sin(angle),
      (side * WRIST_BAND.width) / 2,
      (WRIST_BAND.radiusZ + 0.0002) * Math.cos(angle),
    ]
  }),
)
