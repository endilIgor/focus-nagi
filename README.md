# Focus Nagi

Backend de uma aplicação pessoal single-user de foco e produtividade (pomodoro, tarefas,
projetos, metas, notas, diário e analytics). Monólito modular Java + Spring Boot + PostgreSQL.

## Stack

- Java 21, Spring Boot 3.5 (Web, Validation, Data JPA, Security, Actuator)
- PostgreSQL 16, Flyway (`ddl-auto=validate`), Spring Data JPA
- Sessão server-side com cookie HttpOnly + CSRF (CookieCsrfTokenRepository)
- springdoc-openapi (Swagger UI), Spotless (google-java-format)
- Testes: JUnit 5, Testcontainers PostgreSQL (nunca H2), MockMvc
- Docker multi-stage (usuário não-root) + Docker Compose

## Estrutura

Organização por feature em `src/main/java/com/focusnagi/`:

- `auth/` — owner, login/logout/me/troca de senha, rate limiting de login
- `project/`, `task/` (com subtasks), `focus/`, `goal/`, `note/`, `journal/`
- `analytics/` — agregações (summary, streaks, heatmap, by-day/week/month/hour/project)
- `today/` — projeção compacta do dia
- `config/`, `common/` — segurança, erros, relógio/timezone

Controllers finos; regras em services/entities; DTOs de entrada/saída (nunca serializa entidades
JPA); agregações no banco (SQL nativo com `AT TIME ZONE` para os buckets de analytics).

## Requisitos

- JDK 21 e Docker (para Testcontainers e Compose)

## Executar

```bash
cp .env.example .env   # preencha APP_OWNER_PASSWORD
docker compose up --build
```

API em `http://localhost:8080`, Swagger em `/swagger-ui` (desabilitado por padrão; ative com
`APP_SWAGGER_ENABLED=true` ou rode com o profile `dev`).

Sem Docker (dev local): suba um PostgreSQL qualquer e ajuste `APP_DATABASE_URL`,
`APP_DATABASE_USER`, `APP_DATABASE_PASSWORD`, ou rode só o banco:

```bash
docker compose up db
APP_OWNER_PASSWORD=dev-secret ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

## Testes

```bash
./mvnw verify        # testes (Testcontainers/PostgreSQL) + spotless:check + package
./mvnw test
./mvnw spotless:apply
```

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `APP_OWNER_PASSWORD` | (vazio; obrigatória no primeiro boot) | senha inicial do owner (seed idempotente, BCrypt) |
| `APP_OWNER_USERNAME` | `owner` | username do owner |
| `APP_DATABASE_URL/USER/PASSWORD` | `jdbc:postgresql://localhost:5432/focusnagi` / `focusnagi` | datasource |
| `APP_TIME_ZONE` | `UTC` | timezone dos limites de dia/semana/mês (analytics, metas, diário) |
| `APP_CORS_ALLOWED_ORIGINS` | vazio (mesma origem) | origins separadas por vírgula; nunca combinado com wildcard+credentials |
| `APP_COOKIE_SECURE` | `false` | `true` quando servir via HTTPS |
| `APP_SESSION_TIMEOUT` | `12h` | timeout da sessão |
| `APP_LOGIN_MAX_FAILURES` / `APP_LOGIN_LOCK_MINUTES` | `5` / `5` | trava conservadora anti brute-force (em memória, por instância) |
| `APP_SWAGGER_ENABLED` | `false` | expõe Swagger UI/OpenAPI sem autenticação |
| `APP_PORT` | `8080` | porta |

## Autenticação, cookies e CSRF

- Login por sessão server-side: cookie `FOCUS_SESSION` (HttpOnly; `Secure` com
  `APP_COOKIE_SECURE=true`; SameSite=Lax). Não há cadastro, roles ou multi-user: existe apenas um
  owner, criado via seed no primeiro boot.
- Endpoints privados exigem a sessão (401 `UNAUTHENTICATED` caso contrário). Respostas de erro
  seguem `{"code","message","timestamp"}` sem detalhes internos.
- Toda mutação exige CSRF: obtenha o token em `GET /api/auth/csrf` (cookie `XSRF-TOKEN` + header
  `X-XSRF-TOKEN`).

```bash
# 1) pega o token CSRF
CSRF=$(curl -s -c /tmp/jar -b /tmp/jar http://localhost:8080/api/auth/csrf)
TOKEN=$(echo "$CSRF" | jq -r .token)

# 2) login (cookie de sessão fica no /tmp/jar)
curl -s -c /tmp/jar -b /tmp/jar -H "Content-Type: application/json" \
  -H "X-XSRF-TOKEN: $TOKEN" \
  -d '{"username":"owner","password":"'"$APP_OWNER_PASSWORD"'"}' \
  http://localhost:8080/api/auth/login

# 3) chamadas autenticadas (sempre com o header CSRF em mutações)
curl -s -b /tmp/jar http://localhost:8080/api/auth/me
curl -s -b /tmp/jar http://localhost:8080/api/today
curl -s -c /tmp/jar -b /tmp/jar -H "Content-Type: application/json" \
  -H "X-XSRF-TOKEN: $TOKEN" \
  -d '{"plannedFocusMinutes":25,"plannedBreakMinutes":5}' \
  http://localhost:8080/api/focus-sessions
```

## Semântica de tempo e analytics

- Timestamps persistidos como `Instant` (UTC); datas conceituais como `LocalDate`.
- Limites de dia/semana/mês usam `APP_TIME_ZONE`. Semana começa na segunda (ISO).
- `focusedMinutes` = `actualFocusSeconds / 60` (arredondamento para baixo). Apenas sessões
  `COMPLETED` contam; `CANCELLED` é ignorada. Duração é calculada sempre no servidor (relógio
  injetável, ignorando o relógio do cliente); pausas são descontadas via `paused_seconds_accum`.
- Streak: dias consecutivos (no timezone do app) com pelo menos 1 segundo de foco efetivo. O
  streak atual termina hoje, ou ontem se hoje ainda não tiver foco (o dia não acabou).
- Uma única sessão ativa (`RUNNING`/`PAUSED`) por vez, garantida por índice único parcial do
  PostgreSQL além da checagem na aplicação.
- Heatmap e `focus/by-day` incluem dias com zero; heatmap limita o intervalo a 366 dias.

## Migrations

Toda mudança de schema é uma migration versionada em `src/main/resources/db/migration`
(Flyway). Constraints `NOT NULL`, `UNIQUE`, FKs, CHECKs e índices (apenas com justificativa:
filtros e analytics) vivem no SQL.

## Limitações conhecidas

- Rate limiting de login é em memória e por instância (não distribuído).
- Sessões são in-memory (suficiente para uso single-user; reiniciar o servidor desloga).
- Sem HTTPS embutido: termine TLS no proxy reverso e use `APP_COOKIE_SECURE=true`.
