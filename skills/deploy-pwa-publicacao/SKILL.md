---
name: deploy-pwa-publicacao
description: Publicar, atualizar e validar versoes do sistema web PWA com seguranca. Use quando mudanca local nao aparece no site, Vercel mostra versao antiga, PWA continua em cache, usuario testa build velha, ou for necessario orientar push, deploy e atualizacao no celular e no navegador.
---

# Skill de Publicacao do PWA

Executar publicacao com foco em reduzir falso bug causado por versao antiga.

## Fluxo

1. Confirmar estado local:
- Verificar se a correcao existe nos arquivos certos.
- Rodar build antes de publicar.

2. Publicar com disciplina:
- Informar comandos de git necessarios.
- Confirmar branch, commit e push.

3. Validar deploy:
- Confirmar que a Vercel terminou o build.
- Verificar se o site publicado recebeu a versao nova.

4. Tratar cache do PWA:
- Orientar hard refresh no navegador.
- Quando necessario, remover e reinstalar o app no celular.

5. Diferenciar bug de cache:
- Confirmar se o problema e de logica real ou versao antiga.
- Evitar abrir investigacao longa antes de checar publicacao.

## Regras de Implementacao

- Sempre avisar claramente quando o usuario precisa rodar comando.
- Nunca assumir que site publicado acompanha mudanca local automaticamente.
- Em PWA, tratar cache como suspeito padrao quando a correção nao aparece.
- Confirmar visualmente a versao nova antes de encerrar.

## Entrega Esperada

- Correcao publicada.
- Passo a passo claro de atualizacao para PC e celular.
- Confirmacao se o problema era cache, deploy ou logica.

Para checklist completo, consultar [references/checklist-deploy-pwa-publicacao.md](references/checklist-deploy-pwa-publicacao.md).
