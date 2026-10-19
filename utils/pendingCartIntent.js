// Intenção de adicionar item(ns) ao carrinho, guardada só em memória
// (variável de módulo JS) — NUNCA AsyncStorage. Isso é proposital.
//
// Por quê: quando o usuário deslogado clica "Adicionar" no produto/[id].js,
// o AuthBottomSheet abre (é global, montado em _layout.js — não navega pra
// lugar nenhum). Mas alguns fluxos de login (celular, e-mail, cadastro)
// saem pra outras telas (telefone.js, codigo.js, login.js) até completar.
// Guardar isso como state do componente do produto morreria nessa
// navegação; memória de módulo sobrevive porque é o mesmo processo JS.
//
// Ao mesmo tempo, TEM que sumir sozinha se o app for morto de verdade e
// reaberto — nesse caso a memória do módulo reseta a zero automaticamente,
// sem precisar de nenhuma limpeza manual. É exatamente o comportamento
// pedido: sobrevive a background (esperar OTP), não sobrevive a kill.
let pendingItems = null;

export function setPendingCartIntent(items) {
  pendingItems = items && items.length ? items : null;
}

export function getPendingCartIntent() {
  return pendingItems;
}

export function clearPendingCartIntent() {
  pendingItems = null;
}
