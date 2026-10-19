/**
 * addressHelpers.js
 *
 * Campos "virtuais" usados só na UI — nenhum deles existe na tabela
 * `addresses` do Supabase (compartilhada com o site). NUNCA gravar
 * `icon`/`full_address` no banco; são sempre computados a partir de
 * `label`/`street`/`number`/`neighborhood`/`city`/`state`.
 *
 * `is_default` (coluna real) é o que a UI trata como "endereço ativo".
 */

// label salvo no banco: 'casa' | 'trabalho' | null (null/qualquer outro = "Outro")
export function getAddressIcon(label) {
  if (label === 'casa') return 'home';
  if (label === 'trabalho') return 'briefcase';
  return 'time-outline';
}

export function getAddressLabelText(label) {
  if (label === 'casa') return 'Casa';
  if (label === 'trabalho') return 'Trabalho';
  return 'Outro';
}

export function buildFullAddress(address) {
  return `${address.street}, ${address.number} - ${address.neighborhood}, ${address.city} - ${address.state}`;
}
