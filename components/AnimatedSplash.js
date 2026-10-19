import { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const BRAND_RED = '#8F0B0F';

export default function AnimatedSplash({ onFinish }) {
  const [videoReady, setVideoReady] = useState(false);
  const finishedRef = useRef(false);

  const safeFinish = () => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      onFinish?.();
    }
  };

  const player = useVideoPlayer(require('../assets/splash-animation.mp4'), (playerInstance) => {
    playerInstance.loop = false;
    playerInstance.play();
  });

  useEffect(() => {
    // Fallback de segurança: vídeo tem 2.9s. Se travar decoder ou evento falhar, libera tela após 3.2s
    const fallbackTimer = setTimeout(() => {
      safeFinish();
    }, 3200);

    if (player.status === 'readyToPlay') {
      setVideoReady(true);
    }

    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        setVideoReady(true);
      } else if (status === 'error') {
        console.warn('Erro ao tocar splash:', error);
        safeFinish();
      }
    });

    const finishSubscription = player.addListener('playToEnd', () => {
      safeFinish();
    });

    return () => {
      clearTimeout(fallbackTimer);
      statusSubscription.remove();
      finishSubscription.remove();
    };
  }, [player]);

  return (
    <View style={styles.container}>
      {!videoReady && (
        <View style={styles.loadingScreen}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      )}

      <VideoView
        player={player}
        style={[StyleSheet.absoluteFillObject, { opacity: videoReady ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: BRAND_RED,
  },
  loadingScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
});
