---
name: cadastros-integridade
description: Validar, padronizar e corrigir cadastros mestres do sistema agricola. Use quando houver duplicidade, nome inconsistente, relatorio distorcido por cadastro ruim, exclusao de cadastro com efeito colateral, ou necessidade de revisar produtores, propriedades, talhoes, variedades, armazens e caminhoes.
---

# Skill de Integridade de Cadastros

Executar revisao de dados mestres com foco em confiabilidade operacional e impacto nos relatorios.

## Fluxo

1. Mapear o cadastro afetado:
- Identificar entidade envolvida e quantidade de registros.
- Separar cadastro valido, duplicado, incompleto e obsoleto.

2. Verificar impacto funcional:
- Confirmar se o cadastro aparece em cargas, vendas, estoque, filtros e relatorios.
- Medir risco de alterar nomes, excluir itens ou mesclar registros.

3. Padronizar antes de corrigir:
- Aplicar padrao de nomes, siglas e ordem visual.
- Evitar criar novo cadastro quando a correcao correta for editar o existente.

4. Corrigir com seguranca:
- Priorizar edicao e inativacao antes de exclusao definitiva.
- Bloquear exclusao quando houver dependencia historica relevante.

5. Revalidar ponta a ponta:
- Confirmar que filtros, formularios e relatorios continuam funcionando.
- Confirmar que medias e totais nao foram distorcidos pela limpeza.

## Regras de Implementacao

- Cadastro mestre ruim gera relatorio ruim; tratar isso como risco de negocio.
- Nunca excluir em massa sem checar dependencias.
- Preferir padronizacao simples para usuario leigo.
- Se houver conflito entre historico e limpeza, preservar o historico.

## Entrega Esperada

- Diagnostico do problema cadastral.
- Correcao aplicada com baixo risco.
- Evidencia de que cargas, vendas e relatorios continuam consistentes.

Para checklist completo, consultar [references/checklist-cadastros-integridade.md](references/checklist-cadastros-integridade.md).
