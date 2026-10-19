import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Retorna o inset inferior real da tela com um respiro mínimo garantido.
 * Cobre celulares Android com navegação por 3 botões (insets.bottom ~48-56px),
 * barra de gestos (insets.bottom ~16-24px), iOS home indicator e fallback para insets zero.
 */
export function useBottomInset(minPadding: number = 16): number {
  const insets = useSafeAreaInsets();
  const bottom = insets?.bottom ?? 0;
  return Math.max(bottom, minPadding);
}

export default useBottomInset;
