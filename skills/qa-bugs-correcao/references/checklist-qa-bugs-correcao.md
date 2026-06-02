# Checklist QA de Bugs e Correcao

## 1) Reproducao
- Bug reproduzido com passos claros.
- Contexto registrado (tela, dados, horario, dispositivo).

## 2) Diagnostico
- Causa raiz identificada.
- Logs/erros relevantes coletados.
- Diferenca entre sintoma e causa documentada.

## 3) Correcao
- Patch minimo aplicado.
- Regra de negocio preservada.
- Acoes destrutivas com confirmacao.

## 4) Validacao Funcional
- Cenario original passou apos correcao.
- Cenarios vizinhos testados.
- Offline/online validado quando aplicavel.

## 5) Sincronizacao
- Pendencias saem da fila apos sucesso.
- Mensagens de erro sao legiveis.
- Nao existe sucesso falso com erro oculto.

## 6) Dados e Indicadores
- Totais e medias consistentes apos correcao.
- Relatorios (tela/PDF/CSV) coerentes com filtros.

## 7) Qualidade Tecnica
- Lint sem erros.
- Testes automatizados passando.
- Build de producao passando.

## 8) Fechamento
- Severidade final registrada.
- Risco residual informado.
- Proximo monitoramento definido.
