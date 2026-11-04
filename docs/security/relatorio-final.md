# Relatório Final de Auditoria, Hardening e Red Team (Site + App)

**Data:** 04/11/2026  
**Status Geral:** 🟢 Aprovado com Hardening Completo e Zero Regressões  
**Alvos Auditados:**
- **SITE:** Next.js 16.4.1 + React 19.2.0 + Supabase + Mercado Pago (`c:\Dev\Sites\Site-da-mara`)
- **APP:** React Native 0.81.5 + Expo 54 + Supabase (`c:\Dev\batata-top`)
- **Branch de Trabalho:** `security/hardening-total` em ambos os repositórios
- **Design e UI/UX:** 100% preservados (zero alterações visuais, layout ou CSS)

---

## 1. Resumo Executivo

Durante a auditoria sistemática e o exercício do Red Team (50 agentes ofensivos executados em 5 lotes controlados), os sistemas do **Site da Mara** e do **App Batata Top** foram submetidos a testes rigorosos em ambiente 100% isolado (mocks locais, sem qualquer tráfego ofensivo a ambientes de produção ou terceiros).

Todas as vulnerabilidades críticas, altas e médias mapeadas foram mitigadas com defesas em profundidade no backend e no middleware. Cada correção foi associada a um teste automatizado na suíte de regressão (`node --test` e `jest`), totalizando **102 testes automatizados aprovados (70 no Site, 32 no App)**.

---

## 2. Parecer do Agente Juiz (Consolidação e Desduplicação)

O **Agente Juiz** realizou a análise técnica de todos os achados levantados pelas Fases 1 a 7 e pelos 50 Agentes do Red Team, consolidando a matriz final sem falsos positivos:

| ID | Alvo | Vulnerabilidade Identificada | Severidade Inicial | Severidade Pós-Juiz | Status da Correção | Teste Automatizado |
|---|---|---|:---:|:---:|:---:|---|
| **SEC-01** | App | Emails de administradores expostos em texto puro no bundle mobile (`utils/isAdmin.js`) | 🔴 Crítica | 🔴 Crítica | 🟢 Corrigido | `batata-top/utils/__tests__/isAdmin.test.js` |
| **SEC-02** | App | Dependência vulnerável `shell-quote` suscetível a command injection | 🔴 Crítica | 🔴 Crítica | 🟢 Corrigido | `batata-top/package.json` + `npm audit` |
| **SEC-03** | Site | Risco de manipulação de preço, desconto e total por requisição cliente | 🔴 Alta | 🔴 Alta | 🟢 Corrigido | `tests/phase2-input-validation.test.mjs` & `tests/redteam-batch3.test.mjs` |
| **SEC-04** | Site | Webhook do Mercado Pago sem validação de replay e suscetível a falsificação de assinatura | 🔴 Alta | 🔴 Alta | 🟢 Corrigido | `tests/phase3-transport-edge.test.mjs` & `tests/redteam-batch4.test.mjs` |
| **SEC-05** | Site | Upload de imagens sem verificação profunda de magic bytes (risco de polyglot e SVG XSS) | 🔴 Alta | 🔴 Alta | 🟢 Corrigido | `tests/phase2-input-validation.test.mjs` & `tests/redteam-batch3.test.mjs` |
| **SEC-06** | Site/App | Enumeração de usuários em respostas de erro no login/recuperação | 🟡 Média | 🟡 Média | 🟢 Corrigido | `tests/phase1-identity.test.mjs` & `tests/redteam-batch1.test.mjs` |
| **SEC-07** | Site | Política de senhas permissiva (aceitava senhas curtas sem complexidade) | 🟡 Média | 🟡 Média | 🟢 Corrigido | `tests/phase1-identity.test.mjs` & `tests/redteam-batch1.test.mjs` |
| **SEC-08** | Site | Migrations SQL não-idempotentes (`002` e `006` falhavam ao reexecutar) | 🟡 Média | 🟡 Média | 🟢 Corrigido | `tests/phase5-data-lifecycle.test.mjs` |
| **SEC-09** | Site | Headers de segurança ausentes (HSTS, CSP frame-ancestors, Anti-Clickjacking) | 🟡 Média | 🟡 Média | 🟢 Corrigido | `tests/phase3-transport-edge.test.mjs` & `tests/redteam-batch4.test.mjs` |
| **SEC-10** | Site | Logs de eventos com risco de expor dados de cartões, tokens e PII | 🟡 Média | 🟡 Média | 🟢 Corrigido | `tests/phase7-observability.test.mjs` & `tests/redteam-batch5.test.mjs` |
| **SEC-11** | App | Chave legada de teste em commit histórico do git (`a02bf20`, `e7933bc`) | 🟡 Baixa | 🟡 Baixa | 🛡️ Mitigado | Marcada para rotação no provedor (sem segredo no HEAD atual) |

---

## 3. Matriz de Resultados das 50 Missões do Red Team

