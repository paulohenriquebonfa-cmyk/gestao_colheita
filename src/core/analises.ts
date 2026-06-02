import type { Carga } from './types'
import { produtividadeSacasPorHa, toSacas } from './metrics'

export interface AreaVariedadeTalhaoCalc {
  talhao_id: string
  variedade_id: string
  area_ha: number
}

export function dividirPesoBrutoProporcional(brutoTotal: number, liquidosKg: number[]): number[] {
  if (!Number.isFinite(brutoTotal) || brutoTotal <= 0) return []
  const validos = liquidosKg.filter((n) => Number.isFinite(n) && n > 0)
  if (validos.length === 0) return []

  const totalLiquido = validos.reduce((acc, n) => acc + n, 0)
  if (totalLiquido <= 0) return []

  const resultado: number[] = []
  let acumulado = 0
  for (let i = 0; i < validos.length; i += 1) {
    const liquido = validos[i]
    const proporcao = liquido / totalLiquido
    const brutoLinha = i === validos.length - 1
      ? Number((brutoTotal - acumulado).toFixed(2))
      : Number((brutoTotal * proporcao).toFixed(2))
    acumulado += brutoLinha
    resultado.push(brutoLinha)
  }
  return resultado
}

export interface ProdVarTalhao {
  variedade_id: string
  sacas_total: number
  area_ha: number
  sc_ha: number
}

export function produtividadeVariedadeNoTalhao(
  cargas: Carga[],
  areasCfg: AreaVariedadeTalhaoCalc[],
  talhaoId: string
): ProdVarTalhao[] {
  const cargasTalhao = cargas.filter((c) => c.talhao_id === talhaoId)
  const variedades = Array.from(new Set(cargasTalhao.map((c) => c.variedade_id)))
  const areaMap = new Map(areasCfg.filter((a) => a.talhao_id === talhaoId).map((a) => [a.variedade_id, a.area_ha]))

  return variedades.map((variedadeId) => {
    const sacasTotal = cargasTalhao
      .filter((c) => c.variedade_id === variedadeId)
      .reduce((acc, c) => acc + c.sacas, 0)
    const area = areaMap.get(variedadeId) ?? 0
    return {
      variedade_id: variedadeId,
      sacas_total: sacasTotal,
      area_ha: area,
      sc_ha: produtividadeSacasPorHa(sacasTotal, area)
    }
  })
}

export function totalSacasDivididas(liquidosKg: number[]): number {
  const totalLiquido = liquidosKg
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((acc, n) => acc + n, 0)
  return toSacas(totalLiquido)
}

