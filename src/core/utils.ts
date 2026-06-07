import { v4 as uuid } from 'uuid'

export const nowIso = () => new Date().toISOString()

export const makeId = () => uuid()

export const localDateYmd = (d = new Date()) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const localYmdFromValue = (value?: string | null) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return localDateYmd(d)
}

export const formatDateBr = (value?: string | null) => {
  if (!value) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export const formatDateTimeBr = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

export const formatDateTimeBrWithZone = (value?: string | null) => {
  const base = formatDateTimeBr(value)
  if (base === '-' || base === value) return base
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Fuso local'
  return `${base} (${tz})`
}

export const parsePtBrNumber = (value: string) => {
  const trimmed = value.trim()
  const hasComma = trimmed.includes(',')
  const hasDot = trimmed.includes('.')
  const normalized = hasComma
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : hasDot && /^\d+\.\d{1,2}$/.test(trimmed)
      ? trimmed
      : trimmed.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

export const formatPtBrNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)

export const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}
