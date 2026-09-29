# Batata Top — Guia do Projeto (CLAUDE.md)

> **Documento canônico** do projeto. Prefira este guia em relação ao `README.md` (desatualizado em partes) e use o `INSTALAR.md` apenas para setup inicial e cuidados com dependências.

> Documentação técnica para desenvolvedores e IAs que trabalham no projeto **Batata Top** — app mobile de delivery focado em batatas recheadas, para a cidade de **Iacanga-SP**.

---

## 0. Economia de Token / Formato de Resposta

**Ao ler este arquivo:**
- Não resuma nem repita o conteúdo deste CLAUDE.md na resposta. Confirme com uma linha curta (ex: "Li o contexto, pode mandar") e aplique as regras em silêncio.

**Código:**
- Não regere ou re-printe arquivos que não foram tocados só pra "dar contexto".
- Não recrie do zero um componente/hook que já existe — edite o que já tem.

**Explicações:**
- Sem preâmbulo tipo "Claro! Vou te ajudar com isso" — vai direto na solução.
- Não reexplique padrões/arquitetura já documentados aqui (soft-logout, `cartItemId`, fluxo de push, `ThemedAlert`, etc.) — só referencie a seção (ex: "segue o padrão da seção 11").
- Headers markdown (`##`) só se a resposta tiver 3+ blocos distintos de conteúdo; senão, texto corrido ou lista simples.
- Nada de "resumo final" repetindo o que já foi dito na própria resposta.

**Ambiguidade:**
- Se a tarefa for pequena ou já tiver um padrão documentado aqui, não pergunte — assume o padrão e segue.
- Só pergunta se a ambiguidade puder causar retrabalho real (ex: mexer em pagamento, auth, ou schema do banco).

**Modo Homem das Cavernas:**
De agora em diante, remova palavras de preenchimento. Nada de enrolação. Resposta direta apenas. Use frases curtas de 3 a 6 palavras quando possível. Vá direto ao resultado. Não narre demais. Não explique mais do que o necessário.

**Skill compactar:**
Quando eu disser "COMPACTAR", resuma toda nossa conversa em 5 a 7 bullets com todo o contexto crítico, decisões e trechos essenciais. Formate de um jeito fácil de copiar e colar em um novo chat.

---

## 1. Visão Geral

O Batata Top é um aplicativo mobile desenvolvido com **Expo (SDK 54)** e **React Native**. Utiliza **Expo Router v6** para navegação baseada em arquivos (file-based routing) e **Supabase** como Backend-as-a-Service.

O backend compartilhado (pagamentos + push de pedidos) está no site **Next.js** hospedado na **Vercel** (`https://batatatop.vercel.app`). Repositório local: `C:\Users\SnyX\Documents\Sites\Site-da-mara`.

### Principais Funcionalidades

- **Home / Tela Inicial (`app/index.js`)**: Destaques, cupons de desconto e acesso rápido ao cardápio. Inclui componente de cópia de cupom com feedback visual/haptics.
- **Cardápio (`app/cardapio.js`)**: Listagem de produtos com filtros por categoria e busca textual.
- **Produto (`app/produto/[id].js`)**: Detalhe do produto com seleção de adicionais e observações.
- **Carrinho (`app/cart.js`)**: Visualização, edição de quantidades e remoção de itens.
- **Checkout (`app/checkout.tsx`)**: Fluxo completo de finalização de pedido — endereço, tipo de entrega (delivery ou retirada), método de pagamento (Dinheiro, PIX, Cartão de Crédito, Cartão de Débito), integração com Mercado Pago (Checkout Transparente) e cartões salvos. Ao concluir, chama `notifyAdminNewOrder(orderId)`.
- **Pedidos (`app/pedidos.js` + `app/pedidos/[id].js`)**: Histórico de pedidos do usuário com detalhe por pedido.
- **Perfil (`app/profile.js`)**: Dados do usuário, endereço padrão, método de pagamento preferido, cartões salvos e logout. Sub-telas em `app/profile-data.js` e `app/profile-security.js`.
- **Endereços (`app/addresses.js`)**: Gestão de endereços com integração ViaCEP e validação geográfica (somente Iacanga-SP).
- **Admin (`app/admin/`)**: Painel administrativo com dashboard, gestão de pedidos, produtos, cupons, promoções, caixa, feedbacks e imagens.
- **Push de novo pedido (admin)**: Notificação **real do sistema** (Expo Push) — funciona com app fechado. Mostra cliente, itens e adicionais; toque abre `/admin/pedidos`.
- **Autenticação (`app/auth/`)**: Telas de login (`login.js`), cadastro (`register.js`), autenticação via telefone (`telefone.js`) e código (`codigo.js`) via Supabase Auth.

