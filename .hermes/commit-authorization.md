# Autorização adicional — commits locais

O proprietário declarou nesta conversa: “Pode fazer os commits tbm”. Esta autorização supersede somente a restrição anterior de commits locais no AGENTS.md/spec.md/plan.md e handoffs da fase. Push, deploy, provisionamento, migrações remotas e reescrita de histórico continuam não autorizados.

Hermes principal finaliza os commits após revisão e verificação dos conjuntos coerentes de mudanças, sem concorrência com o único escritor Claude. Supervisor/Claude continuam produção e gates sequenciais; não devem interpretar esta nota como obrigação de interromper implementação nem executar git commit em paralelo. Parent não iniciou nenhum commit ao registrar esta autorização.

Autor e committer: endilIgor <kitsunetech6@gmail.com>. Sem assinatura GPG, trailers de IA ou Co-Authored-By. Stage explícito das fontes/documentação pertinentes; não adicionar logs volumosos brutos, arquivos de credenciais, builds ou caches sem necessidade. Revisar diff staged, verificar commit e relatar dirty tree real. Não excluir testes RED pendentes nem omiti-los artificialmente para declarar conjunto verificado. Se gate falhar, preservar checkpoint e registrar pendências, sem declarar conclusão.
