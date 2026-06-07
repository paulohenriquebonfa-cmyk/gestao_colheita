import { describe, expect, it } from 'vitest'
import { calcularFechamentoFrete, calcularValorDiesel } from '../frete'
import type { FreteLancamento } from '../types'

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
})
