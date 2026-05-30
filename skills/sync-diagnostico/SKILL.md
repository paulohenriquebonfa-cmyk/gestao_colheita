---
name: sync-diagnostico
description: Diagnosticar e corrigir falhas de sincronizacao em apps offline-first com fila local e backend em nuvem. Use quando houver status pendente persistente, erro de permissao, conflito entre dispositivos, ou mensagem de sincronizacao sem efeito real.
---

# Skill de Diagnostico de Sincronizacao

Executar investigacao tecnica com resposta simples para usuario leigo.

## Fluxo

1. Confirmar contexto:
- Verificar conectividade, sessao autenticada e configuracao da nuvem.
- Capturar mensagem de erro atual e hora local do evento.

2. Auditar fila local:
- Ler pendencias por tabela e por operacao (upsert/delete).
- Verificar retries, ultimo erro e idade da pendencia.

3. Auditar envio para nuvem:
- Separar falhas por causa: permissao (RLS), schema/campo, conflito, dependencia ausente.
- Confirmar se a operacao realmente chegou na tabela remota.

4. Auditar retorno da nuvem:
- Validar pull por tabela e compatibilidade de tipos.
- Confirmar que estados locais mudam para sincronizado apos sucesso.

5. Corrigir causa raiz:
- Ajustar validacao, ordem de envio, dependencia, mapeamento de campos ou policy.
- Evitar "sucesso falso" quando ainda houver pendencias.

6. Revalidar ponta a ponta:
- Criar/editar/apagar em um dispositivo.
- Sincronizar e confirmar reflexo no outro dispositivo.

## Regras de Implementacao

- Priorizar confiabilidade de dados antes de cosmetica de interface.
- Nunca mascarar erro tecnico com mensagem de sucesso.
- Sempre mostrar proximo passo acionavel ao usuario.
- Em operacao destrutiva, exigir confirmacao explicita.

## Entrega Esperada

- Diagnostico objetivo com causa da falha.
- Correcao aplicada e validada.
- Checklist de sync preenchido com evidencias.

Para checklist completo, consultar [references/checklist-sync-diagnostico.md](references/checklist-sync-diagnostico.md).
