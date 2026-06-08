import { describe, expect, it } from 'vitest'
import { calcularFechamentoFrete, calcularFreteCarga, calcularSacasFrete, calcularValorDiesel, resumirReprocessamentoFrete } from '../frete'
import type { Carga, FreteLancamento } from '../types'

function lancamento(patch: Partial<FreteLancamento>): FreteLancamento {
  return {
    id: patch.id ?? crypto.randomUUID(),
    safra_id: 'safra-1',
    caminhao_id: 'caminhao-1',
    tipo: patch.tipo ?? 'diesel',
    data: patch.data ?? '2026-06-01',
    litros: patch.litros,
    preco_litro: patch.preco_litro,
    valor_total: patch.valor_total ?? 0,
    observacao: patch.observacao,
    sync_status: 'pending_sync',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    created_by: 'user-1',
    updated_by: 'user-1'
  }
}

function carga(patch: Partial<Carga>): Carga {
  return {
    id: patch.id ?? crypto.randomUUID(),
    safra_id: patch.safra_id ?? 'safra-1',
    data: patch.data ?? '2026-06-01',
    placa: patch.placa ?? 'caminhao-1',
    propriedade_id: patch.propriedade_id ?? 'prop-1',
    talhao_id: patch.talhao_id ?? 'talhao-1',
    produtor_id: patch.produtor_id ?? 'prod-1',
    variedade_id: patch.variedade_id ?? 'var-1',
    armazem_id: patch.armazem_id ?? 'arm-1',
    peso_bruto_kg: patch.peso_bruto_kg ?? 35000,
    peso_liquido_kg: patch.peso_liquido_kg ?? 33000,
    sacas: patch.sacas ?? 550,
    frete_valor_por_saca: patch.frete_valor_por_saca ?? 2,
    frete_valor_total: patch.frete_valor_total ?? 1100,
    sync_status: 'pending_sync',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    created_by: 'user-1',
    updated_by: 'user-1'
  }
}

describe('frete', () => {
  it('calcula valor de diesel por abastecida com litros e preco proprio', () => {
    expect(calcularValorDiesel(120, 5.87)).toBe(704.4)
    expect(calcularValorDiesel(0, 5.87)).toBe(0)
  })

  it('calcula fechamento com varias abastecidas em precos diferentes e vales', () => {
    const fechamento = calcularFechamentoFrete({
      totalViagens: 4,
      totalSacas: 1000,
      valorPorSaca: 2.5,
      lancamentos: [
        lancamento({ tipo: 'diesel', litros: 100, preco_litro: 5, valor_total: 500 }),
        lancamento({ tipo: 'diesel', litros: 50, preco_litro: 6, valor_total: 300 }),
        lancamento({ tipo: 'vale', valor_total: 200 })
      ]
    })

    expect(fechamento.freteBruto).toBe(2500)
    expect(fechamento.totalDiesel).toBe(800)
    expect(fechamento.totalLitrosDiesel).toBe(150)
    expect(fechamento.precoMedioDiesel).toBe(5.3333)
    expect(fechamento.totalVales).toBe(200)
    expect(fechamento.valorLiquido).toBe(1500)
  })

  it('permite valor liquido negativo quando descontos passam do frete', () => {
    const fechamento = calcularFechamentoFrete({
      totalViagens: 1,
      totalSacas: 100,
      valorPorSaca: 2,
      lancamentos: [
        lancamento({ tipo: 'diesel', litros: 80, preco_litro: 5, valor_total: 400 }),
        lancamento({ tipo: 'vale', valor_total: 100 })
      ]
    })

    expect(fechamento.freteBruto).toBe(200)
    expect(fechamento.valorLiquido).toBe(-300)
  })

  it('calcula frete bruto a partir da soma salva nas cargas', () => {
    const fechamento = calcularFechamentoFrete({
      totalViagens: 2,
      totalSacas: 1100,
      freteBruto: 2475,
      lancamentos: []
    })

    expect(fechamento.freteBruto).toBe(2475)
    expect(fechamento.valorPorSaca).toBe(2.25)
  })

  it('resume o impacto do reprocessamento da rota', () => {
    const resumo = resumirReprocessamentoFrete([
      carga({ peso_bruto_kg: 30000, sacas: 500, frete_valor_por_saca: 2, frete_valor_total: 1000 }),
      carga({ peso_bruto_kg: 36000, sacas: 600, frete_valor_por_saca: 2, frete_valor_total: 1200 })
    ], 2.3)

    expect(resumo.quantidadeCargas).toBe(2)
    expect(resumo.totalSacas).toBe(1100)
    expect(resumo.totalAnterior).toBe(2200)
    expect(resumo.totalNovo).toBe(2530)
    expect(resumo.diferenca).toBe(330)
  })

  it('calcula frete de cada carga com valor por saca da rota', () => {
    expect(calcularSacasFrete(33000)).toBe(550)
    expect(calcularFreteCarga(33000, 2.35)).toBe(1292.5)
    expect(calcularFreteCarga(0, 2.35)).toBe(0)
  })
})
