import { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const BRAND_RED = '#8F0B0F';

export default function AnimatedSplash({ onFinish }) {
  const [videoReady, setVideoReady] = useState(false);

  const player = useVideoPlayer(require('../assets/splash-animation.mp4'), (playerInstance) => {
    playerInstance.loop = false;
    playerInstance.play();
  });

  useEffect(() => {
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        setVideoReady(true);
      } else if (status === 'error') {
        console.warn('Erro ao tocar splash:', error);
        onFinish?.();
      }
    });

    const finishSubscription = player.addListener('playToEnd', () => {
      onFinish?.();
    });

    return () => {
      statusSubscription.remove();
      finishSubscription.remove();
    };
  }, [player, onFinish]);

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
        contentFit="contain"
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