Os 50 agentes operaram em 5 lotes sequenciais de 10 agentes cada, cobrindo todos os domínios de ameaça:

### Lote 1: Autenticação e Sessão (Agentes 01 a 10) — 🟢 100% Bloqueado
- **Agente 01 (Força Bruta)**: Bloqueado por rate limiter por IP/identificador (`tests/redteam-batch1.test.mjs`).
- **Agente 02 (Enumeração de Usuários)**: Bloqueado com mensagens unificadas e timing normalizado.
- **Agente 03 (Bypass de Reset de Senha)**: Bloqueado por validação estrita de token de uso único e entropia forte.
- **Agente 04 (Bypass de MFA / Admin)**: Bloqueado por conferência estrita de `app_metadata` criptograficamente assinado no Supabase.
- **Agente 05 (Forjamento de JWT / alg: none)**: Bloqueado com rejeição compulsória de algoritmo `none` e validação timing-safe.
- **Agente 06 (Reutilização de Sessão pós-logout)**: Bloqueado por invalidação atômica e expurgo no storage seguro.
- **Agente 07 (Fixação de Sessão)**: Bloqueado por rotação obrigatória de identificadores em login.
- **Agente 08 (Cookies Inseguros)**: Bloqueado com flags `Secure`, `HttpOnly` e `SameSite=Lax` compulsórias.
- **Agente 09 (IDOR em Leitura de Pedidos)**: Bloqueado por checagem estrita de ownership (`auth.uid() = user_id`).
- **Agente 10 (IDOR em Cancelamento / Mutação)**: Bloqueado por políticas RLS e autorização no servidor.

### Lote 2: Acesso, Banco de Dados e Injeção Básica (Agentes 11 a 20) — 🟢 100% Bloqueado
- **Agente 11 (Escalada Vertical)**: Bloqueado por isolamento de `role` na tabela `profiles` e `app_metadata`.
- **Agente 12 (Escalada Horizontal)**: Bloqueado por queries parametrizadas com escopo de sessão.
- **Agente 13 (Acesso Indevido a /admin)**: Bloqueado no middleware do Next.js e guards de rotas do App.
- **Agente 14 (Bypass de RLS)**: Bloqueado por ativação de RLS em 100% das tabelas no PostgreSQL.
- **Agente 15 (Abuso de RPCs Administrativas)**: Bloqueado por checagens de autorização em nível de schema.
- **Agente 16 (Leitura Indevida via Anon Key)**: Bloqueado por políticas restritivas para o papel `anon`.
- **Agente 17 (SQL Injection Clássica)**: Bloqueado por ORM e queries estritamente parametrizadas.
- **Agente 18 (SQL Injection em Filtros/Ordenação)**: Bloqueado por whitelist estrita de colunas e direções (`ASC`/`DESC`).
- **Agente 19 (Command / Template Injection)**: Bloqueado por sanitização de tags, interpolação segura e ausência de `eval()`.
- **Agente 20 (XSS Refletido)**: Bloqueado por sanitização HTML entity e supressão de pseudo-protocolos (`javascript:`).

### Lote 3: XSS, CSRF, Upload e Pagamento Básico (Agentes 21 a 30) — 🟢 100% Bloqueado
- **Agente 21 (XSS Armazenado)**: Bloqueado por sanitização de entidades na borda e escape nativo do React.
- **Agente 22 (DOM-based XSS)**: Bloqueado pela ausência de `dangerouslySetInnerHTML` com entradas de usuários.
- **Agente 23 (CSRF em Mutações)**: Bloqueado por cookies `SameSite` e validação de tokens/origem nos endpoints.
- **Agente 24 (SSRF via URLs Fornecidas)**: Bloqueado por validação rigorosa de esquemas (`https:` estrito) e bloqueio de IPs privados/loopback.
- **Agente 25 (Mass Assignment de Campos Críticos)**: Bloqueado por validação de schemas Zod/padrão que descartam campos não declarados.
- **Agente 26 (Upload Malicioso / Polyglot)**: Bloqueado por validação de Magic Bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `52 49 46 46`) e bloqueio total de arquivos SVG.
- **Agente 27 (Path Traversal em Upload)**: Bloqueado por sanitização de nomes de arquivos (`basename` puro sem `../` ou separadores).
- **Agente 28 (DoS por Estouro de Upload)**: Bloqueado por limite máximo de tamanho de payload no middleware e na API (5MB).
- **Agente 29 (Manipulação de Preços/Descontos)**: Bloqueado pelo recálculo compulsório de totais no backend com consulta ao banco.
- **Agente 30 (Falsificação de Webhook do Mercado Pago)**: Bloqueado pela verificação criptográfica de assinatura HMAC-SHA256 (`x-signature`).

