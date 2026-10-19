import React from 'react';
import { View, StyleSheet, Platform, PixelRatio } from 'react-native';
import Svg, { Circle, Path, Ellipse } from 'react-native-svg';

/**
 * Marcador de destino "Casa" em Amarelo Dourado Batata Top (#FFB800).
 *
 * Dimensionado em `Math.floor(100 / PixelRatio.get())` dp no Android com SVG
 * `viewBox="0 0 100 100"` para nunca ultrapassar o bitmap nativo de 100x100px
 * do react-native-maps Fabric e jamais cortar a seta inferior.
 */
const MARKER_SIZE = Platform.OS === 'android' ? Math.floor(100 / PixelRatio.get()) : 56;

export default function DeliveryDestinationMarker() {
  return (
    <View
      style={styles.container}
      collapsable={false}
      renderToHardwareTextureAndroid={true}
    >
      <Svg width={MARKER_SIZE} height={MARKER_SIZE} viewBox="0 0 100 100">
        {/* 1. Sombra no solo */}
        <Ellipse cx="50" cy="94" rx="14" ry="3.5" fill="rgba(0,0,0,0.24)" />

        {/* 2. Seta apontando para baixo com contorno branco */}
        <Path
          d="M36 62 L50 91 L64 62 Z"
          fill="#FFB800"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* 3. Círculo Amarelo Dourado com borda branca */}
        <Circle
          cx="50"
          cy="38"
          r="31"
          fill="#FFB800"
          stroke="#FFFFFF"
          strokeWidth="5"
        />

        {/* 4. Ícone de Casa em branco no centro */}
        <Path
          d="M50 20 L31 36 H37 V52 H46 V42 H54 V52 H63 V36 H69 L50 20 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
});
