---
name: backup-restore-retencao
description: Operar backup, restore, exportacao pessoal e limpeza segura de dados com foco em confiabilidade e LGPD basica. Use quando houver risco de perda de dados, reset para teste, necessidade de restaurar ambiente, exportar dados do usuario, ou revisar retencao e exclusao segura.
---

# Skill de Backup, Restore e Retencao

Executar protecao de dados com linguagem simples e passos verificaveis.

## Fluxo

1. Classificar a operacao:
- Separar backup preventivo, restore, limpeza de teste, exportacao LGPD ou exclusao definitiva.
- Confirmar risco e alcance da acao.

2. Auditar origem dos dados:
- Confirmar se os dados estao no aparelho, na nuvem ou nos dois.
- Verificar se existe pendencia de sincronizacao antes da acao.

3. Executar com seguranca:
- Fazer backup antes de restore ou exclusao relevante.
- Em limpeza ampla, exigir confirmacao explicita.

4. Revalidar ambiente:
- Confirmar que os dados esperados foram mantidos, restaurados ou removidos.
- Confirmar que o sistema continua sincronizando.

5. Registrar impacto:
- Informar ao usuario o que foi preservado, removido ou restaurado.
- Informar se ainda existe risco residual.

## Regras de Implementacao

- Backup sem validacao de restore nao e suficiente.
- Nunca apagar historico relevante sem confirmacao clara.
- Dado de teste e dado real nao podem se misturar sem aviso.
- Explicar sempre se a acao afeta so este aparelho ou tambem a nuvem.

## Entrega Esperada

- Operacao de backup/restore executada ou orientada com clareza.
- Confirmacao do efeito real no aparelho e na nuvem.
- Checklist preenchido com risco residual, se houver.

Para checklist completo, consultar [references/checklist-backup-restore-retencao.md](references/checklist-backup-restore-retencao.md).