---

## 2. Estrutura de Arquivos

```
batata-top/                          # App mobile (este repositório)
├── app/
│   ├── _layout.js                   # Layout raiz + AdminPushRegistration
│   ├── index.js                     # Home
│   ├── cardapio.js
│   ├── cart.js
│   ├── checkout.tsx                 # Finaliza pedido + notifyAdminNewOrder()
│   ├── pedidos.js
│   ├── addresses.js
│   ├── profile.js
│   ├── profile-data.js
│   ├── profile-security.js
│   ├── auth/                        # login.js, register.js, codigo.js, telefone.js
│   ├── produto/[id].js
│   ├── pedidos/[id].js
│   ├── hooks/                       # useProdutos.js, useProductRanking.js, usePedidos.js, useGeolocationWithMaps.js, usePlacesAutocomplete.js
│   └── admin/
│       ├── _layout.js
│       ├── index.js                 # Re-registra push token ao abrir painel
│       ├── pedidos.js               # Polling 10s
│       ├── produtos.js, cupons.js, promocoes.js
│       ├── caixa.js                 # Polling 30s
│       ├── feedbacks.js, imagens.js
├── components/
│   ├── AddressCard.js
│   ├── AddressModal.js
│   ├── AdminPushRegistration.js     # Registro Expo Push + deep link ao tocar
│   ├── AnimatedSplash.js
│   ├── AuthBottomSheet.tsx
│   ├── BannerCarousel.js
│   ├── EntrarBanner.tsx
│   ├── HelpModal.js
│   ├── LogoutRememberModal.js
│   ├── MapSelector.tsx
│   └── ThemedAlert.js
├── constants/theme.js
├── data/produtos.js                 # LEGADO — mock; produção usa Supabase
├── utils/
│   ├── addressHelpers.js
│   ├── cartStore.js
│   ├── authSession.js               # Soft-logout: ver seção 11
│   ├── mercadoPago.js
│   ├── usePaymentCards.ts
│   ├── paymentPrefs.js
│   ├── pendingAddress.js
│   ├── notificationSound.js         # Som new_order.mp3 (foreground)
│   ├── pushNotifications.js         # Permissões, canal Android, token, listeners
│   ├── notifyNewOrder.js            # Chama Edge Function ou Vercel API
│   ├── orderNotificationContent.js  # Formato título/corpo da push
│   ├── isAdmin.js                   # isAdminUser(user)
│   └── supabase.js
├── supabase/
│   ├── migrations/
│   │   └── 20250629120000_admin_push_tokens.sql
│   └── functions/
│       └── notify-admin-order/      # Edge Function (alternativa à Vercel)
├── server/api/
│   └── notify-new-order.js          # Cópia legada CommonJS (referência)
├── assets/
│   ├── banner.png
│   └── sounds/new_order.mp3
├── supabaseConfig.js
├── app.json                         # Plugin expo-notifications configurado
├── .env
└── package.json                     # inclui expo-notifications, expo-device

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

**Carrinho (`utils/cartStore.js`):** Observer pattern + hook `useCart()`. `cartItemId` = `${product.id}-${adIds}-${observacoes}`.

**Backend:** Hooks em `app/hooks/` (`useProdutos.js`, `useProductRanking.js`, `usePedidos.js`, `useGeolocationWithMaps.js`, `usePlacesAutocomplete.js`).

**Cartões (`utils/usePaymentCards.ts`):** Tokenização client-side + tabela `payment_cards`.

**Preferências (`utils/paymentPrefs.js`):** Método/cartão preferido via `expo-secure-store`.

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
2. Cliente finaliza checkout (app/checkout.tsx)
3. notifyAdminNewOrder(orderId) é chamado
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
| `app/checkout.tsx` | `notifyAdminNewOrder(created.id)` após insert |
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

- **Entrega:** Somente **Iacanga-SP** (`app/addresses.js` + ViaCEP).
- **Tipo de entrega:** `"delivery"` ou `"retirada"`.
- **Cupons:** Validados no checkout; salvos em `orders.discount_amount` + `coupon_code`.
- **Adicionais:** Na tela do produto; `cartItemId` distingue combinações.
- **Pagamento:** Access Token MP só no servidor Vercel.
- **Admin:** Sem guard de rota em `/admin` — reforçar com RLS/`user_metadata.role` em produção.

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

## 11. Padrão: "Continuar como [nome]" / Soft-Logout

Usado no fluxo "Sim, lembrar minha conta" (`app/profile.js`) + "Continuar como {nome}" (`components/AuthBottomSheet.tsx`, Estado B). Documentado aqui porque a causa raiz é contra-intuitiva e fácil de reintroduzir.

### O bug original

Sintoma: clicar em "Continuar como [nome]" sempre caía no fallback de login (`Invalid Refresh Token: Refresh Token Not Found`), mesmo testando poucos segundos depois do logout — não era expiração de token (refresh token do Supabase **não expira por tempo**, só é invalidado por uso ou revogação).

Causa raiz real: **não existe scope de `supabase.auth.signOut()` que deixe a sessão atual viva no servidor.** `scope: 'global'` (padrão) revoga a sessão em *todos* os dispositivos; `scope: 'local'` revoga só a sessão atual — mas revoga. Não tem meio-termo. Um comentário antigo no código dizia que `'local'` "não revoga o token no servidor" — isso está **errado** (checar doc oficial antes de confiar nesse tipo de suposição de novo).

Ou seja: qualquer `signOut()` chamado no momento do "Sim, lembrar" matava exatamente o refresh token que o app tentaria reusar depois. Reescrever a lógica de refresh/setSession não resolve — o problema é a premissa (guardar um refresh token de uma sessão que você mesmo acabou de revogar).

### A solução: soft-logout (não existe logout de verdade aqui)

`utils/authSession.js` centraliza:
- `SOFT_LOGOUT_KEY` — flag local (`AsyncStorage`) que faz a UI **fingir** deslogado.
- `getEffectiveSession()` — retorna `null` se a flag estiver ligada, senão retorna a sessão real do Supabase.
- `subscribeAuthUiChange` / `emitAuthUiChange` — pub/sub em memória. Necessário porque ligar/desligar a flag **não** passa por `supabase.auth.onAuthStateChange` (a sessão real nunca muda nesse fluxo) — sem isso, telas que já estão montadas há tempo (o `_layout.js` raiz, que nunca desmonta) não saberiam que precisam reconferir o login.
- `initAuthStateListener()` — chamada **uma vez** no `_layout.js` raiz. Escuta `SIGNED_IN` real (não importa por onde: e-mail, telefone, Google, etc.) e desliga `SOFT_LOGOUT_KEY` sozinha se estiver ligada. Sem isso, um login de verdade feito enquanto o soft-logout está ativo deixava a flag presa em `'true'` pra sempre, e telas que checam a flag antes de tudo (`profile.js`) continuavam mostrando deslogado mesmo com sessão nova e válida.

**"Sim, lembrar" (`profile.js`, `handleRememberAccount`):** NÃO chama `signOut()`. Só salva `{name, email, phone}` (pra exibir "Continuar como [nome]") em `SAVED_USER_KEY`, liga `SOFT_LOGOUT_KEY`, emite `emitAuthUiChange()`. A sessão real do Supabase continua 100% viva e se renovando sozinha (`autoRefreshToken: true` em `supabaseConfig.js`).

**"Continuar como" (`AuthBottomSheet.tsx`, `handleContinuarComo`):** só desliga `SOFT_LOGOUT_KEY`, emite o evento, confirma com `getEffectiveSession()`/`getSession()` que a sessão real ainda existe, navega. Sem `refreshSession`, sem `setSession` — não tem token nenhum pra restaurar porque nada foi destruído.

**"Esquecer conta" (`profile.js`, `handleForgetAccount`):** esse sim é logout de verdade — `signOut()` padrão (`scope: 'global'`), limpa `SAVED_USER_KEY` **e** `SOFT_LOGOUT_KEY`.

### Bug relacionado: `onAuthStateChange` pisando no soft-logout

Sintoma: `profile.js` respeitava o soft-logout certinho, mas `pedidos.js`, `addresses.js` e `_layout.js` voltavam a mostrar "logado" sozinhos depois de um tempo, mesmo com `SOFT_LOGOUT_KEY` ligada — sem nenhuma ação do usuário.

Causa raiz: essas telas tinham um segundo listener que setava o usuário **direto do `session` recebido no callback** do `onAuthStateChange`, ignorando a flag:

```js
// ERRADO — ignora o soft-logout
supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
```

A sessão real do Supabase se renova sozinha em background (`autoRefreshToken: true`), o que dispara `onAuthStateChange` (ex: evento `TOKEN_REFRESHED`) mesmo com o soft-logout ligado — e esse handler reaplicava a sessão real por cima. `profile.js` nunca teve esse listener direto (só reconfere a flag no `useFocusEffect`), por isso foi o único que ficou certo.

**Correção:** o callback do `onAuthStateChange` nunca deve usar o `session` recebido pra decidir a UI — ele serve só de **gatilho** pra rechamar a função que passa por `getEffectiveSession()`:

```js
// CERTO — session do callback é só o gatilho, não a fonte de verdade
const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
  refreshEffectiveUser(); // função que chama getEffectiveSession() internamente
});
```

### Bug relacionado: `SIGNED_IN` falso na reidratação de sessão (cold start) — `utils/authSession.js`

Sintoma: usuário clica em "Sim, lembrar", fecha o app de vez (mata o processo) e abre de novo — esperava ver a tela deslogada e precisar clicar em "Continuar como [nome]", mas o app já abre logado sozinho, sem nenhuma ação.

Causa raiz: `initAuthStateListener()` (chamado uma vez no `_layout.js` raiz) escuta `SIGNED_IN` pra desligar `SOFT_LOGOUT_KEY` quando um login de verdade acontece (ver acima). O problema é que o evento `SIGNED_IN` **não dispara só em login interativo real** — o Supabase também reporta `SIGNED_IN` quando reidrata a sessão persistida do `AsyncStorage` ao iniciar o app, mesmo que o usuário não tenha feito nada. Esse é o **primeiro** evento que o listener recebe depois de assinar `onAuthStateChange`.

Sem tratar isso, todo cold-start com o soft-logout ligado disparava esse `SIGNED_IN` de reidratação, o listener achava que era um login de verdade, desligava a flag sozinho, e a pessoa aparecia logada de novo sem nunca ter tocado em "Continuar como".

**Correção:** ignorar explicitamente o primeiro evento recebido depois de assinar o listener — ele é sempre a reidratação/estado atual, nunca uma transição real:

```js
export function initAuthStateListener() {
  if (listenerInitialized) return;
  listenerInitialized = true;

  // O primeiro evento após assinar é sempre a reidratação da sessão do
  // AsyncStorage no cold start, não um login real — precisa ser ignorado.
  let isInitialEvent = true;

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (isInitialEvent) {
      isInitialEvent = false;
      return;
    }

    if (event === 'SIGNED_IN' && session) {
      const soft = await AsyncStorage.getItem(SOFT_LOGOUT_KEY);
      if (soft === 'true') {
        await AsyncStorage.setItem(SOFT_LOGOUT_KEY, 'false');
        emitAuthUiChange();
      }
    }
  });
}
```

### Checklist pra qualquer tela nova que decide "logado ou não" pra UI

- [ ] Nunca chamar `supabase.auth.getSession()` direto pra gate de UI — usar `getEffectiveSession()` de `utils/authSession.js`.
- [ ] No `useEffect` de auth, assinar `subscribeAuthUiChange()` além de `onAuthStateChange` (e limpar os dois no cleanup).
- [ ] **No callback do `onAuthStateChange`, nunca usar o `session` recebido pra setar o usuário/UI diretamente** — ele só deve disparar a função que reaplica a sessão real por cima do soft-logout assim que o token se renova sozinho em background.
- [x] **Em `initAuthStateListener()`, sempre ignorar o primeiro evento recebido** (`isInitialEvent`) — o Supabase reporta a reidratação da sessão no cold start como `SIGNED_IN`, e sem esse guard o soft-logout é desligado sozinho toda vez que o app abre.
- [ ] Já aplicado em: `app/_layout.js`, `app/profile.js`, `app/pedidos.js`, `app/addresses.js`, `components/AuthBottomSheet.tsx`, `components/EntrarBanner.tsx`.

---

## 12. Alertas — sempre `ThemedAlert`, nunca `Alert.alert`

Nunca usar o `Alert.alert` nativo do `react-native` (alerta cinza do sistema, foge do visual do app). Sempre usar `components/ThemedAlert.js`:

```js
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
```

- **`showThemedAlert(title, message, buttons?)`** — mesma assinatura do `Alert.alert` (`buttons` aceita `style: 'cancel' | 'destructive'`), é só trocar o nome da chamada.
- **`<ThemedAlertHost />`** precisa estar montado na árvore de qualquer tela que chame `showThemedAlert` (é ele quem renderiza o modal — sem ele montado, a chamada só loga um warning e não mostra nada). Padrão singleton: uma vez montado num ponto da árvore, `showThemedAlert` funciona de qualquer componente/arquivo, mesmo sem prop-drilling.
- Se a tela tem mais de um `return` (branches tipo `screen === 'x' ? <A/> : <B/>` retornando cedo), o Host precisa estar em **cada** branch que pode disparar alerta — já aplicado assim em `app/addresses.js`.
- Já aplicado em: `app/addresses.js`.

---

## 12.1. Card de Destaques (`DestaqueMiniCard`, `app/index.js`) — Imagem sem corte

**Card:** `miniCard` não tem mais borda amarela de destaque (`borderColor: COLORS.primary`) — ficou com borda neutra padrão (`COLORS.border`, 1px), igual ao resto dos cards do app.

**Imagem (`miniImg`):** trocado de `resizeMode="cover"` (padrão implícito) para `resizeMode="contain"`, dentro de um wrapper (`miniImgWrapper`) com `backgroundColor: COLORS.backgroundElevated` e altura fixa (130). Isso garante que a foto do produto sempre apareça **inteira**, sem cortar bordas e sem dar zoom — independente da proporção original da imagem. Se a foto não preencher 100% da largura/altura do wrapper, sobra um respiro com a cor de fundo elevada (não fica branco/preto feio).

- Esse padrão (wrapper com bg + `Image` em `contain`) é o preferido pra qualquer card novo onde a imagem do produto precisa aparecer completa. Pra cards tipo `ProdutoCard` (Mais Pedidos) que usam `cover` de propósito (overlay + rank badge por cima), manter `cover` — a decisão é caso a caso, não uma regra global.

---

## 13. Informações para Manutenção

- **Design System:** `constants/theme.js` — nunca hardcodar cores/espaçamentos.
- **Imagens:** `useProdutos.js` completa URL do bucket se `image_url` não começa com `http`.
- **TypeScript:** `checkout.tsx`, `usePaymentCards.ts` — resto JavaScript.
- **Sem NativeWind:** Estilização 100% `StyleSheet` (README legado menciona Tailwind).
- **`utils/supabase.js`:** Re-export; prefira `supabaseConfig.js`.
- **`data/produtos.js`:** Mock legado.
- **Dois repositórios:** App = `batata-top` | Site/API = `Site-da-mara`. Alterações em push ou MP no site exigem deploy Vercel separado.
- **Testar push:** Celular físico + admin logado + permissão aceita + tabela `admin_push_tokens` criada + site deployado.

# CLAUDE.md

Behavior guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
