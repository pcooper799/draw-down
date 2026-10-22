import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import guideMarkdown from '../../docs/user-guide.md?raw'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Minimal markdown → safe HTML for the bundled operator guide (offline). */
function renderGuideHtml(md: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(
        /\[([^\]]+)\]\((https?:[^)]+)\)/g,
        '<a href="$2" rel="noreferrer">$1</a>',
      )

  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let inUl = false
  let inTable = false

  const closeUl = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
  }
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>')
      inTable = false
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (/^\|/.test(line)) {
      closeUl()
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
      const next = lines[i + 1]
      const isSep = next != null && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(next)
      if (!inTable) {
        out.push('<table class="help-table"><thead><tr>')
        for (const c of cells) out.push(`<th>${inline(c)}</th>`)
        out.push('</tr></thead><tbody>')
        inTable = true
        if (isSep) {
          i += 2
          continue
        }
        i += 1
        continue
      }
      if (isSep) {
        i += 1
        continue
      }
      out.push('<tr>')
      for (const c of cells) out.push(`<td>${inline(c)}</td>`)
      out.push('</tr>')
      i += 1
      continue
    }

    closeTable()

    if (!line.trim()) {
      closeUl()
      i += 1
      continue
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    if (h) {
      closeUl()
      const level = h[1].length
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      i += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`)
      i += 1
      continue
    }

    closeUl()
    out.push(`<p>${inline(line)}</p>`)
    i += 1
  }

  closeUl()
  closeTable()
  return out.join('\n')
}

export function HelpGuideDialog({ open, onOpenChange }: Props) {
  const html = useMemo(() => renderGuideHtml(guideMarkdown), [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="help-guide-dialog flex max-h-[min(90vh,840px)] w-[min(96vw,720px)] flex-col gap-0 overflow-hidden p-0"
        aria-describedby="help-guide-desc"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--line)] px-6 py-4">
          <DialogTitle className="font-display text-2xl tracking-wide text-[var(--accent)]">
            Draw Down help
          </DialogTitle>
          <DialogDescription id="help-guide-desc" className="text-sm text-[var(--ink-muted)]">
            Local operator guide — works offline, packaged with the app.
          </DialogDescription>
        </DialogHeader>
        <div
          className="help-guide-body min-h-0 flex-1 overflow-y-auto px-6 py-5"
          // Content is built from our bundled markdown with HTML escaping.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </DialogContent>
    </Dialog>
  )
}
