import { v4 as uuid } from 'uuid'

export const nowIso = () => new Date().toISOString()

export const makeId = () => uuid()

export const localDateYmd = (d = new Date()) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parsePtBrNumber = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim()
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

export const formatPtBrNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
