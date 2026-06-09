-- Limpeza cirurgica de dados de teste no Supabase.
-- Use no SQL Editor quando a exclusao pelo app ficar travada por residuos antigos
-- ou por dados de teste que migraram para "Safra Legado".
--
-- Escopo:
-- - remove somente registros ligados aos cadastros/safras de teste
-- - preserva dados reais
--
-- Observacao:
-- - este script tambem cobre os caminhões antigos de teste que foram criados
--   com nomes "BXC9D09" e "HTR4A21", mas só quando estiverem ligados a
--   cargas/fretes claramente de teste

begin;

create temporary table _test_safras as
select id
from safras
where nome like 'TESTE - %';

create temporary table _test_propriedades as
select id
from propriedades
where nome like 'TESTE - %';

create temporary table _test_produtores as
select id
from produtores
where nome like 'TESTE - %';

create temporary table _test_variedades as
select id
from variedades
where nome like 'TESTE - %';

create temporary table _test_armazens as
select id
from armazens
where nome like 'TESTE - %';

create temporary table _test_talhoes as
select id
from talhoes
where nome like 'TESTE - %';

create temporary table _test_caminhoes as
select c.id
from caminhoes c
where c.nome like 'TESTE - %'
or (
  c.nome in ('BXC9D09', 'HTR4A21')
  and (
    exists (
      select 1
      from frete_lancamentos f
      join _test_safras s on s.id = f.safra_id
      where f.caminhao_id = c.id
    )
    or exists (
      select 1
      from cargas cg
      where cg.placa = c.id::text
        and (
          cg.safra_id in (select id from _test_safras)
          or cg.propriedade_id in (select id from _test_propriedades)
          or cg.talhao_id in (select id from _test_talhoes)
          or cg.produtor_id in (select id from _test_produtores)
          or cg.variedade_id in (select id from _test_variedades)
          or cg.armazem_id in (select id from _test_armazens)
        )
    )
  )
);

create temporary table _test_cargas as
select cg.id
from cargas cg
where cg.safra_id in (select id from _test_safras)
   or cg.propriedade_id in (select id from _test_propriedades)
   or cg.talhao_id in (select id from _test_talhoes)
   or cg.produtor_id in (select id from _test_produtores)
   or cg.variedade_id in (select id from _test_variedades)
   or cg.armazem_id in (select id from _test_armazens)
   or cg.placa in (select id::text from _test_caminhoes);

create temporary table _test_estoques as
select id
from estoque_armazem
where safra_id in (select id from _test_safras)
   or armazem_id in (select id from _test_armazens);

create temporary table _test_vendas as
select id
from venda_grao
where safra_id in (select id from _test_safras)
   or produtor_id in (select id from _test_produtores)
   or armazem_cliente_id in (select id from _test_armazens);

create temporary table _test_fretes as
select id
from frete_lancamentos
where safra_id in (select id from _test_safras)
   or caminhao_id in (select id from _test_caminhoes);

create temporary table _test_tarifas as
select id
from tarifas_frete_rota
where safra_id in (select id from _test_safras)
   or propriedade_id in (select id from _test_propriedades)
   or armazem_id in (select id from _test_armazens);

delete from area_variedade_talhao
where talhao_id in (select id from _test_talhoes)
   or variedade_id in (select id from _test_variedades);

delete from movimento_estoque
where safra_id in (select id from _test_safras)
   or armazem_id in (select id from _test_armazens)
   or referencia_id in (
     select id::text from _test_cargas
     union
     select id::text from _test_vendas
     union
     select id::text from _test_estoques
   );

delete from venda_grao
where id in (select id from _test_vendas);

delete from frete_lancamentos
where id in (select id from _test_fretes);

delete from tarifas_frete_rota
where id in (select id from _test_tarifas);

delete from estoque_armazem
where id in (select id from _test_estoques);

delete from cargas
where id in (select id from _test_cargas);

delete from safras
where id in (select id from _test_safras);

delete from talhoes
where id in (select id from _test_talhoes);

delete from caminhoes
where id in (select id from _test_caminhoes);

delete from variedades
where id in (select id from _test_variedades);

delete from produtores
where id in (select id from _test_produtores);

delete from propriedades
where id in (select id from _test_propriedades);

delete from armazens
where id in (select id from _test_armazens);

commit;

select
  (select count(*) from safras where nome like 'TESTE - %') as safras_teste_restantes,
  (select count(*) from propriedades where nome like 'TESTE - %') as propriedades_teste_restantes,
  (select count(*) from produtores where nome like 'TESTE - %') as produtores_teste_restantes,
  (select count(*) from variedades where nome like 'TESTE - %') as variedades_teste_restantes,
  (select count(*) from armazens where nome like 'TESTE - %') as armazens_teste_restantes,
  (select count(*) from talhoes where nome like 'TESTE - %') as talhoes_teste_restantes,
  (select count(*) from cargas cg where cg.id in (select id from _test_cargas)) as cargas_teste_restantes;
