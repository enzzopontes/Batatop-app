import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../constants/theme';
import { resolveCategoryIconSource, mapFallbackIconToMci } from '../utils/resolveCategoryIcon';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default function CategoryIcon({
  category,
  size = 44,
  iconSize,
  style,
  fallbackContainerStyle,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [category?.icon_url, category?.icon_type]);

  const source = resolveCategoryIconSource(category);
  const showImage = Boolean(source) && !failed;

  if (showImage) {
    return (
      <ExpoImage
        source={source}
        style={[size != null ? { width: size, height: size } : null, style]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setFailed(true)}
      />
    );
  }

  const rawAccent = typeof category?.accent_color === 'string' ? category.accent_color.trim() : '';
  const accent = HEX_COLOR_RE.test(rawAccent) ? rawAccent : COLORS.primary;
  const mciName = mapFallbackIconToMci(category?.fallback_icon);
  const boxSize = typeof size === 'number' && size > 0 ? size : 44;
  const glyphSize = iconSize || Math.round(boxSize * 0.54);

  return (
    <View
      style={[
        styles.fallbackBox,
        {
          width: boxSize,
          height: boxSize,
          borderRadius: Math.min(RADIUS.lg, Math.round(boxSize * 0.28)),
          backgroundColor: `${accent}1A`,
          borderColor: `${accent}33`,
        },
        fallbackContainerStyle,
      ]}
    >
      <MaterialCommunityIcons name={mciName} size={glyphSize} color={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