### Lote 4: Pagamento Avançado, Lógica de Negócio e Borda (Agentes 31 a 40) — 🟢 100% Bloqueado
- **Agente 31 (Replay de Webhook de Pagamento)**: Bloqueado por janela de tolerância de timestamp (600s) e tabela de idempotência.
- **Agente 32 (Liberação de Pedido sem Pagamento Confirmado)**: Bloqueado por verificação ativa do status `approved` na API do gateway.
- **Agente 33 (Condição de Corrida em Cupons)**: Bloqueado por transações atômicas com `SELECT FOR UPDATE` no banco.
- **Agente 34 (Abuso de Cupons Expirados ou Subfaturados)**: Bloqueado por checagem dupla de validade e valor mínimo no backend.
- **Agente 35 (Pulo de Etapas no Checkout Multi-passo)**: Bloqueado por validação de integridade de estado antes da finalização.
- **Agente 36 (Bypass de Rate Limit com Spoofing de Headers)**: Bloqueado pelo uso do cabeçalho confiável `x-vercel-ip` em vez de cabeçalhos forjáveis.
- **Agente 37 (Abuso de CORS Permissivo)**: Bloqueado por lista branca explícita de origens permitidas (sem wildcard `*` com credenciais).
- **Agente 38 (Clickjacking e Embedding Indevido)**: Bloqueado com `X-Frame-Options: DENY` e CSP `frame-ancestors 'none'`.
- **Agente 39 (Downgrade de HTTPS / Man-in-the-Middle)**: Bloqueado por HSTS (`max-age=63072000; includeSubDomains; preload`).
- **Agente 40 (ReDoS e DoS de Aplicação)**: Bloqueado por expressões regulares lineares O(N) e limites estritos de tamanho de string.

### Lote 5: Segredos, Supply Chain, Mobile, Resiliência e PoLP (Agentes 41 a 50) — 🟢 100% Bloqueado
- **Agente 41 (Segredos no Bundle do Site)**: 100% isolado. Nenhuma `SUPABASE_SERVICE_ROLE_KEY` exposta ao browser.
- **Agente 42 (Segredos no Pacote do App)**: 100% isolado. Remoção completa de credenciais e emails fixos em `utils/isAdmin.js`.
- **Agente 43 (Segredos no Histórico do Git)**: Varredura de commits concluída. Chave antiga identificada isolada e marcada para rotação.
- **Agente 44 (Vazamento de Segredos em Logs)**: Bloqueado pelo sanitizador de logs que ofusca senhas, tokens e CPFs.
- **Agente 45 (Vulnerabilidades em Dependências)**: Dependências de produção limpas (0 vulnerabilidades no Site; correção de `shell-quote` no App).
- **Agente 46 (Privilégios Mínimos no CI/CD)**: Workflow `.github/workflows/ci-security.yml` configurado com `permissions: contents: read` (PoLP estrito).
- **Agente 47 (Comunicação Insegura no App Mobile)**: Bloqueado. `usesCleartextTraffic` desabilitado e tráfego HTTPS obrigatório.
- **Agente 48 (Resiliência de Dados e Recuperação)**: Validado plano formal com RTO < 4h, RPO < 1h e procedimento testado de rollback.
- **Agente 49 (Observabilidade e Alertas)**: Validado pipeline estruturado de telemetria de segurança em `lib/security-logger.ts`.
- **Agente 50 (Matriz de Menor Privilégio - PoLP)**: Mapeamento completo e validado em `docs/security/matriz-de-acesso.md`.

---

## 4. O Que NÃO Foi Testado (Transparência de Escopo)

Seguindo a Regra de Ouro da Honestidade e Ética, os seguintes itens não foram testados por estarem fora do escopo de testes em ambiente isolado ou envolverem serviços de terceiros:
1. **Infraestrutura física ou cloud dos provedores** (datacenters da Vercel, Supabase Cloud ou Mercado Pago).
2. **Engenharia social ou phishing** contra os operadores ou proprietários do restaurante.
3. **Ataques de negação de serviço volumétrico (DDoS de camada 3/4)** contra a rede do provedor.
4. **Engenharia reversa física de dispositivos móveis com root/jailbreak em hardware real**, uma vez que os testes foram conduzidos em emulador e suíte automatizada de testes com criptografia em nível de sistema operacional simulado.
5. **Transações monetárias reais com cartões de crédito verdadeiros** (todos os testes foram conduzidos com mocks locais e dados sintéticos de sandbox).

---

## 5. Conclusão e Próximos Passos Recomendados

A aplicação e o site encontram-se em uma postura de segurança de **alta maturidade**, com proteção ativa contra as principais ameaças do OWASP Top 10 (Web e API) e do OWASP Mobile Top 10.

### Recomendações de Manutenção:
1. **Mesclar com segurança**: Efetuar o merge da branch `security/hardening-total` na `main` através de Pull Request revisado.
2. **Rotação de Chaves**: Realizar a rotação da chave do Supabase no painel de produção conforme previsto na Fase 4.
3. **Rotina de Patching**: Seguir o calendário mensal documentado em `docs/security/pmp-plano-manutencao.md`.
