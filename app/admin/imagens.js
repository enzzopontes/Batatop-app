import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Image, TextInput, Modal,
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
  { key: 'all', label: 'Todas' },
  { key: 'product', label: 'Produtos', color: '#D97706' },
  { key: 'promo', label: 'Promoções', color: '#EA580C' },
  { key: 'general', label: 'Geral', color: '#2563EB' },
];

const UPLOAD_CATEGORIES = [
  { key: 'product', label: 'Produto', color: '#D97706' },
  { key: 'promo', label: 'Promoção', color: '#EA580C' },
  { key: 'general', label: 'Geral', color: '#2563EB' },
];

export default function AdminImagens() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [uploadCategory, setUploadCategory] = useState('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [dimensions, setDimensions] = useState({});

  // Deletion modal state
  const [imageToDelete, setImageToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Obter dimensões das imagens carregadas
  useEffect(() => {
    images.forEach((img) => {
      if (img.id && !dimensions[img.id] && img.data) {
        const uri = `data:${img.mime_type || 'image/jpeg'};base64,${img.data}`;
        Image.getSize(
          uri,
          (width, height) => {
            setDimensions((prev) => ({ ...prev, [img.id]: `${width} × ${height}` }));
          },
          () => {}
        );
      }
    });
  }, [images]);

  // ─── Fazer upload de uma nova imagem ──────────────────────────────
  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de permissão para acessar sua galeria.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true,
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
        category: uploadCategory,
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

  // ─── Copiar URL de imagem para clipboard com feedback ─────────────
  const handleCopyUrl = async (id) => {
    const url = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app'}/api/images/${id}`;
    await Clipboard.setStringAsync(url);
    setCopiedId(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // ─── Deletar imagem com modal de confirmação ───────────────────────
  const handleDeletePress = (img) => {
    setImageToDelete(img);
  };

  const handleConfirmDelete = async () => {
    if (!imageToDelete) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('uploaded_images')
        .delete()
        .eq('id', imageToDelete.id);
      if (error) throw error;

      setImages((prev) => prev.filter((i) => i.id !== imageToDelete.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setImageToDelete(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível deletar a imagem.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredImages = images.filter((img) => {
    const matchesCat = selectedCategory === 'all' ? true : img.category === selectedCategory;
    const matchesSearch = searchQuery.trim() === '' ? true : (img.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getCategoryCount = (key) => {
    if (key === 'all') return images.length;
    return images.filter((img) => img.category === key).length;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Galeria de Mídia</Text>
          <Text style={s.headerSub}>Biblioteca central de imagens e banners</Text>
        </View>
        <Pressable onPress={loadImages} style={s.refreshBtn} hitSlop={10} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#E3A008" />
          ) : (
            <Ionicons name="refresh-outline" size={22} color="#1A1A1A" />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Upload Card (iFood Media Standard) */}
        <View style={s.uploadCard}>
          <View style={s.uploadCardHeader}>
            <View style={s.uploadIconBadge}>
              <Ionicons name="cloud-upload-outline" size={20} color="#E3A008" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.uploadCardTitle}>Enviar nova imagem</Text>
              <Text style={s.uploadCardSub}>Selecione a categoria de destino</Text>
            </View>
          </View>

          {/* Categoria do Upload */}
          <View style={s.uploadCategoryRow}>
            {UPLOAD_CATEGORIES.map((cat) => {
              const isSelected = uploadCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  style={[s.uploadCatBtn, isSelected && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => setUploadCategory(cat.key)}
                >
                  <Text style={[s.uploadCatBtnText, isSelected && { color: '#FFF' }]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Upload Button */}
          <Pressable
            style={[s.uploadActionBtn, uploading && { opacity: 0.7 }]}
            onPress={handlePickImage}
            disabled={uploading}
          >
            {uploading ? (
              <View style={s.uploadingRow}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={s.uploadActionBtnText}>Enviando imagem...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="images-outline" size={20} color="#FFF" />
                <Text style={s.uploadActionBtnText}>Escolher imagem da Galeria</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Search & Filter Section */}
        <View style={s.filterSection}>
          {/* Busca por nome */}
          <View style={s.searchContainer}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar imagem por nome..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filtro de Categorias */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryPillRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              const count = getCategoryCount(cat.key);
              return (
                <Pressable
                  key={cat.key}
                  style={[s.categoryPill, isSelected && s.categoryPillActive]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Text style={[s.categoryPillText, isSelected && s.categoryPillTextActive]}>{cat.label}</Text>
                  <View style={[s.countBadge, isSelected && s.countBadgeActive]}>
                    <Text style={[s.countBadgeText, isSelected && s.countBadgeTextActive]}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Grid de Imagens */}
        {loading ? (
          <View style={s.centerLoading}>
            <ActivityIndicator size="large" color="#E3A008" />
            <Text style={s.loadingText}>Carregando galeria...</Text>
          </View>
        ) : filteredImages.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIconContainer}>
              <Ionicons name="images-outline" size={40} color="#D1D5DB" />
            </View>
            <Text style={s.emptyTitle}>Nenhuma imagem encontrada</Text>
            <Text style={s.emptyText}>
              {searchQuery ? 'Tente pesquisar com outro nome.' : 'Faça o upload da sua primeira foto acima.'}
            </Text>
          </View>
        ) : (
          <View style={s.grid}>
            {filteredImages.map((img) => {
              const isCopied = copiedId === img.id;
              const dim = dimensions[img.id];
              const categoryColor =
                img.category === 'product' ? '#D97706' : img.category === 'promo' ? '#EA580C' : '#2563EB';
              const categoryLabel =
                img.category === 'product' ? 'Produto' : img.category === 'promo' ? 'Promoção' : 'Geral';

              return (
                <View key={img.id} style={s.imgCard}>
                  {/* Image View with Overlays */}
                  <View style={s.imageWrapper}>
                    <Image
                      source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                      style={s.gridImage}
                      resizeMode="cover"
                    />

                    {/* Top Badges */}
                    <View style={s.overlayBadges}>
                      <View style={[s.categoryTag, { backgroundColor: categoryColor }]}>
                        <Text style={s.categoryTagText}>{categoryLabel}</Text>
                      </View>
                      {dim && (
                        <View style={s.dimensionBadge}>
                          <Text style={s.dimensionBadgeText}>{dim}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Card Info & Actions */}
                  <View style={s.imgCardBody}>
                    <Text style={s.imgName} numberOfLines={1}>
                      {img.name || 'Sem nome'}
                    </Text>
                    <Text style={s.imgDate}>{new Date(img.uploaded_at).toLocaleDateString('pt-BR')}</Text>

                    <View style={s.imgCardActions}>
                      <Pressable
                        style={[s.actionBtn, isCopied && s.actionBtnCopied]}
                        onPress={() => handleCopyUrl(img.id)}
                      >
                        <Ionicons
                          name={isCopied ? 'checkmark-circle' : 'copy-outline'}
                          size={13}
                          color={isCopied ? '#059669' : '#4B5563'}
                        />
                        <Text style={[s.actionBtnText, isCopied && s.actionBtnTextCopied]}>
                          {isCopied ? 'Copiado!' : 'Copiar URL'}
                        </Text>
                      </Pressable>

                      <Pressable style={s.deleteBtn} onPress={() => handleDeletePress(img)}>
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Deletion Confirmation Modal */}
      <Modal visible={!!imageToDelete} transparent animationType="fade" onRequestClose={() => setImageToDelete(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View style={s.modalAlertIcon}>
                <Ionicons name="warning-outline" size={24} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Excluir Imagem?</Text>
                <Text style={s.modalSub}>Esta ação é irreversível e removerá a imagem do sistema.</Text>
              </View>
            </View>

            {imageToDelete && (
              <View style={s.modalPreviewCard}>
                <Image
                  source={{ uri: `data:${imageToDelete.mime_type || 'image/jpeg'};base64,${imageToDelete.data}` }}
                  style={s.modalThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.modalFileName} numberOfLines={2}>
                    {imageToDelete.name}
                  </Text>
                  <Text style={s.modalCategoryText}>
                    Categoria:{' '}
                    {imageToDelete.category === 'product'
                      ? 'Produto'
                      : imageToDelete.category === 'promo'
                      ? 'Promoção'
                      : 'Geral'}
                  </Text>
                </View>
              </View>
            )}

            <View style={s.modalActionRow}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setImageToDelete(null)}
                disabled={isDeleting}
              >
                <Text style={s.modalCancelText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[s.modalConfirmBtn, isDeleting && { opacity: 0.7 }]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color="#FFF" />
                    <Text style={s.modalConfirmText}>Excluir</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  refreshBtn: { padding: 6 },

  scrollContent: { padding: 16, paddingBottom: 40 },

  // Upload Card
  uploadCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  uploadCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  uploadIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCardTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  uploadCardSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  uploadCategoryRow: { flexDirection: 'row', gap: 8 },
  uploadCatBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  uploadCatBtnText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  uploadActionBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E3A008',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#E3A008',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadActionBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },

  // Filter Section
  filterSection: { marginBottom: 16, gap: 10 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#1A1A1A', paddingVertical: 0 },
  categoryPillRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  categoryPillActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  categoryPillText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  categoryPillTextActive: { color: '#FFF' },
  countBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeActive: { backgroundColor: '#374151' },
  countBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  countBadgeTextActive: { color: '#F9FAFB' },

  // Grid
  centerLoading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  emptyText: { color: '#9CA3AF', fontWeight: '500', fontSize: 12, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  imgCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  imageWrapper: { width: '100%', height: 120, position: 'relative', backgroundColor: '#F3F4F6' },
  gridImage: { width: '100%', height: '100%' },
  overlayBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  categoryTagText: { fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase' },
  dimensionBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dimensionBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFF' },

  imgCardBody: { padding: 10, gap: 4 },
  imgName: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },
  imgDate: { fontSize: 9, fontWeight: '500', color: '#9CA3AF' },
  imgCardActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionBtn: {
    flex: 1,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnCopied: { backgroundColor: '#ECFDF5' },
  actionBtnText: { fontSize: 10, fontWeight: '700', color: '#4B5563' },
  actionBtnTextCopied: { color: '#059669' },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  modalAlertIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  modalSub: { fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 16 },
  modalPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#E5E7EB' },
  modalFileName: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },
  modalCategoryText: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  modalCancelText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  modalConfirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
});
