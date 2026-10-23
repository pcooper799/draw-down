import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_ORG_THEME,
  normalizeOrgTheme,
  type OrgThemeColors,
} from '@/lib/orgTheme'

const FIELDS: { key: keyof OrgThemeColors; label: string; hint: string }[] = [
  { key: 'accent', label: 'Brand accent', hint: 'Buttons, status, Draw Down mark' },
  { key: 'insured', label: 'Insured', hint: 'Green tickets by default' },
  { key: 'open', label: 'No-Insurance', hint: 'Yellow tickets by default' },
  { key: 'held', label: 'Held', hint: 'Teal / auction tickets' },
  { key: 'out', label: 'Out', hint: 'Eliminated tickets' },
]

type OrgThemeEditorProps = {
  value: OrgThemeColors
  disabled?: boolean
  onChange: (next: OrgThemeColors) => void
}

export function OrgThemeEditor({ value, disabled = false, onChange }: OrgThemeEditorProps) {
  const theme = normalizeOrgTheme(value)

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--ink)]">Organization colors</p>
          <p className="text-xs text-[var(--ink-faint)]">
            Custom palette for this org — stage, cover, and board.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_ORG_THEME })}
        >
          Defaults
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            className="flex items-center gap-3 border border-[var(--line)] bg-black/20 px-2.5 py-2"
          >
            <input
              type="color"
              className="h-9 w-11 cursor-pointer border border-[var(--line)] bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              value={theme[field.key]}
              disabled={disabled}
              aria-label={field.label}
              onChange={(e) =>
                onChange(
                  normalizeOrgTheme({
                    ...theme,
                    [field.key]: e.target.value,
                  }),
                )
              }
            />
            <span className="min-w-0">
              <Label className="text-sm">{field.label}</Label>
              <span className="block truncate text-[0.7rem] text-[var(--ink-faint)]">
                {field.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
