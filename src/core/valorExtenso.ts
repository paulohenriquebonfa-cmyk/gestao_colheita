const unidades = ['', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const especiais = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'
]
const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function joinPartes(partes: string[]) {
  return partes.filter(Boolean).join(' e ')
}

function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  if (n < 10) return unidades[n]
  if (n < 20) return especiais[n - 10]
  if (n < 100) return joinPartes([dezenas[Math.floor(n / 10)], unidades[n % 10]])
  return joinPartes([centenas[Math.floor(n / 100)], ate999(n % 100)])
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'

  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []

  if (milhoes > 0) partes.push(`${inteiroPorExtenso(milhoes)} ${milhoes === 1 ? 'milhao' : 'milhoes'}`)
  if (milhares > 0) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`)
  if (resto > 0) partes.push(ate999(resto))

  if (partes.length <= 1) return partes[0]
  if (milhoes === 0 && milhares > 0) return partes.join(' ')
  const ultimo = partes[partes.length - 1]
  const antes = partes.slice(0, -1).join(' ')
  return `${antes} e ${ultimo}`
}

export function valorReaisPorExtenso(valor: number): string {
  if (!Number.isFinite(valor)) return ''
  const abs = Math.abs(valor)
  const reais = Math.floor(abs)
  const centavos = Math.round((abs - reais) * 100)
  const partes: string[] = []

  partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`)
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  }

  const texto = partes.join(' e ')
  return valor < 0 ? `menos ${texto}` : texto
}
