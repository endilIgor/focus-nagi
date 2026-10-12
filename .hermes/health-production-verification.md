# Analytics e saúde — publicação e verificação de produção

## Resultado

Publicação autorizada pelo proprietário mediante a escolha explícita “Autorizar publicação completa, migrations e habilitação da minha conta”. Release efetivada nos três serviços existentes, sem criar projetos ou alterar secrets, senhas, dados de produtividade ou dependências da aplicação.

Aplicação pública: https://focus-nagi.vercel.app

Novas páginas: `/treino` e `/alimentacao`; aparecem na navegação da conta habilitada após atualização da capacidade pelo contexto autenticado. Se a aba estava aberta no deploy, recarregue-a; se necessário, saia e entre novamente para renovar a consulta de capacidade. Acesso continua privado, não há auto-habilitação ou cadastro público de contas.

Código da release: `4939d458e21734030ae06bd056c421520ce43a35`. Os commits anteriores das tarefas 12/13 e do relatório local foram preservados. Esse merge integrou sem reescrever o histórico o commit remoto de README e vídeo (`20075ec`). Autor/committer dos commits desta execução: endilIgor <kitsunetech6@gmail.com>, sem assinatura/coautoria de IA. O commit remoto histórico mantém sua própria autoria e trailers; não foi reescrito.

## Banco Supabase

Projeto existente `htdpktavwuzoqceyiann`, região sa-east-1, PostgreSQL 17, conferido pela CLI oficial. UUID aprovado conferido em `auth.users` antes da habilitação. Login da CLI foi autorizado pelo usuário através do fluxo oficial no navegador; nenhum token, arquivo de credencial ou senha de banco foi lido/impresso pelo agente.

Preflight confirmou ausência das quatro tabelas e RPCs de saúde. Histórico remoto tinha onze migrations. Foram aplicadas somente:

- `20261010120000_personal_health_access`;
- `20261010121000_training_catalog`;
- `20261010122000_meal_catalog`.

Aplicação via `supabase db query --linked --project-ref ... --file ...`: transação única, advisory lock, precondições, DDL exatamente igual aos arquivos locais, registro canônico de version/name/statements e assertions de segurança/produtividade. Revisão GPT independente aprovada e hashes conferidos antes da execução. Read-back confirmou as três entradas com conteúdo de `statements[1]` igual às fontes, preservando as onze antigas; histórico final com quatorze entradas.

Verificação remota: quatro tabelas com RLS, nenhum grant DML direto para anon/authenticated; dezesseis RPCs de saúde `SECURITY DEFINER` com `search_path` vazio e execute apenas a authenticated; helpers privados e sequências sem acesso cliente. As migrations estruturais não habilitaram ninguém. A operação administrativa seguinte habilitou somente a identidade aprovada; `api_health_access()` retornou true sob a role autenticada correspondente.

**Drift histórico preservado:** versões das migrations antigas locais diferem das remotas. Não foi usado `db push` indiscriminadamente nem feito replay/reparo de histórico antigo. A release nova não resolve essa divergência: eventual uso futuro de `db push` precisa de preflight e reconciliação deliberada, sem aplicar migrations antigas novamente.

## Backup e proteção dos dados

Antes da alteração, `supabase db dump` gerou schema e dados de `public,app_private`; ambos armazenados localmente com permissão 0600 e exclusão do Git em `.git/info/exclude`. Nenhum backup de dados foi commitado/publicado ou mostrado no chat.

Backups reais foram restaurados em PGlite descartável com shim de infraestrutura/Auth e somente stub do ID aprovado. O mesmo script de release passou sobre essa restauração: histórico anterior preservado, três entradas novas, oito tabelas de produtividade idênticas e nenhum owner habilitado estruturalmente. O primeiro ensaio encontrou alias ambíguo no wrapper, corrigido para `release_table` antes da aprovação/aplicação; relatório da tentativa inicial preservado. Não houve alteração das fontes das migrations.

Comparações remotas antes/depois e assertion dentro da transação cobriram linhas completas e contagens de `focus_session`, `journal_entry`, `daily_checklist`, `task`, `subtask`, `project`, `goal` e `note`: fingerprints idênticos.

Backup de aplicação não é backup completo de Auth/infraestrutura/PITR. Restauração local com shim não comprova restauração do serviço gerenciado inteiro. Proteja os arquivos pessoais locais e mantenha-os fora de futuros commits.

## Worker Cloudflare

Worker existente `focus-nagi-api` publicado usando `wrangler deploy --strict --keep-vars`, tag `health-4939d45` e mensagem vinculada à revisão de código.

- URL: https://focus-nagi-api.kitsunetech6.workers.dev
- Versão: `6dda9e55-efeb-41dc-a486-42d0774c28c4`.
- Versão anterior para eventual rollback de API: `a564a737-f658-4ee7-b1c7-5d02c2cc2552`.
- Metadados do provedor conferidos após upload, incluindo revisão/tag e binding vars existentes.
- Secrets `ALLOWED_USER_IDS`, `SUPABASE_ANON_KEY` e `SUPABASE_URL` preservadas; somente nomes/types foram consultados.
- `APP_TIME_ZONE=America/Sao_Paulo` e `CORS_ALLOWED_ORIGINS` vazio preservados.

