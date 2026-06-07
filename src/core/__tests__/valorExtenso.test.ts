import { describe, expect, it } from 'vitest'
import { valorReaisPorExtenso } from '../valorExtenso'

describe('valorReaisPorExtenso', () => {
  it('converte reais inteiros por extenso', () => {
    expect(valorReaisPorExtenso(12144)).toBe('doze mil cento e quarenta e quatro reais')
  })

  it('converte reais e centavos por extenso', () => {
    expect(valorReaisPorExtenso(1250.75)).toBe('mil duzentos e cinquenta reais e setenta e cinco centavos')
  })

  it('trata singular de real e centavo', () => {
    expect(valorReaisPorExtenso(1.01)).toBe('um real e um centavo')
  })
})
