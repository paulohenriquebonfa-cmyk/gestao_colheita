# LGPD - Checklist Pratico (Sistema de Gestao de Colheita)

## O que ja foi implementado no sistema
- Canal de atendimento LGPD configuravel (aba Assistente).
- Exportacao dos dados do titular (`Exportar meus dados (LGPD)`).
- Exclusao dos dados do titular (`Excluir meus dados (LGPD)`), com confirmacao.
- Politica de retencao por dias (`Aplicar retencao`).
- Relatorio de tratamento (`Gerar relatorio LGPD`) em JSON.
- Auditoria basica por `created_at`, `updated_at`, `created_by`, `updated_by`.

## Rotina recomendada
1. Defina um canal de atendimento LGPD.
2. Defina prazo de retencao (ex.: 730 dias).
3. Gere um relatorio LGPD mensal e guarde em pasta segura.
4. Atenda pedidos de titular usando botoes:
   - exportar dados,
   - excluir dados.
5. Em caso de incidente, registre data/hora, impacto e acao corretiva.

## Observacoes importantes
- LGPD nao exige so tecnologia: exige processo interno.
- Evite coletar dados desnecessarios.
- Compartilhe acesso do sistema apenas com pessoas autorizadas.
- Mantenha senhas fortes e evite reuso.
