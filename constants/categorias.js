// ─── Categorias (ícones 3D locais) ────────────────────────────────────────────
// Fonte única de verdade: usada tanto pela grid 3x2 da home quanto pela
// barra flutuante (components/CategoriasFlutuantes.js). Editar aqui é o
// suficiente pra atualizar as duas telas ao mesmo tempo.
//
// Grid 3x2:
// [Cardápio]  [Batatas]  [Cupons]
// [Macarrão]  [Bebidas]  [Ver mais]
// TODO: "Ver mais" deveria ir pra uma tela "Todas as categorias" separada
// (diferente do cardápio filtrado das outras). Não achei essa rota no projeto
// — por enquanto aponta pra /cardapio também. Trocar `route` abaixo se existir.
export const CATEGORIAS = [
  { label: 'Cardápio',        icon: require('../assets/icones3d/icone cardapio.png'),         route: '/cardapio' },
  { label: 'Batatas',         icon: require('../assets/icones3d/icone batata.png'),          cat: 'Batatas'  },
  { label: 'Macarrão',        icon: require('../assets/icones3d/icone macarrao.png'),         cat: 'Macarrão' },
  { label: 'Bebidas',         icon: require('../assets/icones3d/icone bebidas geladas.png'),  cat: 'Bebidas'  },
  { label: 'Cupons',          icon: require('../assets/icones3d/icone cupom.png'),           route: '/cupons'},
  { label: 'Ver mais',        icon: require('../assets/icones3d/iconetodos.png'),            route: '/cardapio', iconOnly: true },
];

// ─── Navegação de uma categoria (compartilhada entre grid e barra flutuante) ──
export function handleCategoriaPress(router, cat) {
  if (cat.disabled) return;
  if (cat.route) return router.push(cat.route);
  if (cat.cat) return router.push({ pathname: '/cardapio', params: { categoria: cat.cat } });
}
