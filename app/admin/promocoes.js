import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, TextInput, Switch,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';

export default function AdminPromocoes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [products, setProducts] = useState([]);
  const [promoImages, setPromoImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Status settings de promoção
  const [storeSettingsId, setStoreSettingsId] = useState(null);
  const [settingsValue, setSettingsValue] = useState(null);

  const [superPromo, setSuperPromo] = useState({
    isActive: false,
    price: 26.00,
    imageId: null,
    imageUrl: null,
    useUrl: false,
  });

  const [itemPromo, setItemPromo] = useState({
    isActive: false,
    imageId: null,
    imageUrl: null,
    useUrl: false,
  });

  const [promoProducts, setPromoProducts] = useState([]); // Array de { productId, productName, promoPrice }

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Carregar produtos
      const { data: prods, error: pe } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (pe) throw pe;
      setProducts(prods || []);

      // Carregar imagens do tipo 'promo'
      const { data: imgs, error: ie } = await supabase
        .from('uploaded_images')
        .select('*')
        .eq('category', 'promo')
        .order('uploaded_at', { ascending: false })
        .limit(30);
      if (ie) throw ie;
      setPromoImages(imgs || []);

      // Carregar configurações da loja
      const { data: settingsData, error: se } = await supabase
        .from('store_settings')
        .select('*')
        .eq('setting_key', 'store_status')
        .maybeSingle();

      if (se) throw se;

      if (settingsData) {
        setStoreSettingsId(settingsData.id);
        const val = settingsData.setting_value || {};
        setSettingsValue(val);

        if (val.superPromo) {
          setSuperPromo({
            isActive: !!val.superPromo.isActive,
            price: Number(val.superPromo.price ?? 26.00),
            imageId: val.superPromo.imageId || null,
            imageUrl: val.superPromo.imageUrl || null,
            useUrl: !!val.superPromo.useUrl,
          });
        }

        if (val.itemPromo) {
          setItemPromo({
            isActive: !!val.itemPromo.isActive,
            imageId: val.itemPromo.imageId || null,
            imageUrl: val.itemPromo.imageUrl || null,
            useUrl: !!val.itemPromo.useUrl,
          });
        }

        if (val.promoProducts) {
          setPromoProducts(val.promoProducts);
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível carregar as configurações de promoções.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Salvar configurações de promoção ────────────────────────────
  const savePromoSettings = async (updatedSuperPromo, updatedItemPromo, updatedPromoProducts) => {
    if (!storeSettingsId) {
      Alert.alert('Erro', 'Configuração da loja não encontrada.');
      return;
    }

    setSaving(true);
    try {
      const newValue = {
        ...settingsValue,
        superPromo: updatedSuperPromo,
        itemPromo: updatedItemPromo,
        promoProducts: updatedPromoProducts,
        // Também define os campos antigos de compatibilidade se necessário
        isPromoActive: updatedSuperPromo.isActive || updatedItemPromo.isActive,
        promoPrice: updatedSuperPromo.isActive ? updatedSuperPromo.price : (settingsValue.promoPrice || 24.99),
      };

      const { error } = await supabase
        .from('store_settings')
        .update({ setting_value: newValue })
        .eq('id', storeSettingsId);

      if (error) throw error;

      setSettingsValue(newValue);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'Promoções salvas com sucesso!');
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProduct = (product) => {
    const exists = promoProducts.some(p => p.productId === product.id);
    if (exists) {
      setPromoProducts(prev => prev.filter(p => p.productId !== product.id));
    } else {
      setPromoProducts(prev => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          promoPrice: Number(product.price || 0) - 1.00,
        }
      ]);
    }
  };

  const handleUpdateProductPrice = (productId, priceText) => {
    const numeric = parseFloat(priceText.replace(',', '.'));
    setPromoProducts(prev =>
      prev.map(p =>
        p.productId === productId ? { ...p, promoPrice: isNaN(numeric) ? 0 : numeric } : p
      )
    );
  };

  const getImageSrc = (imageId, imageUrl, useUrl) => {
    if (useUrl && imageUrl) {
      return { uri: imageUrl };
    }
    if (imageId) {
      const img = promoImages.find(i => i.id === imageId);
      if (img && img.data) {
        return { uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` };
      }
    }
    return null;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gerenciar Promoções</Text>
          <Text style={s.headerSub}>Configurações de preços especiais e banners</Text>
        </View>
        <Pressable onPress={loadData} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#FFB800" />
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#FFB800" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scrollContent}>
          
          {/* 1. SUPER PROMOÇÃO */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderTitleRow}>
                <Ionicons name="flash-outline" size={20} color="#D97706" />
                <Text style={s.cardTitle}>Super Promoção</Text>
              </View>
              <Switch
                value={superPromo.isActive}
                onValueChange={(val) => setSuperPromo(prev => ({ ...prev, isActive: val }))}
                trackColor={{ false: '#E5E7EB', true: '#FFB800' }}
                thumbColor="#FFF"
              />
            </View>
            <View style={s.cardBody}>
              <Text style={s.infoText}>
                A Super Promoção aplica o mesmo preço a <Text style={{ fontWeight: '800' }}>TODAS as batatas</Text> do cardápio automaticamente.
              </Text>

              <Text style={s.fieldLabel}>Preço Promocional (R$)</Text>
              <TextInput
                style={s.input}
                value={String(superPromo.price)}
                onChangeText={(v) => setSuperPromo(prev => ({ ...prev, price: parseFloat(v) || 0 }))}
                keyboardType="decimal-pad"
                placeholder="26.00"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={s.fieldLabel}>Imagem do Banner da Promoção</Text>
              <View style={s.tabsRow}>
                <Pressable
                  style={[s.tabBtn, !superPromo.useUrl && s.tabBtnActive]}
                  onPress={() => setSuperPromo(prev => ({ ...prev, useUrl: false }))}
                >
                  <Text style={[s.tabBtnText, !superPromo.useUrl && s.tabBtnTextActive]}>Uploads</Text>
                </Pressable>
                <Pressable
                  style={[s.tabBtn, superPromo.useUrl && s.tabBtnActive]}
                  onPress={() => setSuperPromo(prev => ({ ...prev, useUrl: true }))}
                >
                  <Text style={[s.tabBtnText, superPromo.useUrl && s.tabBtnTextActive]}>URL Externa</Text>
                </Pressable>
              </View>

              {superPromo.useUrl ? (
                <TextInput
                  style={s.input}
                  placeholder="https://exemplo.com/banner.png"
                  value={superPromo.imageUrl || ''}
                  onChangeText={(v) => setSuperPromo(prev => ({ ...prev, imageUrl: v }))}
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.imagesScroll}>
                  <Pressable
                    style={[s.imgThumbnail, !superPromo.imageId && s.imgThumbnailSelected]}
                    onPress={() => setSuperPromo(prev => ({ ...prev, imageId: null }))}
                  >
                    <Ionicons name="close" size={24} color="#9CA3AF" />
                    <Text style={s.imgName}>Sem Banner</Text>
                  </Pressable>
                  {promoImages.map((img) => (
                    <Pressable
                      key={img.id}
                      style={[s.imgThumbnail, superPromo.imageId === img.id && s.imgThumbnailSelected]}
                      onPress={() => setSuperPromo(prev => ({ ...prev, imageId: img.id }))}
                    >
                      <Image
                        source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                        style={s.thumbnailImage}
                      />
                      <Text style={s.imgName} numberOfLines={1}>{img.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {getImageSrc(superPromo.imageId, superPromo.imageUrl, superPromo.useUrl) && (
                <View style={s.previewContainer}>
                  <Text style={s.previewLabel}>Preview do Banner:</Text>
                  <Image
                    source={getImageSrc(superPromo.imageId, superPromo.imageUrl, superPromo.useUrl)}
                    style={s.previewImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            </View>
          </View>

          {/* 2. PROMOÇÃO DE ITENS ESPECÍFICOS */}
          <View style={[s.card, { marginTop: 16 }]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderTitleRow}>
                <Ionicons name="pricetags-outline" size={20} color="#2563EB" />
                <Text style={s.cardTitle}>Promoção de Itens Específicos</Text>
              </View>
              <Switch
                value={itemPromo.isActive}
                onValueChange={(val) => setItemPromo(prev => ({ ...prev, isActive: val }))}
                trackColor={{ false: '#E5E7EB', true: '#2563EB' }}
                thumbColor="#FFF"
              />
            </View>
            <View style={s.cardBody}>
              <Text style={s.infoText}>
                Selecione produtos específicos abaixo para aplicar preços promocionais individuais.
              </Text>

              {/* Banner do Item Promo */}
              <Text style={s.fieldLabel}>Imagem do Banner da Promoção</Text>
              <View style={s.tabsRow}>
                <Pressable
                  style={[s.tabBtn, !itemPromo.useUrl && s.tabBtnActive]}
                  onPress={() => setItemPromo(prev => ({ ...prev, useUrl: false }))}
                >
                  <Text style={[s.tabBtnText, !itemPromo.useUrl && s.tabBtnTextActive]}>Uploads</Text>
                </Pressable>
                <Pressable
                  style={[s.tabBtn, itemPromo.useUrl && s.tabBtnActive]}
                  onPress={() => setItemPromo(prev => ({ ...prev, useUrl: true }))}
                >
                  <Text style={[s.tabBtnText, itemPromo.useUrl && s.tabBtnTextActive]}>URL Externa</Text>
                </Pressable>
              </View>

              {itemPromo.useUrl ? (
                <TextInput
                  style={s.input}
                  placeholder="https://exemplo.com/banner.png"
                  value={itemPromo.imageUrl || ''}
                  onChangeText={(v) => setItemPromo(prev => ({ ...prev, imageUrl: v }))}
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.imagesScroll}>
                  <Pressable
                    style={[s.imgThumbnail, !itemPromo.imageId && s.imgThumbnailSelected]}
                    onPress={() => setItemPromo(prev => ({ ...prev, imageId: null }))}
                  >
                    <Ionicons name="close" size={24} color="#9CA3AF" />
                    <Text style={s.imgName}>Sem Banner</Text>
                  </Pressable>
                  {promoImages.map((img) => (
                    <Pressable
                      key={img.id}
                      style={[s.imgThumbnail, itemPromo.imageId === img.id && s.imgThumbnailSelected]}
                      onPress={() => setItemPromo(prev => ({ ...prev, imageId: img.id }))}
                    >
                      <Image
                        source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                        style={s.thumbnailImage}
                      />
                      <Text style={s.imgName} numberOfLines={1}>{img.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {getImageSrc(itemPromo.imageId, itemPromo.imageUrl, itemPromo.useUrl) && (
                <View style={s.previewContainer}>
                  <Text style={s.previewLabel}>Preview do Banner:</Text>
                  <Image
                    source={getImageSrc(itemPromo.imageId, itemPromo.imageUrl, itemPromo.useUrl)}
                    style={s.previewImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Lista de Seleção de Produtos */}
              <Text style={[s.fieldLabel, { marginTop: 14, marginBottom: 8 }]}>Selecione os produtos em promoção</Text>
              <View style={s.productsSelectorList}>
                {products.filter(p => p.category === 'batata' || p.category === 'macarrao').map(product => {
                  const promoItem = promoProducts.find(p => p.productId === product.id);
                  const isSelected = !!promoItem;
                  return (
                    <View key={product.id} style={[s.productSelectCard, isSelected && s.productSelectCardSelected]}>
                      <Pressable style={s.productSelectCardLeft} onPress={() => handleToggleProduct(product)}>
                        <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
                          {isSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.productName}>{product.name}</Text>
                          <Text style={s.productPriceOrig}>Original: R$ {Number(product.price).toFixed(2)}</Text>
                        </View>
                      </Pressable>

                      {isSelected && (
                        <View style={s.promoInputCol}>
                          <Text style={s.promoPriceLabel}>Preço Promo (R$)</Text>
                          <TextInput
                            style={s.smallPriceInput}
                            value={String(promoItem.promoPrice)}
                            onChangeText={(v) => handleUpdateProductPrice(product.id, v)}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor="#9CA3AF"
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Botão de Salvar Geral */}
          <Pressable
            style={[s.saveBtn, saving && { opacity: 0.7 }]}
            onPress={() => savePromoSettings(superPromo, itemPromo, promoProducts)}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Salvar Configurações</Text>}
          </Pressable>

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
  scrollContent: { padding: 16, paddingBottom: 40 },

  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 12, marginBottom: 12 },
  cardHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  cardBody: { gap: 12 },

  infoText: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1A1A1A', fontWeight: '600' },

  tabsRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  tabBtnActive: { backgroundColor: '#FFB800', borderColor: '#FFB800' },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  tabBtnTextActive: { color: '#FFF' },

  imagesScroll: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  imgThumbnail: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', padding: 4, marginRight: 8, backgroundColor: '#F9FAFB' },
  imgThumbnailSelected: { borderColor: '#FFB800', backgroundColor: '#FFF' },
  thumbnailImage: { width: '100%', height: '70%', borderRadius: 8 },
  imgName: { fontSize: 8, fontWeight: '700', color: '#6B7280', marginTop: 4, textAlign: 'center', width: '100%' },

  previewContainer: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  previewLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  previewImage: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#F3F4F6' },

  productsSelectorList: { gap: 8 },
  productSelectCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 16, padding: 12 },
  productSelectCardSelected: { borderColor: '#E5E7EB' },
  productSelectCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  productName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  productPriceOrig: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },
  promoInputCol: { alignItems: 'flex-end', marginLeft: 10 },
  promoPriceLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 },
  smallPriceInput: { height: 32, width: 70, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },

  saveBtn: { backgroundColor: '#FFB800', borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
