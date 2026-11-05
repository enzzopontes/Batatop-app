import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';
import { showSuccessAlert } from '../ThemedAlert';

export default function AdminHomeBannersSection({ promoImages = [] }) {
  const [banners, setBanners] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [dbImages, setDbImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [couponId, setCouponId] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  const loadBannersAndCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: bannersData }, { data: couponsData }, { data: uploadedImgs }] = await Promise.all([
        supabase
          .from('home_banners')
          .select(
            'id, image_url, title, display_order, is_active, coupon_id, created_at, coupons (id, code, title, discount_value, discount_type, badge_label, active)'
          )
          .order('display_order', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('coupons')
          .select('id, code, title, discount_value, discount_type, badge_label, active')
          .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('uploaded_images')
          .select('id, name, data, mime_type, category, uploaded_at')
          .order('uploaded_at', { ascending: false }),
      ]);

      setBanners(
        (bannersData || []).map((b) => ({
          ...b,
          coupon: b.coupons || null,
        }))
      );
      setCoupons(couponsData || []);

      const allImgs = (uploadedImgs && uploadedImgs.length > 0) ? uploadedImgs : promoImages;
      const sortedImgs = [...allImgs].sort((a, b) => {
        const aIsBanner = (a.name || '').toLowerCase().includes('banner') ? 1 : 0;
        const bIsBanner = (b.name || '').toLowerCase().includes('banner') ? 1 : 0;
        return bIsBanner - aIsBanner;
      });
      setDbImages(sortedImgs);
    } catch (err) {
      console.warn('Erro ao carregar banners da Home:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBannersAndCoupons();

    const channel = supabase
      .channel('mobile_admin_home_banners')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_banners' }, () => {
        loadBannersAndCoupons();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBannersAndCoupons]);

  const handleOpenCreate = () => {
    setEditingBanner(null);
    setImageUrl('');
    setTitle('');
    setCouponId('');
    const nextOrder = banners.length > 0 ? Number(banners[0].display_order || 0) + 1 : 1;
    setDisplayOrder(String(nextOrder));
    setIsActive(true);
    setShowUrlInput(false);
    setModalVisible(true);
  };

  const handleOpenEdit = (banner) => {
    setEditingBanner(banner);
    setImageUrl(banner.image_url || '');
    setTitle(banner.title || '');
    setCouponId(banner.coupon_id || '');
    setDisplayOrder(String(banner.display_order ?? 0));
    setIsActive(Boolean(banner.is_active));
    setShowUrlInput(false);
    setModalVisible(true);
  };

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Permita acesso à galeria para escolher o banner.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];

      setUploadingImage(true);
      const fileName = `home-banner-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;

      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const { error: storageErr } = await supabase.storage
          .from('coupon-banners')
          .upload(fileName, blob, {
            contentType: asset.mimeType || 'image/jpeg',
            upsert: true,
          });

        if (!storageErr) {
          const { data: pubData } = supabase.storage
            .from('coupon-banners')
            .getPublicUrl(fileName);
          if (pubData?.publicUrl) {
            setImageUrl(pubData.publicUrl);
            showSuccessAlert('Imagem do banner carregada!', 'Pronto');
            return;
          }
        }
      } catch {
        // fallback para base64 / uploaded_images
      }

      if (asset.base64) {
        const dataUri = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
        setImageUrl(dataUri);
        showSuccessAlert('Imagem selecionada!', 'Pronto');
      } else {
        setImageUrl(asset.uri);
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const cleanUrl = imageUrl.trim();
    if (!cleanUrl) {
      Alert.alert('Atenção', 'Selecione ou informe a imagem do banner.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        image_url: cleanUrl,
        title: title.trim() || null,
        coupon_id: couponId || null,
        display_order: parseInt(displayOrder, 10) || 0,
        is_active: isActive,
      };

      if (editingBanner) {
        const { error } = await supabase
          .from('home_banners')
          .update(payload)
          .eq('id', editingBanner.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('home_banners').insert([payload]);
        if (error) throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      await loadBannersAndCoupons();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o banner.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (banner) => {
    const nextVal = !banner.is_active;
    try {
      await supabase
        .from('home_banners')
        .update({ is_active: nextVal })
        .eq('id', banner.id);
      setBanners((prev) =>
        prev.map((item) => (item.id === banner.id ? { ...item, is_active: nextVal } : item))
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar o status do banner.');
    }
  };

  const handleDelete = (banner) => {
    Alert.alert('Excluir Banner', 'Deseja remover este banner do carrossel da Home?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('home_banners').delete().eq('id', banner.id);
            await loadBannersAndCoupons();
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o banner.');
          }
        },
      },
    ]);
  };

  return (
    <View style={s.sectionCard}>
      <View style={s.headerRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <View style={s.titleWithIcon}>
            <Ionicons name="images" size={18} color="#D97706" />
            <Text style={s.sectionTitle}>Banners da Home (App & Site)</Text>
          </View>
          <Text style={s.sectionSub}>
            Carrossel 16:9 sincronizado em tempo real com cópia automática de cupom ao tocar.
          </Text>
        </View>

        <Pressable style={s.addBtn} onPress={handleOpenCreate}>
          <Ionicons name="add" size={18} color="#111827" />
          <Text style={s.addBtnText}>Novo Banner</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.emptyBox}>
          <ActivityIndicator size="small" color="#D97706" />
          <Text style={s.emptyText}>Carregando banners...</Text>
        </View>
      ) : banners.length === 0 ? (
        <View style={s.emptyBox}>
          <Ionicons name="images-outline" size={32} color="#9CA3AF" />
          <Text style={s.emptyText}>
            Nenhum banner cadastrado. Toque em &quot;Novo Banner&quot; para adicionar.
          </Text>
        </View>
      ) : (
        <View style={s.listWrap}>
          {banners.map((b) => (
            <View key={b.id} style={s.bannerItemCard}>
              <View style={s.previewBox}>
                <Image source={{ uri: b.image_url }} style={s.previewImg} resizeMode="cover" />
                {!b.is_active && (
                  <View style={s.inactiveOverlay}>
                    <Text style={s.inactiveOverlayText}>INATIVO</Text>
                  </View>
                )}
                {b.coupon && (
                  <View style={s.couponChip}>
                    <Ionicons name="pricetag" size={11} color="#FBBF24" />
                    <Text style={s.couponChipText}>Cupom: {b.coupon.code}</Text>
                  </View>
                )}
              </View>

              <View style={s.itemFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle} numberOfLines={1}>
                    {b.title || b.coupon?.title || 'Sem título'}
                  </Text>
                  <Text style={s.itemOrder}>Ordem: {b.display_order ?? 0}</Text>
                </View>

                <View style={s.itemActions}>
                  <Switch
                    value={Boolean(b.is_active)}
                    onValueChange={() => handleToggleStatus(b)}
                    trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                    thumbColor="#FFF"
                  />
                  <Pressable style={s.iconBtn} onPress={() => handleOpenEdit(b)}>
                    <Ionicons name="create-outline" size={18} color="#374151" />
                  </Pressable>
                  <Pressable style={s.iconBtn} onPress={() => handleDelete(b)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <SwipeableBottomSheetModal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={s.sheet}
        scrollable
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>
                {editingBanner ? 'Editar Banner Promocional' : 'Novo Banner Promocional'}
              </Text>
              <Text style={s.modalSub}>Aparece no topo da Home do App e do Site</Text>
            </View>
            <Pressable onPress={() => setModalVisible(false)} style={s.closeBtn}>
              <Ionicons name="close" size={20} color="#374151" />
            </Pressable>
          </View>

          <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
            <View style={s.imageHeaderRow}>
              <Text style={s.fieldLabel}>Arte do Banner (16:9) *</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  style={s.compactActionBtn}
                  onPress={handlePickFromGallery}
                  disabled={uploadingImage}
                >
                  <Ionicons name="cloud-upload-outline" size={13} color="#C1440E" />
                  <Text style={s.compactActionText}>
                    {uploadingImage ? 'Subindo...' : 'Galeria'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.compactActionBtn, showUrlInput && s.compactActionBtnActive]}
                  onPress={() => setShowUrlInput((v) => !v)}
                >
                  <Ionicons name="link-outline" size={13} color="#6B7280" />
                  <Text style={s.compactActionText}>URL</Text>
                </Pressable>
              </View>
            </View>

            {/* Campo compacto de URL externa */}
            {showUrlInput && (
              <View style={s.urlInputRow}>
                <TextInput
                  style={s.compactUrlInput}
                  placeholder="Cole o link (https://...)"
                  placeholderTextColor="#9CA3AF"
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowUrlInput(false)} style={s.closeUrlBtn}>
                  <Ionicons name="close" size={16} color="#9CA3AF" />
                </Pressable>
              </View>
            )}

            {/* Galeria de Banners no Supabase com nomezinho em cima e miniatura embaixo */}
            {dbImages.length > 0 && (
              <View style={{ marginTop: 6, marginBottom: 10 }}>
                <Text style={s.subLabel}>Banners no Supabase (toque para escolher):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {dbImages.map((img) => {
                    const uri = img.data ? `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` : `/api/images/${img.id}`;
                    const isSelected = imageUrl === uri || imageUrl.includes(img.id);
                    const friendlyName = (img.name || '')
                      .replace(/\.[^/.]+$/, '')
                      .replace(/^banner[-_]?\d*[-_]?/i, '')
                      .replace(/[-_]/g, ' ')
                      .toUpperCase() || 'BANNER';

                    return (
                      <Pressable
                        key={img.id}
                        onPress={() => {
                          setImageUrl(uri);
                          if (!title) setTitle(friendlyName);
                        }}
                        style={[s.bannerCard, isSelected && s.bannerCardSelected]}
                      >
                        {/* Nomezinho em cima */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={[s.bannerCardTitle, isSelected && s.bannerCardTitleSelected]} numberOfLines={1}>
                            {friendlyName}
                          </Text>
                          {isSelected && <Ionicons name="checkmark-circle" size={13} color="#E3A008" />}
                        </View>
                        {/* Imagem pequena embaixo */}
                        <Image source={{ uri }} style={s.bannerCardImg} resizeMode="cover" />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Preview da Imagem Selecionada */}
            {Boolean(imageUrl) && (
              <View style={s.selectedBar}>
                <Image source={{ uri: imageUrl }} style={s.selectedBarThumb} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.selectedBarBadge}>✓ IMAGEM SELECIONADA</Text>
                  <Text style={s.selectedBarText} numberOfLines={1}>
                    {title || 'Banner pronto'}
                  </Text>
                </View>
                <Pressable onPress={() => setImageUrl('')}>
                  <Text style={s.selectedBarTrocar}>Trocar</Text>
                </Pressable>
              </View>
            )}

            <Text style={s.fieldLabel}>Título do Banner (opcional)</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: Sexta da Batata Top"
              placeholderTextColor="#9CA3AF"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={s.fieldLabel}>Cupom Vinculado (Copiado ao Tocar)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              <Pressable
                style={[s.couponSelectPill, !couponId && s.couponSelectPillActive]}
                onPress={() => setCouponId('')}
              >
                <Text style={[s.couponSelectText, !couponId && s.couponSelectTextActive]}>
                  Nenhum cupom
                </Text>
              </Pressable>
              {coupons.map((c) => {
                const selected = couponId === c.id;
                const desc =
                  c.discount_type === 'percentage'
                    ? `${c.discount_value}%`
                    : `R$ ${c.discount_value}`;
                return (
                  <Pressable
                    key={c.id}
                    style={[s.couponSelectPill, selected && s.couponSelectPillActive]}
                    onPress={() => setCouponId(c.id)}
                  >
                    <Text style={[s.couponSelectText, selected && s.couponSelectTextActive]}>
                      {c.code} ({desc})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.rowTwoCols}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Ordem de Exibição</Text>
                <TextInput
                  style={s.input}
                  value={displayOrder}
                  onChangeText={setDisplayOrder}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>

              <View style={s.switchWrap}>
                <Text style={s.fieldLabel}>Ativo na Home</Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                  thumbColor="#FFF"
                />
              </View>
            </View>
          </ScrollView>

          <View style={s.modalFooter}>
            <Pressable style={s.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={s.cancelBtnText}>Cancelar</Text>
            </Pressable>
            <Pressable style={s.saveBtn} onPress={handleSave} disabled={saving}>
              <Text style={s.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Banner'}</Text>
            </Pressable>
          </View>
        </View>
      </SwipeableBottomSheetModal>
    </View>
  );
}

const s = StyleSheet.create({
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  sectionSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E3A008',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: 14,
    gap: 6,
  },
  emptyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  listWrap: {
    gap: 12,
  },
  bannerItemCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },
  previewBox: {
    width: '100%',
    height: 130,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  inactiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveOverlayText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  couponChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  couponChipText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  itemFooter: {
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  itemOrder: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '88%',
    maxHeight: '88%',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  modalSub: {
    fontSize: 11,
    color: '#6B7280',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  modalBody: {
    flex: 1,
    padding: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginTop: 12,
    marginBottom: 6,
  },
  imageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  compactActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  compactActionBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#E3A008',
  },
  compactActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  compactUrlInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#111827',
  },
  closeUrlBtn: {
    padding: 4,
  },
  bannerCard: {
    width: 140,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 6,
  },
  bannerCardSelected: {
    borderColor: '#E3A008',
    backgroundColor: '#FFFBEB',
  },
  bannerCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#374151',
    flex: 1,
  },
  bannerCardTitleSelected: {
    color: '#92400E',
  },
  bannerCardImg: {
    width: '100%',
    height: 75,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  selectedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: 'rgba(227, 160, 8, 0.4)',
    marginTop: 6,
    marginBottom: 6,
  },
  selectedBarThumb: {
    width: 60,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  selectedBarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  selectedBarBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  selectedBarTrocar: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    paddingHorizontal: 6,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  galleryBtn: {
    marginTop: 8,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  galleryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C1440E',
  },
  thumbWrap: {
    width: 64,
    height: 42,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  thumbSelected: {
    borderColor: '#E3A008',
    borderWidth: 2,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  livePreviewWrap: {
    marginTop: 10,
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  livePreviewImg: {
    width: '100%',
    height: '100%',
  },
  couponSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    marginRight: 8,
  },
  couponSelectPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#E3A008',
  },
  couponSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  couponSelectTextActive: {
    color: '#92400E',
    fontWeight: '900',
  },
  rowTwoCols: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  switchWrap: {
    flex: 1,
    alignItems: 'flex-start',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
  },
  saveBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#E3A008',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
});
