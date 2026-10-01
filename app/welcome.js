import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeGetNotificationPermissions, safeRequestNotificationPermissions } from '../utils/pushNotifications';

// Chave usada pra marcar que o usuário já passou pela tela de boas-vindas.
// Se precisar resetar o fluxo pra testar de novo, é só remover essa key
// do AsyncStorage (ex: AsyncStorage.removeItem(ALREADY_SEEN_WELCOME_KEY))
export const ALREADY_SEEN_WELCOME_KEY = '@already_seen_welcome';

const COLORS = {
  black: '#1A1A1A',
  gray: '#6B6B6B',
  yellow: '#E3A008', // amarelo padrão da identidade Batata Top
  white: '#FFFFFF',
};

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  async function handleContinuar() {
    if (loading) return;
    setLoading(true);

    try {
      // 1. Solicita a permissão real de notificações do sistema
      const { status: existingStatus } = await safeGetNotificationPermissions();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await safeRequestNotificationPermissions();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        // Usuário negou — não bloqueamos o fluxo, só seguimos em frente.
        console.log('Permissão de notificações negada pelo usuário.');
      }
    } catch (error) {
      console.log('Erro ao solicitar permissão de notificações:', error);
    }

    try {
      // 2. Marca no AsyncStorage que o onboarding já foi visto.
      // ---> É ESSA FLAG que controla se a tela aparece de novo ou não <---
      await AsyncStorage.setItem(ALREADY_SEEN_WELCOME_KEY, 'true');
    } catch (error) {
      console.log('Erro ao salvar flag de onboarding:', error);
    }

    setLoading(false);

    // 3. Navega pra Home
    router.replace('/');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <Text style={styles.title}>BEM-VINDO</Text>

      {/* Ilustração de fundo — já vem com o card de notificação pronto na própria imagem */}
      <View style={styles.illustrationWrapper}>
        <Image
          source={require('../assets/backgraound-page1.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>

      {/* Textos de permissão */}
      <Text style={styles.permissionTitle}>Permitir notificações</Text>
      <Text style={styles.permissionSubtitle}>
        Para acompanhar seus pedidos e receber novidades
      </Text>

      {/* Espaço flexível empurrando o botão pro rodapé */}
      <View style={{ flex: 1 }} />

      {/* Botão fixo no rodapé */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleContinuar}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Aguarde...' : 'Continuar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.black,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  illustrationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: '100%',
    height: 340,
  },
  permissionTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: COLORS.black,
    textAlign: 'center',
    marginTop: 8,
  },
  permissionSubtitle: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 23,
    paddingHorizontal: 12,
  },
  footer: {
    paddingTop: 12,
  },
  button: {
    backgroundColor: COLORS.yellow,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: COLORS.black, // preto tem melhor contraste sobre o amarelo do que branco
    fontSize: 19,
    fontWeight: 'bold',
  },
});
