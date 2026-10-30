import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function NotificationDeviceMockup({
  title = 'Título da notificação',
  body = 'Corpo da mensagem que aparecerá na tela de bloqueio do cliente...',
  imageUrl = null,
  couponCode = null,
  discountLabel = null,
  badgeLabel = null,
}) {
  return (
    <View style={s.container}>
      <View style={s.phoneFrame}>
        {/* Notch / Dynamic Island */}
        <View style={s.islandWrapper}>
          <View style={s.dynamicIsland}>
            <View style={s.cameraLens} />
          </View>
        </View>

        {/* Status Bar */}
        <View style={s.statusBar}>
          <Text style={s.statusTime}>12:30</Text>
          <View style={s.statusIcons}>
            <Ionicons name="cellular" size={14} color="#FFF" style={s.statusIcon} />
            <Ionicons name="wifi" size={14} color="#FFF" style={s.statusIcon} />
            <Ionicons name="battery-full" size={16} color="#FFF" />
          </View>
        </View>

        {/* Lock Screen Clock */}
        <View style={s.lockClockArea}>
          <Text style={s.lockDate}>Quarta-feira, 21 de outubro</Text>
          <Text style={s.lockTime}>12:30</Text>
        </View>

        {/* Push Notification Card (iFood style) */}
        <View style={s.notificationCard}>
          {/* Header do Push */}
          <View style={s.cardHeader}>
            <View style={s.appIdentity}>
              <View style={s.appIconBox}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={s.appLogoImg}
                  resizeMode="contain"
                />
              </View>
              <Text style={s.appName}>Batata Top</Text>
              {badgeLabel ? (
                <View style={s.badgePill}>
                  <Text style={s.badgePillText}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.timeAgo}>agora</Text>
          </View>

          {/* Conteúdo Principal */}
          <View style={s.cardBody}>
            <Text style={s.pushTitle} numberOfLines={2}>
              {title || 'Título da notificação'}
            </Text>
            <Text style={s.pushBody} numberOfLines={3}>
              {body || 'Corpo da mensagem da notificação...'}
            </Text>
          </View>

          {/* Banner de Imagem (opcional) */}
          {imageUrl ? (
            <View style={s.imageContainer}>
              <Image
                source={{ uri: imageUrl }}
                style={s.bannerImage}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {/* Tag de Cupom Atrelado (se houver) */}
          {couponCode ? (
            <View style={s.couponTag}>
              <Ionicons name="pricetag" size={13} color="#C1440E" />
              <Text style={s.couponTagText}>
                CUPOM: <Text style={s.couponCodeBold}>{couponCode}</Text>
                {discountLabel ? ` • ${discountLabel}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Barra inferior de navegação do iPhone */}
        <View style={s.bottomBarContainer}>
          <View style={s.homeIndicator} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  phoneFrame: {
    width: 320,
    height: 520,
    backgroundColor: '#1E1B18',
    borderRadius: 44,
    borderWidth: 6,
    borderColor: '#38322B',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  islandWrapper: {
    alignItems: 'center',
    zIndex: 10,
  },
  dynamicIsland: {
    width: 86,
    height: 22,
    backgroundColor: '#000',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  cameraLens: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#151515',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  statusTime: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 4,
  },
  lockClockArea: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  lockDate: {
    color: '#D1C7BD',
    fontSize: 12,
    fontWeight: '500',
  },
  lockTime: {
    color: '#FFF',
    fontSize: 52,
    fontWeight: '300',
    letterSpacing: -1,
  },
  notificationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  appIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  appLogoImg: {
    width: 22,
    height: 22,
  },
  appName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F1B16',
    letterSpacing: 0.2,
  },
  badgePill: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  badgePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
  },
  timeAgo: {
    fontSize: 10,
    color: '#78716C',
    fontWeight: '500',
  },
  cardBody: {
    marginBottom: 6,
  },
  pushTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F1B16',
    marginBottom: 2,
    lineHeight: 17,
  },
  pushBody: {
    fontSize: 12,
    color: '#44403C',
    lineHeight: 16,
  },
  imageContainer: {
    width: '100%',
    height: 96,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
    backgroundColor: '#F5F5F4',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  couponTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  couponTagText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 5,
  },
  couponCodeBold: {
    fontWeight: '800',
    color: '#C1440E',
  },
  bottomBarContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  homeIndicator: {
    width: 110,
    height: 4,
    backgroundColor: '#FFF',
    borderRadius: 2,
    opacity: 0.8,
  },
});
