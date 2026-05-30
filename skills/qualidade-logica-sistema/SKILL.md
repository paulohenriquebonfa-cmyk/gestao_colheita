---
name: qualidade-logica-sistema
description: Garantir qualidade da logica do sistema em apps web com regras de negocio, validacoes, sincronizacao e tratamento de erros. Use quando o usuario pedir revisao de funcionamento, encontrar comportamento incorreto, pedir testes de funcionalidades, reducao de bugs, ou prevencao de regressao.
---

# Skill de Qualidade da Logica do Sistema

Executar revisao funcional completa com foco em confiabilidade.

## Fluxo

1. Mapear regra de negocio:
- Identificar entradas obrigatorias, calculos oficiais e restricoes de dominio.
- Confirmar quais campos dirigem indicadores e relatorios.

2. Auditar validacoes:
- Verificar validacoes de formulario (obrigatoriedade, tipo, faixa, formato).
- Verificar mensagens claras para erro e sucesso.

3. Auditar sincronizacao:
- Conferir criacao, edicao e exclusao local e nuvem.
- Verificar estados de sync e tratamento de conflito.
- Garantir que dados nao misturem entre usuarios quando houver isolamento.

4. Testar cenarios criticos:
- Fluxo feliz (cadastro, edicao, consulta, relatorio).
- Fluxo de erro (dados invalidos, sem internet, permissao negada).
- Fluxo limite (duplicidade, valores extremos, campos vazios).

5. Corrigir e validar:
- Aplicar correcoes minimas e seguras.
- Rodar lint, testes e build.
- Confirmar que nao houve regressao funcional.

## Regras de Implementacao

- Priorizar bugs que afetam dados, sincronizacao e confiabilidade.
- Corrigir primeiro causa raiz, nao apenas sintoma.
- Evitar mudar regra de negocio sem necessidade.
- Em caso de risco de perda de dados, adicionar confirmacao explicita.

## Entrega Esperada

- Lista de bugs encontrados e severidade.
- Correcoes aplicadas com justificativa curta.
- Evidencia de validacao (lint/test/build).

Para checklist completo, consultar [references/checklist-qualidade-logica.md](references/checklist-qualidade-logica.md).
