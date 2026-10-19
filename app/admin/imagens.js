import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Image, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';

const CATEGORIES = [
  { key: 'product', label: 'Produtos', color: '#D97706' },
  { key: 'promo', label: 'Promoções', color: '#EA580C' },
  { key: 'general', label: 'Geral', color: '#2563EB' },
];

export default function AdminImagens() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('product');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const loadImages = useCallback(async () => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase
        .from('uploaded_images')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setImages(data || []);
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível carregar as imagens.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // ─── Fazer upload de uma nova imagem ──────────────────────────────
  const handlePickImage = async () => {
    // Pedir permissões
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de permissão para acessar sua galeria.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true, // Importante: pegar o base64 para salvar no Supabase!
    });

    if (pickerResult.canceled) return;

    const asset = pickerResult.assets[0];
    if (!asset.base64) {
      Alert.alert('Erro', 'Não foi possível ler os dados da imagem.');
      return;
    }

    if (asset.base64.length > 2800000) {
      Alert.alert('Imagem muito grande', 'Escolha uma imagem menor que 2MB.');
      return;
    }

    setUploading(true);
    try {
      const fileName = asset.fileName || `image-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const insertData = {
        id,
        name: fileName,
        data: asset.base64,
        mime_type: mimeType,
        category: selectedCategory,
        uploaded_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('uploaded_images')
        .insert(insertData);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'Imagem enviada com sucesso!');
      await loadImages();
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Copiar URL de imagem para clipboard ──────────────────────────
  const handleCopyUrl = async (id) => {
    // A URL gerada no site é no formato `/api/images/${id}`
    const url = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app'}/api/images/${id}`;
    await Clipboard.setStringAsync(url);
    setCopiedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Deletar imagem ──────────────────────────────────────────────
  const handleDeleteImage = (img) => {
    Alert.alert('Deletar Imagem', `Tem certeza que deseja excluir a imagem "${img.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase
            .from('uploaded_images')
            .delete()
            .eq('id', img.id);
          if (error) throw error;

          setImages(prev => prev.filter(i => i.id !== img.id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          Alert.alert('Erro', 'Não foi possível deletar a imagem.');
        }
      }},
    ]);
  };

  const filteredImages = images.filter(img => img.category === selectedCategory);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gerenciar Imagens</Text>
          <Text style={s.headerSub}>Upload de imagens para produtos e banners</Text>
        </View>
        <Pressable onPress={loadImages} style={s.refreshBtn}>
          {refreshing ? <ActivityIndicator size="small" color="#FFB800" /> : <Ionicons name="refresh-outline" size={22} color="#FFB800" />}
        </Pressable>
      </View>

      {/* Seletor de Categoria e Upload */}
      <View style={s.uploadSection}>
        <Text style={s.sectionLabel}>Categoria do Upload</Text>
        <View style={s.categorySelectRow}>
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat.key}
              style={[s.categorySelectBtn, selectedCategory === cat.key && { backgroundColor: cat.color, borderColor: cat.color }]}
              onPress={() => setSelectedCategory(cat.key)}
            >
              <Text style={[s.categorySelectBtnText, selectedCategory === cat.key && { color: '#FFF' }]}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[s.uploadBtn, uploading && { opacity: 0.7 }]} onPress={handlePickImage} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="image-outline" size={20} color="#FFF" />
              <Text style={s.uploadBtnText}>Escolher imagem da Galeria</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Grid de Imagens */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#FFB800" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.gridContent}>
          <Text style={s.listTitle}>
            Imagens {selectedCategory === 'product' ? 'de Produtos' : selectedCategory === 'promo' ? 'de Promoções' : 'Gerais'} ({filteredImages.length})
          </Text>

          {filteredImages.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="images-outline" size={48} color="#E5E7EB" />
              <Text style={s.emptyText}>Nenhuma imagem nesta categoria</Text>
            </View>
          ) : (
            <View style={s.grid}>
              {filteredImages.map((img) => (
                <View key={img.id} style={s.imgCard}>
                  <Image
                    source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                    style={s.gridImage}
                  />
                  <View style={s.imgCardBody}>
                    <Text style={s.imgName} numberOfLines={1}>{img.name}</Text>
                    <Text style={s.imgDate}>{new Date(img.uploaded_at).toLocaleDateString('pt-BR')}</Text>
                    <View style={s.imgCardActions}>
                      <Pressable style={s.actionBtn} onPress={() => handleCopyUrl(img.id)}>
                        <Ionicons name={copiedId === img.id ? "checkmark" : "copy-outline"} size={14} color="#6B7280" />
                        <Text style={s.actionBtnText}>{copiedId === img.id ? 'Copiado' : 'Copiar URL'}</Text>
                      </Pressable>
                      <Pressable style={[s.actionBtn, s.deleteBtn]} onPress={() => handleDeleteImage(img)}>
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  uploadSection: { backgroundColor: '#FFF', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  categorySelectRow: { flexDirection: 'row', gap: 8 },
  categorySelectBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  categorySelectBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  uploadBtn: { height: 48, borderRadius: 14, backgroundColor: '#FFB800', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  uploadBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF' },

  gridContent: { padding: 16, paddingBottom: 40 },
  listTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#D1D5DB', fontWeight: '600', fontSize: 14 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  imgCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 18, minHeight: 200, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  gridImage: { width: '100%', height: 110, backgroundColor: '#F3F4F6' },
  imgCardBody: { padding: 10, gap: 4 },
  imgName: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },
  imgDate: { fontSize: 9, fontWeight: '600', color: '#9CA3AF' },
  imgCardActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionBtn: { flex: 1, height: 28, borderRadius: 8, backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionBtnText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  deleteBtn: { flex: 0, width: 28, backgroundColor: '#FEE2E2' },
});
