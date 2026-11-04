# Matriz de Acesso e Menor Privilégio (PoLP)

Documentação oficial da superfície de autorização para o **SITE** (Next.js) e o **APP** (Expo / React Native).

---

## 1. Matriz de Perfis e Permissões de Usuário

| Papel (Role) | Superfície | O que pode acessar (Mínimo Necessário) | O que NÃO pode acessar (Bloqueado por Padrão) | Mecanismo de Garantia |
|---|---|---|---|---|
| **Visitante Anônimo** | Site / App | Consultar cardápio (`products`), banner ativo (`coupons` ativos), status da loja (`store_settings`). | Inserir/alterar pedidos diretamente, ver perfis de terceiros, acessar painel `/admin`, alterar produtos. | RLS no Supabase (`SELECT USING (true)` somente no catálogo público; bloqueio de INSERT/UPDATE). |
| **Cliente Autenticado** | Site / App | Criar pedidos exclusivamente via RPC `create_order()`, consultar apenas os próprios pedidos (`auth.uid() = user_id`), gerenciar seus endereços, atualizar seu próprio perfil. | Ver pedidos de terceiros (IDOR bloqueado), alterar status de pedidos (ex.: marcar como entregue/pago), criar cupons, ver métricas do restaurante. | RLS no Supabase com `auth.uid() = user_id`, queries diretas de INSERT em `orders` bloqueadas via política RLS. |
| **Administrador** | Site / App | Consultar todos os pedidos, alterar status de pedidos na cozinha/entrega, gerenciar catálogo de produtos e adicionais, gerenciar cupons, consultar métricas. | Acessar dados de pagamento crus (número de cartão/CVV - processados via Mercado Pago), alterar chaves de infraestrutura em runtime. | Supabase `profiles.role = 'admin'` verificado no banco e em `app_metadata` assinado; middleware do Next.js e guard de rotas no App. |

---

## 2. Matriz de Chaves e Tokens de API

| Chave / Variável | Destino / Camada | Escopo Concedido | Restrições PoLP Aplicadas |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cliente (Browser / App) | Leitura de catálogo público e operações autenticadas via token JWT do usuário sob RLS. | Não tem privilégio de bypass de RLS. Queries restritas estritamente pelas policies de cada tabela. |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor (Rotas API Next.js e Webhooks) | Execução de rotas serverless administrativas (ex.: processar webhook de pagamento e disparar push). | **NUNCA exposta ao cliente ou embutida no bundle do app.** Usada exclusivamente nas rotas `/app/api/*`. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Servidor (Rotas API Next.js) | Criação de preferências de pagamento e consulta ativa à API `/v1/payments/{id}`. | Acesso estrito do lado do servidor. Clientes móveis ou web comunicam-se apenas através do backend intermediário. |
| `EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` | Cliente (App) | Tokenização de dados de cartão em formulário de checkout transparente. | Permite apenas gerar token efêmero de cartão (zero acesso a dados de cobrança direta ou relatórios). |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Servidor (Next.js API Webhook) | Validação criptográfica da assinatura HMAC-SHA256 (`x-signature`). | Utilizado somente para conferência timingSafeEqual, impedindo falsificação e replay attacks. |

---

## 3. Matriz de Banco de Dados (Supabase / PostgreSQL)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `products` | Público (`true`) | Apenas Admin | Apenas Admin | Apenas Admin |
| `adicionais` | Público (`true`) | Apenas Admin | Apenas Admin | Apenas Admin |
| `orders` | Dono (`auth.uid() = user_id`) ou Admin | Bloqueado para usuários comuns; apenas RPC `create_order` ou Admin | Apenas Admin | Apenas Admin |
| `order_items` | Dono ou Admin | Bloqueado para usuários comuns; apenas RPC `create_order` ou Admin | Apenas Admin | Apenas Admin |
| `profiles` | Próprio usuário (`auth.uid() = id`) ou Admin | Usuário cria seu próprio registro | Próprio usuário (campos básicos); Admin (demais) | Apenas Admin |
| `coupons` | Público (apenas `active = true`) | Apenas Admin | Apenas Admin | Apenas Admin |
| `store_settings` | Público (`true`) | Apenas Admin | Apenas Admin | Apenas Admin |
| `uploaded_images` | Público (via API ou rota) | Usuário autenticado ou Admin (com validação de magic bytes) | Apenas Admin | Apenas Admin |

---

## 4. Matriz de Rede, Borda e CI/CD

| Componente | Configuração Aplicada | Menor Privilégio Assegurado |
|---|---|---|
| **CORS** | Whitelist explícita de origens (`batatatop.com.br`, `www.batatatop.com.br`, `localhost:3000`) | Proibição de wildcard `*` em endpoints com credenciais. |
| **HSTS & Headers** | `max-age=63072000; includeSubDomains; preload`, `frame-ancestors 'none'`, `X-Frame-Options: DENY` | Eliminação de downgrade HTTP e bloqueio total de framing (clickjacking). |
| **GitHub Actions** | `permissions: contents: read` | Tokens efêmeros do CI sem permissão de escrita, pull request modification ou secrets tampering. |
| **Cookies** | `Secure`, `HttpOnly`, `SameSite=Lax` | Tokens de autenticação protegidos contra extração via scripts maliciosos client-side (XSS). |
