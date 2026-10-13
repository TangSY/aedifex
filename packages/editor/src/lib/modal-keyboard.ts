export function isModalKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => Element | null } | null
  return Boolean(
    element?.closest?.(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
    ),
  )
}
