import React from 'react';
import { View, StyleSheet, Platform, PixelRatio } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';

/**
 * Marcador de Carro 3D Visto de Cima: VW Gol G2 ("Bolinha") Prata Metálico (#C0C0C0 / #D8D8D8).
 *
 * Contorna o limite nativo do react-native-maps Fabric no Android (`100x100` px)
 * dimensionando o container em `Math.floor(100 / PixelRatio.get())` dp e ocupando
 * o viewBox `0 0 100 100` com folga segura para máxima nitidez e zero corte (clipping).
 */
const MARKER_SIZE = Platform.OS === 'android' ? Math.floor(100 / PixelRatio.get()) : 56;

export default function DeliveryVehicleMarker() {
  return (
    <View
      style={styles.container}
      collapsable={false}
      renderToHardwareTextureAndroid={true}
    >
      <Svg width={MARKER_SIZE} height={MARKER_SIZE} viewBox="0 0 100 100">
        {/* 1. Sombra suave projetada no asfalto */}
        <Rect x="21" y="11" width="58" height="80" rx="25" fill="rgba(0,0,0,0.26)" />

        {/* 2. 4 Pneus escuros nas extremidades */}
        <Rect x="17" y="21" width="6" height="15" rx="3" fill="#1E293B" />
        <Rect x="77" y="21" width="6" height="15" rx="3" fill="#1E293B" />
        <Rect x="17" y="63" width="6" height="15" rx="3" fill="#1E293B" />
        <Rect x="77" y="63" width="6" height="15" rx="3" fill="#1E293B" />

        {/* 3. Contorno branco de alto contraste estilo pin iFood */}
        <Rect x="19.5" y="8" width="61" height="84" rx="26" fill="#FFFFFF" />

        {/* 4. Chanfro 3D inferior em cinza chumbo metálico */}
        <Rect x="22" y="10.5" width="56" height="79" rx="23.5" fill="#4B5563" />

        {/* 5. Carroceria hatchback arredondada Gol G2 "Bolinha" em Prata Metálico */}
        <Rect x="23.5" y="11.5" width="53" height="76" rx="22" fill="#C0C0C0" stroke="#6B7280" strokeWidth="1" />
        <Rect x="26" y="14" width="48" height="71" rx="19.5" fill="#D8D8D8" />
        <Rect x="28" y="16" width="44" height="67" rx="17.5" fill="#C0C0C0" />

        {/* 6. Capô arredondado do Gol G2 com vincos suaves e grade frontal */}
        <Path d="M33 17 Q31 24 32 32" stroke="#F3F4F6" strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M67 17 Q69 24 68 32" stroke="#F3F4F6" strokeWidth="2" strokeLinecap="round" fill="none" />
        <Rect x="41" y="12.5" width="18" height="2.8" rx="1.4" fill="#374151" />

        {/* 7. Faróis arredondados estilo Gol G2 */}
        <Path d="M28.5 17.5 Q29.5 12.5 39 13.5 L38 17.5 Z" fill="#FEF9C3" stroke="#FFFFFF" strokeWidth="1" />
        <Path d="M71.5 17.5 Q70.5 12.5 61 13.5 L62 17.5 Z" fill="#FEF9C3" stroke="#FFFFFF" strokeWidth="1" />

        {/* 8. Retrovisores laterais em prata metálico */}
        <Path d="M23.5 34.5 L15.5 37 Q14.5 39 17 41 L23.5 40 Z" fill="#C0C0C0" stroke="#4B5563" strokeWidth="1.2" />
        <Path d="M76.5 34.5 L84.5 37 Q85.5 39 83 41 L76.5 40 Z" fill="#C0C0C0" stroke="#4B5563" strokeWidth="1.2" />

        {/* 9. Cabine contrastante com vidros escuros (#1E293B) e reflexos especulares */}
        <Path d="M29 33.5 Q50 28.5 71 33.5 L68 43 Q50 40.2 32 43 Z" fill="#1E293B" />
        <Path d="M33.5 33.5 Q42 31.2 48.5 31.8 L46 41.2 Q39 41.4 35 42 Z" fill="rgba(255,255,255,0.38)" />

        {/* Janelas laterais características do Gol G2 */}
        <Path d="M28.5 36.5 L31.5 44 L31.5 66.5 L28.5 70.5 Z" fill="#1E293B" />
        <Path d="M71.5 36.5 L68.5 44 L68.5 66.5 L71.5 70.5 Z" fill="#1E293B" />

        {/* Vigia traseiro hatchback arredondado + reflexo */}
        <Path d="M32 68 Q50 69.8 68 68 L69.5 76.5 Q50 79.5 30.5 76.5 Z" fill="#1E293B" />
        <Path d="M35.5 68.8 L45 69.3 L42.5 76.2 L34.5 75.5 Z" fill="rgba(255,255,255,0.25)" />

        {/* 10. Teto 3D elevado em Prata Metálico com brilho central */}
        <Rect x="31.5" y="42" width="37" height="27" rx="9" fill="#C0C0C0" stroke="#F3F4F6" strokeWidth="1.5" />
        <Rect x="35" y="45" width="30" height="20" rx="6.5" fill="#D8D8D8" />
        <Rect x="41" y="48.5" width="18" height="12" rx="4" fill="#F3F4F6" />

        {/* 11. Lanternas traseiras envolventes em rubi do Gol G2 */}
        <Path d="M28.5 79.5 Q31 83.5 39.5 83.5 L39.5 79.5 Z" fill="#EF4444" stroke="#991B1B" strokeWidth="0.8" />
        <Path d="M71.5 79.5 Q69 83.5 60.5 83.5 L60.5 79.5 Z" fill="#EF4444" stroke="#991B1B" strokeWidth="0.8" />
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
