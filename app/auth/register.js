import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { SHADOWS } from '../../constants/theme';
import { ThemedAlertHost, showThemedAlert } from '../../components/ThemedAlert';
import { signInWithGoogle } from '../../utils/googleAuth';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      showThemedAlert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      showThemedAlert('Erro', 'As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
      showThemedAlert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    if (error) {
      showThemedAlert('Erro no Cadastro', error.message);
      setLoading(false);
    } else {
      showThemedAlert('Sucesso', 'Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.', [
        { text: 'OK', onPress: () => router.replace('/auth/login') }
      ]);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.success) {
      router.replace('/');
    } else if (!result.cancelled) {
      showThemedAlert('Erro no login', result.error || 'Não foi possível conectar com o Google.');
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Image
              source={{ uri: 'https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/logo/logo.png' }}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Criar Conta</Text>
            <Text style={styles.subtitle}>Cadastre-se para começar a acumular pontos e receber ofertas exclusivas.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.inputLabel}>Nome Completo</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Como quer ser chamado?"
                value={name}
                onChangeText={setName}
              />
            </View>

            <Text style={styles.inputLabel}>E-mail</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <Text style={styles.inputLabel}>Senha</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Confirmar Senha</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Repita sua senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#333" />
              ) : (
                <Text style={styles.registerButtonText}>Criar minha conta</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>OU</Text>
              <View style={styles.line} />
            </View>

            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
              <Ionicons name="logo-google" size={20} color="#333" style={{ marginRight: 10 }} />
              <Text style={styles.googleButtonText}>Cadastrar com Google</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => router.push('/auth/login')}>
              <Text style={styles.loginLinkText}>Já tem uma conta? <Text style={{ color: '#EA1D2C', fontWeight: '800' }}>Faça Login</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ThemedAlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 30,
    paddingTop: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 260,
    height: 310,
    marginBottom: -90,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#EEE',
    paddingHorizontal: 15,
    height: 55,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
  },
  registerButton: {
    backgroundColor: '#FFB500',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    ...SHADOWS.sm,
  },
  registerButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#EEE',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
  },
  googleButton: {
    flexDirection: 'row',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    marginBottom: 15,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
