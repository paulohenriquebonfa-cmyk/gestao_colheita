import type { FreteLancamento } from './types'

export interface FechamentoFrete {
  totalViagens: number
  totalSacas: number
  valorPorSaca: number
  freteBruto: number
  totalDiesel: number
  totalLitrosDiesel: number
  precoMedioDiesel: number
  totalVales: number
  valorLiquido: number
}

const roundMoney = (value: number) => Number(value.toFixed(2))
const round4 = (value: number) => Number(value.toFixed(4))

export function calcularValorDiesel(litros: number, precoLitro: number): number {
  if (!Number.isFinite(litros) || !Number.isFinite(precoLitro) || litros <= 0 || precoLitro <= 0) return 0
  return roundMoney(litros * precoLitro)
}

export function calcularFechamentoFrete(input: {
  totalViagens: number
  totalSacas: number
  valorPorSaca: number
  lancamentos: FreteLancamento[]
}): FechamentoFrete {
  const freteBruto = Number.isFinite(input.valorPorSaca) && input.valorPorSaca > 0
    ? roundMoney(input.totalSacas * input.valorPorSaca)
    : 0
  const diesel = input.lancamentos.filter((l) => l.tipo === 'diesel')
  const vales = input.lancamentos.filter((l) => l.tipo === 'vale')
  const totalDiesel = roundMoney(diesel.reduce((acc, l) => acc + l.valor_total, 0))
  const totalLitrosDiesel = round4(diesel.reduce((acc, l) => acc + (l.litros ?? 0), 0))
  const totalVales = roundMoney(vales.reduce((acc, l) => acc + l.valor_total, 0))
  const precoMedioDiesel = totalLitrosDiesel > 0 ? round4(totalDiesel / totalLitrosDiesel) : 0

  return {
    totalViagens: input.totalViagens,
    totalSacas: input.totalSacas,
    valorPorSaca: input.valorPorSaca,
    freteBruto,
    totalDiesel,
    totalLitrosDiesel,
    precoMedioDiesel,
    totalVales,
    valorLiquido: roundMoney(freteBruto - totalDiesel - totalVales)
  }
}
