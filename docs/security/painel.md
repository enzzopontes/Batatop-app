# Painel de Hardening e Auditoria de Segurança

| Fase | App (React Native / Expo) | Site (Next.js / Vercel) | Evidência |
|---|:---:|:---:|---|
| **1. Identidade e Acesso** | 🟢 Concluído | 🟢 Concluído | App: Remoção de e-mails hardcoded em `utils/isAdmin.js`, 5 testes em `isAdmin.test.js`. Site: Política de senha forte (>=8 chars, alfanumérico), sanitização de erros contra enumeração de usuários, cookies `Secure`/`SameSite`, 3 testes em `tests/phase1-identity.test.mjs`. |
| **2. Entrada de Dados** | 🟢 Concluído | 🟢 Concluído | App: Validação de quantidades (`1 <= qty <= 99`), bloqueio de preços enviados pelo client em `orderMapper.js`. Site: Sanitização contra XSS e aninhamento de tags, bloqueio de path traversal, validação profunda de magic bytes em upload e bloqueio de SVG, 4 testes em `tests/phase2-input-validation.test.mjs`. |
| **3. Transporte e Borda** | 🟢 Concluído | 🟢 Concluído | App: Comunicação exclusiva via HTTPS, chamadas seguras por backend. Site: HSTS (`max-age=63072000; includeSubDomains; preload`), CSP restritivo (`frame-ancestors 'none'`, `object-src 'none'`), X-Frame-Options DENY, validação HMAC-SHA256 e anti-replay no webhook do Mercado Pago, 3 testes em `tests/phase3-transport-edge.test.mjs`. |
| **4. Segredos e Cripto** | 🟢 Concluído | 🟢 Concluído | App: Cifra AES-256-GCM para tokens com chave em hardware (`expo-secure-store`), varredura de git history identificou chave antiga marcada para rotação. Site: Zero segredos no código atual, isolamento de `SUPABASE_SERVICE_ROLE_KEY` fora do bundle client, correção do `.gitignore`, 3 testes em `tests/phase4-secrets-crypto.test.mjs`. |
| **5. Dados e Ciclo de Vida** | 🟢 Concluído | 🟢 Concluído | Idempotência validada em 100% das migrations (`scripts/*.sql`), runbook documentado de rollback na Vercel e PITR no Supabase com RTO (4h) e RPO (1h), política de retenção LGPD escrita, 2 testes em `tests/phase5-data-lifecycle.test.mjs`. |
| **6. Cadeia de Suprimentos** | 🟢 Concluído | 🟢 Concluído | App: Correção de vulnerabilidade crítica no `shell-quote` via `npm audit fix`. Site: 0 vulnerabilidades de produção (`npm audit --omit=dev`), Dependabot ativado, workflow do GitHub Actions com `permissions: contents: read` e `npm ci`, 2 testes em `tests/phase6-supply-chain.test.mjs`. |
| **7. Observabilidade e Resposta** | 🟢 Concluído | 🟢 Concluído | Sanitizador de logs contra vazamento de senhas, cartões de crédito e PII (`lib/security-logger.ts`), Runbook de Resposta a Incidentes (NIST), Plano de Manutenção e Patching (PMP) e `SECURITY.md` publicado na raiz, 3 testes em `tests/phase7-observability.test.mjs`. |
| **PoLP (Transversal)** | 🟢 Concluído | 🟢 Concluído | Matriz completa de papéis e privilégios mínimos mapeada em `docs/security/matriz-de-acesso.md`. Nenhuma permissão sem justificativa. |
| **8. Red Team (50 vetores)** | 🟢 Concluído | 🟢 Concluído | 50 missões ofensivas executadas em 5 lotes de 10 agentes (`tests/redteam-batch1` a `batch5`). 100% dos ataques bloqueados e mitigados com sucesso. Consolidação pelo Agente Juiz em `docs/security/relatorio-final.md`. |

---

### Resumo das Suítes Automatizadas
- **Site (`c:\Dev\Sites\Site-da-mara`)**: 70 testes passando (100% de sucesso em `node --test`).
- **App (`c:\Dev\batata-top`)**: 32 testes passando (100% de sucesso em `jest`).
- **Total Geral**: 102 testes automatizados de segurança ativos.
- **Design e UI**: 100% intactos (zero alterações visuais, layout ou CSS).
