import { describe, expect, it } from 'vitest'
import { formatCpf, parsePtBrNumber } from '../utils'

describe('parsePtBrNumber', () => {
  it('aceita numero brasileiro com milhar e decimal', () => {
    expect(parsePtBrNumber('2.858,95')).toBe(2858.95)
  })

  it('aceita decimal com ponto para valores digitados pelo sistema ou usuario', () => {
    expect(parsePtBrNumber('2858.95')).toBe(2858.95)
    expect(parsePtBrNumber('5.85')).toBe(5.85)
  })

  it('mantem ponto como milhar quando ha tres digitos depois do ponto', () => {
    expect(parsePtBrNumber('21.000')).toBe(21000)
  })
})

describe('formatCpf', () => {
  it('formata CPF no padrao 000.000.000-00', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01')
  })

  it('remove caracteres nao numericos e limita em 11 digitos', () => {
    expect(formatCpf('123.456.789-0123')).toBe('123.456.789-01')
  })
})
