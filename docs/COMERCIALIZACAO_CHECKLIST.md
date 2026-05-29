# Checklist de Provisionamento por Cliente (1 ambiente por cliente)

## 1) Criar ambiente do cliente
1. Criar novo projeto no Supabase com nome do cliente.
2. Registrar URL e ANON KEY do projeto.
3. Aplicar `supabase/schema.sql` no SQL Editor.
4. Criar usuario administrador inicial (email/senha).

## 2) Configuracao do app para o cliente
1. Configurar `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do cliente.
2. Publicar versao dedicada (ou subdominio) para o cliente.
3. Realizar primeiro login e executar onboarding comercial.

## 3) Validacoes obrigatorias
1. Cadastrar dados basicos e criar 1 carga teste.
2. Validar sincronizacao em 2 dispositivos.
3. Validar backup e restore assistido.
4. Validar funcoes LGPD (exportar e excluir dados do titular).

## 4) Entrega e suporte
1. Treinamento de 1 hora com operador e proprietario.
2. Definir canal de suporte e canal LGPD do cliente.
3. Registrar SLA: resposta em ate 24h uteis (plano padrao).
