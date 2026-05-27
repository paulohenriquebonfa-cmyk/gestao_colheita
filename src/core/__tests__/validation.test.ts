import { describe, expect, it } from 'vitest'
import { validarCarga } from '../validation'

describe('validarCarga', () => {
  it('retorna erros de campos obrigatorios', () => {
    const erros = validarCarga({
      data: '',
      placa: '',
      propriedadeId: '',
      talhaoId: '',
      produtorId: '',
      variedadeId: '',
      armazemId: '',
      pesoBruto: '',
      pesoLiquido: ''
    })

    expect(erros).toContain('Data obrigatoria')
    expect(erros).toContain('Placa obrigatoria')
    expect(erros).toContain('Peso bruto invalido')
    expect(erros).toContain('Peso liquido invalido')
  })

  it('retorna erro quando liquido maior que bruto', () => {
    const erros = validarCarga({
      data: '2026-05-26',
      placa: 'ABC1234',
      propriedadeId: '1',
      talhaoId: '1',
      produtorId: '1',
      variedadeId: '1',
      armazemId: '1',
      pesoBruto: '1000',
      pesoLiquido: '1200'
    })

    expect(erros).toContain('Peso liquido nao pode ser maior que o bruto')
  })

  it('aceita carga valida sem erros', () => {
    const erros = validarCarga({
      data: '2026-05-26',
      placa: 'ABC1234',
      propriedadeId: '1',
      talhaoId: '1',
      produtorId: '1',
      variedadeId: '1',
      armazemId: '1',
      pesoBruto: '1000',
      pesoLiquido: '980'
    })

    expect(erros).toEqual([])
  })
})