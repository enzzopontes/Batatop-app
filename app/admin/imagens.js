import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Image, TextInput, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';
import { AdminListSkeleton } from '../../components/Skeleton';
import { showSuccessAlert, showErrorAlert, ThemedAlertHost } from '../../components/ThemedAlert';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatopiacanga.com.br';
const STORAGE_BUCKET = 'Products';
const STORAGE_FOLDERS = [
  { folder: '', category: 'product' },
  { folder: 'uploads/product', category: 'product' },
  { folder: 'uploads/promo', category: 'promo' },
  { folder: 'uploads/brand', category: 'brand' },
  { folder: 'uploads/general', category: 'general' },
];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_BASE64_LENGTH = 2_750_000;
const MAX_IMAGE_DIMENSION = 1000;

const UPLOAD_CATEGORIES = [
  { key: 'product', label: 'Produto', color: '#D97706', icon: 'fast-food-outline' },
  { key: 'promo', label: 'Banner / Promoção', color: '#EA580C', icon: 'megaphone-outline' },
  { key: 'brand', label: 'Logo / Identidade', color: '#7C3AED', icon: 'ribbon-outline' },
  { key: 'general', label: 'Geral', color: '#2563EB', icon: 'images-outline' },
];

const CATEGORIES = [
  { key: 'all', label: 'Todas' },
  ...UPLOAD_CATEGORIES,
];

const VALID_CATEGORIES = new Set(UPLOAD_CATEGORIES.map((c) => c.key));

function getCategoryMeta(categoryKey) {
  return (
    UPLOAD_CATEGORIES.find((c) => c.key === categoryKey) ||
    UPLOAD_CATEGORIES[UPLOAD_CATEGORIES.length - 1]
  );
}

function getImageFormat(nameOrMime) {
  if (!nameOrMime) return null;
  const raw = String(nameOrMime).toLowerCase().trim();
  if (raw.startsWith('image/')) {
    const subtype = raw.slice(6).split(';')[0].trim();
    if (subtype === 'webp') return 'WEBP';
    if (subtype === 'jpeg' || subtype === 'jpg') return 'JPG';
    if (subtype === 'png') return 'PNG';
    return null;
  }
  const clean = raw.split('?')[0].split('#')[0];
  if (clean.endsWith('.webp')) return 'WEBP';
  if (clean.endsWith('.jpeg') || clean.endsWith('.jpg')) return 'JPG';
  if (clean.endsWith('.png')) return 'PNG';
  return null;
}

function resolveAllowedMime(asset) {
  const rawMime = typeof asset?.mimeType === 'string'
    ? asset.mimeType.split(';')[0].trim().toLowerCase()
    : '';

  if (rawMime) {
    const normalized = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    return ALLOWED_MIME_TYPES.includes(normalized) ? normalized : null;
  }

  const candidate = String(asset?.fileName || asset?.uri || '')
    .split('?')[0]
    .split('#')[0]
    .toLowerCase();

  if (candidate.endsWith('.jpg') || candidate.endsWith('.jpeg')) return 'image/jpeg';
  if (candidate.endsWith('.png')) return 'image/png';
  if (candidate.endsWith('.webp')) return 'image/webp';
  return null;
}

function formatSupabaseError(err, fallback) {
  const code = String(err?.code || '').trim();
  const msg = String(err?.message || '').trim();
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    /row-level security|permission denied|policy/i.test(msg)
  ) {
    return 'Permissão negada pelo banco de dados (RLS). Verifique sua sessão de administrador.';
  }
  if (code === '42P01' || code === 'PGRST205') {
    return 'Tabela de metadados não encontrada no banco. Execute a migração pendente.';
  }
  if (msg && msg.includes('(RLS)')) {
    return msg;
  }
  return fallback;
}

function safeRelease(ref) {
  try {
    ref?.release?.();
  } catch {
    // Ignore native release failures
  }
}

