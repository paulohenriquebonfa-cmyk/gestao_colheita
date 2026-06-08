import type { Carga, FreteLancamento } from './types'

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

export function calcularFreteCarga(sacas: number, valorPorSaca: number): number {
  if (!Number.isFinite(sacas) || sacas <= 0 || !Number.isFinite(valorPorSaca) || valorPorSaca <= 0) return 0
  return roundMoney(sacas * valorPorSaca)
}

export function calcularFechamentoFrete(input: {
  totalViagens: number
  totalSacas: number
  valorPorSaca?: number
  freteBruto?: number
  lancamentos: FreteLancamento[]
}): FechamentoFrete {
  const freteBruto = Number.isFinite(input.freteBruto) && (input.freteBruto ?? 0) > 0
    ? roundMoney(input.freteBruto ?? 0)
    : (Number.isFinite(input.valorPorSaca) && (input.valorPorSaca ?? 0) > 0
        ? calcularFreteCarga(input.totalSacas, input.valorPorSaca ?? 0)
        : 0)
  const valorPorSaca = Number.isFinite(input.valorPorSaca) && (input.valorPorSaca ?? 0) > 0
    ? round4(input.valorPorSaca ?? 0)
    : (input.totalSacas > 0 ? round4(freteBruto / input.totalSacas) : 0)
  const diesel = input.lancamentos.filter((l) => l.tipo === 'diesel')
  const vales = input.lancamentos.filter((l) => l.tipo === 'vale')
  const totalDiesel = roundMoney(diesel.reduce((acc, l) => acc + l.valor_total, 0))
  const totalLitrosDiesel = round4(diesel.reduce((acc, l) => acc + (l.litros ?? 0), 0))
  const totalVales = roundMoney(vales.reduce((acc, l) => acc + l.valor_total, 0))
  const precoMedioDiesel = totalLitrosDiesel > 0 ? round4(totalDiesel / totalLitrosDiesel) : 0

  return {
    totalViagens: input.totalViagens,
    totalSacas: input.totalSacas,
    valorPorSaca,
    freteBruto,
    totalDiesel,
    totalLitrosDiesel,
    precoMedioDiesel,
    totalVales,
    valorLiquido: roundMoney(freteBruto - totalDiesel - totalVales)
  }
}

export interface ResumoReprocessamentoFrete {
  quantidadeCargas: number
  totalSacas: number
  totalAnterior: number
  totalNovo: number
  diferenca: number
}

export function resumirReprocessamentoFrete(cargas: Carga[], novoValorPorSaca: number): ResumoReprocessamentoFrete {
  const totalSacas = round4(cargas.reduce((acc, carga) => acc + carga.sacas, 0))
  const totalAnterior = roundMoney(cargas.reduce((acc, carga) => acc + carga.frete_valor_total, 0))
  const totalNovo = roundMoney(cargas.reduce((acc, carga) => acc + calcularFreteCarga(carga.sacas, novoValorPorSaca), 0))
  return {
    quantidadeCargas: cargas.length,
    totalSacas,
    totalAnterior,
    totalNovo,
    diferenca: roundMoney(totalNovo - totalAnterior)
  }
}
