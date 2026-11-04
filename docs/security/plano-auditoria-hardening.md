# Plano de Execução: Auditoria, Hardening e Red Team (App + Site)

## 1. Identificação de Alvos e Stacks Confirmadas

- **SITE**: `c:\Dev\Sites\Site-da-mara`
  - Framework: Next.js 16.4.1 (App Router), React 19.2.0
  - Banco & Auth: Supabase (`@supabase/ssr` 0.8.0, `@supabase/supabase-js` 2.90.0)
  - Pagamentos: Mercado Pago API (Pix, Cartão, Webhook)
  - Notificações: CallMeBot WhatsApp API, Expo Push Notifications
  - Estilização & UI: Tailwind CSS v4.1.9, Radix UI / shadcn/ui
  - Hosting / Infra: Vercel

- **APP**: `c:\Dev\batata-top`
  - Framework: React Native 0.81.5, Expo SDK ~54.0.37 (Expo Router ~6.0.7)
  - Banco & Auth: Supabase (`@supabase/supabase-js` ^2.110.0), Google Sign-In
  - Armazenamento Seguro: `expo-secure-store` ~15.0.8, `@react-native-async-storage/async-storage` 2.2.0
  - Notificações: `expo-notifications` ~0.32.17
  - Build/EAS: EAS Build (`eas.json`), Android Nativo (`android/`)

- **BANCO & BACKEND**:
  - PostgreSQL / Supabase compartilhado (tabelas de produtos, adicionais, pedidos, cupons, perfis, status da loja)
  - Políticas RLS e scripts SQL em `scripts/` (Site) e `supabase/` (App)

- **Branches de Trabalho Criadas**:
  - Site: `security/hardening-total`
  - App: `security/hardening-total`
  - Ambiente de Teste: Mocks locais isolados, suíte de testes automatizados com Jest/Vitest, zero chamadas à produção.

---

## 2. Metodologia e Regras Operacionais

1. **Design Intacto**: Nenhuma alteração de estilos CSS, layouts, fontes, cores ou copies visuais. Qualquer necessidade de ajuste visual paralisará o fluxo para confirmação expressa.
2. **Isolamento Absoluto**: Testes ofensivos rodam estritamente contra mocks locais e endpoints isolados. Nenhuma requisição a serviços externos (Mercado Pago prod, Supabase prod, Vercel prod).
3. **Commit Cirúrgico**: Mensagens estritas no formato `sec(<fase>): <descrição>`.
4. **Verificação com Teste Antes/Depois**: Cada vulnerabilidade remediada receberá teste automatizado comprovando falha prévia e sucesso posterior.
5. **Menor Privilégio Contínuo (PoLP)**: Nenhuma chave `service_role` no cliente/app; policies RLS restritas sem `USING (true)`; revogação de permissões desnecessárias.

---

## 3. Detalhamento Fase a Fase

### Fase 1: Identidade e Acesso
- **1.1 Senhas**: Validar regras de força, ausência de hashing fraco no cliente, Supabase Auth configurado com bcrypt/argon2id.
- **1.2 MFA**: Verificar suporte e obrigatoriedade para papéis de admin no painel `/admin` do site e rotas privilegiadas.
- **1.3 Controle de Acesso (IDOR / RLS)**:
  - Site: Checar endpoints `/api/*` e rotas do App Router contra IDOR (leitura e alteração de pedidos e endereços de terceiros).
  - App: Validar se queries diretas ao Supabase respeitam `auth.uid() = user_id`.
  - Auditar separação estrita de admin vs cliente sem flag client-side adulterável.
- **1.4 Sessão e Tokens**:
  - Rotação e expiração de refresh tokens; revogação efetiva no logout.
  - Rejeição de `alg: none` e validação estrita de `exp`/`aud`/`iss`.
