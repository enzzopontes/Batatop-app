# Batata Top — Guia do Projeto (CLAUDE.md)

> **Documento canônico** do projeto. Prefira este guia em relação ao `README.md` (desatualizado em partes) e use o `INSTALAR.md` apenas para setup inicial e cuidados com dependências.

> Documentação técnica para desenvolvedores e IAs que trabalham no projeto **Batata Top** — app mobile de delivery focado em batatas recheadas, para a cidade de **Iacanga-SP**.

---

## 0. Economia de Token / Formato de Resposta

**Ao ler este arquivo:**
- Não resuma nem repita o conteúdo deste CLAUDE.md na resposta. Confirme com apenas uma linha curta (ex: "Li o contexto, pode mandar") e aplique as regras em silêncio.

**Investigação Autônoma Antes de Gastar Tokens / Perguntar:**
Antes de formular dúvidas ao usuário ou deduzir regras, investigue o repositório na seguinte ordem:
1. `constants/theme.js` (cores/espaçamentos) e `constants/store.js` (regras e taxas da loja).
2. `supabaseConfig.js` e `supabase/migrations/` (modelos e políticas RLS). Nunca crie conexões ad-hoc ao Supabase.
3. `utils/` e `hooks/` (lógicas centrais: `cartStore.js`, `authSession.js`, `useCheckoutFlow.ts`, etc.).
4. Componente ou tela alvo.

**Edição Cirúrgica de Código:**
- Ao editar arquivos existentes, mande **apenas o trecho alterado** (função/bloco com 2-3 linhas de contexto antes e depois). NUNCA envie o arquivo inteiro, exceto sob pedido explícito ("mande o arquivo completo").
- Não regere, reformate ou re-printe arquivos ou trechos não tocados só para "dar contexto".
- Não faça refatorações cosméticas em código adjacente que não esteja quebrado.
- Não recrie do zero componentes, hooks ou utilitários que já existem — edite e reaproveite.
- Mantenha a simplicidade máxima: resolva com o menor número possível de linhas sem abstrações especulativas.

**Explicações & Comunicação:**
- Sem preâmbulos nem cumprimentos ("Claro! Vou te ajudar com isso", "Com certeza!") — vá direto à solução.
- Não reexplique padrões ou arquiteturas já documentados aqui — apenas referencie a seção (ex: "segue o padrão da seção 11").
- Sem cabeçalhos desnecessários se a resposta for curta ou contiver apenas um bloco de código.
- Sem "resumo final" repetindo o que acabou de ser entregue.

**Ambiguidade:**
- Se a tarefa for pontual ou já tiver um padrão documentado aqui ou no código, não pergunte — assuma o padrão e execute.
- Só pergunte se a ambiguidade puder causar retrabalho crítico ou quebra em produção (ex: pagamentos Mercado Pago, auth real ou schema do banco).

**Check-list Anti-Desperdício (Mental antes de responder):**
- [ ] O código introduz dependências novas desnecessárias? Se não for indispensável, não adicione.
- [ ] Criou conexões ou utilitários paralelos em vez de reaproveitar o existente?
- [ ] Hardcodou valores de estilo/loja fora de `constants/`?
- [ ] A resposta é estritamente cirúrgica, sem enrolação?

**Modo Homem das Cavernas (Caveman Mode — Economia Extrema de Tokens):**
- **Corte gordura:** Remova 100% de palavras de preenchimento, saudações, cortesias e despedidas ("Olá", "Claro", "Aqui está", "Espero ter ajudado").
- **Estilo telegráfico:** Use frases ultra-curtas de 3 a 6 palavras quando falar for necessário. Direto ao osso.
- **Zero narração:** Não narre o que vai fazer antes de fazer. Faça a alteração e mostre apenas o diff.
- **Sem explicar o óbvio:** Se o código ou diff já é claro, entregue apenas o código. Zero parágrafos redundantes.
- **Sem resumos ou conclusões:** Nunca adicione fechamentos, resumos finais ou recapitulativos no fim da resposta.
- **Explicação só sob demanda:** Se o usuário pedir explicação explicitamente, entregue em bullets rápidos de 1 linha.

**Skill COMPACTAR:**
Quando dito "COMPACTAR", resuma toda nossa conversa em 5 a 7 bullets com todo o contexto crítico, decisões e trechos essenciais, formatado para copiar e colar em um novo chat.

---

## 1. Visão Geral

O Batata Top é um aplicativo mobile desenvolvido com **Expo (SDK 54)** e **React Native**. Utiliza **Expo Router v6** para navegação baseada em arquivos (file-based routing) e **Supabase** como Backend-as-a-Service.

O backend compartilhado (pagamentos + push de pedidos) está no site **Next.js** hospedado na **Vercel** (`https://batatatop.vercel.app`). Repositório local: `C:\Users\SnyX\Documents\Sites\Site-da-mara`.

### Principais Funcionalidades

- **Home / Tela Inicial (`app/index.js`)**: Destaques, cupons de desconto, categorias e acesso rápido ao cardápio. Inclui componente de cópia de cupom com feedback visual/haptics.
- **Boas-vindas & Localização (`app/welcome.js` e `app/location.js`)**: Fluxo de onboarding no primeiro acesso, solicitando permissões de notificações e seleção/confirmação da localização do usuário.
- **Cardápio (`app/cardapio.js`)**: Listagem de produtos com filtros por categoria e busca textual.
- **Produto (`app/produto/[id].js`)**: Detalhe do produto com seleção de adicionais e observações. Integração com intenção pendente de login (`pendingCartIntent.js`).
- **Sacola / Checkout Unificado (`app/cart.tsx`)**: Fluxo unificado de sacola e checkout em página única com 3 etapas (`itens` ➔ `entrega` ➔ `pagamento`), orquestrado por `components/cart/useCheckoutFlow.ts`. Valida pedido mínimo (`MinOrderSheet`), tipo de entrega (delivery ou retirada), cálculo de frete, aplicação de cupons, seleção/cadastro de endereços, escolha de formas de pagamento (PIX, Cartão de Crédito/Débito online via Mercado Pago Checkout Transparente e cartões salvos, ou dinheiro/máquina na entrega). Ao concluir com sucesso, chama `notifyAdminNewOrder(orderId)`.
- **Pedidos (`app/pedidos.js` + `app/pedidos/[id].js`)**: Histórico de pedidos do usuário e detalhe por pedido com suporte a Realtime `UPDATE`, fallback polling, exibição de tempo estimado (`metadata.eta_minutes`) e ocultação dinâmica do QR Code Pix após aprovação.
- **Perfil (`app/profile/`)**: Hub do usuário (`index.js`) com sub-rotas dedicadas:
  - `data.js` (dados cadastrais)
  - `informacoes-pessoais.js` (nome, telefone, CPF, aniversário)
  - `informacoes-acesso.js` (e-mail, alteração de credenciais)
  - `payments.js` (métodos de pagamento preferidos e cartões salvos)
  - `security.js` (segurança e opções de conta)
  - `gerenciar-notificacoes.js` (preferências de push notifications salvas em `user_push_tokens`)
  - `dispositivos-conectados.js` (sessões ativas)
