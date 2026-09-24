# Focus Nagi

Aplicação pessoal single-owner de foco e produtividade (pomodoro, checklist diário,
diário e analytics). Os dados anteriores de tarefas, projetos, metas e notas são preservados
no banco para não causar perda de histórico, mas essas seções não aparecem mais na interface.

## Arquitetura

```
Navegador ──► Vercel (SPA React/Vite, Hobby)
   │            └── /api/*  ──rewrite──► Cloudflare Worker (Hono, TypeScript)
   │                                        │  valida o JWT do Supabase (JWKS)
   │                                        └──► Supabase PostgREST /rest/v1/rpc/api_*
   │                                              (anon key + JWT do usuário ⇒ RLS)
   └── login/refresh/logout ──► Supabase Auth
```

- **Frontend** (`frontend/`): React 18 + TypeScript + Vite, TanStack Query, React Router. Autentica
  com Supabase Auth (`@supabase/supabase-js`, sessão persistida e renovada automaticamente) e chama a
  API em URLs relativas `/api/...` com `Authorization: Bearer <access token>`.
- **API** (`worker/`): Cloudflare Worker em TypeScript estrito com Hono. Verifica o JWT localmente
  (JWKS do projeto; segredo HS256 legado opcional), aplica allowlist do owner, valida entrada (zod),
  adiciona headers de segurança e chama **uma** função SQL por operação via PostgREST, repassando o
  JWT do próprio usuário. Nunca usa a `service_role`.
- **Banco/Auth** (`supabase/`): PostgreSQL do Supabase com migrations idempotentes. Toda tabela tem
  `user_id` → `auth.users`, RLS habilitado e políticas `user_id = auth.uid()`. Clientes
  autenticados não recebem acesso direto às tabelas: só podem executar funções `public.api_*`
  `SECURITY DEFINER`, com `search_path` vazio e escopo explícito por `auth.uid()`. Assim, cada
  operação é atômica e as regras do Worker não podem ser contornadas pela Data API do Supabase.
- **Migração de dados** (`scripts/migrate-data/`): exporta o PostgreSQL legado (VPS) e importa no
  Supabase preservando IDs e relacionamentos.

O backend Spring Boot/Maven/Docker anterior foi removido; suas migrations Flyway (V1..V8) foram
traduzidas para `supabase/migrations` e continuam disponíveis no histórico do git.

## Estrutura

```
frontend/                 SPA (Vite) + scripts/vercel-output.mjs (config do Vercel) + vercel.json
worker/                   Worker (src/routes/*, auth, db, validation) + testes (vitest + PGlite)
supabase/migrations/      schema, RLS/grants, funções api_* (projetos, tarefas, foco, metas,
                          notas/diário, checklist diário, today/analytics)
supabase/config.toml      config do Supabase CLI (signup público desabilitado)
scripts/migrate-data/     export-legacy.sh, import-supabase.sh, staging/transform/verify.sql
```

## Desenvolvimento local

