import { describe, expect, it } from 'vitest'
import { dividirPesoBrutoProporcional, produtividadeVariedadeNoTalhao, totalSacasDivididas } from '../analises'
import type { Carga } from '../types'

describe('analises - divisao de carga', () => {
  it('divide peso bruto proporcionalmente e fecha total no final', () => {
    const bruto = 10000
    const liquidos = [3000, 2000]
    const partes = dividirPesoBrutoProporcional(bruto, liquidos)

    expect(partes.length).toBe(2)
    expect(partes[0]).toBe(6000)
    expect(partes[1]).toBe(4000)
    expect(Number((partes[0] + partes[1]).toFixed(2))).toBe(10000)
  })

  it('calcula total em sacas das linhas divididas', () => {
    const total = totalSacasDivididas([1800, 1200])
    expect(total).toBe(50)
  })
})

describe('analises - produtividade por variedade no talhao', () => {
  it('calcula sc/ha usando area configurada por variedade no talhao', () => {
    const cargas: Carga[] = [
      {
        id: '1',
        data: '2026-05-30',
        placa: 'CAM1',
        propriedade_id: 'P1',
        talhao_id: 'T1',
        produtor_id: 'PR1',
        variedade_id: 'V1',
        peso_bruto_kg: 12000,
        peso_liquido_kg: 12000,
        sacas: 200,
        sync_status: 'synced',
        created_at: '2026-05-30T10:00:00.000Z',
        updated_at: '2026-05-30T10:00:00.000Z',
        created_by: 'U1',
        updated_by: 'U1',
        armazem_id: 'A1'
      },
      {
        id: '2',
        data: '2026-05-30',
        placa: 'CAM1',
        propriedade_id: 'P1',
        talhao_id: 'T1',
        produtor_id: 'PR1',
        variedade_id: 'V2',
        peso_bruto_kg: 9000,
        peso_liquido_kg: 9000,
        sacas: 150,
        sync_status: 'synced',
        created_at: '2026-05-30T10:10:00.000Z',
        updated_at: '2026-05-30T10:10:00.000Z',
        created_by: 'U1',
        updated_by: 'U1',
        armazem_id: 'A1'
      }
    ]

    const areas = [
      { talhao_id: 'T1', variedade_id: 'V1', area_ha: 5 },
      { talhao_id: 'T1', variedade_id: 'V2', area_ha: 3 }
    ]

    const resultado = produtividadeVariedadeNoTalhao(cargas, areas, 'T1')
    const v1 = resultado.find((r) => r.variedade_id === 'V1')
    const v2 = resultado.find((r) => r.variedade_id === 'V2')

    expect(v1?.sc_ha).toBe(40)
    expect(v2?.sc_ha).toBe(50)
  })

  it('retorna sc/ha = 0 quando nao ha area configurada', () => {
    const cargas: Carga[] = [
      {
        id: '1',
        data: '2026-05-30',
        placa: 'CAM1',
        propriedade_id: 'P1',
        talhao_id: 'T1',
        produtor_id: 'PR1',
        variedade_id: 'V1',
        peso_bruto_kg: 6000,
        peso_liquido_kg: 6000,
        sacas: 100,
        sync_status: 'synced',
        created_at: '2026-05-30T10:00:00.000Z',
        updated_at: '2026-05-30T10:00:00.000Z',
        created_by: 'U1',
        updated_by: 'U1',
        armazem_id: 'A1'
      }
    ]

    const resultado = produtividadeVariedadeNoTalhao(cargas, [], 'T1')
    expect(resultado[0].sc_ha).toBe(0)
  })
})

