import { parsePtBrNumber } from './utils'

export interface CargaInput {
  data: string
  placa: string
  propriedadeId: string
  talhaoId: string
  produtorId: string
  variedadeId: string
  armazemId: string
  pesoBruto: string
  pesoLiquido: string
}

export function validarCarga(input: CargaInput): string[] {
  const erros: string[] = []

  if (!input.data) erros.push('Data obrigatoria')
  if (!input.placa.trim()) erros.push('Placa obrigatoria')
  if (!input.propriedadeId) erros.push('Propriedade obrigatoria')
  if (!input.talhaoId) erros.push('Talhao obrigatorio')
  if (!input.produtorId) erros.push('Produtor obrigatorio')
  if (!input.variedadeId) erros.push('Variedade obrigatoria')
  if (!input.armazemId) erros.push('Armazem obrigatorio')

  const bruto = parsePtBrNumber(input.pesoBruto)
  const liquido = parsePtBrNumber(input.pesoLiquido)

  if (!Number.isFinite(bruto) || bruto <= 0) erros.push('Peso bruto invalido')
  if (!Number.isFinite(liquido) || liquido <= 0) erros.push('Peso liquido invalido')
  if (Number.isFinite(bruto) && Number.isFinite(liquido) && liquido > bruto) {
    erros.push('Peso liquido nao pode ser maior que o bruto')
  }

  return erros
}
