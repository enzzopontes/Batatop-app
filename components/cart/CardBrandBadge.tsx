import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome, Ionicons } from '@expo/vector-icons';

export type CardBrand = 'visa' | 'master' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | string;

interface CardBrandBadgeProps {
  brand?: CardBrand | null;
  size?: 'sm' | 'md' | 'lg';
}

const BRAND_LOGOS: Record<string, string> = {
  visa: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/visa.svg',
  master: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/mastercard.svg',
  mastercard: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/mastercard.svg',
  elo: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/elo.svg',
  amex: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/amex.svg',
  hipercard: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat/hipercard.svg',
};

export function normalizeBrandId(raw?: string | null): string {
  const b = (raw || '').toLowerCase().trim();
  if (b.includes('visa')) return 'visa';
  if (b.includes('master')) return 'master';
  if (b.includes('elo')) return 'elo';
  if (b.includes('amex')) return 'amex';
  if (b.includes('hiper')) return 'hipercard';
  return 'default';
}

export default function CardBrandBadge({ brand, size = 'md' }: CardBrandBadgeProps) {
  const [loadError, setLoadError] = useState(false);
  const key = normalizeBrandId(brand);
  const logoUrl = BRAND_LOGOS[key];

  const dims =
    size === 'sm'
      ? { width: 34, height: 22, iconSize: 14 }
      : size === 'lg'
      ? { width: 48, height: 31, iconSize: 20 }
      : { width: 40, height: 26, iconSize: 17 };

  // Renderiza fallback vetorial nativo se falhar carregamento ou sem URL
  const renderFallback = () => {
    if (key === 'visa') {
      return <FontAwesome name="cc-visa" size={dims.iconSize + 2} color="#1A1F71" />;
    }
    if (key === 'master') {
      return (
        <View style={styles.masterCircles}>
          <View style={[styles.mcCircle, { backgroundColor: '#EB001B' }]} />
          <View style={[styles.mcCircle, { backgroundColor: '#F79E1B', marginLeft: -6 }]} />
        </View>
      );
    }
    if (key === 'amex') {
      return <FontAwesome name="cc-amex" size={dims.iconSize + 2} color="#006FCF" />;
    }
    if (key === 'elo') {
      return <Text style={styles.eloText}>elo</Text>;
    }
    if (key === 'hipercard') {
      return <Text style={styles.hiperText}>hiper</Text>;
    }
    return <Ionicons name="card-outline" size={dims.iconSize} color="#4B5563" />;
  };

  return (
    <View style={[styles.container, { width: dims.width, height: dims.height }]}>
      {logoUrl && !loadError ? (
        <Image
          source={{ uri: logoUrl }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={100}
          onError={() => setLoadError(true)}
        />
      ) : (
        renderFallback()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  masterCircles: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mcCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  eloText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  hiperText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: -0.5,
  },
});
