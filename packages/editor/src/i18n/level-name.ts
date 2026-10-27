import { type AedifexI18n, getDefaultLevelName, levelDisplayNumber } from '@aedifex/core'

type DisplayLevel = {
  level?: number
  name?: string
}

export function localizedLevelName(level: DisplayLevel, i18n: AedifexI18n, locale: string): string {
  const levelNumber = level.level ?? 0
  const authoredName = level.name?.trim()
  if (
    authoredName &&
    authoredName !== `Level ${levelNumber}` &&
    authoredName !== getDefaultLevelName(levelNumber)
  ) {
    return authoredName
  }
  if (levelNumber === 0) {
    return i18n._({ id: 'core.level.groundFloor', message: 'Ground floor' })
  }
  if (levelNumber === -1) {
    return i18n._({ id: 'core.level.basement', message: 'Basement' })
  }
  if (levelNumber < -1) {
    return i18n._({
      id: 'core.level.basementNumber',
      message: 'Basement {number}',
      values: { number: -levelNumber },
    })
  }
  return i18n._({
    id: 'core.level.floorNumber',
    message: 'Floor {number}',
    values: { number: levelDisplayNumber(levelNumber, locale) },
  })
}
