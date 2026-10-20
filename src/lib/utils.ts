import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTicket(n: number, digits = 3) {
  return String(n).padStart(digits, '0')
}

export function parseTicketList(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
}
