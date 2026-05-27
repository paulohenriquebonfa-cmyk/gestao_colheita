# Sistema de Gestao de Colheita (MVP)

PWA offline-first para registro e analise de colheita com sincronizacao via Supabase.

## Requisitos

- Node 24+
- npm 11+

## Configuracao

1. Copie `.env.example` para `.env` e preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. No Supabase SQL Editor, execute [`supabase/schema.sql`](./supabase/schema.sql).

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Regras do MVP implementadas

- Cadastro de cargas com data, placa, propriedade, talhao, produtor, variedade, armazem, peso bruto e peso liquido.
- Conversao automatica de `peso_liquido_kg` para sacas (`kg / 60`).
- Indicadores calculados exclusivamente com peso liquido.
- Dashboard com total em kg, total em sacas e produtividade (sacas/ha).
- Operacao offline local (IndexedDB) + sincronizacao automatica quando reconectar.
- Status de sincronizacao por registro: `local_only`, `pending_sync`, `synced`, `sync_error`.