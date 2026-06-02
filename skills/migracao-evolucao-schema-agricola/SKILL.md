---
name: migracao-evolucao-schema-agricola
description: Planejar e executar evolucao de schema, tabelas, campos e policies do sistema agricola com baixo risco operacional. Use quando houver necessidade de criar entidade nova, alterar colunas, ajustar sincronizacao, expandir relatorios, revisar RLS, ou preparar o banco para crescimento sem quebrar dados existentes.
---

# Skill de Migracao e Evolucao de Schema Agricola

Executar mudancas estruturais com foco em continuidade do sistema, compatibilidade com sync offline e preservacao do historico.

## Fluxo

1. Definir a mudanca de negocio:
- Identificar o que o sistema precisa aprender a guardar, calcular ou proteger.
- Separar claramente mudanca de regra de negocio, mudanca de interface e mudanca de banco.

2. Mapear impacto tecnico:
- Listar tabelas, campos, indices, policies e entidades locais afetadas.
- Verificar impacto em IndexedDB, fila `pending_ops`, sync, filtros, relatorios e exportacoes.

3. Planejar compatibilidade:
- Preferir mudanca aditiva antes de mudanca destrutiva.
- Manter compatibilidade com dados antigos durante periodo de transicao.
- Definir como valores antigos serao preenchidos ou tratados.

4. Aplicar a evolucao:
- Atualizar schema remoto.
- Atualizar tipos, banco local, mapeamentos de sync e validacoes.
- Atualizar regras de exibicao e relatorios que dependem da estrutura nova.

5. Revisar seguranca:
- Confirmar grants e RLS da tabela ou coluna nova.
- Garantir que o perfil certo continua vendo apenas o que deve ver.

6. Validar ponta a ponta:
- Criar, editar, excluir e sincronizar registro da estrutura nova.
- Testar pelo menos um aparelho com dado ja existente e outro com base limpa.

## Regras de Implementacao

- Mudanca estrutural sem revisar sync e bug anunciado.
- Nunca criar tabela nova sem pensar em policy, grant e banco local.
- Evitar renomear ou remover campo em etapa unica quando houver historico relevante.
- Priorizar migracao segura e compreensivel, mesmo que leve uma etapa a mais.

## Entrega Esperada

- Diagnostico do impacto da mudanca.
- Passo estrutural aplicado no banco e na aplicacao.
- Evidencia de compatibilidade com dados antigos e sincronizacao.

Para checklist completo, consultar [references/checklist-migracao-evolucao-schema-agricola.md](references/checklist-migracao-evolucao-schema-agricola.md).
