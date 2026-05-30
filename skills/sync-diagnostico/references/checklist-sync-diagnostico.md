# Checklist de Diagnostico de Sync

## 1) Conectividade e Sessao
- Internet ativa no dispositivo.
- Sessao autenticada valida.
- URL e chave da nuvem configuradas.

## 2) Fila de Pendencias
- Numero de pendencias por tabela conhecido.
- Cada pendencia com op, retries e erro registrado.
- Pendencia antiga identificada e tratada.

## 3) Permissoes e Policies
- Operacoes de leitura/escrita autorizadas para usuario atual.
- Erros "permission denied" resolvidos com policy correta.
- Isolamento de dados entre usuarios respeitado.

## 4) Integridade de Payload
- Campos obrigatorios presentes no envio.
- Tipos corretos (data, numero, timestamp).
- Dependencias enviadas antes do registro dependente.

## 5) Estados de Sync
- Registro sai de pending_sync para synced apos sucesso.
- Erro de sync vira mensagem legivel para usuario.
- Nao existe "sucesso" com pendencia remanescente silenciosa.

## 6) Multi-dispositivo
- Dado criado no dispositivo A aparece no B apos sincronizar.
- Edicao e exclusao propagam corretamente.
- Conflitos seguem regra definida (ex.: last-write-wins).

## 7) Evidencias
- Lint sem erros.
- Testes automatizados passando.
- Build de producao passando.
