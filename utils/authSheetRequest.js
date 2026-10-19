// Pede pra abrir o AuthBottomSheet global (montado uma vez em _layout.js,
// como sibling do <Stack> — ver EntrarBanner) a partir de qualquer tela,
// sem precisar subir a prop setAuthSheetVisible por todo o Stack.
//
// Mesmo padrão pub/sub do authSession.js: quem quer abrir o sheet (ex:
// produto/[id].js, no gate de login do "Adicionar") chama requestAuthSheet();
// o _layout.js assina uma vez no mount e reage virando authSheetVisible=true.
const listeners = new Set();

export function subscribeAuthSheetRequest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function requestAuthSheet() {
  listeners.forEach((fn) => fn());
}
