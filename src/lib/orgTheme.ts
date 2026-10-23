/** Per-organization stage colors (accent + ticket states). */

export type OrgThemeColors = {
  /** Brand / highlight (buttons, status, Draw Down mark). */
  accent: string
  /** Insured tickets (green by default). */
  insured: string
  /** No-insurance / still-in tickets (yellow by default). */
  open: string
  /** Held / auction tickets (teal by default). */
  held: string
  /** Eliminated tickets (red by default). */
  out: string
}

export const DEFAULT_ORG_THEME: OrgThemeColors = {
  accent: '#e8a838',
  insured: '#5aa87a',
  open: '#e4c15a',
  held: '#6ec3c9',
  out: '#d35a4a',
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim())
}

export function normalizeOrgTheme(raw: unknown): OrgThemeColors {
  const src = raw && typeof raw === 'object' ? (raw as Partial<OrgThemeColors>) : {}
  return {
    accent: isHexColor(src.accent) ? src.accent.trim().toLowerCase() : DEFAULT_ORG_THEME.accent,
    insured: isHexColor(src.insured) ? src.insured.trim().toLowerCase() : DEFAULT_ORG_THEME.insured,
    open: isHexColor(src.open) ? src.open.trim().toLowerCase() : DEFAULT_ORG_THEME.open,
    held: isHexColor(src.held) ? src.held.trim().toLowerCase() : DEFAULT_ORG_THEME.held,
    out: isHexColor(src.out) ? src.out.trim().toLowerCase() : DEFAULT_ORG_THEME.out,
  }
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isHexColor(hex)) return null
  const n = hex.trim().slice(1)
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  }
}

/** Relative luminance 0–1 (sRGB). */
export function relativeLuminance(hex: string): number {
  const rgb = parseRgb(hex)
  if (!rgb) return 0.5
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

/** Dark ink on light swatches, light ink on dark swatches. */
export function contrastInk(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#1a1206' : '#f3e6c8'
}

/** CSS custom properties for the live stage / operator chrome. */
export function themeToCssVars(theme: OrgThemeColors): Record<string, string> {
  const t = normalizeOrgTheme(theme)
  return {
    '--accent': t.accent,
    '--accent-fg': contrastInk(t.accent),
    '--safe': t.insured,
    '--warn': t.open,
    '--held': t.held,
    '--danger': t.out,
    '--ticket-insured-ink': contrastInk(t.insured),
    '--ticket-open-ink': contrastInk(t.open),
    '--ticket-held-ink': contrastInk(t.held),
    '--ticket-out-ink': contrastInk(t.out),
  }
}