- **Cupons (`app/cupons.js`)**: Visualização de cupons disponíveis, validação e aplicação manual de códigos promocionais via `useCoupons`.
- **Notificações (`app/notifications.js`)**: Central de alertas e notificações para o usuário.
- **Central de Ajuda (`app/ajuda/`)**: FAQ e suporte categorizado (`index.js`, `artigo/[id].js`, `categoria/[id].js`).
- **Endereços (`app/addresses.js`)**: Gestão de endereços com integração ViaCEP, validação geográfica (Iacanga-SP) e verificação do endereço ativo (`addressVerification.js`).
- **Admin (`app/admin/`)**: Painel administrativo com dashboard, gestão de pedidos, produtos, cupons, promoções, caixa, feedbacks e imagens.
- **Push de novo pedido (admin)**: Notificação **real do sistema** (Expo Push) — funciona com app fechado. Mostra cliente, itens e adicionais; toque abre `/admin/pedidos`.
- **Autenticação (`app/auth/`)**: Telas de login (`login.js`), cadastro (`register.js`), telefone (`telefone.js`) e código (`codigo.js`) via Supabase Auth. Suporte a soft-logout e disparo global do `AuthBottomSheet`.

---

## 2. Estrutura de Arquivos

```
batata-top/                          # App mobile (este repositório)
├── app/
│   ├── _layout.js                   # Layout raiz + Providers + Header + TabBar + CartBar + AdminPushRegistration
│   ├── index.js                     # Home
│   ├── welcome.js                   # Onboarding: tela de boas-vindas e permissão de push
│   ├── location.js                  # Onboarding: seleção/confirmação de localização
│   ├── cardapio.js                  # Listagem de produtos e filtros
│   ├── cart.tsx                     # Sacola/Checkout unificado (3 etapas: itens, entrega, pagamento)
│   ├── cupons.js                    # Cupons disponíveis e validação de cupom
│   ├── notifications.js             # Central de notificações do usuário
│   ├── pedidos.js                   # Lista de pedidos (Realtime + polling)
│   ├── addresses.js                 # Gestão de endereços
│   ├── produto/[id].js              # Detalhe do produto e adicionais
│   ├── pedidos/[id].js              # Detalhe do pedido (Pix QR, ETA, status)
│   ├── ajuda/                       # Central de ajuda
│   │   ├── index.js
│   │   ├── categoria/[id].js
│   │   └── artigo/[id].js
│   ├── auth/                        # login.js, register.js, codigo.js, telefone.js
│   ├── hooks/                       # useProdutos, useProductRanking, usePedidos, useCoupons, useAddressVerification, useGeolocationWithMaps, usePlacesAutocomplete
│   ├── profile/                     # Hub de perfil e sub-telas
│   │   ├── index.js                 # Tela principal de perfil
│   │   ├── data.js, security.js
│   │   ├── informacoes-pessoais.js, informacoes-acesso.js
│   │   ├── payments.js              # Gestão de cartões e métodos salvos
│   │   ├── gerenciar-notificacoes.js # Notificações e push do cliente
│   │   └── dispositivos-conectados.js
│   └── admin/                       # Painel administrativo
│       ├── _layout.js
│       ├── index.js                 # Re-registra push token ao abrir painel
│       ├── pedidos.js               # Polling 10s
│       ├── produtos.js, cupons.js, promocoes.js
│       ├── caixa.js                 # Polling 30s
│       └── feedbacks.js, imagens.js
├── components/
│   ├── AddressCard.js, AddressModal.js
│   ├── AddressVerificationModal.tsx, NoAddressModal.tsx
│   ├── AdminPushRegistration.js     # Registro Expo Push + deep link ao tocar
│   ├── AnimatedSplash.js            # Animação/vídeo de abertura
│   ├── AuthBottomSheet.tsx          # Modal de login/cadastro rápido
│   ├── BannerCarousel.js            # Carrossel de banners da home
│   ├── CardWizard.js                # Fluxo guiado de adição de cartão de crédito/débito
│   ├── CartBar.js                   # Barra flutuante inferior do carrinho
│   ├── CategoriasFlutuantes.js      # Pílulas de categoria flutuantes no scroll
│   ├── CouponCard.jsx, FreeCouponCard.jsx
│   ├── EntrarBanner.tsx             # Banner de login para visitantes
│   ├── HelpModal.js, LogoutRememberModal.js
│   ├── MapSelector.tsx, ThemedAlert.js
│   ├── ProfileAccordionItem.js, ProfileSuccessToast.js
│   └── cart/                        # Subcomponentes do checkout unificado
│       ├── CartHeader.tsx, CartFooter.tsx
│       ├── StepItens.tsx, StepEntrega.tsx, StepPagamento.tsx
│       ├── PaymentSelector.tsx, PaymentCard.tsx, MinOrderSheet.tsx
│       └── useCheckoutFlow.ts       # Hook orquestrador do checkout
├── constants/
│   ├── theme.js                     # Design System (cores, tipografia, espaçamentos)
│   ├── store.js                     # MIN_ORDER_VALUE, DELIVERY_FEE, STORE_ADDRESS
│   └── categorias.js                # Categorias do cardápio
├── data/produtos.js                 # LEGADO — mock; produção usa Supabase
├── utils/
│   ├── addressHelpers.js
│   ├── addressVerification.js       # ID do endereço ativo persistido
│   ├── authSession.js               # Soft-logout: ver seção 11
│   ├── authSheetRequest.js          # Disparo global do AuthBottomSheet
│   ├── cartStore.js                 # Observer pattern + cartItemId
│   ├── isAdmin.js                   # isAdminUser(user) e checkIsAdmin(userId)
│   ├── mercadoPago.js               # Checkout Transparente MP
│   ├── notificationSound.js         # Som new_order.mp3 (foreground)
│   ├── notifyNewOrder.js            # Chama Edge Function ou Vercel API
│   ├── orderNotificationContent.js  # Formato título/corpo da push
│   ├── paymentPrefs.js              # Preferências de pagamento persistidas
│   ├── pendingAddress.js            # Endereço temporário antes do login
│   ├── pendingCartIntent.js         # Intenção de adição ao carrinho pós-login
│   ├── pushNotifications.js         # Push notifications para ADMIN
│   ├── userPushNotifications.js     # Push notifications para CLIENTES
│   ├── supabase.js
│   └── usePaymentCards.ts           # Gerenciamento de cartões (tokenização MP)
├── supabase/
│   ├── migrations/
│   │   ├── 20250629120000_admin_push_tokens.sql
│   │   ├── 20261013140000_security_hardening_admin_and_tokens.sql # Hardening de roles, triggers e push tokens
│   │   ├── 20261013141000_secure_orders_and_order_items.sql       # RLS estrito de pedidos e itens
│   │   └── 20261013142000_admin_write_policies_catalog.sql        # RLS de escrita para produtos, adicionais e cupons
│   └── functions/
│       └── notify-admin-order/      # Edge Function (com validação Bearer JWT)
├── server/api/
│   └── notify-new-order.js          # Cópia legada CommonJS (referência)
├── assets/
│   ├── banner.png
│   └── sounds/new_order.mp3
├── supabaseConfig.js
├── app.json                         # Plugin expo-notifications + allowBackup: false configurado
├── .env                             # Ignorado pelo Git (.gitignore) contra vazamento de credenciais
└── package.json                     # inclui expo-notifications, expo-device, react-native-keyboard-controller

Site-da-mara/                        # Site Next.js + API Vercel (repositório separado)
├── app/api/
│   ├── mercadopago/                 # Rotas de pagamento MP
│   └── notify-new-order/route.ts    # POST — envia push para admins
└── lib/push-notifications.ts        # Monta mensagem + Expo Push API
```

