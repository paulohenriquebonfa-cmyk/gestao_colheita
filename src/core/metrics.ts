export const KG_POR_SACA = 60

export function toSacas(pesoLiquidoKg: number): number {
  return pesoLiquidoKg / KG_POR_SACA
}

export function produtividadeSacasPorHa(totalSacas: number, areaHa: number): number {
  if (areaHa <= 0) return 0
  return totalSacas / areaHa
}