async function convertImageToWebP(asset) {
  let context = null;
  let rendered = null;
  let resizeContext = null;
  let resizedRendered = null;

  try {
    context = ImageManipulator.manipulate(asset.uri);

    if (asset.width && asset.height) {
      if (asset.width > MAX_IMAGE_DIMENSION || asset.height > MAX_IMAGE_DIMENSION) {
        context.resize(
          asset.width >= asset.height
            ? { width: MAX_IMAGE_DIMENSION }
            : { height: MAX_IMAGE_DIMENSION }
        );
      }
      rendered = await context.renderAsync();
      return await rendered.saveAsync({
        format: SaveFormat.WEBP,
        compress: 0.82,
        base64: true,
      });
    }

    rendered = await context.renderAsync();
    if (rendered.width > MAX_IMAGE_DIMENSION || rendered.height > MAX_IMAGE_DIMENSION) {
      resizeContext = ImageManipulator.manipulate(rendered);
      resizeContext.resize(
        rendered.width >= rendered.height
          ? { width: MAX_IMAGE_DIMENSION }
          : { height: MAX_IMAGE_DIMENSION }
      );
      resizedRendered = await resizeContext.renderAsync();
      return await resizedRendered.saveAsync({
        format: SaveFormat.WEBP,
        compress: 0.82,
        base64: true,
      });
    }

    return await rendered.saveAsync({
      format: SaveFormat.WEBP,
      compress: 0.82,
      base64: true,
    });
  } finally {
    safeRelease(resizedRendered);
    safeRelease(resizeContext);
    safeRelease(rendered);
    safeRelease(context);
  }
}

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

  // Recategorize modal state
  const [imageToRecategorize, setImageToRecategorize] = useState(null);
  const [updatingCategory, setUpdatingCategory] = useState(null);

  // Concurrency locks
  const uploadingRef = useRef(false);
  const updatingCategoryRef = useRef(false);
  const deletingRef = useRef(false);

  const loadImages = useCallback(async () => {
    try {
      setRefreshing(true);

      const [storageResults, dbResult, metadataResult] = await Promise.all([
        Promise.all(
          STORAGE_FOLDERS.map(async ({ folder, category }) => {
            try {
              const { data: files, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .list(folder, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

              if (error || !files) return [];

              return files
                .filter((file) => file && file.name && !file.name.startsWith('.') && file.id)
                .map((file) => {
                  const storagePath = folder ? `${folder}/${file.name}` : file.name;
                  const { data: pubData } = supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(storagePath);

                  return {
                    id: storagePath,
                    name: file.name,
                    url: pubData?.publicUrl || '',
                    category,
                    format: getImageFormat(file.metadata?.mimetype) || getImageFormat(file.name),
                    uploaded_at: file.created_at || file.updated_at || new Date().toISOString(),
                    source: 'storage',
                  };
                });
            } catch {
              return [];
            }
          })
        ),
        supabase
          .from('uploaded_images')
          .select('id, name, mime_type, category, uploaded_at')
          .order('uploaded_at', { ascending: false }),
        Promise.resolve(
          supabase
            .from('media_metadata')
            .select('storage_path, category')
        ).catch((err) => ({ data: null, error: err })),
      ]);

      const metadataMap = {};
      if (metadataResult?.error) {
        if (__DEV__) {
          console.warn(
            '[AdminImagens] media_metadata indisponível:',
            metadataResult.error.message || metadataResult.error
          );
        }
      } else if (Array.isArray(metadataResult?.data)) {
        metadataResult.data.forEach((row) => {
          if (row?.storage_path && VALID_CATEGORIES.has(row.category)) {
            metadataMap[row.storage_path] = row.category;
          }
        });
      }

      const storageImages = storageResults.flat().map((item) => ({
        ...item,
        category: metadataMap[item.id] || item.category,
      }));

      if (dbResult.error && storageImages.length === 0) {
        throw dbResult.error;
      }

      const dbImages = (dbResult.data || []).map((row) => ({
        ...row,
        category: VALID_CATEGORIES.has(row.category) ? row.category : 'general',
        format: getImageFormat(row.mime_type) || getImageFormat(row.name),
        url: `${API_BASE_URL}/api/images/${row.id}`,
        source: 'database',
      }));

      const combined = [...storageImages, ...dbImages].sort(
        (a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime()
      );

      setImages(combined);
    } catch (e) {
      console.error(e);
      showErrorAlert('Não foi possível carregar as imagens.');
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
      if (img.id && !dimensions[img.id]) {
        const uri = img.url || `${API_BASE_URL}/api/images/${img.id}`;
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
    if (uploadingRef.current || uploading) return;
    uploadingRef.current = true;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showErrorAlert('Precisamos de permissão para acessar sua galeria.', 'Permissão necessária');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
        base64: false,
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]) return;

      const asset = pickerResult.assets[0];
      if (!asset.uri) {
        showErrorAlert('Não foi possível ler os dados da imagem.');
        return;
      }

      const allowedMime = resolveAllowedMime(asset);
      if (!allowedMime) {
        showErrorAlert('Use imagens nos formatos JPG, PNG ou WebP.', 'Formato não suportado');
        return;
      }

      setUploading(true);
      const manipulated = await convertImageToWebP(asset);
      const targetCategory = VALID_CATEGORIES.has(uploadCategory) ? uploadCategory : 'product';
      const storagePath = `uploads/${targetCategory}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

      let uploadedUrl = null;
      if (manipulated?.uri) {
        let blob = null;
        try {
          const response = await fetch(manipulated.uri);
          if (!response.ok) {
            throw new Error(`Falha ao ler imagem convertida (HTTP ${response.status}).`);
          }
          blob = await response.blob();
        } catch {
          blob = null;
        }

        if (blob && blob.size > MAX_UPLOAD_BYTES) {
          showErrorAlert('Escolha uma imagem menor que 2MB.', 'Imagem muito grande');
          return;
        }

        if (blob) {
          try {
            const { error: storageError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, blob, {
                contentType: 'image/webp',
                cacheControl: '31536000',
                upsert: false,
              });

            if (!storageError) {
              const { data: pubData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(storagePath);
              if (pubData?.publicUrl) {
                uploadedUrl = pubData.publicUrl;
              }
            }
          } catch {
            // Fallback para tabela uploaded_images
          }
        }
      }

      if (uploadedUrl) {
        try {
          const { error: metaError } = await supabase
            .from('media_metadata')
            .upsert(
              {
                storage_path: storagePath,
                category: targetCategory,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'storage_path' }
            );
          if (metaError && __DEV__) {
            console.warn('[AdminImagens] Falha ao salvar media_metadata:', metaError.message || metaError);
          }
        } catch (metaErr) {
          if (__DEV__) {
            console.warn('[AdminImagens] Falha ao salvar media_metadata:', metaErr);
          }
        }
      } else {
        if (!manipulated?.base64) {
          throw new Error('Não foi possível ler os dados da imagem.');
        }

        if (manipulated.base64.length > MAX_BASE64_LENGTH) {
          showErrorAlert('Escolha uma imagem menor que 2MB.', 'Imagem muito grande');
          return;
        }

        const baseName = asset.fileName
          ? asset.fileName.replace(/\.[^.]+$/, '')
          : `image-${Date.now()}`;
        const fileName = `${baseName}.webp`;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

        const insertData = {
          id,
          name: fileName,
          data: manipulated.base64,
          mime_type: 'image/webp',
          category: targetCategory,
          uploaded_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('uploaded_images')
          .insert(insertData);

        if (error) throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccessAlert('Imagem convertida em WebP e enviada com sucesso!');
      await loadImages();
    } catch (e) {
      console.error(e);
      showErrorAlert(formatSupabaseError(e, 'Não foi possível enviar a imagem.'));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  // ─── Editar categoria de uma imagem existente ─────────────────────
  const handleSelectNewCategory = async (newCategory) => {
    if (!imageToRecategorize || updatingCategoryRef.current || updatingCategory) return;
    if (imageToRecategorize.category === newCategory) {
      setImageToRecategorize(null);
      return;
    }

    const target = imageToRecategorize;
    updatingCategoryRef.current = true;
    try {
      setUpdatingCategory(newCategory);
      const isStorageItem =
        target.source === 'storage' || String(target.id || '').includes('/');

      if (isStorageItem) {
        const { error } = await supabase
          .from('media_metadata')
          .upsert(
            {
              storage_path: target.id,
              category: newCategory,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'storage_path' }
          );
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('uploaded_images')
          .update({ category: newCategory })
          .eq('id', target.id)
          .select('id');
        if (error) throw error;
        if (!data?.length) {
          throw new Error('Permissão negada ou registro não encontrado (RLS).');
        }
      }

      setImages((prev) =>
        prev.map((item) =>
          item.id === target.id ? { ...item, category: newCategory } : item
        )
      );
      setImageToRecategorize(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const nextMeta = getCategoryMeta(newCategory);
      setTimeout(() => {
        showSuccessAlert(`Categoria atualizada para ${nextMeta.label}.`);
      }, 150);
    } catch (e) {
      console.error(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showErrorAlert(
        formatSupabaseError(e, 'Não foi possível atualizar a categoria da imagem.')
      );
    } finally {
      updatingCategoryRef.current = false;
      setUpdatingCategory(null);
    }
  };

  // ─── Copiar URL de imagem para clipboard com feedback ─────────────
  const handleCopyUrl = async (img) => {
    const url = img.url || `${API_BASE_URL}/api/images/${img.id}`;
    await Clipboard.setStringAsync(url);
    setCopiedId(img.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // ─── Deletar imagem com modal de confirmação ───────────────────────
  const handleDeletePress = (img) => {
    if (uploadingRef.current || uploading || deletingRef.current || isDeleting || updatingCategoryRef.current || updatingCategory) {
      return;
    }
    setImageToDelete(img);
  };

  const handleConfirmDelete = async () => {
    if (!imageToDelete || deletingRef.current || isDeleting) return;
    deletingRef.current = true;
    try {
      setIsDeleting(true);
      const isStorageItem =
        imageToDelete.source === 'storage' || String(imageToDelete.id || '').includes('/');

      if (isStorageItem) {
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([imageToDelete.id]);
        if (error) throw error;

        try {
          await supabase
            .from('media_metadata')
            .delete()
            .eq('storage_path', imageToDelete.id);
        } catch {
          // Best-effort cleanup caso media_metadata não exista
        }
      } else {
        const { data, error } = await supabase
          .from('uploaded_images')
          .delete()
          .eq('id', imageToDelete.id)
          .select('id');
        if (error) throw error;
        if (!data?.length) {
          throw new Error('Permissão negada ou registro não encontrado (RLS).');
        }
      }

      setImages((prev) => prev.filter((i) => i.id !== imageToDelete.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setImageToDelete(null);
    } catch (e) {
      console.error(e);
      showErrorAlert(formatSupabaseError(e, 'Não foi possível deletar a imagem.'));
    } finally {
      deletingRef.current = false;
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

  const isActionBusy = uploading || isDeleting || !!updatingCategory;
  const modalSafeAreaStyle = {
    paddingTop: Math.max(insets.top, SPACING[4]),
    paddingBottom: Math.max(insets.bottom, SPACING[4]),
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Galeria de Mídia</Text>
          <Text style={s.headerSub}>Biblioteca central de imagens e banners</Text>
        </View>
        <Pressable onPress={loadImages} style={s.refreshBtn} hitSlop={10} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={COLORS.text} />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Upload Card (iFood Media Standard) */}
        <View style={s.uploadCard}>
          <View style={s.uploadCardHeader}>
            <View style={s.uploadIconBadge}>
              <Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} />
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
                  <Ionicons
                    name={cat.icon}
                    size={14}
                    color={isSelected ? COLORS.white : cat.color}
                  />
                  <Text style={[s.uploadCatBtnText, isSelected && { color: COLORS.white }]} numberOfLines={2}>
                    {cat.label}
                  </Text>
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
                <ThreeDotsLoader color={COLORS.white} dotSize={7} />
                <Text style={s.uploadActionBtnText}>Otimizando e enviando WebP...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="images-outline" size={20} color={COLORS.white} />
                <Text style={s.uploadActionBtnText}>Escolher imagem da Galeria</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Search & Filter Section */}
        <View style={s.filterSection}>
          {/* Busca por nome */}
          <View style={s.searchContainer}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar imagem por nome..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
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
            <AdminListSkeleton count={4} />
          ) : filteredImages.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIconContainer}>
              <Ionicons name="images-outline" size={40} color={COLORS.textMuted} />
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
              const categoryMeta = getCategoryMeta(img.category);

              return (
                <View key={img.id} style={s.imgCard}>
                  {/* Image View with Overlays */}
                  <View style={s.imageWrapper}>
                    <Image
                      source={{ uri: img.url || `${API_BASE_URL}/api/images/${img.id}` }}
                      style={s.gridImage}
                      resizeMode="cover"
                    />

                    {/* Top Badges */}
                    <View style={s.overlayBadges}>
                      <Pressable
                        style={({ pressed }) => [
                          s.categoryTag,
                          { backgroundColor: categoryMeta.color },
                          pressed && !isActionBusy && { opacity: 0.85 },
                          isActionBusy && { opacity: 0.7 },
                        ]}
                        onPress={() => setImageToRecategorize(img)}
                        disabled={isActionBusy}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={s.categoryTagText} numberOfLines={1}>
                          {categoryMeta.label}
                        </Text>
                        <Ionicons name="pencil" size={9} color={COLORS.white} />
                      </Pressable>
                    </View>

                    {/* Format & Dimension Badges */}
                    {(img.format || dim) && (
                      <View style={s.bottomBadges}>
                        {img.format && (
                          <View
                            style={[
                              s.formatBadge,
                              img.format === 'WEBP' && s.formatBadgeWebp,
                            ]}
                          >
                            <Text style={s.formatBadgeText} numberOfLines={1}>{img.format}</Text>
                          </View>
                        )}
                        {dim && (
                          <View style={s.dimensionBadge}>
                            <Text style={s.dimensionBadgeText} numberOfLines={1}>{dim}</Text>
                          </View>
                        )}
                      </View>
                    )}
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
                        onPress={() => handleCopyUrl(img)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons
                          name={isCopied ? 'checkmark-circle' : 'copy-outline'}
                          size={13}
                          color={isCopied ? COLORS.success : COLORS.textSecondary}
                        />
                        <Text style={[s.actionBtnText, isCopied && s.actionBtnTextCopied]}>
                          {isCopied ? 'Copiado!' : 'Copiar URL'}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[s.deleteBtn, isActionBusy && { opacity: 0.5 }]}
                        onPress={() => handleDeletePress(img)}
                        disabled={isActionBusy}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Quick Category Edit Modal */}
      <Modal
        visible={!!imageToRecategorize}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => !updatingCategory && setImageToRecategorize(null)}
      >
        <View style={[s.modalOverlay, modalSafeAreaStyle]}>
          <View style={s.modalContent}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.modalScrollContent}
            >
              <View style={s.modalHeader}>
                <View style={s.modalEditIcon}>
                  <Ionicons name="pricetag-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>Alterar Categoria</Text>
                  <Text style={s.modalSub}>A URL da imagem permanece inalterada.</Text>
                </View>
              </View>

              {imageToRecategorize && (
                <View style={s.modalPreviewCard}>
                  <Image
                    source={{
                      uri: imageToRecategorize.url || `${API_BASE_URL}/api/images/${imageToRecategorize.id}`,
                    }}
                    style={s.modalThumb}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalFileName} numberOfLines={2}>
                      {imageToRecategorize.name}
                    </Text>
                    <Text style={s.modalCategoryText}>
                      Atual: {getCategoryMeta(imageToRecategorize.category).label}
                    </Text>
                  </View>
                </View>
              )}

              <View style={s.categoryOptionsList}>
                {UPLOAD_CATEGORIES.map((cat) => {
                  const isCurrent = imageToRecategorize?.category === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      style={({ pressed }) => [
                        s.categoryOptionItem,
                        isCurrent && { borderColor: cat.color, backgroundColor: `${cat.color}12` },
                        pressed && !updatingCategory && { opacity: 0.8 },
                      ]}
                      onPress={() => handleSelectNewCategory(cat.key)}
                      disabled={!!updatingCategory}
                    >
                      <View style={[s.categoryOptionIconWrap, { backgroundColor: `${cat.color}18` }]}>
                        <Ionicons name={cat.icon} size={16} color={cat.color} />
                      </View>
                      <Text
                        style={[
                          s.categoryOptionLabel,
                          isCurrent && { color: cat.color, fontWeight: '800' },
                        ]}
                      >
                        {cat.label}
                      </Text>
                      {updatingCategory === cat.key ? (
                        <ActivityIndicator size="small" color={cat.color} />
                      ) : isCurrent ? (
                        <Ionicons name="checkmark-circle" size={18} color={cat.color} />
                      ) : (
                        <View style={[s.categoryOptionDot, { backgroundColor: cat.color }]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={s.modalActionRow}>
                <Pressable
                  style={[s.modalCancelBtn, !!updatingCategory && { opacity: 0.5 }]}
                  onPress={() => setImageToRecategorize(null)}
                  disabled={!!updatingCategory}
                >
                  <Text style={s.modalCancelText}>Cancelar</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
          {!!imageToRecategorize && <ThemedAlertHost />}
        </View>
      </Modal>

      {/* Deletion Confirmation Modal */}
      <Modal
        visible={!!imageToDelete}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => !isDeleting && setImageToDelete(null)}
      >
        <View style={[s.modalOverlay, modalSafeAreaStyle]}>
          <View style={s.modalContent}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.modalScrollContent}
            >
              <View style={s.modalHeader}>
                <View style={s.modalAlertIcon}>
                  <Ionicons name="warning-outline" size={24} color={COLORS.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>Excluir Imagem?</Text>
                  <Text style={s.modalSub}>Esta ação é irreversível e removerá a imagem do sistema.</Text>
                </View>
              </View>

              {imageToDelete && (
                <View style={s.modalPreviewCard}>
                  <Image
                    source={{ uri: imageToDelete.url || `${API_BASE_URL}/api/images/${imageToDelete.id}` }}
                    style={s.modalThumb}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalFileName} numberOfLines={2}>
                      {imageToDelete.name}
                    </Text>
                    <Text style={s.modalCategoryText}>
                      Categoria: {getCategoryMeta(imageToDelete.category).label}
                    </Text>
                  </View>
                </View>
              )}

              <View style={s.modalActionRow}>
                <Pressable
                  style={[s.modalCancelBtn, isDeleting && { opacity: 0.5 }]}
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
                    <ThreeDotsLoader color={COLORS.white} dotSize={7} />
                  ) : (
                    <>
                      <Ionicons name="trash" size={16} color={COLORS.white} />
                      <Text style={s.modalConfirmText}>Excluir</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
          {!!imageToDelete && <ThemedAlertHost />}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[4],
    paddingBottom: 14,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING[3],
  },
  backBtn: { padding: SPACING[1] },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  refreshBtn: { padding: 6 },

  scrollContent: { padding: SPACING[4], paddingBottom: SPACING[10] },

  // Upload Card
  uploadCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[4],
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  uploadCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  uploadIconBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  uploadCardSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  uploadCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  uploadCatBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: COLORS.backgroundElevated,
  },
  uploadCatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flexShrink: 1,
    textAlign: 'center',
  },
  uploadActionBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  uploadActionBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.white },

  // Filter Section
  filterSection: { marginBottom: SPACING[4], gap: 10 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    height: 40,
  },
  searchIcon: { marginRight: SPACING[2] },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 0 },
  categoryPillRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: SPACING[3],
    paddingVertical: 6,
    gap: 6,
  },
  categoryPillActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  categoryPillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  categoryPillTextActive: { color: COLORS.white },
  countBadge: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeActive: { backgroundColor: COLORS.textSecondary },
  countBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
  countBadgeTextActive: { color: COLORS.white },

  // Grid
  centerLoading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 60, gap: SPACING[2] },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1],
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  emptyText: { color: COLORS.textMuted, fontWeight: '500', fontSize: 12, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[3] },
  imgCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  imageWrapper: { width: '100%', height: 120, position: 'relative', backgroundColor: COLORS.grayLight },
  gridImage: { width: '100%', height: '100%' },
  overlayBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  bottomBadges: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    left: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  formatBadge: {
    backgroundColor: 'rgba(17,24,39,0.78)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatBadgeWebp: {
    backgroundColor: 'rgba(5,150,105,0.9)',
  },
  formatBadgeText: { fontSize: 8, fontWeight: '800', color: COLORS.white, letterSpacing: 0.3 },
  dimensionBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dimensionBadgeText: { fontSize: 8, fontWeight: '700', color: COLORS.white },

  imgCardBody: { padding: 10, gap: SPACING[1] },
  imgName: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  imgDate: { fontSize: 9, fontWeight: '500', color: COLORS.textMuted },
  imgCardActions: { flexDirection: 'row', gap: 6, marginTop: SPACING[1] },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.grayLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1],
  },
  actionBtnCopied: { backgroundColor: '#ECFDF5' },
  actionBtnText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
  actionBtnTextCopied: { color: COLORS.success },
  deleteBtn: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: RADIUS.md,
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
    paddingHorizontal: SPACING[5],
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING[5],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalScrollContent: {
    gap: SPACING[4],
  },
  modalHeader: { flexDirection: 'row', gap: SPACING[3], alignItems: 'flex-start' },
  modalAlertIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEditIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  modalPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.grayBorder },
  modalFileName: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  modalCategoryText: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  categoryOptionsList: { gap: SPACING[2] },
  categoryOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 10,
    paddingHorizontal: SPACING[3],
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  categoryOptionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryOptionLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  categoryOptionDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
  },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: SPACING[1] },
  modalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  modalCancelText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { fontSize: 13, fontWeight: '800', color: COLORS.white },
});
