# 🥔 Batata Top — App Delivery (Expo SDK 54)

App mobile oficial do **Batata Top**, delivery de batatas recheadas gigantes em Iacanga-SP.

---

## ⚡ Setup em 3 passos

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o servidor de desenvolvimento
npx expo start

# 3. Escanear o QR Code com o Expo Go (iOS/Android)
```

---

## 📁 Estrutura do Projeto

```
batata-top/
├── app/
│   ├── _layout.js          # Layout raiz (Header com logo e localização)
│   ├── index.js            # Home — slogan, destaques e CTA
│   ├── cardapio.js         # Cardápio — filtros por categoria + FlatList
│   └── produto/
│       └── [id].js         # Detalhes + botão "Pedir via WhatsApp"
├── data/
│   └── produtos.js         # Dados mock — produtos e categorias
├── app.json                # Config Expo SDK 54
├── babel.config.js         # Babel com plugin nativewind/babel
├── tailwind.config.js      # Config Tailwind/NativeWind
├── metro.config.js         # Config Metro bundler
└── package.json            # Dependências alinhadas ao SDK 54
```

---

## 🛠️ Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Expo SDK 54 (Managed Workflow) |
| Navegação | expo-router v4 (File-based) |
| Estilização | NativeWind v2 (Tailwind CSS) |
| Linguagem | JavaScript puro (sem TypeScript) |
| React | 18.3.1 |
| React Native | 0.76.0 |

---

## 📱 Fluxo de Telas

```
Home (/)
  └── Explorar Cardápio
        └── Cardápio (/cardapio)
              └── [Produto] (/produto/[id])
                    └── 💬 Pedir via WhatsApp → wa.me
```

---

## 🔧 Personalização

### Número do WhatsApp
Edite o arquivo `app/produto/[id].js` e substitua:
```js
const WHATSAPP_NUMBER = '5516999999999'; // ← Número real do Batata Top
```

### Adicionar produtos
Edite `data/produtos.js` e adicione um novo objeto ao array `produtos`:
```js
{
  id: '8',
  categoria: 'Batatas Recheadas',
  nome: 'Batata Frango Buffalo',
  descricao: 'Descrição apetitosa aqui...',
  ingredientes: ['Batata grande', 'Frango', 'Molho buffalo'],
  preco: 'R$ 32,90',
  precoNum: 32.90,
  emoji: '🌶️',
  cor: '#EF4444',
  destaque: false,
  imagem: 'https://...url-da-foto...',
}
```

---

## 🎨 Identidade Visual

| Cor | Hex | Uso |
|-----|-----|-----|
| Laranja Vibrante | `#F97316` | CTA, header, preço |
| Creme Suave | `#FFF7ED` | Fundo principal |
| Creme Escuro | `#FED7AA` | Cards secundários |
| Texto Escuro | `#1C1917` | Títulos |
| Texto Médio | `#78716C` | Descrições |

---

## ✅ Checklist antes de publicar

- [ ] Atualizar `WHATSAPP_NUMBER` com o número real
- [ ] Substituir imagens mock por fotos reais dos produtos
- [ ] Revisar preços no `data/produtos.js`
- [ ] Adicionar ícone real em `assets/icon.png`
- [ ] Testar fluxo completo no Expo Go
