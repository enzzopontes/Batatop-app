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
import * as Location from 'expo-location';

// Chave usada pra marcar que o usuário já passou pela tela de permissão de
// localização. Separada da chave do /welcome (@already_seen_welcome).
// Se precisar resetar o fluxo pra testar de novo, é só remover essa key
// do AsyncStorage (ex: AsyncStorage.removeItem(ALREADY_SEEN_LOCATION_KEY))
export const ALREADY_SEEN_LOCATION_KEY = '@already_seen_location';

const COLORS = {
  black: '#1A1A1A',
  gray: '#6B6B6B',
  yellow: '#E3A008', // amarelo padrão da identidade Batata Top
  white: '#FFFFFF',
  outlineBorder: '#E0E0E0', // borda neutra do botão "Pular"
};

export default function LocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  // Marca a flag e navega — chamado tanto no "Permitir" quanto no "Pular",
  // já que a tela só deve aparecer uma vez independente da escolha do usuário.
  async function marcarVistoENavegar() {
    try {
      await AsyncStorage.setItem(ALREADY_SEEN_LOCATION_KEY, 'true');
    } catch (error) {
      console.log('Erro ao salvar flag de localização:', error);
    }
    router.replace('/');
  }

  async function handlePermitir() {
    if (loading) return;
    setLoading(true);

    try {
      // Solicita a permissão real de localização do sistema
      await Location.requestForegroundPermissionsAsync();
    } catch (error) {
      console.log('Erro ao solicitar permissão de localização:', error);
    }

    setLoading(false);
    await marcarVistoENavegar();
  }

  async function handlePular() {
    if (loading) return;
    // Não solicita permissão nenhuma — só marca como visto e segue.
    await marcarVistoENavegar();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <Text style={styles.title}>BEM-VINDO</Text>

      {/* Ilustração de fundo — já vem com o card mockado do restaurante
          pronto na própria imagem, igual à page 1 */}
      <View style={styles.illustrationWrapper}>
        <Image
          source={require('../assets/backgraound-page2.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>

      {/* Textos de permissão */}
      <Text style={styles.permissionTitle}>Permitir localização</Text>
      <Text style={styles.permissionSubtitle}>
        Para descobrir restaurantes que entregam na sua região
      </Text>

      {/* Espaço flexível empurrando os botões pro rodapé */}
      <View style={{ flex: 1 }} />

      {/* Rodapé com os dois botões lado a lado */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.buttonOutline,
            pressed && styles.buttonOutlinePressed,
          ]}
          onPress={handlePular}
          disabled={loading}
        >
          <Text style={styles.buttonOutlineText}>Pular</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.buttonFilled,
            pressed && styles.buttonFilledPressed,
          ]}
          onPress={handlePermitir}
          disabled={loading}
        >
          <Text style={styles.buttonFilledText}>
            {loading ? 'Aguarde...' : 'Permitir'}
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
    flexDirection: 'row',
    gap: 12,
  },
  // "Pular" — outline neutro, cor cinza (não amarelo) pra não competir com
  // o CTA principal. Se preferir usar a cor de destaque (amarelo) aqui,
  // troca COLORS.gray/outlineBorder por COLORS.yellow nos 3 campos abaixo.
  buttonOutline: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.outlineBorder,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutlinePressed: {
    opacity: 0.6,
  },
  buttonOutlineText: {
    color: COLORS.gray,
    fontSize: 19,
    fontWeight: 'bold',
  },
  // "Permitir" — preenchido, mesma cor amarela padrão da page 1
  buttonFilled: {
    flex: 1,
    backgroundColor: COLORS.yellow,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFilledPressed: {
    opacity: 0.85,
  },
  buttonFilledText: {
    color: COLORS.black, // preto tem melhor contraste sobre o amarelo do que branco
    fontSize: 19,
    fontWeight: 'bold',
  },
});