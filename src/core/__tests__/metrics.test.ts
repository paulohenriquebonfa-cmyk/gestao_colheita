import { describe, expect, it } from 'vitest'
import { produtividadeSacasPorHa, toSacas } from '../metrics'

describe('metrics', () => {
  it('converte peso liquido em sacas usando 60kg por saca', () => {
    expect(toSacas(120)).toBe(2)
    expect(toSacas(30)).toBe(0.5)
  })

  it('calcula produtividade em sacas/ha', () => {
    expect(produtividadeSacasPorHa(100, 20)).toBe(5)
  })

  it('retorna 0 para area invalida', () => {
    expect(produtividadeSacasPorHa(100, 0)).toBe(0)
    expect(produtividadeSacasPorHa(100, -5)).toBe(0)
  })
})