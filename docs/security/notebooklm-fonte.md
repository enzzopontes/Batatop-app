# Documento Fonte para NotebookLM: Auditoria, Hardening e Red Team (Site da Mara & App Batata Top)

## 1. Visão Geral do Projeto e Escopo da Auditoria
Este documento consolida todas as informações técnicas, arquiteturais, de segurança e de resposta a incidentes do ecossistema digital do restaurante **Batata Top (Site da Mara & App Batata Top)**.

O objetivo da auditoria foi realizar um processo exaustivo de **Hardening (Endurecimento de Segurança)**, revisão e aplicação rigorosa do **Princípio do Menor Privilégio (PoLP - Principle of Least Privilege)** e execução de um exercício completo de **Red Team com 50 Agentes Ofensivos** operando em ambiente 100% isolado de testes.

### Tecnologias e Stacks Auditadas:
- **SITE (Web):**
  - Framework: Next.js 16.4.1 (App Router)
  - UI Library: React 19.2.0
  - Hospedagem e Borda: Vercel
  - Backend como Serviço (BaaS): Supabase (PostgreSQL 15+, Auth, Storage, Row Level Security)
  - Gateway de Pagamentos: Mercado Pago (Checkout Pro e Transparente com Webhooks HMAC-SHA256)
  - Diretório de Código: `c:\Dev\Sites\Site-da-mara`
- **APP (Mobile):**
  - Framework: React Native 0.81.5 + Expo SDK 54
  - Armazenamento Seguro: `expo-secure-store` com Cifra AES-256-GCM em hardware e fallback autenticado
  - BaaS: Supabase Client SDK com RLS
  - Diretório de Código: `c:\Dev\batata-top`

### Restrições Rígidas de Engenharia:
1. **Zero alterações visuais:** Nenhuma alteração foi realizada em design, CSS, paletas de cores (Âmbar Dourado `#E3A008`, Terracota `#C1440E`), tipografia ou layout de componentes. Todas as melhorias ocorreram na camada de lógica, middleware, banco de dados, configuração e infraestrutura.
2. **Ambiente 100% isolado:** Nenhuma requisição ofensiva atingiu endpoints de produção, bancos de dados reais de clientes ou gateways de pagamento reais. Testes foram executados em mocks locais de alta fidelidade e branches de desenvolvimento.
3. **Desenvolvimento seguro em branch:** Todo o trabalho foi desenvolvido na branch `security/hardening-total` em ambos os repositórios, com commits atômicos rastreáveis (`sec(<fase>): <descrição>`).
4. **Verificação antes da conclusão:** Cada vulnerabilidade identificada recebeu um teste automatizado que falhava antes da correção e passou após a implementação da defesa.

---

## 2. As Fases de Hardening e Implementações Técnicas

### Fase 1: Identidade e Acesso
- **Política de Senhas Fortes:** Implementada validação no servidor exigindo no mínimo 8 caracteres contendo caracteres alfanuméricos (`/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/`). Senhas fracas ou comuns são rejeitadas.
- **Proteção contra Enumeração de Usuários:** Respostas de erro para tentativas de login e recuperação de senha foram unificadas para a mensagem genérica: *"Credenciais inválidas ou usuário não localizado"*. Tempos de resposta foram harmonizados para impedir inferência baseada em timing attacks.
- **Autorização e Menor Privilégio (Admin):** Removidos e-mails de administradores codificados de forma estática no arquivo `utils/isAdmin.js` do aplicativo mobile. A autoridade administrativa passou a ser validada exclusivamente através de `app_metadata` assinado criptograficamente no token JWT do Supabase e checagem no banco via RLS (`profiles.role = 'admin'`).
- **Segurança de Cookies e Sessão:** Cookies de autenticação foram blindados com os atributos compulsórios `Secure` (somente HTTPS), `HttpOnly` (inacessíveis via scripts JavaScript/XSS) e `SameSite=Lax` (prevenção contra CSRF).

