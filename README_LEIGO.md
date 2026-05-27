# Guia Simples (Sem Programacao)

Este sistema ja esta funcionando no seu computador.

## 1) Abrir o sistema localmente

1. Abra o terminal na pasta do projeto.
2. Rode:

```bash
npm run dev
```

3. Abra o link que aparecer (normalmente `http://localhost:5173`).

## 2) Usar agora, sem configuracao

- Se aparecer aviso de "Modo local", pode continuar usando normalmente.
- Nesse modo, os dados ficam salvos no proprio aparelho (funciona offline).

## 3) Fazer sincronizacao entre celulares/computadores

Para isso, precisa de uma conta gratuita no Supabase.

1. Crie conta em: https://supabase.com
2. Crie um projeto novo.
3. No Supabase, abra `SQL Editor` e execute o arquivo:
   - `supabase/schema.sql`
4. No projeto, crie um arquivo `.env` (na raiz) com:

```env
VITE_SUPABASE_URL=COLE_AQUI_A_URL_DO_SEU_PROJETO
VITE_SUPABASE_ANON_KEY=COLE_AQUI_A_CHAVE_ANON
```

5. Reinicie o sistema (`npm run dev`).

Pronto: o login e a sincronizacao online ficam ativos.

## 4) Colocar no celular

Opcao mais simples:
1. Abra o sistema no navegador do celular.
2. Toque em "Adicionar a tela inicial".

Assim ele vira um app (PWA).

## 5) Se quiser publicar com link publico

Eu posso fazer isso para voce no proximo passo com Vercel (mais simples).