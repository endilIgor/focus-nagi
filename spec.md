# Especificação — Focus Nagi v3

Status: aprovado pelo proprietário nesta conversa, com exclusão de sessões canceladas do contador ocioso e autorização para deploy após verificação.

## Objetivo

Implementar o design fornecido pelo proprietário no login e na interface principal do Focus Nagi, preservando a autenticação, os dados reais e os comportamentos existentes. Substituir os botões de duração na tela Foco por um mini menu e corrigir o indicador Ocioso do cabeçalho.

## Referência

Projeto Claude Design: https://claude.ai/design/p/a2697cb2-b2b3-47b7-bf50-63120c838e8d?file=Focus+Nagi+v3.dc.html

Arquivos lidos via MCP claude_design, com cópias locais para consulta:
- /tmp/focus-nagi-design-v3/Focus Nagi v3.dc.html
- /tmp/focus-nagi-design-v3/support.js

As cópias são referências de trabalho, não exportações verificadas byte a byte. support.js é o runtime do protótipo; não deve ser instalado como runtime do aplicativo React nem substituir APIs/autenticação reais.

## Interface

A superfície principal é de monitoramento/operação: manter estados, métricas e ações reais, sem introduzir dados demonstrativos do protótipo.

- Fundo #05060f com grade suave, iluminação superior e partículas triangulares formando o robô/anel de foco conforme a referência.
- Tipografia Geist e Geist Mono; acento #8052ff, âmbar #ffb829; títulos claros, superfícies translúcidas e botões arredondados.
- Login: título Focus Nagi, cartão de autenticação, campos E-mail/Senha, botão de envio com estados pendente/erro, rodapé informativo; preservar Supabase Auth.
- Shell: cabeçalho flutuante, marca triangular, navegação Hoje/Foco/Checklist/Diário/Analytics, estado da sessão e saída.
- Abrangência aprovada: adaptar Hoje, Foco, Checklist, Diário e Analytics à referência sem remover recursos existentes, incluindo seletores semanais/mensais de analytics.
- Partículas decorativas não capturam eventos nem bloqueiam campos, navegação ou leitura. Respeitar prefers-reduced-motion e remover listeners/RAF ao desmontar.
- Layout utilizável em desktop e telas estreitas sem overflow horizontal; estados de foco visíveis e controles acessíveis.

## Mini menu de duração

- Substituir a lista sempre visível de presets por um controle compacto, consistente com o novo design.
- Manter opções existentes: 25, 50, 60, 90 e 15 minutos; seleção inicial de 50 minutos.
- Abrir, selecionar e fechar usando mouse/teclado; Escape fecha e devolve foco ao acionador.
- Identificar claramente a duração selecionada; aplicar a seleção ao timer e ao payload de início.
- Impedir alterações durante sessão RUNNING/PAUSED e durante início pendente.
- Incluir entrada de duração personalizada; verificar os limites reais do contrato de backend e testar vazio, decimal, negativo e valores fora do intervalo.

## Indicador Ocioso

Problema confirmado em frontend/src/layout/AppShell.tsx: sem sessão ativa o valor usa formatClock(new Date(now)), exibindo a hora do dia.

Comportamento aprovado:
- Sem sessão ativa, exibir duração desde endedAt da última sessão COMPLETED, não a hora do dia. Sessões CANCELLED não redefinem a base do contador.
- Usar timestamps reais do servidor; continuar corretamente após recarregar, navegar ou entrar novamente. Não iniciar um contador local fictício a cada montagem.
- Atualizar a base imediatamente ao finalizar manualmente ou automaticamente, invalidando/atualizando os dados compartilhados relevantes. Ao cancelar, voltar ao período desde a última sessão COMPLETED; sem sessão COMPLETED, mostrar 00:00.
- Durante sessão RUNNING/PAUSED, preservar a contagem de foco existente e a semântica de pausa.
- Sem histórico encerrado, mostrar 00:00. Nunca mostrar NaN ou duração negativa se o timestamp for inválido/futuro.
- Formato mm:ss ou hh:mm:ss quando houver horas; o contador não reinicia à meia-noite.

## Critérios verificáveis de aceite

1. Login mantém envio real, feedback de erro, bloqueio de duplo envio e navegação após autenticação; testes de autenticação existentes passam.
2. Shell mantém rotas reais, logout e conclusão automática sem duplicação de requests.
3. Menu de duração tem testes para abrir/fechar, teclado, seleção, payload correto e bloqueio em sessão ativa/pendente.
4. Contador ocioso tem testes com relógio controlado para último endedAt, ausência de histórico, timestamps inválidos/futuros, mais de uma hora, recarga/remontagem e encerramentos manual/automático/cancelamento conforme decisão aprovada.
5. Nenhum dado demonstrativo ou lógica simulada do HTML substitui chamadas reais; nenhuma alteração de backend/migração/dependências sem aprovação específica.
6. npm test, npm run typecheck e npm run build passam no diretório frontend.
7. Verificação de navegador em desktop/mobile cobre login, shell, navegação, mini menu e reduced motion, distinguindo cenários com dados simulados de verificação real de autenticação.
8. Revisão compara fontes da referência, diff e comportamento existente; screenshots são evidência auxiliar, não prova isolada de fidelidade completa.

## Restrições e exclusões

- React/TypeScript e bibliotecas já existentes; não incorporar o runtime support.js nem montar o protótipo como iframe.
- Não ler ou imprimir credenciais/.env. Deploy autorizado no projeto de produção existente; commit/push do conjunto verificado autorizado como etapa da publicação Git-triggered. Não alterar configuração remota, banco ou Worker sem necessidade de escopo.
- Não remover funções existentes nem refatorar APIs fora do necessário.
- Hermes prepara/revisa especificação e integração; implementação de produção delegada ao Claude Code CLI, seguida de verificação independente.
- Escrever plan.md com tarefas numeradas e testáveis somente após aprovação deste rascunho. Antes de cada implementação, observar o teste de regressão falhando para o comportamento ausente.

## Decisões aprovadas

Cinco telas principais; presets e duração personalizada; cancelamentos EXCLUÍDOS da base do contador ocioso; 00:00 sem histórico concluído; publicação de produção após verificação.
