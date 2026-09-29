# Batata Top — Guia Rápido (versão leve)

> Use esta versão pra ajustes pontuais (estilo, texto, bug pequeno, componente isolado). Pra mexer em auth/soft-logout, pagamento, push notification ou keyboard controller, usa o CLAUDE.md completo — essas áreas têm gotchas documentados que essa versão não cobre.

---

## Regras de resposta
- Não resuma este arquivo, só confirme curto e aplique.
- Manda só o trecho alterado, nunca o arquivo inteiro, a menos que eu peça.
- Sem preâmbulo, direto na solução.
- Sem headers se a resposta for só um bloco de código ou 1-2 frases.
- Se já existe um padrão óbvio, não pergunta — assume e segue.

## Stack
Expo (SDK 54) + React Native, Expo Router v6 (file-based routing), Supabase. Backend de pagamento/push é site Next.js separado (`Site-da-mara`, deploy `batatatop.vercel.app`). Estilização: **só `StyleSheet` + `constants/theme.js`** — sem NativeWind/Tailwind. Paleta: Amarelo `#FFB800`, Vermelho `#E61E2A`, fundo branco. TypeScript só em `checkout.tsx` e `usePaymentCards.ts`, resto é JS.

## Estrutura principal
```
app/
├── _layout.js          # Header, TabBar, contexts, KeyboardProvider
├── index.js            # Home
├── cardapio.js
├── cart.js
├── checkout.tsx         # Finaliza pedido
├── pedidos.js / pedidos/[id].js
├── produto/[id].js
├── profile.js / profile-data.js / profile-security.js
├── addresses.js
├── auth/                # login, register, telefone, codigo
└── admin/                # dashboard, pedidos, produtos, cupons, caixa
components/               # AddressCard, ThemedAlert, etc.
utils/                    # cartStore, authSession, mercadoPago, isAdmin, supabase
constants/theme.js         # cores/espaçamentos — nunca hardcodar
```

## Padrões rápidos
- **Alertas:** sempre `showThemedAlert()` de `components/ThemedAlert.js`, nunca `Alert.alert` nativo. Precisa ter `<ThemedAlertHost />` montado na tela.
- **Carrinho:** `cartItemId = ${product.id}-${adIds}-${observacoes}` — combinação de adicionais gera item distinto.
- **Imagens de produto (cards novos):** wrapper com `backgroundColor: COLORS.backgroundElevated` + `Image resizeMode="contain"` pra não cortar. Exceção: `ProdutoCard` (ranking) usa `cover` de propósito.
- **Header/scroll:** usar `useScrollHandler` e `useHeaderHeight` de `./_layout`, não reinventar.

## Banco (tabelas mais usadas)
`products`, `adicionais`/`product_adicionais`, `orders`, `order_items`, `addresses`, `payment_cards`, `coupons`, `store_settings`.

## Cuidado
- Não rodar `npm audit fix --force` (quebra o Expo).
- Access Token Mercado Pago e `service_role` do Supabase: **só no servidor (Vercel)**, nunca no app.

---

*Pra contexto completo de auth/soft-logout, push, keyboard controller e histórico de bugs, pede pra eu ler o CLAUDE.md completo.*
