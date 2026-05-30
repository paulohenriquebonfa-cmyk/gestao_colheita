---
name: relatorio-claro
description: Padronizar relatorios (tela, PDF e CSV) com linguagem simples, estrutura de resumo + detalhamento + conferencia, e coerencia de dados para operador e gestor. Use quando o usuario pedir melhoria de relatorio, clareza de leitura, padrao profissional, ou validacao de consistencia entre indicadores e exportacoes.
---

# Skill de Relatorio Claro

Gerar e revisar relatorios com foco em entendimento rapido e confiabilidade.

## Fluxo

1. Definir objetivo do relatorio:
- Identificar publico (operador, gestor, produtor, transportador).
- Definir pergunta principal que o relatorio responde.

2. Estruturar em 3 blocos:
- Resumo executivo (totais e indicadores chave).
- Detalhamento (linhas por registro, periodo e filtros).
- Conferencia (rodape para validacao/assinatura/observacoes).

3. Padronizar linguagem:
- Frases curtas e diretas.
- Evitar termos tecnicos internos sem explicacao.
- Nomear campos com significado de negocio (ex.: peso liquido, sacas, armazem).

4. Garantir consistencia de numeros:
- Totais da tela devem bater com PDF/CSV.
- Unidades explicitas (kg, sacas, sacas/ha, R$).
- Datas e horas no fuso local do usuario.

5. Revisar legibilidade visual:
- Hierarquia de titulo, subtitulo e secoes.
- Espacamento e quebra de linha apropriados.
- Evitar "linhao" dificil de ler em telas pequenas.

6. Validar com cenarios reais:
- Sem dados, com poucos dados e com volume alto.
- Confirmar mensagens amigaveis quando nao houver registros.

## Regras de Implementacao

- Todo novo relatorio deve ter resumo + detalhamento + conferencia.
- Exportacao CSV deve seguir mesma base filtrada da tela.
- Exportacao PDF deve incluir periodo, emissao local e responsavel.
- Nunca mostrar "sucesso" se a geracao falhou.

## Entrega Esperada

- Relatorio legivel para usuario leigo e gestor.
- Padrao unico entre abas e tipos de relatorio.
- Checklist de qualidade de relatorio preenchido.

Para checklist completo, consultar [references/checklist-relatorio-claro.md](references/checklist-relatorio-claro.md).
