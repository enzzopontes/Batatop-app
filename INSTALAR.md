# 🥔 Batata Top — Instalação Correta

## ⚠️ IMPORTANTE: Apague a pasta atual e extraia o ZIP de novo

O `npm audit fix --force` corrompeu as dependências (atualizou o Expo para SDK 56).
Siga os passos abaixo do zero.

---

## Passo a passo

### 1. Delete a pasta `batata-top` inteira e extraia o ZIP novamente

### 2. Abra o terminal na pasta e rode APENAS isso:

```bash
npx expo install expo-router expo-constants expo-linking expo-font expo-splash-screen expo-status-bar @expo/metro-runtime react-native-safe-area-context react-native-screens
```

### 3. Inicie o app:
```bash
npx expo start
```

---

## ❌ NUNCA rode estes comandos neste projeto:
- `npm audit fix --force`  → quebra o Expo, sobe para SDK 56
- `npm audit fix`          → pode alterar versões de peer deps
- `npm update`             → idem

Os avisos de `npm audit` em projetos Expo são normais e não afetam o funcionamento.
Ignore-os com segurança.