---

## 3. Variáveis de Ambiente

### App mobile (`.env`)

| Variável | Descrição |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima (pública) do Supabase |
| `EXPO_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` | Public Key do Mercado Pago (Checkout Transparente) |
| `EXPO_PUBLIC_API_BASE_URL` | URL base da API Vercel (`https://batatatop.vercel.app`) |

### Site Vercel (`Site-da-mara/.env.local`)

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (servidor — push + webhook MP) |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token MP (nunca no app) |

> **Atenção:** Access Token do Mercado Pago e `SUPABASE_SERVICE_ROLE_KEY` ficam **somente no servidor** (Vercel).

---

## 4. Comandos

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npx expo start

# Plataformas específicas
npm run android
npm run ios
npm run web
```

> **Cuidado:** Não rode `npm audit fix --force` neste projeto — pode quebrar o Expo (ver `INSTALAR.md`).

---

## 5. Arquitetura e Padrões

### Navegação
- **Expo Router v6** com file-based routing.
- O arquivo `app/_layout.js` gerencia Header animado, TabBar, Drawer, contexts (`NavContext`, `ScrollYContext`, `HeaderHeightContext`) e monta `AdminPushRegistration`.

**Como usar nas telas:**
```js
import { useScrollHandler, useHeaderHeight } from './_layout';

const { onScroll, resetHeader } = useScrollHandler();
const headerHeight = useHeaderHeight();

// ScrollView: onScroll={onScroll} scrollEventThrottle={16}
// contentContainerStyle={{ paddingTop: headerHeight }}

// useFocusEffect: resetHeader() ao voltar para a tela
```

### Gerenciamento de Estado

**Sacola e Checkout Unificado (`app/cart.tsx` + `components/cart/useCheckoutFlow.ts`):** Fluxo em 3 etapas (`itens`, `entrega`, `pagamento`). O hook `useCheckoutFlow` orquestra itens, endereço ativo, cálculo de frete, aplicação de cupons, valor mínimo (`MinOrderSheet`), escolha/cadastro de cartões (`CardWizard`) e submissão com Mercado Pago.

**Carrinho em memória (`utils/cartStore.js`):** Observer pattern + hook `useCart()`. `cartItemId` = `${product.id}-${adIds}-${observacoes}`.

**Backend / Dados:** Hooks em `hooks/` (`useProdutos.js`, `useProductRanking.js`, `usePedidos.js`, `useCoupons.js`, `useAddressVerification.js`, `useGeolocationWithMaps.js`, `usePlacesAutocomplete.js`).

**Cartões (`utils/usePaymentCards.ts`):** Tokenização client-side + tabela `payment_cards`.

**Preferências (`utils/paymentPrefs.js`):** Método/cartão preferido via `expo-secure-store`.

**Regras da Loja (`constants/store.js`):** `MIN_ORDER_VALUE` (pedido mínimo), `DELIVERY_FEE` (taxa de entrega fixa), `STORE_ADDRESS` (endereço de retirada).

### Atualização de Dados

| Área | Estratégia | Onde |
|---|---|---|
| Pedidos do usuário | Realtime (`UPDATE` orders) + polling 30s | `app/pedidos.js` |
| Admin — lista | Polling 10s | `app/admin/pedidos.js` |
| Admin — caixa | Polling 30s | `app/admin/caixa.js` |
| Admin — novo pedido | **Expo Push** (servidor → celular) | Vercel `/api/notify-new-order` |

### Estilização
- **`StyleSheet` + `constants/theme.js`** — sem NativeWind/Tailwind.
- Paleta: Amarelo `#FFB800`, Vermelho `#E61E2A`, fundo branco.

