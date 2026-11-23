import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import { resolveProductImage, API_BASE_URL } from '../../utils/resolveProductImage';

const STORAGE_BUCKET = 'Products';
const STORAGE_FOLDERS = [
  { folder: '', category: 'product' },
  { folder: 'uploads/product', category: 'product' },
  { folder: 'uploads/promo', category: 'promo' },
  { folder: 'uploads/general', category: 'general' },
];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_CATEGORIES = new Set(['product', 'promo', 'general']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = 2_750_000;

function isSafeImageUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (trimmed.includes('..')) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return false;
}

function normalizeMimeType(rawMime) {
  if (!rawMime || typeof rawMime !== 'string') return '';
  const cleaned = rawMime.split(';')[0].trim().toLowerCase();
  if (cleaned === 'image/jpg') return 'image/jpeg';
  return cleaned;
}

function mimeFromExtension(source) {
  if (!source || typeof source !== 'string') return '';
  const clean = source.split(/[?#]/)[0].toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)$/);
  if (!match) return '';
  const ext = match[1];
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Prefix(base64, maxBytes = 12) {
  const clean = base64.replace(/\s+/g, '');
  const bytes = [];
  for (let i = 0; i + 3 < clean.length && bytes.length < maxBytes; i += 4) {
    const c1 = BASE64_CHARS.indexOf(clean[i]);
    const c2 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (c1 < 0 || c2 < 0 || (clean[i + 2] !== '=' && c3 < 0) || (clean[i + 3] !== '=' && c4 < 0)) {
      return null;
    }
    bytes.push((c1 << 2) | (c2 >> 4));
    if (c3 >= 0 && bytes.length < maxBytes) {
      bytes.push(((c2 & 15) << 4) | (c3 >> 2));
    }
    if (c4 >= 0 && bytes.length < maxBytes) {
      bytes.push(((c3 & 3) << 6) | c4);
    }
  }
  return bytes;
}

function hasValidImageMagicBytes(base64, mimeType) {
  if (typeof base64 !== 'string' || !base64) return false;
  const trimmed = base64.trim();
  if (mimeType === 'image/jpeg') return trimmed.startsWith('/9j/');
  if (mimeType === 'image/png') return trimmed.startsWith('iVBORw0KGgo');
  if (mimeType === 'image/webp') {
    if (!trimmed.startsWith('UklGR')) return false;
    const header = decodeBase64Prefix(trimmed.slice(0, 24), 12);
    if (!header || header.length < 12) return false;
    return header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  }
  return false;
}

function sanitizeFileName(rawName, fallbackExt, prefix = 'product') {
  const fallback = `${prefix}-${Date.now()}.${fallbackExt}`;
  if (!rawName || typeof rawName !== 'string') return fallback;
  const base = rawName.split(/[\\/]/).pop() || '';
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+/, '')
    .slice(0, 100);
  return cleaned || fallback;
}

function getNormalizedKeys(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return [];
  const trimmed = rawUrl.trim();
  if (!trimmed) return [];

  const keys = new Set();
  const addVariants = (candidate) => {
    if (!candidate) return;
    const withoutQuery = candidate.split(/[?#]/)[0];
    let decoded = withoutQuery;
    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      decoded = withoutQuery;
    }
    const lower = decoded.toLowerCase();
    keys.add(lower);

    const storageMatch = lower.match(/\/storage\/v1\/object\/public\/products\/(.+)$/i);
    if (storageMatch?.[1]) {
      const rel = storageMatch[1].replace(/^\/+/, '');
      if (rel) {
        keys.add(`products:${rel}`);
        keys.add(`/products/${rel}`);
      }
    }

    const couponBannerMatch = lower.match(/\/storage\/v1\/object\/public\/coupon-banners\/(.+)$/i);
    if (couponBannerMatch?.[1]) {
      const rel = couponBannerMatch[1].replace(/^\/+/, '');
      if (rel) {
        keys.add(`coupon-banners:${rel}`);
      }
    }

    const relProductsMatch = lower.match(/^\/?products\/(.+)$/i);
    if (relProductsMatch?.[1]) {
      const rel = relProductsMatch[1].replace(/^\/+/, '');
      if (rel) {
        keys.add(`products:${rel}`);
        keys.add(`/products/${rel}`);
      }
    }

    const apiImgMatch = lower.match(/(\/api\/images\/[^/?#]+)$/i);
    if (apiImgMatch?.[1]) {
      keys.add(apiImgMatch[1]);
    }

    if (!/^https?:\/\//i.test(lower) && !lower.startsWith('/api/images/') && !lower.startsWith('/products/') && !lower.startsWith('products/')) {
      const bare = lower.replace(/^\/+/, '');
      if (bare) {
        keys.add(`products:${bare}`);
        keys.add(`/products/${bare}`);
      }
    }
  };

  addVariants(trimmed);
  const resolved = resolveProductImage(trimmed, null);
  if (resolved) {
    addVariants(resolved);
  }

  return Array.from(keys);
}

export default function ProductImagePicker({
  value,
  onChange,
  usedUrls = [],
  visible = true,
  label = 'Foto do Produto',
  category = 'product',
  emptyUsedText = 'Todas as fotos do banco já estão em uso em outros produtos.',
  includeCouponBanners = false,
  hidePreview = false,
}) {
  const safeCategory = ALLOWED_CATEGORIES.has(category) ? category : 'product';
  const [bankImages, setBankImages] = useState([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [bankError, setBankError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [brokenThumbIds, setBrokenThumbIds] = useState({});

  const mountedRef = useRef(true);
  const visibleRef = useRef(visible);
  const busyRef = useRef(false);

  const isActive = useCallback(() => mountedRef.current && visibleRef.current, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) {
      setLoadingBank(false);
      setUploading(false);
    }
  }, [visible]);

  const loadBankImages = useCallback(async () => {
    if (!isActive()) return;
    try {
      setLoadingBank(true);
      setBankError(false);

      const storageTasks = STORAGE_FOLDERS.map(async ({ folder, category: folderCategory }) => {
        try {
          const { data: files, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(folder, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

          if (error || !files) return { items: [], failed: true };

          const items = files
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
                category: folderCategory,
                uploaded_at: file.created_at || file.updated_at || new Date().toISOString(),
                source: 'storage',
              };
            })
            .filter((item) => Boolean(item.url));

          return { items, failed: false };
        } catch {
          return { items: [], failed: true };
        }
      });

      if (includeCouponBanners) {
        storageTasks.push(
          (async () => {
            try {
              const { data: files, error } = await supabase.storage
                .from('coupon-banners')
                .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

              if (error || !files) return { items: [], failed: true };

              const items = files
                .filter((file) => file && file.name && !file.name.startsWith('.') && file.id)
                .map((file) => {
                  const { data: pubData } = supabase.storage
                    .from('coupon-banners')
                    .getPublicUrl(file.name);

                  return {
                    id: file.name,
                    name: file.name,
                    url: pubData?.publicUrl || '',
                    category: 'promo',
                    uploaded_at: file.created_at || file.updated_at || new Date().toISOString(),
                    source: 'coupon-banners',
                  };
                })
                .filter((item) => Boolean(item.url));

              return { items, failed: false };
            } catch {
              return { items: [], failed: true };
            }
          })()
        );
      }

      const [storageResults, dbResult] = await Promise.all([
        Promise.all(storageTasks),
        supabase
          .from('uploaded_images')
          .select('id, name, mime_type, category, uploaded_at')
          .order('uploaded_at', { ascending: false }),
      ]);

      if (!isActive()) return;

      const storageImages = storageResults.flatMap((r) => r.items);
      const storageFailed = storageResults.some((r) => r.failed);
      const dbFailed = Boolean(dbResult.error);
      const dbImages = (dbResult.data || []).map((row) => ({
        ...row,
        url: `${API_BASE_URL}/api/images/${row.id}`,
        source: 'database',
      }));

      const combined = [...storageImages, ...dbImages].sort(
        (a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime()
      );

      setBankImages(combined);
      setBrokenThumbIds({});
      setBankError(storageFailed || dbFailed);
    } catch (e) {
      console.error('Erro ao carregar banco de fotos:', e);
      if (isActive()) {
        setBankError(true);
      }
    } finally {
      if (isActive()) {
        setLoadingBank(false);
      }
    }
  }, [isActive, includeCouponBanners]);

  useEffect(() => {
    if (visible) {
      loadBankImages();
    }
  }, [visible, loadBankImages]);

  const usedKeySet = useMemo(() => {
    const set = new Set();
    for (const u of usedUrls || []) {
      for (const key of getNormalizedKeys(u)) {
        set.add(key);
      }
    }
    return set;
  }, [usedUrls]);

  const selectedKeySet = useMemo(() => {
    return new Set(getNormalizedKeys(value));
  }, [value]);

  const availableImages = useMemo(() => {
    return bankImages.filter((img) => {
      const keys = getNormalizedKeys(img.url);
      const isSelected = keys.some((k) => selectedKeySet.has(k));
      if (isSelected) return true;
      const isUsed = keys.some((k) => usedKeySet.has(k));
      return !isUsed;
    });
  }, [bankImages, selectedKeySet, usedKeySet]);

  const handlePickFromGallery = async () => {
    if (busyRef.current || !isActive()) return;
    busyRef.current = true;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isActive()) return;

      if (!permissionResult.granted) {
        if (permissionResult.canAskAgain === false) {
          Alert.alert(
            'Permissão necessária',
            'O acesso à galeria foi bloqueado. Abra as configurações para permitir o acesso.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert('Permissão necessária', 'Precisamos de permissão para acessar sua galeria.');
        }
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.72,
        base64: true,
      });

      if (!isActive()) return;
      if (pickerResult.canceled || !pickerResult.assets?.[0]) return;

      const asset = pickerResult.assets[0];
      if (!asset.uri && !asset.base64) {
        Alert.alert('Erro', 'Não foi possível ler os dados da imagem.');
        return;
      }

      let mimeType = normalizeMimeType(asset.mimeType);
      if (mimeType === 'image/svg+xml' || (mimeType && !mimeType.startsWith('image/'))) {
        Alert.alert('Formato não suportado', 'Use uma imagem válida (JPG, PNG, WebP ou HEIC).');
        return;
      }

      if (
        typeof asset.fileSize === 'number' &&
        (asset.fileSize <= 0 || asset.fileSize > MAX_FILE_SIZE_BYTES)
      ) {
        Alert.alert('Imagem muito grande', 'Escolha uma imagem válida com até 5MB.');
        return;
      }

      if (isActive()) setUploading(true);

      let uploadUri = asset.uri || null;
      let uploadBase64 = asset.base64 || null;

      // Converte automaticamente PNG, JPG, HEIC, etc. para WebP antes do upload
      if (uploadUri && ImageManipulator?.manipulateAsync && ImageManipulator?.SaveFormat?.WEBP) {
        const actions =
          typeof asset.width === 'number' && asset.width > 1200
            ? [{ resize: { width: 1200 } }]
            : [];
        try {
          const manipulated = await ImageManipulator.manipulateAsync(uploadUri, actions, {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.WEBP,
            base64: true,
          });
          if (manipulated?.uri) {
            uploadUri = manipulated.uri;
            uploadBase64 = manipulated.base64 || null;
            mimeType = 'image/webp';
          }
        } catch (webpError) {
          console.warn('Conversão para WebP falhou, tentando fallback JPEG:', webpError);
          if (ImageManipulator?.SaveFormat?.JPEG) {
            try {
              const jpegManipulated = await ImageManipulator.manipulateAsync(uploadUri, actions, {
                compress: 0.8,
                format: ImageManipulator.SaveFormat.JPEG,
                base64: true,
              });
              if (jpegManipulated?.uri) {
                uploadUri = jpegManipulated.uri;
                uploadBase64 = jpegManipulated.base64 || null;
                mimeType = 'image/jpeg';
              }
            } catch {
              // Fallback seguro para formato original caso o módulo nativo não suporte WebP no build atual
            }
          }
        }
      }

      if (!isActive()) return;

      let blob = null;
      if (uploadUri) {
        try {
          const response = await fetch(uploadUri);
          blob = await response.blob();
        } catch {
          blob = null;
        }
      }

      if (!isActive()) return;

      if (!mimeType && blob?.type) {
        mimeType = normalizeMimeType(blob.type);
      }
      if (!mimeType) {
        mimeType = mimeFromExtension(asset.fileName || uploadUri);
      }
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        Alert.alert('Formato não suportado', 'Use imagens nos formatos JPG, PNG ou WebP.');
        return;
      }

      if (blob && (typeof blob.size !== 'number' || blob.size <= 0 || blob.size > MAX_FILE_SIZE_BYTES)) {
        Alert.alert('Imagem muito grande', 'Escolha uma imagem válida com até 5MB.');
        return;
      }

      if (uploadBase64 && !hasValidImageMagicBytes(uploadBase64, mimeType)) {
        Alert.alert('Imagem inválida', 'O conteúdo do arquivo não corresponde a uma imagem válida (JPG, PNG ou WebP).');
        return;
      }

      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const rand = Math.random().toString(36).slice(2, 8);
      const storagePath = `uploads/${safeCategory}/${Date.now()}-${rand}.${ext}`;

      let uploadedUrl = null;
      if (blob) {
        try {
          const { error: storageError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, blob, {
              contentType: mimeType,
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

      if (!isActive()) return;

      if (!uploadedUrl) {
        if (!uploadBase64) {
          throw new Error('Não foi possível ler os dados da imagem.');
        }

        if (uploadBase64.length > MAX_BASE64_LENGTH) {
          Alert.alert('Imagem muito grande', 'Escolha uma imagem menor que 2MB.');
          return;
        }

        const fileName = sanitizeFileName(asset.fileName, ext, safeCategory);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

        const { error } = await supabase.from('uploaded_images').insert({
          id,
          name: fileName,
          data: uploadBase64,
          mime_type: mimeType,
          category: safeCategory,
          uploaded_at: new Date().toISOString(),
        });

        if (error) throw error;
        uploadedUrl = `${API_BASE_URL}/api/images/${id}`;
      }

      if (!isActive()) return;
      onChange?.(uploadedUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadBankImages();
    } catch (e) {
      console.error('Erro ao enviar imagem:', e);
      if (isActive()) {
        Alert.alert('Erro', 'Não foi possível enviar a imagem.');
      }
    } finally {
      busyRef.current = false;
      if (isActive()) {
        setUploading(false);
      }
    }
  };

  const resolvedPreview = isSafeImageUrl(value) ? resolveProductImage(value, null) : null;
  const hasSafePreview = isSafeImageUrl(resolvedPreview);

  useEffect(() => {
    setPreviewError(false);
  }, [resolvedPreview]);

  return (
    <View style={s.wrapper}>
      <Text style={s.sectionLabel}>{label}</Text>

      {/* Preview da imagem selecionada */}
      {!hidePreview && (hasSafePreview ? (
        <View style={s.previewCard}>
          {previewError ? (
            <View style={[s.previewImage, s.imageFallback]}>
              <Ionicons name="image-outline" size={24} color="#9CA3AF" />
            </View>
          ) : (
            <Image
              source={{ uri: resolvedPreview }}
              style={s.previewImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              onError={() => setPreviewError(true)}
            />
          )}
          <View style={s.previewInfo}>
            <Text style={s.previewTitle}>Imagem selecionada</Text>
            <Text style={s.previewUrl} numberOfLines={2}>
              {value}
            </Text>
            <Pressable
              style={s.removeBtn}
              hitSlop={10}
              onPress={() => {
                Haptics.selectionAsync();
                onChange?.('');
              }}
            >
              <Ionicons name="trash-outline" size={13} color="#DC2626" />
              <Text style={s.removeBtnText}>Remover</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={s.emptyPreview}>
          <Ionicons name="image-outline" size={24} color="#6B7280" />
          <Text style={s.emptyPreviewText}>Nenhuma foto selecionada</Text>
        </View>
      ))}

      {/* Botão enviar foto da galeria */}
      <Pressable
        style={[s.uploadBtn, uploading && { opacity: 0.7 }]}
        onPress={handlePickFromGallery}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <ActivityIndicator size="small" color="#1A1A1A" />
            <Text style={s.uploadBtnText}>Convertendo e enviando...</Text>
          </>
        ) : (
          <>
            <Ionicons name="images-outline" size={17} color="#1A1A1A" />
            <Text style={s.uploadBtnText}>Enviar foto da galeria (WebP)</Text>
          </>
        )}
      </Pressable>

      {/* Banco de fotos disponíveis */}
      <View style={s.bankSection}>
        <View style={s.bankHeader}>
          <Text style={s.bankTitle}>
            Banco de fotos disponíveis ({availableImages.length})
          </Text>
          <Pressable
            onPress={loadBankImages}
            disabled={loadingBank}
            hitSlop={12}
            style={s.refreshBtn}
          >
            {loadingBank ? (
              <ActivityIndicator size="small" color="#E3A008" />
            ) : (
              <Ionicons name="refresh-outline" size={15} color="#6B7280" />
            )}
          </Pressable>
        </View>

        {loadingBank && bankImages.length === 0 ? (
          <View style={s.bankStateBox}>
            <ActivityIndicator size="small" color="#E3A008" />
            <Text style={s.bankStateText}>Carregando banco de fotos...</Text>
          </View>
        ) : bankError && bankImages.length === 0 ? (
          <View style={s.bankErrorBox}>
            <View style={s.bankErrorRow}>
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text style={s.bankErrorText}>Não foi possível carregar o banco de fotos.</Text>
            </View>
            <Pressable style={s.retryBtn} onPress={loadBankImages} disabled={loadingBank}>
              <Text style={s.retryBtnText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : availableImages.length === 0 ? (
          <View style={s.bankStateBox}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color="#9CA3AF" />
            <Text style={s.bankStateText}>
              {bankImages.length > 0
                ? emptyUsedText
                : 'Nenhuma foto disponível no banco ainda.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.thumbRow}
          >
            {availableImages.map((img) => {
              const thumbKey = `${img.source}-${img.id}`;
              const isSelected = getNormalizedKeys(img.url).some((k) => selectedKeySet.has(k));
              const isBroken = Boolean(brokenThumbIds[thumbKey]);
              return (
                <Pressable
                  key={thumbKey}
                  style={[s.thumbCard, isSelected && s.thumbCardSelected]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onChange?.(img.url);
                  }}
                >
                  {isBroken ? (
                    <View style={[s.thumbImage, s.imageFallback]}>
                      <Ionicons name="image-outline" size={20} color="#9CA3AF" />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: img.url }}
                      style={s.thumbImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      onError={() =>
                        setBrokenThumbIds((prev) =>
                          prev[thumbKey] ? prev : { ...prev, [thumbKey]: true }
                        )
                      }
                    />
                  )}
                  {isSelected && (
                    <View style={s.selectedBadge}>
                      <Ionicons name="checkmark" size={11} color="#FFF" />
                    </View>
                  )}
                  <Text style={s.thumbName} numberOfLines={1}>
                    {img.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 10,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  previewInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  previewUrl: {
    fontSize: 10,
    color: '#6B7280',
  },
  removeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 2,
  },
  removeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  emptyPreviewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E3A008',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  bankSection: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bankTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
  },
  refreshBtn: {
    padding: 2,
  },
  bankStateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  bankStateText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  bankErrorBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  bankErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bankErrorText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  thumbRow: {
    gap: 8,
    paddingVertical: 2,
  },
  thumbCard: {
    width: 76,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbCardSelected: {
    borderColor: '#E3A008',
    backgroundColor: '#FEF3C7',
  },
  thumbImage: {
    width: 73,
    height: 64,
    backgroundColor: '#F3F4F6',
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C1440E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbName: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4B5563',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
});
