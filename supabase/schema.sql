create extension if not exists pgcrypto;

create table if not exists propriedades (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists produtores (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists variedades (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists armazens (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists caminhoes (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists talhoes (
  id uuid primary key,
  nome text not null,
  area_ha numeric not null check (area_ha > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists cargas (
  id uuid primary key,
  data date not null,
  placa text not null,
  propriedade_id uuid not null references propriedades(id),
  talhao_id uuid not null references talhoes(id),
  produtor_id uuid not null references produtores(id),
  variedade_id uuid not null references variedades(id),
  armazem_id uuid not null references armazens(id),
  peso_bruto_kg numeric not null,
  peso_liquido_kg numeric not null,
  sacas numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists estoque_armazem (
  id uuid primary key,
  armazem_id uuid not null references armazens(id),
  saldo_sacas numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists movimento_estoque (
  id uuid primary key,
  tipo text not null,
  armazem_id uuid not null references armazens(id),
  sacas numeric not null,
  origem text not null,
  referencia_id text not null,
  motivo text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists venda_grao (
  id uuid primary key,
  data date not null,
  produtor_id uuid not null references produtores(id),
  armazem_cliente_id uuid not null references armazens(id),
  sacas numeric not null,
  valor_por_saca numeric not null,
  valor_total numeric not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);
alter table venda_grao add column if not exists produtor_id uuid references produtores(id);

create table if not exists pilot_participantes (
  id uuid primary key,
  email text not null,
  nome text not null,
  status text not null,
  data_entrada date not null,
  ultimo_acesso timestamptz,
  ultimo_sync timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists feedback_items (
  id uuid primary key,
  categoria text not null,
  prioridade text not null,
  descricao text not null,
  contexto text not null,
  contato text,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists area_variedade_talhao (
  id uuid primary key,
  talhao_id uuid not null references talhoes(id),
  variedade_id uuid not null references variedades(id),
  area_ha numeric not null check (area_ha > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists safras (
  id uuid primary key,
  nome text not null,
  cultura text not null,
  ano text not null,
  data_inicio date not null,
  data_fim date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

create table if not exists frete_lancamentos (
  id uuid primary key,
  safra_id uuid not null references safras(id),
  caminhao_id uuid not null references caminhoes(id),
  tipo text not null check (tipo in ('diesel', 'vale')),
  data date not null,
  litros numeric,
  preco_litro numeric,
  valor_total numeric not null,
  observacao text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text not null,
  updated_by text not null,
  sync_status text not null
);

alter table propriedades enable row level security;
alter table produtores enable row level security;
alter table variedades enable row level security;
alter table armazens enable row level security;
alter table caminhoes enable row level security;
alter table talhoes enable row level security;
alter table cargas enable row level security;
alter table estoque_armazem enable row level security;
alter table movimento_estoque enable row level security;
alter table venda_grao enable row level security;
alter table pilot_participantes enable row level security;
alter table feedback_items enable row level security;
alter table area_variedade_talhao enable row level security;
alter table safras enable row level security;
alter table frete_lancamentos enable row level security;

drop policy if exists "farm_read_propriedades" on propriedades;
drop policy if exists "farm_write_propriedades" on propriedades;
drop policy if exists "farm_read_produtores" on produtores;
drop policy if exists "farm_write_produtores" on produtores;
drop policy if exists "farm_read_variedades" on variedades;
drop policy if exists "farm_write_variedades" on variedades;
drop policy if exists "farm_read_armazens" on armazens;
drop policy if exists "farm_write_armazens" on armazens;
drop policy if exists "farm_read_caminhoes" on caminhoes;
drop policy if exists "farm_write_caminhoes" on caminhoes;
drop policy if exists "farm_read_talhoes" on talhoes;
drop policy if exists "farm_write_talhoes" on talhoes;
drop policy if exists "farm_read_cargas" on cargas;
drop policy if exists "farm_write_cargas" on cargas;
drop policy if exists "farm_read_estoque_armazem" on estoque_armazem;
drop policy if exists "farm_write_estoque_armazem" on estoque_armazem;
drop policy if exists "farm_read_movimento_estoque" on movimento_estoque;
drop policy if exists "farm_write_movimento_estoque" on movimento_estoque;
drop policy if exists "farm_read_venda_grao" on venda_grao;
drop policy if exists "farm_write_venda_grao" on venda_grao;
drop policy if exists "farm_read_pilot_participantes" on pilot_participantes;
drop policy if exists "farm_write_pilot_participantes" on pilot_participantes;
drop policy if exists "farm_insert_pilot_participantes" on pilot_participantes;
drop policy if exists "farm_update_pilot_participantes" on pilot_participantes;
drop policy if exists "farm_delete_pilot_participantes" on pilot_participantes;
drop policy if exists "farm_read_feedback_items" on feedback_items;
drop policy if exists "farm_write_feedback_items" on feedback_items;
drop policy if exists "farm_read_area_variedade_talhao" on area_variedade_talhao;
drop policy if exists "farm_write_area_variedade_talhao" on area_variedade_talhao;
drop policy if exists "farm_read_safras" on safras;
drop policy if exists "farm_write_safras" on safras;
drop policy if exists "farm_read_frete_lancamentos" on frete_lancamentos;
drop policy if exists "farm_write_frete_lancamentos" on frete_lancamentos;

create policy "farm_read_propriedades" on propriedades for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_propriedades" on propriedades for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_produtores" on produtores for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_produtores" on produtores for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_variedades" on variedades for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_variedades" on variedades for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_armazens" on armazens for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_armazens" on armazens for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_caminhoes" on caminhoes for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_caminhoes" on caminhoes for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_talhoes" on talhoes for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_talhoes" on talhoes for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_cargas" on cargas for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_cargas" on cargas for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_estoque_armazem" on estoque_armazem for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_estoque_armazem" on estoque_armazem for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_movimento_estoque" on movimento_estoque for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_movimento_estoque" on movimento_estoque for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_venda_grao" on venda_grao for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_venda_grao" on venda_grao for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_pilot_participantes" on pilot_participantes for select to authenticated using (created_by = auth.uid()::text or lower(email) = lower(auth.email()));
create policy "farm_insert_pilot_participantes" on pilot_participantes for insert to authenticated with check (created_by = auth.uid()::text);
create policy "farm_update_pilot_participantes" on pilot_participantes for update to authenticated using (created_by = auth.uid()::text or lower(email) = lower(auth.email())) with check (created_by = auth.uid()::text or lower(email) = lower(auth.email()));
create policy "farm_delete_pilot_participantes" on pilot_participantes for delete to authenticated using (created_by = auth.uid()::text);
create policy "farm_read_feedback_items" on feedback_items for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_feedback_items" on feedback_items for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_area_variedade_talhao" on area_variedade_talhao for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_area_variedade_talhao" on area_variedade_talhao for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_safras" on safras for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_safras" on safras for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);
create policy "farm_read_frete_lancamentos" on frete_lancamentos for select to authenticated using (created_by = auth.uid()::text);
create policy "farm_write_frete_lancamentos" on frete_lancamentos for all to authenticated using (created_by = auth.uid()::text) with check (created_by = auth.uid()::text);

grant select, insert, update, delete on table safras to authenticated;
grant select, insert, update, delete on table frete_lancamentos to authenticated;