---

## 6. Banco de Dados Supabase

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `products` | Cardápio |
| `adicionais` / `product_adicionais` | Adicionais e relação com produtos |
| `orders` | Pedidos completos |
| `order_items` | Itens: `product_name`, `quantity`, `adicionais[]` (strings), `notes` |
| `addresses` | Endereços por `user_id` |
| `payment_cards` | Cartões salvos Mercado Pago |
| `store_settings` | Status loja, entregas, promoções (JSON) |
| `coupons` | Cupons de desconto |
| `uploaded_images` | Imagens admin |
| `feedbacks` | Feedbacks |
| `admin_push_tokens` | Tokens Expo Push dos admins |
| `user_push_tokens` | Tokens Expo Push dos clientes (pedidos e promoções) |

> **Observação sobre `orders`:** suporte a campo `metadata.eta_minutes` para estimativa dinâmica de entrega e persistência dos dados de pagamento (Mercado Pago ID, Pix QR, etc.).

### Migration push (obrigatória)

Arquivo: `supabase/migrations/20250629120000_admin_push_tokens.sql`

Rodar uma vez no [SQL Editor do Supabase](https://supabase.com/dashboard/project/eucwoxjmjfqylyrqunwk/sql/new).

### Storage
- Bucket **`Products`**: `https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/Products/`

### Status de Pedidos
`pending` / `awaiting_payment` → `preparing` → `ready` → `delivered` / `cancelled`

---

## 7. API Vercel (Site-da-mara)

Repositório: `Site-da-mara` → deploy em `https://batatatop.vercel.app`.

```
App (client) ──► batatatop.vercel.app/api/... ──► Mercado Pago / Supabase / Expo Push
      │
 Public Key (MP)                    Access Token + service_role (servidor)
```

### Rotas Mercado Pago (`/api/mercadopago/`)

`preference`, `pix`, `pix-status`, `card-payment`, `customer`, `save-card`, `delete-card`, `webhook`

Chamadas do app: `utils/mercadoPago.js` → `EXPO_PUBLIC_API_BASE_URL/api/mercadopago/{path}`

### Rota Push (`/api/notify-new-order`)

| Campo | Valor |
|---|---|
| Método | `POST` |
| Body | `{ "orderId": "uuid-do-pedido" }` |
| Arquivo (site) | `Site-da-mara/app/api/notify-new-order/route.ts` |
| Helper (site) | `Site-da-mara/lib/push-notifications.ts` |

**O que faz:**
1. Busca pedido + `order_items` no Supabase (service_role)
2. Busca todos os tokens em `admin_push_tokens`
3. Envia push via [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/)

---

## 8. Push Notification de Novo Pedido (Admin)

Notificação **real do sistema operacional** (como WhatsApp) — funciona com app **fechado**, em background ou aberto.

### Fluxo completo

```
1. Admin loga no app → aceita permissão → token salvo em admin_push_tokens
2. Cliente finaliza checkout (app/cart.tsx — etapa pagamento)
3. notifyAdminNewOrder(orderId) é chamado em useCheckoutFlow.ts
4. POST https://batatatop.vercel.app/api/notify-new-order
5. Vercel monta mensagem e envia via Expo Push API
6. Admin recebe notificação na barra do celular + som new_order.mp3
7. Toque na notificação → app abre /admin/pedidos
```

### Setup (checklist)

- [x] Código no app mobile (`pushNotifications.js`, `AdminPushRegistration.js`, `notifyNewOrder.js`)
- [x] Rota no site Vercel (`Site-da-mara/app/api/notify-new-order/route.ts`)
- [ ] SQL `admin_push_tokens` rodado no Supabase
- [ ] Deploy do `Site-da-mara` na Vercel (git push)
- [ ] Admin testou no **celular físico** (não simulador)
- [ ] Produção: `eas init` + `extra.eas.projectId` no `app.json`

### App mobile — arquivos

| Arquivo | Função |
|---|---|
| `utils/pushNotifications.js` | Permissões, canal Android `new-orders`, registro token, listeners |
| `components/AdminPushRegistration.js` | Montado em `app/_layout.js` |
| `utils/notifyNewOrder.js` | Edge Function (tenta) → fallback Vercel API |
| `utils/isAdmin.js` | Quem recebe/registra push |
| `app/admin/index.js` | Re-sincroniza token ao abrir painel |
| `app/cart.tsx` + `useCheckoutFlow.ts` | `notifyAdminNewOrder(created.id)` após insert do pedido |
| `assets/sounds/new_order.mp3` | Som customizado da push |
| `app.json` | Plugin `expo-notifications` + permissão `POST_NOTIFICATIONS` (Android) |

### Conteúdo da notificação

```
Título:  Novo Pedido #123
Corpo:   Maria Silva
         ────────────────
         2x Batata Calabresa
            + Bacon, Cheddar
         1x Refrigerante
         ────────────────
         Toque para gerenciar o pedido
Som:     new_order.mp3 (canal Android prioridade MAX)
Toque:   /admin/pedidos
```

### Registro do token (admin)

A validação de administrador é feita em duas etapas em `utils/isAdmin.js` (através de `isAdminUser(user)` e `checkIsAdmin(userId)`):
- **Validação instantânea (client-side)**: E-mail exato (`enzzobaraldo2008@gmail.com`), e-mail contendo a palavra `admin` ou role nos metadados (`user.user_metadata.role === 'admin'`).
- **Validação no banco de dados (async)**: Consulta a coluna `role` na tabela `profiles` do Supabase para verificar se o privilégio está ativo (`role === 'admin'`).

Token upsert em `admin_push_tokens` via Supabase (RLS: admin gerencia só o próprio token).

### Dependências push

```json
"expo-notifications": "~0.32.x",
"expo-device": "~8.0.x"
```

### Alternativa: Supabase Edge Function

Se preferir não usar Vercel para push:
- Código: `supabase/functions/notify-admin-order/index.ts`
- Deploy: `supabase functions deploy notify-admin-order`
- `notifyNewOrder.js` tenta a Edge Function primeiro, depois Vercel

### Som

- **Checkout do cliente:** sem som de novo pedido.
- **Admin:** som via push do sistema + reforço `playNewOrderSound()` se app estiver aberto (`notificationSound.js`).

---

## 9. Regras de Negócio Importantes

- **Entrega:** Somente **Iacanga-SP** (`app/addresses.js` + ViaCEP + validação geográfica).
- **Tipo de entrega:** `"delivery"` ou `"retirada"`. Endereço obrigatório só para delivery.
- **Pedido mínimo:** Definido em `constants/store.js` (`MIN_ORDER_VALUE`). Zero = desativado. `MinOrderSheet` bloqueia avanço se não atingido.
- **Taxa de entrega:** `DELIVERY_FEE` em `constants/store.js` — cobrada somente quando `store_settings.store_status.isDeliveryFeeEnabled` estiver ativo.
- **Cupons:** Validados no checkout via `useCoupons`; salvos em `orders.discount_amount` + `coupon_code`.
- **Adicionais:** Na tela do produto; `cartItemId` distingue combinações.
- **Pagamento:** Access Token MP só no servidor Vercel. Métodos disponíveis: PIX, Cartão de Crédito/Débito (Mercado Pago Checkout Transparente) e Dinheiro/Maquininha (sem integração MP).
- **Admin:** Sem guard de rota em `/admin` — reforçar com RLS/`user_metadata.role` em produção.
- **Onboarding:** Fluxo `welcome.js` → `location.js` só no primeiro acesso (controlado por `ALREADY_SEEN_WELCOME_KEY` no AsyncStorage). Solicita permissão de push antes mesmo do login.
- **Push do cliente:** `userPushNotifications.js` registra token em `user_push_tokens`. O envio real de push de status de pedido para o cliente **ainda não está implementado** (infra pronta, disparo ausente).

---

## 10. Padrão: Botão Fixo Acima do Teclado (react-native-keyboard-controller)

Usado em `app/auth/login.js` no botão "Continuar" (footer fixo dos steps `email` e `name`). Documentado aqui porque o bug que resolve é sutil — reaplique esse padrão em qualquer outra tela que precise de um botão/footer que acompanha o teclado.

### Histórico do bug (por que não dá pra resolver só com JS)

Duas abordagens anteriores falharam, ambas pelo mesmo motivo raiz:

1. **`KeyboardAvoidingView`**: esquecia o estado do teclado depois de um ciclo de `AppState` (app vai pra background e volta) — botão ficava grudado ou não subia.
2. **`keyboardHeight` manual em `state` + eventos `Keyboard.addListener`**: resolvia o problema acima, mas Android soma esse offset em cima do próprio `adjustResize` da janela (que já reposiciona a tela sozinho), dobrando o deslocamento. E depois de background/foreground, o próprio `adjustResize` do Android pode simplesmente não redisparar — problema no nível do SO, não corrigível só em JS/React.

**Conclusão:** qualquer abordagem baseada em resize de janela ou eventos JS do teclado é fundamentalmente frágil no Android depois de ciclos de background/foreground. A solução definitiva é ler o teclado direto do nível nativo.

### A solução: `react-native-keyboard-controller`

```
npx expo install react-native-keyboard-controller
```

**1. `app/_layout.js`** — envolver a árvore inteira com `<KeyboardProvider>`, por fora de todos os outros providers:

```jsx
import { KeyboardProvider } from 'react-native-keyboard-controller';

return (
  <KeyboardProvider>
    {/* NavContext, ScrollYContext, SafeAreaProvider, Stack, etc. */}
  </KeyboardProvider>
);
```

**2. `app.json`** — **NÃO** adicionar em `plugins`. Essa lib não tem `app.plugin.js`/config plugin; é só um módulo nativo autolinkado normalmente. Adicionar em `plugins` quebra o build (`PluginError: Unable to resolve a valid config plugin`).

**3. Na tela** (`login.js`) — troca o `keyboardHeight` em state por `useReanimatedKeyboardAnimation`, que devolve um valor Reanimated sincronizado com o inset nativo do teclado a cada frame:

```js
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
const footerAnimatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: keyboardHeight.value }], // negativo quando o teclado abre
}));
```

```jsx
<Animated.View style={[styles.footerAvoider, footerAnimatedStyle]}>
  <View style={styles.footer}>
    {/* botão continuar */}
  </View>
</Animated.View>
```

```js
// footerAvoider mantém bottom: 0 fixo — o translateY do Animated.View
// que empurra pra cima quando o teclado abre.
footerAvoider: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
},
```

Com isso, **remove completamente**: `useState(keyboardHeight)`, os `useEffect` com `Keyboard.addListener`, e o `useEffect` com `AppState.addEventListener` (blur manual dos inputs, dismiss forçado no resume). Nada disso é mais necessário — o hook nativo já é imune a ciclos de background/foreground.

### Bug relacionado: `autoFocus` + transição de tela

Sintoma: **na primeiríssima vez** que a tela abre (cold start / navegação), o cabeçalho aparece levemente deslocado — só nessa primeira vez.

Causa: `autoFocus` abre o teclado **durante** a animação de entrada da tela (Expo Router). Correção: foco manual via `ref` com atraso.

```js
const emailRef = useRef(null);

useEffect(() => {
  if (step === 'email') {
    const t = setTimeout(() => emailRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }
}, [step]);
```

```jsx
<TextInput ref={emailRef} /* ...sem autoFocus... */ />
```

### Gotchas de build no Windows (ao instalar a lib e rebuildar)

- **Caminho do projeto precisa ser curto.** O codegen C++ dessa lib gera nomes de arquivo longos; combinado com caminho de projeto tipo `C:\Users\...\Documents\Sites\App\batata-top`, estoura o limite de 260 caracteres do Windows (`ninja: error: Filename longer than 260 characters`). Mantenha o projeto em algo curto, ex. `C:\Dev\batata-top`.
- **Depois de mover a pasta do projeto**, limpe caches antes de rebuildar — senão o Gradle falha com `No matching variant... No variants exist` pra **todos** os módulos nativos (resíduo de caminho absoluto antigo em cache):
  ```powershell
  cd android && .\gradlew --stop && cd ..
  Remove-Item -Recurse -Force android\build, android\app\build, android\app\.cxx, android\.gradle, node_modules
  npm install
  npx expo prebuild --clean
  npx expo run:android
  ```

### Checklist pra reaplicar esse padrão em outra tela

- [ ] Nunca usar `KeyboardAvoidingView` nem `keyboardHeight` em `state`/`Keyboard.addListener` — usar `useReanimatedKeyboardAnimation`.
- [ ] Footer como `Animated.View` com `transform: translateY(keyboardHeight.value)`, `bottom: 0` fixo no style base.
- [ ] `<KeyboardProvider>` precisa envolver a árvore no `_layout.js` raiz (uma vez só, vale pro app inteiro).
- [ ] `react-native-keyboard-controller` **não vai** em `plugins` do `app.json`.
- [ ] Nunca usar `autoFocus` em campo que abre logo na entrada de uma tela via navegação — usar `ref` + `setTimeout` (~300ms).

---

## 11. Padrão: Sessão Segura (LargeSecureStore) e Logout Real com "Lembrar Conta"

Substituiu o antigo "soft-logout" por autenticação segura com criptografia autenticada em hardware e signOut real no Supabase.

### Arquitetura de Armazenamento: `LargeSecureStore` (`utils/largeSecureStore.js`)
- **Problema de limite de 2KB:** O Supabase armazena sessão completa (JWT + Refresh Token + metadados) que ultrapassa os 2KB suportados com segurança pelo `SecureStore` puro no Android.
- **Padrão LargeSecureStore com AEAD:**
  - A chave mestra simétrica AES-256 (32 bytes gerados via hardware com `expo-crypto.getRandomBytes(32)`) é protegida no `expo-secure-store` com `keychainAccessible: AFTER_FIRST_UNLOCK`.
  - O payload da sessão é cifrado com **AES-256-GCM** (@noble/ciphers/aes) usando um nonce fresco de 12 bytes (`expo-crypto.getRandomBytes(12)`) por escrita.
  - O ciphertext autenticado com a tag GCM é armazenado no `AsyncStorage` sob o prefixo `enc_`.
  - **Serialização por chave (`withKeyLock`):** Fila de promises FIFO garante que leituras e escritas concorrentes (ex: refresh de token vs render de tela) nunca colidam.
  - **Conversão UTF-8 pura:** Não depende de `TextEncoder` ou `TextDecoder` globais do runtime Hermes/JSC. Protegido contra bytes inválidos e loops infinitos.
  - **Tolerância a falhas e órfãos:** Se a chave do SecureStore for perdida mas existirem dados `enc_`, os dados órfãos são limpos e uma nova chave é gerada limpa para novos logins. Se houver erro transitório de hardware, nenhum dado bom é apagado.

### Fluxo de Logout Real: `performLogout(rememberUser)` (`utils/authSession.js`)
Não existe mais simulação de deslogado via flag local. Todo logout executa `supabase.auth.signOut()` real:

1. **"Lembrar minha conta" (`performLogout(true)`):**
   - Resolve o nome do usuário (`user_metadata` com fallback via query rápida a `profiles.full_name`).
   - Salva em `@batatatop:savedUser` apenas dados mínimos para reconhecimento visual: `{ name, email, provider }` (**ZERO telefone** em estrita conformidade com a LGPD).
   - Executa `supabase.auth.signOut({ scope: 'local' })`: desloga este dispositivo com segurança, sem revogar sessões ativas do cliente em outros aparelhos.
   - Confirma com `getSession()`; se restar resíduo, expurga a chave cifrada via `LargeSecureStore.removeItem`.

2. **"Esquecer conta" / Excluir conta (`performLogout(false)`):**
   - Remove `@batatatop:savedUser`.
   - Executa `supabase.auth.signOut({ scope: 'global' })`: revoga todas as sessões do usuário no servidor Supabase.
   - Expurga chaves residuais de storage e notifica a interface via `emitAuthUiChange()`.

3. **Migração Automática de Versões Anteriores (`migrateLegacyAuthState`):**
   - Executada no boot do app em `initAuthStateListener()` antes de qualquer render ou leitura de sessão.
   - Detecta usuários que estavam no estado legado de soft-logout (`@batatatop:softLoggedOut === 'true'`), desloga-os de verdade com `signOut({ scope: 'local' })` e preserva o `savedUser` mínimo sem telefone.
   - Remove a flag legada `@batatatop:softLoggedOut`.
   - Higieniza `@batatatop:savedUser` antigos apagando telefones pré-existentes gravados em texto puro e inferindo `provider`.

4. **"Continuar como" no `AuthBottomSheet.tsx`:**
   - Se `provider === 'google'`: aciona o fluxo Google diretamente com feedback de cancelamento/erro sem fechar o sheet prematuramente.
   - Se `provider === 'phone'`: redireciona para `/auth/telefone`.
   - Se `provider === 'email'`: abre `/auth/login` pré-preenchendo o e-mail nos parâmetros.
   - Se legado sem provider: transita para a seleção de métodos (Estado A) sem prometer login em 1 toque incorreto.

## 12. Alertas — OBRIGATÓRIO: sempre `ThemedAlert` global

**REGRA OBRIGATÓRIA:** Todo e qualquer alerta, notificação, toast ou aviso de erro/sucesso no app **DEVE** usar o sistema unificado `components/ThemedAlert.js`.

- ❌ **NUNCA** usar `Alert.alert` nativo do `react-native` (alerta cinza feio do sistema operacional).
- ❌ **NUNCA** criar banners estáticos locais em tela (ex: `const [banner, setBanner] = useState(null)` que empurram o layout).
- ❌ **NUNCA** criar modais ou toasts de feedback paralelos/isolados por componente.

### Como funciona
- **Erros, avisos e sucessos simples (0 ou 1 botão):** renderizam automaticamente como a barrinha flutuante no topo do app (estilo iFood), com animação física (`translateY` spring + bounce + fade), sem bloquear interação na tela, sumindo sozinhas em 3.5s ou ao tocar no banner.
- **Confirmações interativas (2+ botões, ex: Cancelar + Excluir):** abrem automaticamente em modal temático centralizado com backdrop suave e botões estilizados.

### Como usar

```js
import { showSuccessAlert, showErrorAlert, showThemedAlert, hideThemedAlert, ThemedAlertHost } from '../components/ThemedAlert';
```

Também acessíveis globalmente via `showSuccessAlert(...)` e `showErrorAlert(...)` sem necessidade de importação.

#### 1. Notificação de Sucesso (banner verde `COLORS.success` `#27AE60` animado no topo):
```js
showSuccessAlert('Endereço salvo com sucesso!', 'Pronto');
// Ou:
showThemedAlert.success('Código enviado');
```

#### 2. Notificação de Erro (banner vermelho original `COLORS.error` `#EB5757` animado no topo):
```js
showErrorAlert('Não foi possível conectar com o servidor.', 'Erro');
// Ou:
showThemedAlert.error('Código inválido ou expirado. Tente novamente.');
```

#### 3. Interceptação Automática do Alert.alert:
Chamadas legadas a `Alert.alert(title, message)` são interceptadas: se o título ou mensagem contiver palavras de sucesso (sucesso, copiado, salvo, parabéns, concluído), o alerta abre verde (`success`); caso contrário, mantém o vermelho original (`error`).

#### 4. Alerta simples / Atenção:
```js
showThemedAlert('Atenção', 'Selecione uma opção antes de continuar.');
```

#### 5. Confirmação com botões (abre em modal):
```js
showThemedAlert('Limpar sacola?', 'Deseja remover todos os itens?', [
  { text: 'Cancelar', style: 'cancel' },
  { text: 'Limpar', style: 'destructive', onPress: () => clearCart() },
]);
```

#### 6. Fechar alerta programaticamente (ex: usuário começou a digitar de novo):
```js
hideThemedAlert();
```

### `<ThemedAlertHost />`
- Está montado globalmente na raiz em `app/_layout.js`.
- Pode ser mantido no final de qualquer tela para garantir renderização direta (o singleton despacha sempre para o host ativo mais recente, sem duplicar banners).
- Se a tela possui múltiplos retornos antecipados com árvore própria, monte `<ThemedAlertHost />` no retorno correspondente.

---

## 12.1. Card de Destaques (`DestaqueMiniCard`, `app/index.js`) — Imagem sem corte

**Card:** `miniCard` não tem mais borda amarela de destaque (`borderColor: COLORS.primary`) — ficou com borda neutra padrão (`COLORS.border`, 1px), igual ao resto dos cards do app.

**Imagem (`miniImg`):** trocado de `resizeMode="cover"` (padrão implícito) para `resizeMode="contain"`, dentro de um wrapper (`miniImgWrapper`) com `backgroundColor: COLORS.backgroundElevated` e altura fixa (130). Isso garante que a foto do produto sempre apareça **inteira**, sem cortar bordas e sem dar zoom — independente da proporção original da imagem. Se a foto não preencher 100% da largura/altura do wrapper, sobra um respiro com a cor de fundo elevada (não fica branco/preto feio).

- Esse padrão (wrapper com bg + `Image` em `contain`) é o preferido pra qualquer card novo onde a imagem do produto precisa aparecer completa. Pra cards tipo `ProdutoCard` (Mais Pedidos) que usam `cover` de propósito (overlay + rank badge por cima), manter `cover` — a decisão é caso a caso, não uma regra global.

---

## 13. Informações para Manutenção

- **Design System:** `constants/theme.js` — nunca hardcodar cores/espaçamentos. `constants/store.js` para regras da loja.
- **Imagens:** `useProdutos.js` completa URL do bucket se `image_url` não começa com `http`.
- **TypeScript:** `cart.tsx`, `components/cart/*.tsx`, `useCheckoutFlow.ts`, `usePaymentCards.ts`, `AddressVerificationModal.tsx`, `NoAddressModal.tsx` — resto JavaScript.
- **Sem NativeWind:** Estilização 100% `StyleSheet` (README legado menciona Tailwind).
- **`utils/supabase.js`:** Re-export; prefira `supabaseConfig.js`.
- **`data/produtos.js`:** Mock legado — não usar em código novo.
- **Dois repositórios:** App = `batata-top` | Site/API = `Site-da-mara`. Alterações em push ou MP no site exigem deploy Vercel separado.
- **Testar push (admin):** Celular físico + admin logado + permissão aceita + tabela `admin_push_tokens` criada + site deployado.
- **CartBar:** componente flutuante que fica acima da BottomTabBar. Posicionado usando `TabBarHeightContext` — não duplicar o valor de altura da tab bar no componente.
- **Contexts do `_layout.js`:** `NavContext`, `ScrollYContext`, `HeaderHeightContext`, `TabBarHeightContext`, `HeaderHiddenContext`, `HeaderAnimContext` — todos exportados. Usar os hooks exportados (`useScrollHandler`, `useHeaderHeight`, `useTabBarHeight`, `useHeaderHidden`, `useHeaderAnim`).
- **AuthBottomSheet global:** qualquer tela pode disparar via `requestAuthSheet()` de `utils/authSheetRequest.js` — não precisa passar `setVisible` por prop.
- **Branch atual:** `refactor/sacola-pagina-unica` — contém o novo fluxo de sacola unificada.

---

## 14. Padrão: Sacola de Página Única & Fluxo de Checkout Estilo iFood

Refatoração canônica da Sacola (`app/cart.tsx`, `components/cart/*`) seguindo rigorosamente os padrões visuais e ergonômicos do iFood e mantendo 60fps locked:

### Arquitetura e Componentes:
- **Tab Bar e EntrarBanner ocultos:** `app/_layout.js` oculta de forma real a `BottomTabBar` e `EntrarBanner` na rota `/cart` e `/checkout`.
- **Cabeçalho da loja:** Proporcional à referência do iFood com logo de 56x56 e nome "Batata Top" em fonte destacada (18px, weight 800) + link "Adicionar mais itens".
- **Bloco de Pagamento na Sacola:** Container arredondado com header da logo (`assets/batatatopestendida.png`), método atual (com cartão salvo padrão ou Pix/Dinheiro) e linha com parcelamento "1x de R$ XX,XX", abrindo o modal curvo ao toque.
- **Bloco de Cupom:** Ícone oficial `assets/cuponpretobranco.png`, status do cupom e ação "Adicionar"/"Remover" com cor primária.
- **Edição de Itens (Lápis 44x44):** Área de toque de 44x44 com ícone lápis de 18px. Navega para `app/produto/[id].js` com `editCartItemId`, `initialQty`, `initialObs` e `initialAdicionais`. Ao salvar, chama `updateItem()` no `cartStore` atualizando o item existente no carrinho sem duplicar.
- **Rodapé Fixo Branco:** Respeitando `useSafeAreaInsets()`, alinha preço e entrega na MESMA linha ("R$ XX,XX • Entrega grátis" ou "com entrega") e botão "Continuar" em `COLORS.primary`.
- **Modal "Revise o seu pedido" (`components/cart/ReviseOrderModal.tsx`):** Bottom sheet curvo que resume entrega (estimativa de tempo), endereço, cupom e pagamento. Linhas interativas com atalhos de edição e botão "Fazer pedido" chamando o fluxo real do Supabase e Mercado Pago.
- **Modal de Pagamento (`components/cart/PaymentModal.tsx`):** Reutiliza o padrão visual do modal de pagamentos do profile, com logo `batatatopestendida.png`, abas "Pagar pelo app" (cartões salvos com tag "Parcele seu pedido", Pix "Aprovação automática" e link "Adicionar novo cartão") e "Pagar na entrega" (Dinheiro, Cartão de Crédito e Débito).
- **"Peça também" 60fps (`components/cart/PecaTambemList.tsx`):**
  - Sugestão inteligente: se só tem batata, sugere bebidas + bloco menor de batatas mais pedidas; se só tem bebida, sugere batatas; se tem ambos, sugere extras/sobremesas.
  - Ordenação por dados reais de venda através do hook `useProductRanking`.
  - Performance: FlatList horizontal com `getItemLayout`, `initialNumToRender={4}`, `maxToRenderPerBatch={4}`, `windowSize={3}`, `removeClippedSubviews`, `snapToInterval`, `React.memo` nos cards e imagens com cache `memory-disk` via `expo-image`.
- **Cores:** Zero amarelo escuro/hardcoded; todos os botões e destaques utilizam a cor primária canônica `COLORS.primary` de `constants/theme.js`.

---

## 15. Rastreio Ao Vivo Estilo iFood & Motor Zero Cliques da Mara

### Identidade do Produto:
- **Batata Recheada** (nunca mencionar "batata frita" em textos, ilustrações, animações ou estados de preparo).

### Fluxo de Rastreio Ao Vivo & Mapa iFood (`components/orders/LiveDeliveryMap.js`, `DeliveryVehicleMarker.js`, `DeliveryDestinationMarker.js`, `app/pedidos/[id].js`):
- **Carro 3D Top-Down VW Gol G2 ("Bolinha") Prata Metálico:** SVG customizado (`#C0C0C0` / `#D8D8D8`) dimensionado em `Math.floor(100 / PixelRatio.get())` dp (`viewBox="0 0 100 100"`) para zero clipping no Android Fabric (`react-native-maps` possui buffer nativo fixo de 100x100px).
- **Interpolação Fluida Quadro a Quadro:** `requestAnimationFrame` de `1.85s` sincronizado com pulsos de GPS a cada `2s` (dependendo apenas das primitivas `[driverPos.latitude, driverPos.longitude, driverPos.heading]`) e rotação automática nas curvas via `calculateBearing`.
- **Experiência Dual (Card + Modal):** Mini-preview não-interativo de `140px` integrado ao Card 1 de status (`app/pedidos/[id].js`) quando o rastreio está ativo (`is_active && isFreshPing <= 150s`), abrindo modal em tela cheia com Bottom Sheet estilo iFood ao toque.

### Motor Zero Cliques da Mara (`utils/maraTrackingEngine.js` & `app/admin/pedidos.js`) + `pg_cron` (`advance_order_progression`):
- **Auto-start no Painel Admin:** Liga o GPS automaticamente em `/admin/pedidos` sempre que há pedido `delivery` ativo (`preparing`, `ready` ou `out_for_delivery`).
- **Privacidade de Balcão na Loja:** Enquanto a Mara está na loja (`<= 40m`, 0 pedidos em `out_for_delivery`), mantém `delivery_tracking.is_active = false` no banco (protege a privacidade e deixa o `pg_cron` livre).
- **Saída Automática da Base:** Ao sair `> 40m` da base por 2 leituras consecutivas (com trava `canDispatchFromBase` que só desarma após despachar pelo menos 1 pedido e só rearma ao voltar `<= 80m` da loja), muda os pedidos da leva (`preparing`/`ready`) para `out_for_delivery` e ativa o mapa ao vivo.
- **Chegada no Cliente (Trava Irreversível):** Permanecer num raio de `<= 40m` do cliente (com histerese de saída em `60m`) por `25s` grava `metadata.arrived_at` e `metadata.auto_deliver_at` (+2 min). Essa trava é **irreversível**: conclui o pedido para `delivered` em 2 minutos invisíveis para o cliente mesmo se a Mara desligar o GPS ou fechar o app para cobrar na maquininha/Pix.
- **Fallback Automático (`pg_cron`):** Se o GPS desligar ou ficar `> 2 min` sem heartbeat antes de chegar no cliente, o `pg_cron` (`advance_order_progression`) desativa `delivery_tracking`, esconde o mapa do cliente e retoma a fila automática normal por tempo (`2 min` confirmação + `10..45 min` preparo dinâmico + `20 min` entrega).