Requisitos: Node.js 22+. Um projeto Supabase de desenvolvimento (hosted Free, ou `npx supabase start`
com Docker) com as migrations aplicadas e um usuário criado (ver [Deploy](#deploy-passo-a-passo)).

```bash
# API (http://127.0.0.1:8787)
cd worker
npm ci
cp .dev.vars.example .dev.vars   # preencha SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_USER_IDS
npm run dev

# Frontend (http://localhost:5173; /api é proxied para :8787)
cd frontend
npm ci
cp .env.example .env.local       # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Com `supabase start` local, `CORS_ALLOWED_ORIGINS` pode ficar vazio: o Vite faz proxy de `/api`.

## Testes e checks

```bash
cd worker
npm run check        # typecheck + eslint + vitest + wrangler deploy --dry-run
cd ../frontend
npm test && npm run typecheck && npm run build
```

Os testes do Worker sobem um PostgreSQL real em processo (PGlite) com um shim mínimo do Supabase
(`worker/test/support/supabase-shim.sql`: roles `anon`/`authenticated`, `auth.users`, `auth.uid()`),
aplicam **todas** as migrations e exercitam as rotas HTTP ponta a ponta sob RLS. Cobrem: contrato de
todos os endpoints legados, sucesso/erro de cada endpoint, transições de estado, limites de
analytics por timezone (relógio controlável via `app.now`), isolamento entre usuários (RLS e FKs
compostas), idempotência das migrations, verificação de JWT (ES256/JWKS, HS256 legado, expirado,
issuer/audience/role errados), transporte PostgREST e o script de migração de dados.

CI (`.github/workflows/ci.yml`) roda os checks do Worker, do frontend e a sintaxe dos scripts shell.

## Deploy passo a passo

Nada neste repositório contém URLs de conta, chaves ou senhas: tudo abaixo é configurado nos
painéis/CLIs de cada serviço.

### 1. Supabase

1. Crie um projeto (plano Free) em <https://supabase.com/dashboard>. Anote o **Project URL**, a
   **anon/publishable key** (pública) e a senha do banco (fica só com você).
2. **Authentication → Sign In / Providers**:
   - desative **Allow new users to sign up** (não existe cadastro público);
   - desative **anonymous sign-ins**; mantenha o provider **Email** ativo;
   - em Email, ative **Secure password change**.
3. **Authentication → URL Configuration**: `Site URL` = domínio do frontend no Vercel.
4. Aplique as migrations (em ordem; são idempotentes):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Alternativa sem CLI: cole cada arquivo de `supabase/migrations/` no **SQL Editor**, em ordem.
5. Crie o único usuário: **Authentication → Users → Add user → Create new user**, informe e-mail e
   uma senha forte e marque **Auto Confirm User**. Copie o **User UID** (UUID) — ele vai para
   `ALLOWED_USER_IDS` e para a importação de dados.
6. **Project Settings → Data API**: mantenha apenas o schema `public` exposto. `anon` e
   `authenticated` não têm acesso direto às tabelas; somente as funções `api_*` podem ser executadas
   por usuários autenticados.

### 2. Cloudflare Worker

```bash
cd worker
npm ci
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://<project-ref>.supabase.co
npx wrangler secret put SUPABASE_ANON_KEY     # anon/publishable key (NUNCA a service_role)
npx wrangler secret put ALLOWED_USER_IDS      # UUID do owner (vários: separados por vírgula)
# Somente se o projeto ainda assina JWTs com o segredo HS256 legado:
# npx wrangler secret put SUPABASE_JWT_SECRET
npm run deploy
curl https://focus-nagi-api.<sua-conta>.workers.dev/api/health   # {"status":"UP"}
```

Variáveis não secretas ficam em `worker/wrangler.toml` (`[vars]`):

| Variável | Default | Descrição |
|---|---|---|
| `APP_TIME_ZONE` | `UTC` | timezone IANA dos limites de dia/semana/mês (analytics, metas, diário) — ex.: `America/Sao_Paulo` |
| `CORS_ALLOWED_ORIGINS` | vazio | origens exatas separadas por vírgula; vazio = sem CORS (acesso via rewrite same-origin). Entradas com `*` são ignoradas; credenciais nunca são permitidas |

Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_USER_IDS` (recomendado; vazio = qualquer
usuário válido do projeto, isolado por RLS), `SUPABASE_JWT_SECRET` (opcional, legado).

### 3. Vercel (frontend)

1. **Add New → Project**, importe o repositório e defina **Root Directory = `frontend`**.
   `frontend/vercel.json` já define `framework: null`, `installCommand` e
   `buildCommand: npm run build:vercel`.
2. **Settings → Environment Variables** (Production e Preview):

   | Variável | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon/publishable key |
   | `API_ORIGIN` | origem do Worker, ex. `https://focus-nagi-api.<sua-conta>.workers.dev` (sem path e sem `/` final) |

3. Deploy. O build roda `vite build` e depois `node scripts/vercel-output.mjs`, que gera
   `.vercel/output` (Build Output API v3) com:
   - `/api/*` → rewrite (proxy) para `${API_ORIGIN}/api/*` — o navegador continua em URLs relativas;
   - arquivos estáticos, depois fallback SPA para `index.html` (rotas `/hoje`, `/checklist`, ...);
   - headers de segurança (CSP com `connect-src` limitado ao Supabase, `frame-ancestors 'none'`,
     `nosniff`, HSTS) e cache imutável para `/assets/*`.

   **Por que um script?** `vercel.json` não interpola variáveis de ambiente em rewrites. Gerar a
   config no build mantém o hostname fora do git e falha o build (fail-closed) se `API_ORIGIN`
   estiver ausente, sem https, ou com path/credenciais. A lógica é testada em
   `frontend/scripts/vercel-output.test.ts`.

   Alternativa sem proxy: defina `VITE_API_BASE_URL` com a origem do Worker e
   `CORS_ALLOWED_ORIGINS` no Worker com o domínio do Vercel.

### 4. Domínios próprios (opcional)

- Frontend: **Vercel → Settings → Domains**. Atualize o `Site URL` do Supabase Auth.
- API: **Cloudflare → Workers → focus-nagi-api → Settings → Domains & Routes → Custom Domain**
  (ex. `api.seudominio.com`). Atualize `API_ORIGIN` no Vercel e faça redeploy. Opcionalmente
  `workers_dev = false` em `wrangler.toml` para desligar o subdomínio `workers.dev`.

### 5. Migrar os dados do VPS

Faça numa janela sem uso do app (o app antigo deve parar de receber escritas).

```bash
# 1) no VPS (ou com acesso ao Postgres legado): congele escritas e exporte
docker compose stop api                                   # no checkout antigo; o banco continua de pé
export PGPASSWORD=...                                     # senha do Postgres legado (não versionar)
LEGACY_DATABASE_URL=postgresql://focusnagi@localhost:5432/focusnagi \
  scripts/migrate-data/export-legacy.sh migration-data    # CSVs + legacy-counts.txt (dados pessoais!)

# 2) importe no Supabase (única etapa privilegiada; usa a senha do banco, não a service_role)
export PGPASSWORD=...                                     # senha do banco Supabase
SUPABASE_DB_URL='postgresql://postgres.<project-ref>@<pooler-host>:5432/postgres' \
OWNER_USER_ID=<UUID do passo 1.5> \
  scripts/migrate-data/import-supabase.sh migration-data

# 3) confira (compare com migration-data/legacy-counts.txt)
psql "$SUPABASE_DB_URL" -v owner_id=<UUID> -f scripts/migrate-data/verify.sql
```

A connection string (session pooler ou direta) está em **Project Settings → Database → Connect**.

- Tudo roda numa única transação: IDs são preservados (todas as FKs continuam válidas), cada linha
  recebe `user_id = OWNER_USER_ID`, as sequências de identidade avançam além do maior ID importado e
  as contagens são conferidas; qualquer divergência faz rollback. O script recusa rodar se as tabelas
  de destino já tiverem dados.
- A tabela legada `owner` (username + hash BCrypt) **não** é migrada: o login passa a ser o usuário
  do Supabase Auth criado no passo 1.5, mapeado via `OWNER_USER_ID`.
- `verify.sql` mostra contagens por tabela, linhas de outros donos (esperado 0), sessões ativas
  (0 ou 1), constraints não validadas (nenhuma), RLS por tabela e o próximo ID de cada sequência.
- Apague `migration-data/` (gitignored) depois de validar.

### 6. Rollback

- **Frontend**: Vercel → Deployments → **Instant Rollback** para o deploy anterior.
- **Worker**: `npx wrangler deployments list` e `npx wrangler rollback [<version-id>]`.
- **Antes do corte**: pare as escritas no stack antigo e crie um backup completo, além dos CSVs:
  `pg_dump --format=custom "$LEGACY_DATABASE_URL" -f legacy-pre-cutover.dump`. Não remova o banco,
  o stack antigo nem esse dump até encerrar a janela de rollback.
- **Janela segura**: depois de importar, mantenha os dois ambientes sem novas escritas enquanto faz
  o smoke test. Decida entre rollback e abertura para uso antes de liberar o primeiro write no
  Supabase. Nessa janela, voltar ao VPS não perde dados porque o banco legado permanece intacto.
- **Banco Supabase**: migrations são forward-only; corrija schema com uma nova migration. Antes de
  cada mudança e antes de abrir o uso, faça também um dump de `public` com schema + dados:
  `pg_dump --format=custom --schema=public "$SUPABASE_DB_URL" -f supabase-public.dump`.
- **Depois de liberar escritas**: não existe migração reversa automática. Um rollback exige primeiro
  bloquear novas escritas e transferir manualmente para o legado tudo que foi criado no Supabase;
  sem essa reconciliação, volte apenas o frontend/Worker e mantenha o Supabase como banco oficial.

## Limites dos planos gratuitos (confira as páginas de preço atuais)

- **Supabase Free**: projeto é **pausado após ~7 dias sem atividade** (reative no dashboard; o uso
  normal do app evita a pausa); ~500 MB de banco; **sem backups automáticos acessíveis** — faça
  dumps periódicos (`supabase db dump` / `pg_dump`) e guarde fora do projeto; limite de 2 projetos
  ativos. Rate limits do Supabase Auth protegem o login contra força bruta.
- **Cloudflare Workers Free**: 100.000 requisições/dia, 10 ms de CPU por requisição (o Worker faz
  apenas verificação de JWT + 1 subrequest ao PostgREST por chamada; o JWKS fica em cache), 50
  subrequests por invocação. O mesmo código roda no Workers Paid sem mudanças.
- **Vercel Hobby**: uso pessoal/não comercial; limites de banda e de invocações — o rewrite `/api`
  é um proxy de edge, não uma função serverless.

## API

Mesmo contrato do backend anterior (paths, verbos, corpos, paginação estilo Spring `Page`,
status HTTP e códigos de erro), agora com `Authorization: Bearer <access token do Supabase>` em
todas as rotas exceto `GET /api/health`. Erros: `{"code","message","timestamp"}` sem detalhes
internos.

| Recurso | Endpoints |
|---|---|
| Auth | `GET /api/auth/me` → `{id, email}` |
| Projetos | `POST/GET /api/projects`, `GET/PATCH /api/projects/{id}`, `POST .../{id}/complete\|archive\|restore`, `GET .../{id}/focus`, `GET .../{id}/tasks` |
| Tarefas | `POST/GET /api/tasks`, `GET/PATCH/DELETE /api/tasks/{id}`, `POST .../{id}/start\|complete\|reopen\|cancel`, `POST .../{id}/subtasks`, `POST .../{id}/subtasks/{sid}/complete\|reopen`, `DELETE .../{id}/subtasks/{sid}` |
| Foco | `POST/GET /api/focus-sessions`, `GET .../current` (204 sem sessão), `POST .../{id}/pause\|resume\|finish\|cancel` |
| Metas | `POST/GET /api/goals`, `GET/PATCH /api/goals/{id}`, `POST .../{id}/complete\|archive\|restore`, `GET .../{id}/progress` |
| Notas | `POST/GET /api/notes` (`pinned`, `projectId`, `q`), `GET/PATCH/DELETE /api/notes/{id}`, `POST .../{id}/pin\|unpin` |
| Diário | `POST /api/journal`, `GET /api/journal?date=`, `GET .../range?from=&to=`, `GET .../recent`, `PATCH/DELETE /api/journal/{id}` |
| Checklist | `GET /api/checklist?date=`, `POST /api/checklist`, `PATCH/DELETE /api/checklist/{id}` |
| Hoje | `GET /api/today` |
| Analytics | `GET /api/analytics/focus/summary?period=TODAY\|WEEK\|MONTH`, `.../streaks`, `.../heatmap?from=&to=`, `.../focus/by-day\|by-week\|by-month\|by-hour`, `.../focus/by-project`, `.../checklist/daily?from=&to=` |

Mudanças intencionais de contrato:

- `POST /api/auth/login|logout|password` e `GET /api/auth/csrf` foram removidos: login, logout,
  refresh e troca de senha são feitos pelo Supabase Auth no navegador (a troca de senha re-verifica
  a senha atual). Não há cookies nem CSRF — o token vai no header `Authorization`.
- O login usa **e-mail** (Supabase Auth) em vez de username.
- `GET /api/auth/me` retorna `{id: uuid, email}`.
- Campos nulos são serializados como `null` (antes eram omitidos).
- `notes` enviado ao iniciar uma sessão de foco agora é persistido.
- Parâmetros obrigatórios ausentes retornam 400 `VALIDATION_ERROR` (antes 500); corpo acima de 1 MB
  retorna 413 `PAYLOAD_TOO_LARGE`; títulos em branco em PATCH são rejeitados.

## Segurança

- Sem cadastro público: signup desabilitado no Supabase Auth, nenhuma chamada `signUp` no app e
  allowlist `ALLOWED_USER_IDS` no Worker (403 `ACCESS_DENIED` para qualquer outro usuário).
- A `service_role` não é usada em lugar nenhum; o frontend recusa inicializar com uma chave
  `service_role`/`sb_secret_`.
- Defesa em profundidade: o Worker verifica o JWT (issuer, audience `authenticated`, role, expiração);
  o PostgREST verifica de novo; clientes autenticados têm `EXECUTE` apenas nas funções `api_*`, sem
  acesso direto às tabelas; as funções usam `SECURITY DEFINER`, `search_path` vazio e filtram por
  `auth.uid()` explicitamente; RLS e FKs compostas `(id, user_id)` permanecem como backstops.
- Busca de notas usa `LIKE` com escape e parâmetros; nenhum SQL é montado com entrada do usuário.
- `app.now` (override de relógio) só pode ser definido por uma sessão direta no banco (testes/manutenção);
  clientes PostgREST não conseguem alterá-lo.

## Semântica de tempo e analytics

- Timestamps em `timestamptz` (UTC, serializados como ISO-8601 com `Z`); datas conceituais como `date`.
- Limites de dia/semana/mês usam `APP_TIME_ZONE`. Semana começa na segunda (ISO).
- `focusedMinutes` = segundos / 60 (arredondado para baixo) por bucket. Apenas sessões `COMPLETED`
  contam. Duração é sempre calculada com o relógio do servidor; pausas são descontadas via
  `paused_seconds_accum`.
- Streak: dias consecutivos com foco > 0; o atual termina hoje, ou ontem se hoje ainda não tiver foco.
- No máximo uma sessão `RUNNING`/`PAUSED` por usuário (checagem + índice único parcial; transições
  com `SELECT ... FOR UPDATE`).
- Heatmap e `focus/by-day` incluem dias com zero; heatmap limita a 366 dias, by-week a 372 dias,
  by-month a 5 anos.

## Decisões e limitações conscientes do frontend

- O protótipo de design original tinha um medidor de "nível/XP" e um "log do sistema" puramente
  decorativos, sem contraparte na API; foram removidos para não fabricar dados.
- A escolha de paleta de cores (4 temas) é client-side (`localStorage`).
- Na tela de Foco, sessões novas são livres; vínculos de sessões antigas continuam visíveis no histórico.
  Notas da sessão só podem ser definidas ao iniciar uma sessão.
- A interface de analytics permite selecionar uma semana ISO ou um mês específico; a classificação
  semanal combina o tempo de foco concluído e a proporção de itens diários concluídos. A semana
  corrente recebe uma avaliação parcial no sábado/domingo, e a avaliação final fica disponível
  a partir da segunda-feira.