Não fazer rollback automático do frontend/banco com base na simples versão antiga de API; banco aditivo é forward-only e retorno da API deve ser avaliado junto ao cliente.

## Frontend Vercel

Projeto `focus-nagi`, ID `prj_qyGC7GeQmwnWiIAejUI6VCEcKjO9`, conta/equipe `nagis-projects-f32dc1df`, rootDirectory `frontend`. Push de main com a revisão 4939d45 foi conferido por `git ls-remote`. CI GitHub passou nos jobs frontend, Worker e scripts:
https://github.com/endilIgor/focus-nagi/actions/runs/38298376001

A primeira consulta do GitHub ainda não apresentava status Vercel para a revisão. CLI Vercel oficial foi autenticada pelo navegador; inspeção direta mostrou que o deploy automático já estava READY. Não houve projeto temporário, deploy duplicado ou alteração de environment variables.

- Deploy de código: `dpl_9ucaMdGXEjD4V4LAHqYhfRYp2Lxj`.
- URL imutável: https://focus-nagi-6h421hodl-nagis-projects-f32dc1df.vercel.app
- SHA de produção nos metadados: `4939d458e21734030ae06bd056c421520ce43a35`.
- Domínio público associado: https://focus-nagi.vercel.app
- Bundle servido: `/assets/index-CpEmnVXC.js`, SHA-256 `faaf6caadc566d12792fbf9c1435f979e3723ae432e4979535064b1229212b89`.

O asset do domínio público foi comparado byte a byte com o asset do deploy imutável: iguais. Marcadores healthAccess, rotas, cliente de alimentação, modo/duração e mapa de foco presentes. `/treino`, `/alimentacao` e `/login` servem o mesmo SPA fallback. CSP, `frame-ancestors 'none'` e `nosniff` conferidos. Commits posteriores somente documentais podem gerar outro deploy com o mesmo código; o SHA acima identifica o código efetivamente verificado, não uma previsão de HEAD futuro.

## Testes realmente executados

Após integrar o README/vídeo remoto, parent repetiu frontend 414/414, Worker 580/580, typecheck/build dos dois pacotes, lint do Worker e diff-check: todos passaram. Nenhuma produção mudou depois desses gates; somente documentos/checkpoints/suportes de release foram escritos. CI remoto da revisão publicada também passou.

Smoke SQL real remoto, sob `SET LOCAL ROLE authenticated` e claims do UUID aprovado, passou para cadastro/edição/leitura/listagem/exclusão, trim, weekdays, troca de repetitions→duration limpando alvo/notas, mudança de refeição limpando quantidade e cascade. Tudo em transação revertida: zero rotinas/exercícios/alimentos de QA persistidos; somente a habilitação administrativa permanece. Incrementos de sequences PostgreSQL de inserts revertidos são normais e podem deixar lacunas de IDs; não são perda de registros.

HTTP real do domínio público e API direta: `/api/health` 200/UP; `/api/auth/me`, `/api/training/routines` e `/api/nutrition/foods` sem credencial retornaram 401/UNAUTHENTICATED nos dois caminhos.

Chromium real em contexto anônimo isolado, **sem interceptar respostas**: `/treino` e `/alimentacao` redirecionaram para `/login` em 1440/390/320px; formulário de login apareceu, nenhum heading privado foi montado, zero requests de saúde, sem overflow ou exceções JavaScript. Contexto descartado após screenshots/medidas; navegador herdado não foi encerrado. A QA autenticada de UI anterior usa fixtures locais e continua classificada assim no relatório local.

## Limite da verificação autenticada

**Publicação e habilitação concluídas. Não foi executado login com a senha real, CRUD HTTP/JWT autenticado no navegador nem teste de sincronização entre dispositivos.** A role/claims usada pelo smoke SQL não é autenticação HTTP de produção. Não foram extraídos tokens de sessões, enviados e-mails de login ou criadas senhas/contas para simular esse trecho.

Aceite final pelo proprietário: entrar no domínio público, conferir Treino/Alimentação, cadastrar um dado legítimo, editar/mover, recarregar e confirmar persistência; se quiser, confirmar em outro dispositivo. Não colocar registros sintéticos permanentes no catálogo real para fabricar um smoke autenticado. Caso surja erro, coletar mensagem/status sem senha/token e investigar mantendo os demais dados intactos.

## Evidências locais

Base privada: `/root/projects/focus-nagi/.hermes/evidence/health-release/`.

- Preflight, backups schema/dados, hashes e `backup-restore-test*`.
- `gpt-sql-review.json`, `apply-health-release.sql`, `applied-migrations.json`, `verified-schema.json`, `enabled-owner.json`.
- `productivity-before.json`, `productivity-after-migrations.json`, `productivity-after-smoke.json`.
- `remote-rollback-smoke.sql/json`.
- `worker-deploy*`, `worker-version.json`, `worker-secrets-after.json` (nomes somente).
- `vercel-deployments.json`, `vercel-production-inspect.json`, `public-production-verification.json`.
- `production-anonymous-browser.mjs/json` e `production-login-*.png`.
- `merged-baseline-*` com stdout/XML/gates integrais.

Este documento é o índice versionado; evidências brutas, backups e credenciais permanecem locais. O relatório `.hermes/health-local-verification.md` preserva o estado e limites da entrega anterior, antes da nova autorização/publicação.
