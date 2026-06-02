---
name: piloto-acesso-isolamento
description: Revisar e corrigir acesso, convites, perfis e isolamento de dados no modo piloto. Use quando convidado nao consegue entrar, dono e convidado enxergam dados um do outro, perfil esta errado, RLS falha, ou sincronizacao mistura informacoes entre usuarios.
---

# Skill de Acesso e Isolamento do Piloto

Executar auditoria e correcao de identidade, permissao e separacao de dados por usuario.

## Fluxo

1. Confirmar identidade e papel:
- Verificar email, perfil, status ativo/inativo e tipo de conta.
- Confirmar se o usuario e dono, operador, leitura ou convidado.

2. Revisar politica de acesso:
- Conferir regra de convite, lista autorizada e expiracao do piloto.
- Confirmar se o bloqueio ocorre no login, no pull ou no push.

3. Auditar isolamento:
- Verificar created_by, updated_by e filtros por usuario.
- Confirmar que cada conta enxerga apenas seus dados quando esse for o escopo esperado.

4. Auditar RLS:
- Validar grants, policies e comportamento por tabela critica.
- Separar falha de permissao de falha de aplicacao.

5. Revalidar em dois usuarios:
- Testar conta dona e conta convidada.
- Confirmar login, sincronizacao e privacidade de dados.

## Regras de Implementacao

- Privacidade errada e bug critico.
- Nunca resolver problema de isolamento abrindo permissao geral.
- Sempre deixar claro se os dados devem ser compartilhados ou separados.
- Toda correcao precisa ser testada com pelo menos dois perfis.

## Entrega Esperada

- Diagnostico do problema de acesso.
- Correcao aplicada em login, perfil ou policy.
- Evidencia de isolamento ou compartilhamento conforme regra definida.

Para checklist completo, consultar [references/checklist-piloto-acesso-isolamento.md](references/checklist-piloto-acesso-isolamento.md).