### Fase 2: Entrada de Dados e Lógica de Negócio
- **Sanitização de Strings e Defesa contra XSS:** Implementada função `sanitizeString` que neutraliza tags HTML perigosas (`<script>`, `<iframe>`, `<img>`, etc.), atributos de manipuladores de eventos (`onclick`, `onerror`) e pseudo-protocolos perigosos (`javascript:`, `vbscript:`, `data:`).
- **Validação de Nomes de Arquivo e Path Traversal:** Implementada função `sanitizeFileName` que extrai apenas o nome base (`path.basename`), remove caracteres de controle, sequências de retrocesso (`../` ou `..\`) e prefixa um timestamp único com UUID aleatório.
- **Integridade de Preços e Regras de Negócio do Carrinho:** No backend, foi eliminado o risco de manipulação de preços pelo cliente. Os totais de pedidos são recalculados obrigatoriamente no servidor consultando a tabela `products` e `adicionais`. O payload do pedido valida limites estritos de quantidade (`1 <= quantidade <= 99`) e valores monetários positivos.
- **Upload Seguro com Verificação de Magic Bytes:** A validação de uploads de imagem deixou de confiar na extensão do arquivo (`.jpg`, `.png`). O sistema analisa a assinatura binária inicial (Magic Bytes):
  - JPEG: `FF D8 FF`
  - PNG: `89 50 4E 47`
  - WEBP: `52 49 46 46`
  - SVG: Bloqueio estrito devido ao risco intrínseco de injeção de scripts XML/XSS.

### Fase 3: Transporte e Borda (Edge Security)
- **HSTS (HTTP Strict Transport Security):** Configurado cabeçalho com duração de 2 anos: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Cabeçalhos de Segurança da Web:**
  - Content Security Policy (CSP): Inclusão de `frame-ancestors 'none'` e `object-src 'none'`.
  - Anti-Clickjacking: `X-Frame-Options: DENY`.
  - MIME-Sniffing Prevention: `X-Content-Type-Options: nosniff`.
  - Referrer Policy: `Referrer-Policy: strict-origin-when-cross-origin`.
- **CORS Restritivo (PoLP de Origem):** Apenas origens explicitamente autorizadas (`batatatop.com.br`, `www.batatatop.com.br`, `localhost:3000`) possuem permissão de requisições cross-origin com credenciais. O uso de wildcard `*` com `credentials: true` foi completamente eliminado.
- **Proteção de Webhook do Mercado Pago:** Validação criptográfica da assinatura HMAC-SHA256 (`x-signature`) com verificação em tempo constante (`crypto.timingSafeEqual`) para impedir timing attacks. Adicionalmente, foi implementada janela de tolerância de timestamp de no máximo 600 segundos (10 minutos), impedindo ataques de repetição (Replay Attacks).
- **Rate Limiting Confiável:** Limitação de taxa baseada em cabeçalho confiável de borda (`x-vercel-ip` ou `cf-connecting-ip`), mitigando tentativas de bypass por meio de injeção de falsos cabeçalhos `X-Forwarded-For`.

### Fase 4: Segredos e Criptografia
- **Isolamento de Segredos de Cliente:** A chave `SUPABASE_SERVICE_ROLE_KEY` e segredos de gateways (`MERCADO_PAGO_ACCESS_TOKEN`) foram isolados estritamente na camada serverless do Next.js. O código do cliente e do app móvel utilizam unicamente chaves públicas/anônimas (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- **Limpeza e Auditoria do Git History:** Varredura completa do histórico de commits. Foi identificada uma chave antiga de testes do Supabase adicionada em commits históricos do app (`a02bf20`, `e7933bc`). Como reescrever o histórico causaria risco operacional destrutivo, a chave foi documentada e marcada para rotação imediata no painel administrativo do Supabase. O HEAD atual encontra-se 100% limpo.
- **Criptografia em Repouso no App Mobile:** Implementação da biblioteca `largeSecureStore.js` no app, que utiliza cifra AES-256-GCM com autenticação de integridade de tags para sessões e tokens grandes no armazenamento persistente (`AsyncStorage`), mantendo a chave-mestra no hardware seguro do dispositivo (`expo-secure-store` / KeyStore / Keychain).

### Fase 5: Dados e Ciclo de Vida
- **Idempotência de Migrations SQL:** As migrations `scripts/002_create_rls_policies.sql` e `scripts/006_insert_all_products.sql` foram atualizadas com guardas de idempotência (`DROP POLICY IF EXISTS`, `CREATE POLICY`, `ON CONFLICT (id) DO NOTHING`), garantindo que possam ser reexecutadas sem falhas nem duplicidade de dados.
- **Plano de Backup e Rollback:** Formalizado documento com:
  - RPO (Recovery Point Objective): Máximo de 1 hora de perda de dados.
  - RTO (Recovery Time Objective): Máximo de 4 horas para restauração total.
  - Procedimentos de reversão instantânea de deploy na Vercel (`vercel rollback`) e Point-in-Time Recovery (PITR) no Supabase.
- **Política de Retenção e LGPD:** Documentadas diretrizes de conformidade com a LGPD (Lei Geral de Proteção de Dados - Lei nº 13.709/2018), incluindo rotinas de expurgo periódico de carrinhos abandonados, logs de acesso expirados e canais de atendimento aos direitos dos titulares.

### Fase 6: Cadeia de Suprimentos (Supply Chain)
- **Auditoria e Correção de Dependências:**
  - App: Correção de vulnerabilidade de gravidade crítica no pacote `shell-quote` via `npm audit fix`.
  - Site: 0 vulnerabilidades em dependências de produção (`npm audit --omit=dev`).
- **Automação do Dependabot:** Configurado `.github/dependabot.yml` para monitoramento semanal automatizado de atualizações e alertas de segurança.
- **CI/CD Endurecido com Princípio do Menor Privilégio:** Criado workflow `.github/workflows/ci-security.yml` executando `npm ci` e testes com permissão estrita `permissions: contents: read`, impedindo vazamento ou sequestro de tokens de build.

### Fase 7: Observabilidade e Resposta a Incidentes
- **Sanitização Automatizada de Logs (`lib/security-logger.ts`):** Todos os dados serializados em logs de erro ou auditoria passam por mascaramento automático de chaves sensíveis (`password`, `token`, `secret`, `apiKey`, `card_number`, `cvv`) e redação por regex de números de cartão e CPFs.
- **Runbook de Resposta a Incidentes:** Estruturado com base nas 6 etapas do NIST SP 800-61 Rev. 2 (Preparação, Identificação, Contenção, Erradicação, Recuperação e Lições Aprendidas).
- **Plano de Manutenção e Patching (PMP):** Estabelecido calendário de janelas mensais e rotinas de resposta rápida em menos de 24 horas para vulnerabilidades críticas de Zero-Day.
- **Divulgação Responsável (`SECURITY.md`):** Criado canal oficial de reporte de vulnerabilidades éticas.

---

## 3. Exercício do Red Team: 50 Agentes Ofensivos

Um total de 50 missões ofensivas automatizadas cobriram toda a superfície de ataque da aplicação em 5 lotes de 10 agentes:
1. **Lote 1 (Agentes 01 a 10):** Autenticação e Sessão (Força bruta, enumeração, reset de senha, JWT adulterado, IDOR de leitura e escrita). Resultado: 10/10 bloqueados.
2. **Lote 2 (Agentes 11 a 20):** Acesso e Injeção (Escalada vertical e horizontal, rotas `/admin`, bypass de RLS, SQL Injection clássica e dinâmica, Template Injection, XSS refletido). Resultado: 10/10 bloqueados.
3. **Lote 3 (Agentes 21 a 30):** XSS Armazenado, CSRF, SSRF, Mass Assignment, Upload Polyglot/SVG, Path Traversal, DoS de Upload, Manipulação de Preços, Falsificação de Webhooks. Resultado: 10/10 bloqueados.
4. **Lote 4 (Agentes 31 a 40):** Replay de Webhook, Pedido sem Pagamento, Race Condition de Cupons, Cupom Expirado, Pulo de Checkout, Bypass de Rate Limit por IP Spoofing, CORS permissivo, Anti-Framing/Clickjacking, Downgrade HTTPS, DoS/ReDoS. Resultado: 10/10 bloqueados.
5. **Lote 5 (Agentes 41 a 50):** Segredos em Bundles Web e Mobile, Varredura de Git History, Mascaramento em Logs de Erro, Dependências Vulneráveis, PoLP em CI/CD, Tráfego Claro no App, Resiliência de Backups, Logs Estruturados, Matriz de Acesso PoLP. Resultado: 10/10 bloqueados.

---

## 4. Métricas e Evidências Consolidadas
- **Testes Automatizados Ativos:**
  - Site (`Site-da-mara`): 70 testes passando em `node --test` (100% sucesso).
  - App (`batata-top`): 32 testes passando em `jest` (100% sucesso).
  - Total: 102 testes automatizados de segurança sem falhas.
- **Commits na Branch `security/hardening-total`:**
  - `a26d538`: sec(fase1): endurecer auth, cookies e senhas
  - `1a73708`: sec(fase1): remover hardcoded emails de admin do app
  - `64e07b0`: sec(fase2): validacao de inputs, sanitizacao, magic bytes e integridade de preco
  - `98fb8d1`: sec(fase3): hsts, csp, cors polp, anti-replay e rate limit confiavel
  - `50d5ce0`: sec(fase4): isolamento de segredos, scan de git history e protecao de bundle
  - `e9488ac`: sec(fase5): idempotencia de migrations, plano de backup rto/rpo e retencao lgpd
  - `cca43ce`: sec(fase6): ci hardening com polp, dependabot e auditoria de dependencias
  - `b911335`: sec(fase6): correcao de vulnerabilidade no shell-quote do app
  - `571196c`: sec(fase7): logger seguro com mascaramento de pii, runbook de incidentes e pmp
  - `a6cfeec`: sec(polp): matriz de acesso por perfil e ranking ponderado de comentarios
  - `75e366b`: sec(fase8): testes ofensivos do lote 1 do red team (agentes 01 a 10)
  - `6b9f167`: sec(fase8): testes ofensivos do lote 2 do red team (agentes 11 a 20)
  - `c917ab5`: sec(fase8): testes ofensivos do lote 3 do red team (agentes 21 a 30)
  - `cc14515`: sec(fase8): testes ofensivos do lote 4 do red team (agentes 31 a 40)
  - `c95bd87`: sec(fase8): testes ofensivos do lote 5 do red team (agentes 41 a 50)
- **Status do Escopo Visual:** 100% inalterado (zero quebras de layout ou CSS).