- **1.5 Cookies & Storage**:
  - Site: Cookies de sessão com `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
  - App: Migrar qualquer token de auth ou dado confidencial em `AsyncStorage` para `expo-secure-store`.
- **1.6 Fluxos Sensíveis**:
  - Reset de senha com tokens de uso único, sem enumeração de contas (mensagens de erro padronizadas).

### Fase 2: Entrada de Dados
- **2.1 Validação Server-Side**:
  - Introduzir schemas estritos (Zod) em todos os endpoints de API do site (`/api/mercadopago/*`, `/api/images/*`, etc.).
- **2.2 Sanitização e Escape**:
  - Sanitização de inputs contra XSS (refletido, armazenado em observações de pedidos, nomes, cupons).
- **2.3 Injeção SQL & RPC**:
  - Auditar todas as chamadas SQL e funções RPC no Supabase; garantir queries 100% parametrizadas.
- **2.4 CSRF & SSRF**:
  - Proteção em ações mutativas; bloqueio de requisições a URLs arbitrárias fornecidas por usuários.
- **2.5 Upload de Arquivos**:
  - Validação de magic numbers / MIME type real (não só extensão), limite de tamanho e armazenamento seguro fora de diretórios executáveis.
- **2.6 Regras de Negócio e Mass Assignment**:
  - Recálculo 100% server-side de preços, descontos de cupons, taxas de entrega e totais de pedidos.
  - Bloqueio de inserção/edição arbitrária de campos `role`, `status`, `price`, `is_admin`.

### Fase 3: Transporte e Borda
- **3.1 HTTPS & HSTS**:
  - Configurar headers `Strict-Transport-Security` com `preload` e `includeSubDomains` no `next.config.mjs`.
- **3.2 CORS**:
  - Restringir origens permitidas nas rotas de API do Next.js (eliminar qualquer wildcard permissivo com credenciais).
- **3.3 Headers de Segurança**:
  - `Content-Security-Policy` robusta, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` / `frame-ancestors: 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **3.4 Rate Limiting**:
  - Endpoints críticos (login, reset, checkout, webhook) com limitação de taxa por IP e conta, retornando HTTP 429.
- **3.5 Webhooks (Mercado Pago)**:
  - Validação criptográfica de assinatura (HMAC SHA256 do header `x-signature`).
  - Verificação ativa do status do pagamento diretamente na API do Mercado Pago antes da liberação do pedido.
  - Idempotência com tabela de eventos/transações processadas contra ataques de replay.

### Fase 4: Segredos e Criptografia
- **4.1 Varredura de Histórico e Código**:
  - Executar varredura profunda com Gitleaks/TruffleHog em todo o histórico git de ambos os repositórios.
  - Identificar chaves expostas e marcar para rotação sem expor valores nos relatórios.
- **4.2 Proteção de Bundles**:
  - Auditar build do Next.js e bundle do React Native/Metro para garantir que `SUPABASE_SERVICE_ROLE_KEY` e `MERCADO_PAGO_ACCESS_TOKEN` nunca vazem para o client.
- **4.3 Gerenciamento de Ambientes**:
  - Sanitizar `.env.example` e garantir `.gitignore` correto.
- **4.4 Criptografia de Dados Sensíveis**:
  - Proteção em repouso e trânsito para PII (telefone, endereços, CPF) e armazenamento seguro no app.

### Fase 5: Dados e Ciclo de Vida
- **5.1 Versionamento de Migrations**:
  - Organizar e validar idempotência dos scripts SQL em `scripts/` e `supabase/`.
- **5.2 Rollback**:
  - Documentar e validar procedimentos de rollback para banco e deploys da Vercel.
- **5.3 Backup & Restauração**:
  - Validar rotinas de backup do Supabase e simular restauração funcional em ambiente isolado.
- **5.4 Retenção e LGPD**:
  - Estabelecer diretrizes de expurgo de dados inativos e exclusão a pedido do titular.

### Fase 6: Cadeia de Suprimentos
- **6.1 Auditoria de Dependências**:
  - Executar `npm audit` em ambos os repositórios e sanar vulnerabilidades críticas e altas.
- **6.2 Travamento e CI**:
  - Uso estrito de `package-lock.json` com `npm ci`.
  - Configuração de CI com permissões mínimas (`permissions: read-all`).

### Fase 7: Observabilidade e Resposta
- **7.1 Logging Seguro**:
  - Estruturação de logs de auditoria sem PII, senhas ou tokens.
- **7.2 Monitoramento & Alertas**:
  - Regras para detecção de anomalias (picos 401/403/429 e falhas de webhook).
- **7.3 Runbook de Incidentes & PMP**:
  - Criação de `docs/security/runbook-incidente.md` (RTO: 4h, RPO: 1h) e rotina de patching mensal.
- **7.4 Contato de Segurança**:
  - Publicação de `SECURITY.md` na raiz.

---

## 4. Revisão PoLP (Seção 4) e Ranking (Seção 5)

- Elaboração de `docs/security/matriz-de-acesso.md` mapeando todas as permissões de banco, API, usuários e chaves.
- Elaboração de `docs/security/ranking-comentarios.md` aplicando o ranking provisório de impacto vs esforço.

---

## 5. Fase 8: Red Team Final (50 Vetores Ofensivos)

Execução orquestrada dos 50 vetores em ambiente local de teste:
- **1 a 5 (Auth)**: Força bruta de login, enumeração de usuários, bypass de reset de senha, bypass de MFA, adulteração de JWT.
- **6 a 8 (Sessão)**: Reuso após logout, fixação de sessão, abuso de flags de cookie.
- **9 a 13 (Acesso)**: IDOR leitura, IDOR escrita, escalada vertical, escalada horizontal, acesso não autorizado a `/admin`.
- **14 a 16 (Banco)**: Bypass de RLS tabela por tabela, abuso de RPCs/Edge Functions, extração indevida via anon key.
- **17 a 19 (Injeção)**: SQLi clássica, SQLi em filtros/ordenação, command/template injection.
- **20 a 22 (XSS)**: XSS refletido, XSS armazenado, XSS DOM.
- **23 a 25 (Injeção & Negócio)**: CSRF, SSRF, Mass Assignment em `role`/`status`/`price`.
- **26 a 28 (Upload)**: Arquivo malicioso, Path Traversal, estouro de payload.
- **29 a 33 (Pagamento)**: Manipulação de preço/desconto, webhook falso, replay de webhook, bypass de pagamento, race condition de estoque/pedido.
- **34 a 35 (Lógica de Negócio)**: Abuso de cupom, bypass de etapas do checkout.
- **36 a 40 (Borda & Infra)**: Bypass de rate limit via headers spoofados, abuso de CORS, clickjacking, downgrade HTTPS, DoS por payload pesado/ReDoS.
- **41 a 44 (Segredos)**: Leak no bundle do site, leak no APK/bundle do app, leak no git history, leak em logs de erro.
- **45 a 46 (Supply Chain)**: Dependências vulneráveis exploráveis, abuso de CI tokens.
- **47 (App Mobile)**: Interceptação de tráfego, adulteração de storage local, inspeção de binário.
- **48 (Resiliência)**: Corrupção controlada e teste de restauração de snapshot.
- **49 (Detecção)**: Ataque furtivo e verificação de disparo de logs/alertas.
- **50 (PoLP Audit)**: Prova de privilégio excessivo em qualquer rota ou role.

Agente Juiz consolidará os 50 relatórios, descartará falsos positivos e alimentará o loop de correção até 0 Críticos, 0 Altos e Médios tratados.

---

## 6. Entregáveis Finais

1. `docs/security/painel.md`
2. `docs/security/relatorio-final.md`
3. `docs/security/matriz-de-acesso.md`
4. `docs/security/ranking-comentarios.md`
5. `docs/security/runbook-incidente.md`
6. `SECURITY.md`
7. `docs/security/notebooklm-fonte.md`
8. `docs/security/notebooklm-roteiro-crianca.md`
