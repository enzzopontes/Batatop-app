import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface FooterInsetsOptions {
  extraPadding?: number;
  minBottom?: number;
}

/**
 * Hook reutilizável de insets para rodapés fixos e modais.
 * Garante respiro visível em celulares com navegação por 3 botões (insets.bottom ~48px)
 * e com barra de gestos (insets.bottom ~20px), além de fallback seguro para insets zero.
 */
export function useFooterInsets(options?: FooterInsetsOptions) {
  const insets = useSafeAreaInsets();
  const extraPadding = options?.extraPadding ?? 16;
  const minBottom = options?.minBottom ?? 16;

  const paddingBottom = Math.max(insets.bottom + extraPadding, minBottom + extraPadding);

  return {
    insets,
    paddingBottom,
    bottomInset: insets.bottom,
  };
}

export default useFooterInsets;
