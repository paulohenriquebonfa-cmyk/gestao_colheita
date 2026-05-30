# Checklist de Auditoria de Estoque

## 1) Fonte da Verdade
- Saldo do armazem vem de eventos (cargas, vendas, ajustes), nao apenas de valor acumulado.
- Formula de conciliacao documentada e aplicada de forma unica.

## 2) Isolamento de Conta
- Dados de outro usuario/conta nao entram no calculo.
- Filtros por created_by/tenant aplicados em cargas, vendas e movimentos.

## 3) Sinal das Operacoes
- Entrada soma saldo.
- Saida subtrai saldo.
- Estorno soma saldo.
- Ajuste manual respeita tipo (entrada/saida).

## 4) Duplicidade e Residuos
- Movimentos automaticos tecnicos nao sao contados como ajuste manual.
- Exclusao/edicao de carga nao deixa saldo fantasma.
- Registros de teste antigos nao contaminam saldo atual.

## 5) Reconciliacao
- Saldo exibido por armazem bate com saldo recalculado.
- Total de estoque bate com somatorio por armazem.
- Saldo disponivel por produtor bate com cargas - vendas ativas.

## 6) Validacao Funcional
- Venda acima do saldo bloqueia com mensagem clara.
- Cancelamento de venda estorna exatamente o valor vendido.
- Apagar carga reflete no estoque sem deixar pendencia falsa.

## 7) Sincronizacao
- Pendencias saem da fila apos sucesso.
- Erro de sync exibe causa legivel.
- Multi-dispositivo converge para o mesmo saldo apos sincronizar.

## 8) Evidencias
- Lint sem erros.
- Testes automatizados passando.
- Build de producao passando.
