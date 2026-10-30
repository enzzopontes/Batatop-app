import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACING, SHADOWS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HOME_PROD_GRID_GAP = 14;
const HOME_PROD_CARD_WIDTH = (SCREEN_WIDTH - SPACING[6] * 2 - HOME_PROD_GRID_GAP) / 2;
const HOME_PROD_IMG_HEIGHT = HOME_PROD_CARD_WIDTH * 0.9;

/**
 * Componente atômico básico de Skeleton animado com pulso contínuo
 */
export function Skeleton({ width, height, borderRadius = RADIUS.md, style }) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#ECE7E0',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Skeleton para o carrossel horizontal de Destaques (Home)
 */
export function HomeDestaquesSkeleton() {
  return (
    <View style={styles.miniCarousel}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.miniCard}>
          <Skeleton width="100%" height={130} borderRadius={0} />
          <View style={styles.miniBody}>
            <View style={{ gap: 6 }}>
              <Skeleton width="85%" height={14} borderRadius={RADIUS.sm} />
              <Skeleton width="50%" height={12} borderRadius={RADIUS.sm} />
            </View>
            <View style={styles.miniFooter}>
              <Skeleton width={55} height={18} borderRadius={RADIUS.sm} />
              <Skeleton width={36} height={36} borderRadius={18} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para a grade de 2 colunas da Home (Mais Pedidos e Macarrão)
 */
export function HomeGridSkeleton({ count = 4 }) {
  return (
    <View style={styles.prodGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.prodCard}>
          <Skeleton width="100%" height={HOME_PROD_IMG_HEIGHT} borderRadius={0} />
          <View style={styles.prodInfo}>
            <View style={{ gap: 5 }}>
              <Skeleton width="85%" height={14} borderRadius={RADIUS.sm} />
              <Skeleton width="60%" height={11} borderRadius={RADIUS.sm} />
            </View>
            <View style={styles.prodTags}>
              <Skeleton width={42} height={14} borderRadius={RADIUS.sm} />
              <Skeleton width={32} height={14} borderRadius={RADIUS.sm} />
            </View>
            <View style={styles.prodFooter}>
              <Skeleton width={56} height={18} borderRadius={RADIUS.sm} />
              <Skeleton width={28} height={28} borderRadius={14} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para o Cardápio (grade de produtos)
 */
export function CardapioGridSkeleton({ count = 4 }) {
  return (
    <View style={styles.cardapioGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.cardapioCard}>
          <Skeleton width="100%" height={140} borderRadius={0} />
          <View style={styles.prodInfo}>
            <View style={{ gap: 5 }}>
              <Skeleton width="85%" height={14} borderRadius={RADIUS.sm} />
              <Skeleton width="60%" height={11} borderRadius={RADIUS.sm} />
            </View>
            <View style={styles.prodTags}>
              <Skeleton width={40} height={14} borderRadius={RADIUS.sm} />
              <Skeleton width={30} height={14} borderRadius={RADIUS.sm} />
            </View>
            <View style={styles.prodFooter}>
              <Skeleton width={55} height={18} borderRadius={RADIUS.sm} />
              <Skeleton width={28} height={28} borderRadius={14} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Detalhes do Produto (app/produto/[id].js)
 */
export function ProdutoDetalhesSkeleton() {
  return (
    <View style={styles.produtoScreen}>
      <Skeleton width="100%" height={260} borderRadius={0} />
      <View style={styles.produtoContent}>
        <View style={styles.produtoNomePrecoRow}>
          <Skeleton width="60%" height={24} borderRadius={RADIUS.sm} />
          <Skeleton width="28%" height={24} borderRadius={RADIUS.sm} />
        </View>
        <View style={{ gap: 6, marginVertical: SPACING[2] }}>
          <Skeleton width="95%" height={14} borderRadius={RADIUS.sm} />
          <Skeleton width="70%" height={14} borderRadius={RADIUS.sm} />
        </View>

        <View style={{ marginTop: SPACING[4], gap: SPACING[3] }}>
          <Skeleton width="40%" height={18} borderRadius={RADIUS.sm} />
          {[1, 2, 3].map((item) => (
            <View key={item} style={styles.adicionalItemSkeleton}>
              <View style={{ gap: 4, flex: 1 }}>
                <Skeleton width="60%" height={14} borderRadius={RADIUS.sm} />
                <Skeleton width="35%" height={12} borderRadius={RADIUS.sm} />
              </View>
              <Skeleton width={28} height={28} borderRadius={14} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.produtoFooter}>
        <Skeleton width={110} height={44} borderRadius={RADIUS.xl} />
        <Skeleton width={190} height={44} borderRadius={RADIUS.xl} />
      </View>
    </View>
  );
}

/**
 * Skeleton para Lista de Pedidos (app/pedidos.js)
 */
export function PedidosListSkeleton() {
  return (
    <View style={styles.pedidosContainer}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.pedidoCard}>
          <View style={styles.pedidoHeader}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={15} borderRadius={RADIUS.sm} />
              <Skeleton width="30%" height={12} borderRadius={RADIUS.sm} />
            </View>
            <Skeleton width={55} height={16} borderRadius={RADIUS.sm} />
          </View>
          <Skeleton width="100%" height={32} borderRadius={RADIUS.md} style={{ marginVertical: 8 }} />
          <View style={{ gap: 6, marginTop: 4 }}>
            <Skeleton width="75%" height={13} borderRadius={RADIUS.sm} />
            <Skeleton width="60%" height={13} borderRadius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Detalhes de um Pedido (app/pedidos/[id].js)
 */
export function PedidoDetalhesSkeleton() {
  return (
    <View style={styles.pedidoDetalhesContainer}>
      <View style={styles.pedidoDetalheCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={18} borderRadius={RADIUS.sm} />
            <Skeleton width="40%" height={13} borderRadius={RADIUS.sm} />
          </View>
        </View>
        <Skeleton width="100%" height={8} borderRadius={4} />
      </View>

      <View style={styles.pedidoDetalheCard}>
        <Skeleton width="40%" height={16} borderRadius={RADIUS.sm} style={{ marginBottom: 12 }} />
        <View style={{ gap: 10 }}>
          <Skeleton width="90%" height={14} borderRadius={RADIUS.sm} />
          <Skeleton width="80%" height={14} borderRadius={RADIUS.sm} />
        </View>
      </View>

      <View style={styles.pedidoDetalheCard}>
        <Skeleton width="35%" height={16} borderRadius={RADIUS.sm} style={{ marginBottom: 12 }} />
        <Skeleton width="85%" height={14} borderRadius={RADIUS.sm} />
      </View>
    </View>
  );
}

/**
 * Skeleton para Notificações (app/notifications.js)
 */
export function NotificationsSkeleton({ count = 4 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.notificationCard}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="55%" height={14} borderRadius={RADIUS.sm} />
              <Skeleton width={50} height={11} borderRadius={RADIUS.sm} />
            </View>
            <Skeleton width="90%" height={12} borderRadius={RADIUS.sm} />
            <Skeleton width="70%" height={12} borderRadius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Lista de Endereços (app/addresses.js)
 */
export function AddressesSkeleton({ count = 3 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.addressCard}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <View style={{ flex: 1, gap: 5 }}>
            <Skeleton width="45%" height={15} borderRadius={RADIUS.sm} />
            <Skeleton width="85%" height={13} borderRadius={RADIUS.sm} />
            <Skeleton width="60%" height={12} borderRadius={RADIUS.sm} />
          </View>
          <Skeleton width={20} height={20} borderRadius={10} />
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Cupons (app/cupons.js)
 */
export function CuponsSkeleton({ count = 3 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.couponCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={48} height={48} borderRadius={RADIUS.md} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="50%" height={16} borderRadius={RADIUS.sm} />
              <Skeleton width="75%" height={12} borderRadius={RADIUS.sm} />
            </View>
            <Skeleton width={24} height={24} borderRadius={12} />
          </View>
          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5F2ED', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width={100} height={12} borderRadius={RADIUS.sm} />
            <Skeleton width={60} height={12} borderRadius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Perfil do Usuário (app/profile/index.js)
 */
export function ProfileSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 20 }}>
      {/* Header do Perfil */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <Skeleton width={64} height={64} borderRadius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={18} borderRadius={RADIUS.sm} />
          <Skeleton width="45%" height={13} borderRadius={RADIUS.sm} />
        </View>
      </View>

      {/* Menu Itens */}
      <View style={{ gap: 14 }}>
        {[1, 2, 3, 4, 5].map((item) => (
          <View key={item} style={styles.profileMenuItem}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <Skeleton width="50%" height={15} borderRadius={RADIUS.sm} style={{ flex: 1 }} />
            <Skeleton width={16} height={16} borderRadius={8} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Skeleton para Cartões / Pagamentos (app/profile/payments.js)
 */
export function PaymentCardsSkeleton() {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginVertical: 16 }}>
      {[1, 2].map((i) => (
        <View key={i} style={styles.paymentCardSkeleton}>
          <Skeleton width={36} height={24} borderRadius={4} />
          <View style={{ gap: 6, marginTop: 12 }}>
            <Skeleton width="80%" height={14} borderRadius={RADIUS.sm} />
            <Skeleton width="50%" height={12} borderRadius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Formulários (app/profile/informacoes-*.js)
 */
export function FormFieldsSkeleton({ count = 3 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 18 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Skeleton width={90} height={13} borderRadius={RADIUS.sm} />
          <Skeleton width="100%" height={48} borderRadius={RADIUS.md} />
        </View>
      ))}
      <Skeleton width="100%" height={48} borderRadius={RADIUS.lg} style={{ marginTop: 16 }} />
    </View>
  );
}

/**
 * Skeleton para Listas de Configuração / Switches (app/profile/gerenciar-notificacoes.js, dispositivos)
 */
export function SettingsListSkeleton({ count = 3 }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.settingsRowSkeleton}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={15} borderRadius={RADIUS.sm} />
            <Skeleton width="80%" height={12} borderRadius={RADIUS.sm} />
          </View>
          <Skeleton width={44} height={26} borderRadius={13} />
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton para Painel Admin Dashboard (app/admin/index.js, caixa.js)
 */
export function AdminDashboardSkeleton() {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      {/* 4 Cards de Métricas */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.adminMetricCard}>
            <Skeleton width={32} height={32} borderRadius={8} />
            <Skeleton width="60%" height={18} borderRadius={RADIUS.sm} style={{ marginTop: 8 }} />
            <Skeleton width="40%" height={12} borderRadius={RADIUS.sm} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      {/* Gráfico / Seção Principal */}
      <View style={styles.adminSectionCard}>
        <Skeleton width="45%" height={18} borderRadius={RADIUS.sm} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={160} borderRadius={RADIUS.md} />
      </View>
    </View>
  );
}

/**
 * Skeleton para Listas do Admin (pedidos, produtos, cupons, etc.)
 */
export function AdminListSkeleton({ count = 4 }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.adminListCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton width="40%" height={16} borderRadius={RADIUS.sm} />
            <Skeleton width={70} height={22} borderRadius={RADIUS.full} />
          </View>
          <Skeleton width="75%" height={13} borderRadius={RADIUS.sm} style={{ marginVertical: 6 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Skeleton width={90} height={14} borderRadius={RADIUS.sm} />
            <Skeleton width={60} height={14} borderRadius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Home Destaques
  miniCarousel: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
  },
  miniCard: {
    width: 170,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  miniBody: {
    padding: SPACING[3],
    gap: SPACING[2],
  },
  miniFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },

  // Home Grid
  prodGrid: {
    paddingHorizontal: SPACING[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: HOME_PROD_GRID_GAP,
  },
  prodCard: {
    width: HOME_PROD_CARD_WIDTH,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  prodInfo: {
    padding: SPACING[3],
    gap: SPACING[2],
  },
  prodTags: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  prodFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },

  // Cardápio Grid
  cardapioGrid: {
    paddingHorizontal: SPACING[5],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[4],
  },
  cardapioCard: {
    width: '47%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },

  // Produto Detalhes
  produtoScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  produtoContent: {
    padding: SPACING[5],
    flex: 1,
  },
  produtoNomePrecoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[2],
  },
  adicionalItemSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[2],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  produtoFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[6],
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Pedidos Lista
  pedidosContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  pedidoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    ...SHADOWS.sm,
  },
  pedidoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },

  // Pedido Detalhes
  pedidoDetalhesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  pedidoDetalheCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    ...SHADOWS.sm,
  },

  // Notificações
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    gap: 12,
  },

  // Endereços
  addressCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    alignItems: 'center',
    gap: 12,
  },

  // Cupons
  couponCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    borderStyle: 'dashed',
  },

  // Perfil
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F2ED',
    gap: 12,
  },

  // Pagamentos
  paymentCardSkeleton: {
    width: 150,
    height: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    justifyContent: 'space-between',
  },

  // Settings / Dispositivos
  settingsRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE7E0',
  },

  // Admin
  adminMetricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE7E0',
  },
  adminSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7E0',
  },
  adminListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE7E0',
  },
});

export default Skeleton;
