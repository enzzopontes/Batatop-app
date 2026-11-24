import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { isAppReady, subscribeAppReady } from '../utils/appReady';

const SPLASH_BG = '#121212';
const MIN_SHOW_MS = 250;
const MAX_WAIT_MS = 1600;
const FADE_OUT_MS = 160;

export default function AnimatedSplash({ onFinish }) {
  const finishedRef = useRef(false);
  const fadingRef = useRef(false);
  const nativeHiddenRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const opacityAnim = useRef(new Animated.Value(1)).current;

  const hideNativeSplashOnce = () => {
    if (!nativeHiddenRef.current) {
      nativeHiddenRef.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  };

  useEffect(() => {
    const safeFinish = () => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current?.();
      }
    };

    const startFadeOut = () => {
      if (fadingRef.current) return;
      fadingRef.current = true;
      hideNativeSplashOnce();
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        safeFinish();
      });
    };

    // Fallback para garantir que a splash nativa nunca fique presa
    const nativeFallback = setTimeout(hideNativeSplashOnce, 80);

    let minDone = false;
    let readyDone = isAppReady();

    const maybeFinish = () => {
      if (minDone && readyDone) {
        startFadeOut();
      }
    };

    const minTimer = setTimeout(() => {
      minDone = true;
      maybeFinish();
    }, MIN_SHOW_MS);

    const maxTimer = setTimeout(() => {
      startFadeOut();
    }, MAX_WAIT_MS);

    const unsubscribe = subscribeAppReady(() => {
      readyDone = true;
      maybeFinish();
    });

    return () => {
      clearTimeout(nativeFallback);
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      unsubscribe();
    };
  }, [opacityAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      <Image
        source={require('../assets/splash-logo.png')}
        style={styles.logo}
        resizeMode="contain"
        onLoad={hideNativeSplashOnce}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 210,
    height: 210,
  },
});
