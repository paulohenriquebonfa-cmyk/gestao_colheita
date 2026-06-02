# Checklist de Migracao e Evolucao de Schema Agricola

## Objetivo

Permitir crescimento do banco e das regras do sistema sem quebrar sincronizacao, historico e relatorios.

## Checklist

- Definir a necessidade de negocio da mudanca.
- Listar tabelas, colunas e policies afetadas.
- Verificar impacto no banco local e no sync.
- Definir estrategia de compatibilidade com dados antigos.
- Atualizar schema remoto.
- Atualizar tipos e mapeamentos da aplicacao.
- Atualizar RLS e grants.
- Validar create, edit, delete e sync.
- Validar relatorios e filtros afetados.
- Registrar risco residual, se houver.
