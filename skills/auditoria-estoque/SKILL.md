---
name: auditoria-estoque
description: Investigar e corrigir divergencias de saldo de estoque por armazem e produtor em apps web com cargas, vendas, ajustes e sincronizacao. Use quando o usuario relatar saldo incorreto, valores inflados, saldo negativo inesperado, ou diferenca entre historico e estoque exibido.
---

# Skill de Auditoria de Estoque

Executar diagnostico de saldo com foco em causa raiz e correcao segura.

## Fluxo

1. Mapear fontes de saldo:
- Confirmar quais tabelas/colecoes formam o saldo (cargas, vendas, movimentos, ajustes).
- Confirmar regra de sinal (entrada soma, saida subtrai, estorno soma).

2. Validar escopo de dados:
- Confirmar isolamento por usuario/conta (created_by/tenant).
- Verificar se ha residuos de testes antigos contaminando o saldo atual.

3. Reconciliar saldo por armazem:
- Recalcular saldo teorico com base em eventos validos.
- Comparar saldo teorico x saldo exibido x saldo persistido.
- Identificar divergencia por registro (id, origem, motivo, data).

4. Auditar movimentos manuais:
- Separar ajuste manual legitimo de movimento automatico tecnico.
- Garantir que movimentos tecnicos nao sejam contados duas vezes.

5. Corrigir e normalizar:
- Ajustar logica de calculo e validacao de venda/baixa.
- Se necessario, criar acao de recalc para reescrever saldo consolidado.
- Preservar trilha de auditoria.

6. Validar ponta a ponta:
- Criar carga, editar, apagar, vender, cancelar venda e ajustar manualmente.
- Confirmar que saldo final bate com formula esperada.

## Regras de Implementacao

- Priorizar evento como fonte da verdade (carga/venda/ajuste), nao valor acumulado opaco.
- Evitar saldo negativo silencioso; bloquear ou explicar ao usuario.
- Mensagens devem ser leigas e acionaveis.
- Toda acao destrutiva deve pedir confirmacao explicita.

## Entrega Esperada

- Diagnostico claro da causa da divergencia.
- Correcao aplicada com impacto explicado.
- Checklist de reconciliacao preenchido.

Para checklist completo, consultar [references/checklist-auditoria-estoque.md](references/checklist-auditoria-estoque.md).
