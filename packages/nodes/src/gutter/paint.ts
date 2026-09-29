import type { PaintCapability } from '@aedifex/core'
import { surfacePaintCapability } from '../shared/surface-paint'

export const gutterPaint: PaintCapability = {
  ...surfacePaintCapability,
  materialTarget: 'gutter',
  resolveRole: () => 'gutter',
}
