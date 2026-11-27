import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../constants/theme';
import {
  resolveCategoryIconSource,
  resolveLocalPreset3DIcon,
  mapFallbackIconToMci,
} from '../utils/resolveCategoryIcon';
import { normalizeCategoryIconScale } from '../hooks/useCategories';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export default function CategoryIcon({
  category,
  size = 44,
  iconSize,
  iconScale,
  style,
  fallbackContainerStyle,
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setStage(0);
  }, [category?.icon_url, category?.icon_type, category?.slug]);

  const safeScale = normalizeCategoryIconScale(iconScale ?? category?.icon_scale);
  const scaleFactor = safeScale / 100;
  const boxSize = typeof size === 'number' && size > 0 ? size : 44;

  const source = resolveCategoryIconSource(category);
  const slugFallback =
    category?.icon_type !== 'lucide' ? resolveLocalPreset3DIcon(category?.slug) : null;
  const hasDistinctSlugFallback = Boolean(slugFallback && slugFallback !== source);
  const activeSource =
    stage === 0 ? source : stage === 1 && hasDistinctSlugFallback ? slugFallback : null;

  if (activeSource) {
    return (
      <View
        style={[
          styles.imageSlot,
          style,
          { width: boxSize, height: boxSize, overflow: 'hidden' },
        ]}
      >
        <ExpoImage
          source={activeSource}
          style={{ width: boxSize, height: boxSize, transform: [{ scale: scaleFactor }] }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
          onError={() => {
            if (stage === 0 && hasDistinctSlugFallback) {
              setStage(1);
            } else {
              setStage(2);
            }
          }}
        />
      </View>
    );
  }

  const rawAccent = typeof category?.accent_color === 'string' ? category.accent_color.trim() : '';
  const accent = HEX_COLOR_RE.test(rawAccent) ? rawAccent : COLORS.primary;
  const mciName = mapFallbackIconToMci(category?.fallback_icon);
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
  imageSlot: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
