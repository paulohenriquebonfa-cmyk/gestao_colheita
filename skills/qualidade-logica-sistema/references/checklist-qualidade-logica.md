# Checklist de Qualidade da Logica

## 1) Regras de Negocio
- Formula principal aplicada corretamente.
- Campos corretos usados em totais e medias.
- Dependencias entre entidades respeitadas.

## 2) Validacao de Entrada
- Campos obrigatorios realmente bloqueiam salvamento vazio.
- Valores numericos aceitam formato esperado e rejeitam invalido.
- Limites minimos e maximos aplicados.

## 3) Integridade de Dados
- Criacao salva todos os campos exigidos.
- Edicao preserva campos nao alterados.
- Exclusao nao deixa referencia quebrada.

## 4) Sincronizacao
- Operacoes pendentes saem da fila apos sucesso.
- Erros de permissao sao exibidos com mensagem clara.
- Offline e reconexao sem perda de dados.
- Dados de usuarios diferentes nao se misturam.

## 5) Experiencia de Erro
- Mensagem de erro compreensivel para usuario leigo.
- Confirmacao para acao destrutiva.
- Notificacao de sucesso apos acao concluida.

## 6) Relatorios e Indicadores
- Totais e medias batem com a base filtrada.
- Datas e horas exibidas no fuso local.
- Exportacoes (CSV/PDF) consistentes com a tela.

## 7) Regressao
- Lint sem erros.
- Testes automatizados passando.
- Build de producao passando.
