# Aedifex — Design System

## Color System (OKLch)

All colors use OKLch color space. Defined in `apps/editor/app/globals.css`.

### Light Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(0.998 0 0)` | Page background |
| `--foreground` | `oklch(0.145 0 0)` | Primary text |
| `--primary` | `oklch(0.205 0 0)` | Buttons, emphasis |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text on primary |
| `--border` | `oklch(0.922 0 0)` | Borders |
| `--accent` | `oklch(0.97 0 0)` | Hover backgrounds |
| `--muted-foreground` | `oklch(0.556 0 0)` | Secondary text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error/danger |

### Dark Mode (sidebar, editor panels)
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(0.205 0 0)` | ~#171717 |
| `--foreground` | `oklch(0.985 0 0)` | ~white |
| `--border` | `oklch(1 0 0 / 10%)` | Subtle borders |
| `--input` | `oklch(1 0 0 / 15%)` | Input backgrounds |
| `--accent` | `oklch(1 0 0 / 10%)` | Hover states |
| `--sidebar-primary` | `oklch(0.488 0.243 264.376)` | Blue-purple accent |

### Hardcoded Values (panels)
| Value | Usage |
|-------|-------|
| `#2C2C2E` | Panel button background |
| `#3e3e3e` | Panel button hover/active |

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Sans (default) | Barlow | 400/500/600/700 | — |
| Mono | GeistMono | 400 | — |
| UI text | font-barlow | 500 (medium) | text-sm (14px) |
| Small UI | font-barlow | 400 | text-xs (12px) |
| Headings | font-barlow | 600 (semibold) | text-lg (18px) |
| Numbers/code | font-mono tabular-nums | 400 | text-sm |

## Spacing & Sizing

| Token | Value | Usage |
|-------|-------|-------|
| Panel padding | `px-3 py-3` (12px) | Panel headers, sections |
| Section gap | `gap-1.5` (6px) | Within panel sections |
| Control height | `h-10` (40px) | Standard controls |
| Button height | `h-9` (36px) | Default buttons |
| Small button | `h-8` (32px) | Compact buttons |
| Icon button | `h-7 w-7` (28px) | Panel header actions |
| Icon size | `h-4 w-4` (16px) | Standard icons |
| Rail icon | `h-6 w-6` (24px) | Icon Rail navigation |

## Border Radius (Squircle)

```css
--radius: 0.625rem;      /* 10px base */
--radius-sm: calc(var(--radius) - 4px);  /* 6px */
--radius-md: calc(var(--radius) - 2px);  /* 8px */
--radius-lg: var(--radius);               /* 10px */
--radius-xl: calc(var(--radius) + 4px);  /* 14px */
corner-shape: squircle;  /* Progressive enhancement */
```

## Layout

| Component | Width | Notes |
|-----------|-------|-------|
| Icon Rail | 44px (`w-11`) | Fixed vertical icon bar |
| Sidebar | 288-800px | Resizable, default 288px |
| Floating panels | 320px | Right-side property panels |
| Viewport | Remaining space | Three.js canvas |

## Shadows & Effects

| Level | Value | Usage |
|-------|-------|-------|
| Input | `shadow-xs` | Form inputs |
| Panel | `shadow-2xl backdrop-blur-xl` | Floating panels |
| Dialog | `shadow-lg` | Modal dialogs |
| Button | none | No default shadow |

## Animation

- Library: `motion/react` (Framer Motion)
- Default spring: `type: 'spring', bounce: 0, duration: 0.4`
- Enter/exit: `AnimatePresence` with height + opacity
- Duration range: 200-400ms

## Component Patterns

### Button Variants (CVA)
- `default`: bg-primary text-primary-foreground
- `ghost`: hover:bg-accent/50
- `destructive`: bg-destructive text-white
- `outline`: border bg-background
- `secondary`: bg-secondary

### Panel Header
```
flex items-center gap-2 px-3 py-3 border-b border-border/50
```

### Panel Section (collapsible)
- Header: `h-10`, expanded `bg-accent/50`, collapsed `text-muted-foreground`
- Content: `p-3 pt-2 gap-1.5`

### Icon System
- Library: Lucide React (^0.562.0)
- Standard: 16px (`h-4 w-4`)
- Rail: 24px (`h-6 w-6`)
- States: inactive `opacity-50 saturate-0`, active `opacity-100`

## Z-Index Layers
| Layer | Z-Index |
|-------|---------|
| Sidebar | 10 |
| Floating panels | 50 |
| Dialog/Popover | 50 |
| Tooltip | 50 |

## Dark Theme

The editor sidebar is **always dark** (`dark text-white` class forced). All sidebar components use dark mode tokens by default. The 3D viewport has no theme — it's a Three.js canvas.
