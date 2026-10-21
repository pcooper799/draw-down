import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Explicit confirmation required after an emergency stop before drawing resumes. */
export function SafeResumeDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,440px)]">
        <DialogHeader>
          <DialogTitle>Resume after emergency stop?</DialogTitle>
          <DialogDescription>
            The draw was safely paused. Nothing was reset — pool, insurance, and holds are intact.
            Confirm only when the stage and operator are ready to continue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Stay paused
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Yes — resume draw
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
