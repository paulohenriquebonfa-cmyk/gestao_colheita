---
name: qa-bugs-correcao
description: Executar ciclo completo de qualidade para encontrar, reproduzir, priorizar e corrigir bugs em sistema web offline-first com sincronizacao. Use quando o usuario pedir para testar funcionalidades, investigar falhas, corrigir erros, reduzir regressao, ou validar estabilidade antes de piloto/producao.
---

# Skill QA de Bugs e Correcao

Objetivo: transformar problema relatado em correcao validada com evidencia.

## Fluxo

1. Triagem do problema:
- Identificar sintoma, tela, acao e impacto.
- Classificar severidade: critica, alta, media, baixa.

2. Reproducao controlada:
- Criar passos reproduziveis (com dados e horario local).
- Confirmar se ocorre em desktop e mobile.

3. Diagnostico tecnico:
- Verificar validacoes, estado local, fila de sync, payload e resposta da nuvem.
- Diferenciar causa raiz de efeito colateral.

4. Correcao minima e segura:
- Aplicar patch focado na causa raiz.
- Evitar alterar regra de negocio sem necessidade.

5. Validacao pos-correcao:
- Reexecutar cenario original.
- Rodar cenarios vizinhos para evitar regressao.
- Confirmar mensagens claras de sucesso/erro para usuario leigo.

6. Evidencia e fechamento:
- Registrar o que foi corrigido, risco residual e proximo monitoramento.

## Matriz de Prioridade

- Critica: perda de dados, erro de sync com bloqueio total, violacao de seguranca.
- Alta: calculo incorreto de indicador, divergencia de saldo, operacao-chave indisponivel.
- Media: problema de usabilidade que induz erro operacional.
- Baixa: ajuste visual sem impacto funcional.

## Regras de Implementacao

- Corrigir primeiro causa raiz, nao mascarar com mensagem de sucesso.
- Em acoes destrutivas, sempre exigir confirmacao explicita.
- Sempre validar lint/test/build apos correcao.
- Preferir mensagens objetivas e acionaveis para usuario leigo.

## Entrega Esperada

- Lista de bugs encontrados com severidade.
- Correcao aplicada com justificativa curta.
- Evidencia de validacao e checklist preenchido.

Para checklist completo, consultar [references/checklist-qa-bugs-correcao.md](references/checklist-qa-bugs-correcao.md).
