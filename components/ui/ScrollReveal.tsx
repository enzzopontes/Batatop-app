import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Dimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * Entrada em cascata de cima para baixo (scroll reveal), disparo único.
 *
 * Contrato (idêntico ao Site): opacity 0 -> 1 e translateY -18 -> 0, 500ms,
 * Easing.out(Easing.cubic), stagger 60ms entre itens do mesmo lote (teto 300ms).
 * Anima somente opacity/transform (UI thread, zero layout shift).
 *
 * Como funciona:
 * - Cada tela cria um RevealScope (useRevealScope). Os itens se registram nele.
 * - O item mede a própria posição na janela (measureInWindow) no layout e a cada
 *   scroll (throttle de 64ms). Entrou na área visível -> anima 1 vez.
 * - O conjunto de chaves já reveladas vive em memória por NOME de tela
 *   (module-level). Remontar a tela, reciclar célula de FlatList ou voltar para
 *   uma aba nunca reanima item já revelado.
 * - Item que ficou acima da tela (scroll programático) aparece sem animar.
 * - Failsafe: se a medição falhar, o item é mostrado após 2.5s (nunca fica preso
 *   com opacity 0). prefers-reduced-motion (useReducedMotion): sem movimento.
 */

const STAGGER_MS = 60;
const MAX_DELAY_MS = 300;
const DEFAULT_DISTANCE_PX = 18;
const DEFAULT_DURATION_MS = 500;
const BOTTOM_MARGIN_PX = 40;
const SCROLL_THROTTLE_MS = 64;
const BATCH_WINDOW_MS = 150;
const FAILSAFE_MS = 2500;

/** Use em FlatList/SectionList junto com `scope.onViewableItemsChanged`. */
export const REVEAL_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 } as const;

type Checker = () => void;

export interface RevealScope {
  readonly name: string;
  isRevealed: (key: string) => boolean;
  markRevealed: (key: string) => void;
  /** Delay de stagger do próximo item revelado no mesmo lote. */
  claimDelay: () => number;
  register: (check: Checker) => () => void;
  /** Reavalia itens pendentes (throttle). Passe como onScroll de ScrollView/FlatList. */
  onScroll: () => void;
  /** Passe como onViewableItemsChanged de FlatList/SectionList (referência estável). */
  onViewableItemsChanged: () => void;
}

/** Normaliza a chave para slug ASCII minúsculo (a-z, 0-9, -, _): remove acentos e troca o resto por "-". */
export function toRevealSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const revealedByScreen = new Map<string, Set<string>>();

function createScope(name: string): RevealScope {
  let revealed = revealedByScreen.get(name);
  if (!revealed) {
    revealed = new Set<string>();
    revealedByScreen.set(name, revealed);
  }
  const seen = revealed;
  const checkers = new Set<Checker>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  let batchCount = 0;

  const flush = () => {
    flushTimer = null;
    Array.from(checkers).forEach((check) => check());
  };
  const notify = () => {
    if (flushTimer == null) flushTimer = setTimeout(flush, SCROLL_THROTTLE_MS);
  };

  return {
    name,
    isRevealed: (key) => seen.has(key),
    markRevealed: (key) => {
      seen.add(key);
    },
    claimDelay: () => {
      const delay = Math.min(batchCount * STAGGER_MS, MAX_DELAY_MS);
      batchCount += 1;
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        batchCount = 0;
        batchTimer = null;
      }, BATCH_WINDOW_MS);
      return delay;
    },
    register: (check) => {
      checkers.add(check);
      return () => {
        checkers.delete(check);
      };
    },
    onScroll: notify,
    onViewableItemsChanged: notify,
  };
}

/** Um scope por tela. `name` identifica a tela no registro de itens já revelados. */
export function useRevealScope(name: string): RevealScope {
  const ref = useRef<RevealScope | null>(null);
  if (ref.current === null) ref.current = createScope(name);
  return ref.current;
}

export interface ScrollRevealProps {
  scope?: RevealScope | null;
  /** Identificador estável do item (ex.: `home:produto:${id}`). */
  revealKey: string;
  /** Atraso extra (ms) somado ao stagger automático. */
  delayMs?: number;
  distancePx?: number;
  durationMs?: number;
  /** Estilo de layout do slot externo (largura, flex...). O conteúdo preenche o slot. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function ScrollReveal({
  scope,
  revealKey,
  delayMs = 0,
  distancePx = DEFAULT_DISTANCE_PX,
  durationMs = DEFAULT_DURATION_MS,
  style,
  children,
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();
  const slug = toRevealSlug(revealKey);
  const alreadyRevealed = reduceMotion || !scope || scope.isRevealed(slug);

  const progress = useSharedValue(alreadyRevealed ? 1 : 0);
  const hostRef = useRef<View>(null);
  const doneRef = useRef(alreadyRevealed);

  const reveal = useCallback(
    (animate: boolean) => {
      if (doneRef.current || !scope) return;
      doneRef.current = true;
      scope.markRevealed(slug);
      if (!animate) {
        progress.value = 1;
        return;
      }
      const delay = Math.min(scope.claimDelay() + delayMs, MAX_DELAY_MS);
      progress.value = withDelay(
        delay,
        withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) }),
      );
    },
    [scope, slug, delayMs, durationMs, progress],
  );

  const check = useCallback(() => {
    if (doneRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    host.measureInWindow((_x, y, w, h) => {
      if (doneRef.current) return;
      if (w === 0 && h === 0) return; // ainda sem layout
      const windowHeight = Dimensions.get('window').height;
      if (y + h <= 0) {
        reveal(false); // já ficou acima da tela
      } else if (y < windowHeight - BOTTOM_MARGIN_PX) {
        reveal(true);
      }
    });
  }, [reveal]);

  useEffect(() => {
    if (doneRef.current || !scope) return;
    const unregister = scope.register(check);

    // Failsafe: medição que nunca resolve não pode deixar o item invisível.
    const timer = setTimeout(() => {
      if (doneRef.current) return;
      const host = hostRef.current;
      if (!host) {
        reveal(false);
        return;
      }
      host.measureInWindow((_x, y, w, h) => {
        if (doneRef.current) return;
        const windowHeight = Dimensions.get('window').height;
        if ((w === 0 && h === 0) || y < windowHeight) {
          reveal(false);
        }
      });
    }, FAILSAFE_MS);

    return () => {
      clearTimeout(timer);
      unregister();
    };
  }, [scope, check, reveal]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -distancePx }],
  }));

  return (
    <View ref={hostRef} style={style} onLayout={check} collapsable={false}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}

export default ScrollReveal;
