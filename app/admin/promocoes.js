import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, TextInput, Switch,
  Image, Modal, Dimensions, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  // Modais estilo iFood Marketing Portal
  const [isSuperModalVisible, setIsSuperModalVisible] = useState(false);
  const [isItemModalVisible, setIsItemModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todos');

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
        .limit(40);
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
  const savePromoSettings = async (updatedSuperPromo, updatedItemPromo, updatedPromoProducts, showFeedback = true) => {
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
        isPromoActive: updatedSuperPromo.isActive || updatedItemPromo.isActive,
        promoPrice: updatedSuperPromo.isActive ? updatedSuperPromo.price : (settingsValue?.promoPrice || 24.99),
      };

      const { error } = await supabase
        .from('store_settings')
        .update({ setting_value: newValue })
        .eq('id', storeSettingsId);

      if (error) throw error;

      setSettingsValue(newValue);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (showFeedback) {
        Alert.alert('Sucesso', 'Configurações de promoção sincronizadas com sucesso!');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  // Quick Inline Toggles
  const handleToggleSuperActive = async (value) => {
    const updated = { ...superPromo, isActive: value };
    setSuperPromo(updated);
    await savePromoSettings(updated, itemPromo, promoProducts, false);
  };

  const handleToggleItemActive = async (value) => {
    if (value && promoProducts.length === 0) {
      setIsItemModalVisible(true);
      return;
    }
    const updated = { ...itemPromo, isActive: value };
    setItemPromo(updated);
    await savePromoSettings(superPromo, updated, promoProducts, false);
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
          promoPrice: Math.max(0, Number(product.price || 0) - 1.00),
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
    if (imageUrl) {
      return { uri: imageUrl };
    }
    return null;
  };

  // Produtos filtrados para o modal de seleção
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => p.category === 'batata' || p.category === 'macarrao')
      .filter(p => {
        if (selectedCategory === 'todos') return true;
        return p.category === selectedCategory;
      })
      .filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [products, selectedCategory, searchQuery]);

  const activeCount = (superPromo.isActive ? 1 : 0) + (itemPromo.isActive ? 1 : 0);
  const superPromoImgSrc = getImageSrc(superPromo.imageId, superPromo.imageUrl, superPromo.useUrl);
  const itemPromoImgSrc = getImageSrc(itemPromo.imageId, itemPromo.imageUrl, itemPromo.useUrl);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Central de Promoções</Text>
          <Text style={s.headerSub}>Portal de Campanhas e Banners</Text>
        </View>
        <Pressable onPress={loadData} style={s.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#D97706" />
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#FFB800" />
          <Text style={{ marginTop: 12, color: '#6B7280', fontWeight: '700', fontSize: 13 }}>
            Carregando campanhas...
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* iFood Marketing Portal Summary Hero Card */}
          <LinearGradient
            colors={['#1F2937', '#111827', '#92400E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.heroCard}
          >
            <View style={s.heroBadgeRow}>
              <View style={s.heroPill}>
                <Ionicons name="flame" size={13} color="#FBBF24" />
                <Text style={s.heroPillText}>DESTAQUES DA LOJA</Text>
              </View>
              <View style={[s.statusPill, activeCount > 0 ? s.statusPillActive : s.statusPillPaused]}>
                <View style={[s.statusDot, activeCount > 0 ? s.statusDotActive : s.statusDotPaused]} />
                <Text style={s.statusPillText}>
                  {activeCount > 0 ? `${activeCount} Ativa(s)` : 'Pausadas'}
                </Text>
              </View>
            </View>

            <Text style={s.heroTitle}>Campanhas Promocionais</Text>
            <Text style={s.heroSubtitle}>
              Banners visualmente impactantes na página inicial e preços especiais automáticos no carrinho.
            </Text>

            {/* Quick Metrics Bar */}
            <View style={s.metricsRow}>
              <View style={s.metricItem}>
                <Text style={s.metricLabel}>Campanhas</Text>
                <Text style={s.metricValue}>2</Text>
              </View>
              <View style={s.metricDivider} />
              <View style={s.metricItem}>
                <Text style={s.metricLabel}>Itens em Oferta</Text>
                <Text style={[s.metricValue, { color: '#FCD34D' }]}>
                  {superPromo.isActive ? 'Todas Batatas' : promoProducts.length}
                </Text>
              </View>
              <View style={s.metricDivider} />
              <View style={s.metricItem}>
                <Text style={s.metricLabel}>Impacto Estimado</Text>
                <Text style={[s.metricValue, { color: '#34D399' }]}>+35%</Text>
              </View>
            </View>
          </LinearGradient>

          {/* ─────────────────────────────────────────────────────────────
              CARD 1: SUPER PROMOÇÃO (iFood High-Impact Banner Card)
          ─────────────────────────────────────────────────────────────── */}
          <View style={s.campaignCard}>
            {/* Visual Banner Preview */}
            <View style={s.bannerContainer}>
              {superPromoImgSrc ? (
                <Image source={superPromoImgSrc} style={s.bannerImage} resizeMode="cover" />
              ) : (
                <LinearGradient colors={['#C1440E', '#E3A008']} style={s.placeholderBanner}>
                  <Ionicons name="flash" size={32} color="#FEF3C7" />
                  <Text style={s.placeholderTitle}>Banner da Super Promoção</Text>
                  <Text style={s.placeholderSub}>Toque em Configurar para adicionar imagem</Text>
                </LinearGradient>
              )}

              {/* Gradient Dark Overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']}
                style={s.bannerOverlay}
              />

              {/* Top Banner Chips */}
              <View style={s.bannerTopRow}>
                <View style={s.bannerBadge}>
                  <Ionicons name="flash" size={12} color="#FBBF24" />
                  <Text style={s.bannerBadgeText}>SUPER PROMOÇÃO</Text>
                </View>
                <View style={[s.bannerStatusChip, superPromo.isActive ? s.chipActive : s.chipInactive]}>
                  <Text style={s.bannerStatusChipText}>
                    {superPromo.isActive ? 'ATIVA' : 'PAUSADA'}
                  </Text>
                </View>
              </View>

              {/* Bottom Price Tag */}
              <View style={s.bannerBottomRow}>
                <View>
                  <Text style={s.bannerBottomLabel}>Preço Promocional Único</Text>
                  <Text style={s.bannerBottomPrice}>R$ {Number(superPromo.price).toFixed(2)}</Text>
                </View>
                <View style={s.bannerPillScope}>
                  <Text style={s.bannerPillScopeText}>Todas as Batatas</Text>
                </View>
              </View>
            </View>

            {/* Content Details */}
            <View style={s.cardContent}>
              <View style={s.cardTitleRow}>
                <View style={{ flex: 1 }}>
                  <View style={s.typeBadgeRow}>
                    <View style={s.badgeMassa}>
                      <Text style={s.badgeMassaText}>CAMPANHA EM MASSA</Text>
                    </View>
                    <View style={s.badgePrecoFixo}>
                      <Text style={s.badgePrecoFixoText}>PREÇO FIXO</Text>
                    </View>
                  </View>
                  <Text style={s.campaignTitle}>Super Promoção de Batatas</Text>
                </View>
                <Switch
                  value={superPromo.isActive}
                  onValueChange={handleToggleSuperActive}
                  trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                  thumbColor="#FFF"
                />
              </View>

              <Text style={s.campaignDesc}>
                Aplica automaticamente o valor de R$ {Number(superPromo.price).toFixed(2)} em todas as batatas recheadas do cardápio.
              </Text>

              {/* Validity Chips */}
              <View style={s.chipsRow}>
                <View style={s.chip}>
                  <Ionicons name="fast-food-outline" size={12} color="#6B7280" />
                  <Text style={s.chipText}>Todas as Batatas</Text>
                </View>
                <View style={s.chip}>
                  <Ionicons name="pricetag-outline" size={12} color="#D97706" />
                  <Text style={s.chipText}>R$ {Number(superPromo.price).toFixed(2)} / un</Text>
                </View>
                <View style={s.chip}>
                  <Ionicons name="image-outline" size={12} color="#2563EB" />
                  <Text style={s.chipText}>{superPromoImgSrc ? 'Banner Ativo' : 'Sem Banner'}</Text>
                </View>
              </View>

              {/* Action Button */}
              <Pressable
                style={s.configBtnAmber}
                onPress={() => setIsSuperModalVisible(true)}
              >
                <Ionicons name="options-outline" size={18} color="#FFF" />
                <Text style={s.configBtnText}>Configurar Campanha & Banner</Text>
              </Pressable>
            </View>
          </View>

          {/* ─────────────────────────────────────────────────────────────
              CARD 2: PROMOÇÃO DE ITENS ESPECÍFICOS
          ─────────────────────────────────────────────────────────────── */}
          <View style={[s.campaignCard, { marginTop: 20 }]}>
            {/* Visual Banner Preview */}
            <View style={s.bannerContainer}>
              {itemPromoImgSrc ? (
                <Image source={itemPromoImgSrc} style={s.bannerImage} resizeMode="cover" />
              ) : (
                <LinearGradient colors={['#1E40AF', '#3B82F6']} style={s.placeholderBanner}>
                  <Ionicons name="pricetags" size={32} color="#DBEAFE" />
                  <Text style={s.placeholderTitle}>Banner de Ofertas Selecionadas</Text>
                  <Text style={s.placeholderSub}>Toque em Gerenciar para personalizar</Text>
                </LinearGradient>
              )}

              {/* Gradient Dark Overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']}
                style={s.bannerOverlay}
              />

              {/* Top Banner Chips */}
              <View style={s.bannerTopRow}>
                <View style={s.bannerBadge}>
                  <Ionicons name="pricetags" size={12} color="#60A5FA" />
                  <Text style={s.bannerBadgeText}>OFERTAS SELECIONADAS</Text>
                </View>
                <View style={[s.bannerStatusChip, itemPromo.isActive ? s.chipActive : s.chipInactive]}>
                  <Text style={s.bannerStatusChipText}>
                    {itemPromo.isActive ? 'ATIVA' : 'PAUSADA'}
                  </Text>
                </View>
              </View>

              {/* Bottom Preview Tag */}
              <View style={s.bannerBottomRow}>
                <View>
                  <Text style={s.bannerBottomLabel}>Pratos em Oferta</Text>
                  <Text style={s.bannerBottomPrice}>{promoProducts.length} itens participantes</Text>
                </View>
                <View style={s.bannerPillScope}>
                  <Text style={s.bannerPillScopeText}>Descontos Individuais</Text>
                </View>
              </View>
            </View>

            {/* Content Details */}
            <View style={s.cardContent}>
              <View style={s.cardTitleRow}>
                <View style={{ flex: 1 }}>
                  <View style={s.typeBadgeRow}>
                    <View style={s.badgeItem}>
                      <Text style={s.badgeItemText}>DESCONTO INDIVIDUAL</Text>
                    </View>
                    <View style={s.badgePrecoFixo}>
                      <Text style={s.badgePrecoFixoText}>PRATOS SELECIONADOS</Text>
                    </View>
                  </View>
                  <Text style={s.campaignTitle}>Promoção de Itens Específicos</Text>
                </View>
                <Switch
                  value={itemPromo.isActive}
                  onValueChange={handleToggleItemActive}
                  trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                  thumbColor="#FFF"
                />
              </View>

              <Text style={s.campaignDesc}>
                Escolha produtos individuais (batatas e macarrão) e configure um preço promocional dedicado a cada um.
              </Text>

              {/* Validity Chips */}
              <View style={s.chipsRow}>
                <View style={s.chip}>
                  <Ionicons name="restaurant-outline" size={12} color="#2563EB" />
                  <Text style={s.chipText}>{promoProducts.length} Pratos Selecionados</Text>
                </View>
                <View style={s.chip}>
                  <Ionicons name="image-outline" size={12} color="#6B7280" />
                  <Text style={s.chipText}>{itemPromoImgSrc ? 'Banner Ativo' : 'Sem Banner'}</Text>
                </View>
              </View>

              {/* Action Button */}
              <Pressable
                style={s.configBtnBlue}
                onPress={() => setIsItemModalVisible(true)}
              >
                <Ionicons name="list-outline" size={18} color="#FFF" />
                <Text style={s.configBtnText}>Gerenciar Produtos & Banner</Text>
              </Pressable>
            </View>
          </View>

          {/* Sincronização Geral */}
          <Pressable
            style={[s.masterSaveBtn, saving && { opacity: 0.7 }]}
            onPress={() => savePromoSettings(superPromo, itemPromo, promoProducts, true)}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
                <Text style={s.masterSaveBtnText}>Sincronizar Todas as Configurações</Text>
              </>
            )}
          </Pressable>

        </ScrollView>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: CONFIGURAÇÃO DA SUPER PROMOÇÃO
      ─────────────────────────────────────────────────────────────── */}
      <Modal
        visible={isSuperModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsSuperModalVisible(false)}
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Configurar Super Promoção</Text>
              <Text style={s.modalSubtitle}>Preço promocional único em todas as batatas</Text>
            </View>
            <Pressable onPress={() => setIsSuperModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#374151" />
            </Pressable>
          </View>

          <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Status Switch */}
            <View style={s.modalSwitchRow}>
              <View>
                <Text style={s.modalSwitchTitle}>Ativar na Loja</Text>
                <Text style={s.modalSwitchDesc}>Aplica o desconto imediatamente aos clientes</Text>
              </View>
              <Switch
                value={superPromo.isActive}
                onValueChange={(val) => setSuperPromo(prev => ({ ...prev, isActive: val }))}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                thumbColor="#FFF"
              />
            </View>

            {/* Input Preço */}
            <Text style={s.inputSectionLabel}>Preço Promocional Único (R$)</Text>
            <View style={s.priceInputWrap}>
              <Text style={s.priceCurrency}>R$</Text>
              <TextInput
                style={s.priceTextInput}
                value={String(superPromo.price)}
                onChangeText={(v) => setSuperPromo(prev => ({ ...prev, price: parseFloat(v.replace(',', '.')) || 0 }))}
                keyboardType="decimal-pad"
                placeholder="26.00"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Sugestões rápidas */}
            <View style={s.quickChipsRow}>
              <Text style={s.quickChipsLabel}>Sugestões:</Text>
              {[23.90, 24.90, 26.00, 27.90].map((p) => (
                <Pressable
                  key={p}
                  style={s.quickChipBtn}
                  onPress={() => setSuperPromo(prev => ({ ...prev, price: p }))}
                >
                  <Text style={s.quickChipBtnText}>R$ {p.toFixed(2)}</Text>
                </Pressable>
              ))}
            </View>

            {/* Seleção do Banner */}
            <Text style={[s.inputSectionLabel, { marginTop: 20 }]}>Banner de Destaque</Text>
            <View style={s.tabSelectorRow}>
              <Pressable
                style={[s.tabSelectorBtn, !superPromo.useUrl && s.tabSelectorBtnActive]}
                onPress={() => setSuperPromo(prev => ({ ...prev, useUrl: false }))}
              >
                <Text style={[s.tabSelectorText, !superPromo.useUrl && s.tabSelectorTextActive]}>
                  Galeria de Banners
                </Text>
              </Pressable>
              <Pressable
                style={[s.tabSelectorBtn, superPromo.useUrl && s.tabSelectorBtnActive]}
                onPress={() => setSuperPromo(prev => ({ ...prev, useUrl: true }))}
              >
                <Text style={[s.tabSelectorText, superPromo.useUrl && s.tabSelectorTextActive]}>
                  Link / URL Externa
                </Text>
              </Pressable>
            </View>

            {!superPromo.useUrl ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modalThumbsScroll}>
                <Pressable
                  style={[s.thumbItem, !superPromo.imageId && s.thumbItemSelected]}
                  onPress={() => setSuperPromo(prev => ({ ...prev, imageId: null }))}
                >
                  <Ionicons name="close-circle-outline" size={26} color="#9CA3AF" />
                  <Text style={s.thumbItemText}>Sem Banner</Text>
                </Pressable>

                {promoImages.map((img) => (
                  <Pressable
                    key={img.id}
                    style={[s.thumbItem, superPromo.imageId === img.id && s.thumbItemSelected]}
                    onPress={() => setSuperPromo(prev => ({ ...prev, imageId: img.id }))}
                  >
                    <Image
                      source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                      style={s.thumbItemImg}
                    />
                    <Text style={s.thumbItemText} numberOfLines={1}>{img.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <TextInput
                style={s.urlTextInput}
                placeholder="https://exemplo.com/banner.png"
                value={superPromo.imageUrl || ''}
                onChangeText={(v) => setSuperPromo(prev => ({ ...prev, imageUrl: v }))}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            )}

            {/* Live Preview no Modal */}
            <Text style={[s.inputSectionLabel, { marginTop: 16 }]}>Pré-visualização do Banner:</Text>
            <View style={s.modalPreviewBox}>
              {superPromoImgSrc ? (
                <Image source={superPromoImgSrc} style={s.modalPreviewImg} resizeMode="cover" />
              ) : (
                <View style={s.modalEmptyPreview}>
                  <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                  <Text style={s.modalEmptyPreviewText}>Nenhum banner selecionado</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View style={s.modalFooter}>
            <Pressable
              style={s.modalCancelBtn}
              onPress={() => setIsSuperModalVisible(false)}
            >
              <Text style={s.modalCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={s.modalSaveBtn}
              onPress={async () => {
                await savePromoSettings(superPromo, itemPromo, promoProducts, true);
                setIsSuperModalVisible(false);
              }}
            >
              <Text style={s.modalSaveText}>Salvar Alterações</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: CONFIGURAÇÃO DA PROMOÇÃO DE ITENS ESPECÍFICOS
      ─────────────────────────────────────────────────────────────── */}
      <Modal
        visible={isItemModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsItemModalVisible(false)}
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Gerenciar Ofertas em Pratos</Text>
              <Text style={s.modalSubtitle}>Selecione pratos e ajuste preços promocionais</Text>
            </View>
            <Pressable onPress={() => setIsItemModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#374151" />
            </Pressable>
          </View>

          <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Status Switch */}
            <View style={s.modalSwitchRow}>
              <View>
                <Text style={s.modalSwitchTitle}>Ativar na Loja</Text>
                <Text style={s.modalSwitchDesc}>Ativa os descontos dos pratos marcados</Text>
              </View>
              <Switch
                value={itemPromo.isActive}
                onValueChange={(val) => setItemPromo(prev => ({ ...prev, isActive: val }))}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                thumbColor="#FFF"
              />
            </View>

            {/* Banner Selection */}
            <Text style={[s.inputSectionLabel, { marginTop: 14 }]}>Banner da Campanha de Itens</Text>
            <View style={s.tabSelectorRow}>
              <Pressable
                style={[s.tabSelectorBtn, !itemPromo.useUrl && s.tabSelectorBtnActive]}
                onPress={() => setItemPromo(prev => ({ ...prev, useUrl: false }))}
              >
                <Text style={[s.tabSelectorText, !itemPromo.useUrl && s.tabSelectorTextActive]}>
                  Galeria de Banners
                </Text>
              </Pressable>
              <Pressable
                style={[s.tabSelectorBtn, itemPromo.useUrl && s.tabSelectorBtnActive]}
                onPress={() => setItemPromo(prev => ({ ...prev, useUrl: true }))}
              >
                <Text style={[s.tabSelectorText, itemPromo.useUrl && s.tabSelectorTextActive]}>
                  Link / URL Externa
                </Text>
              </Pressable>
            </View>

            {!itemPromo.useUrl ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modalThumbsScroll}>
                <Pressable
                  style={[s.thumbItem, !itemPromo.imageId && s.thumbItemSelected]}
                  onPress={() => setItemPromo(prev => ({ ...prev, imageId: null }))}
                >
                  <Ionicons name="close-circle-outline" size={26} color="#9CA3AF" />
                  <Text style={s.thumbItemText}>Sem Banner</Text>
                </Pressable>

                {promoImages.map((img) => (
                  <Pressable
                    key={img.id}
                    style={[s.thumbItem, itemPromo.imageId === img.id && s.thumbItemSelected]}
                    onPress={() => setItemPromo(prev => ({ ...prev, imageId: img.id }))}
                  >
                    <Image
                      source={{ uri: `data:${img.mime_type || 'image/jpeg'};base64,${img.data}` }}
                      style={s.thumbItemImg}
                    />
                    <Text style={s.thumbItemText} numberOfLines={1}>{img.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <TextInput
                style={s.urlTextInput}
                placeholder="https://exemplo.com/banner-itens.png"
                value={itemPromo.imageUrl || ''}
                onChangeText={(v) => setItemPromo(prev => ({ ...prev, imageUrl: v }))}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            )}

            {/* Filtros e Busca de Produtos */}
            <View style={s.filterHeaderRow}>
              <Text style={s.inputSectionLabel}>
                Produtos Participantes ({promoProducts.length})
              </Text>
              <View style={s.catPillsRow}>
                {['todos', 'batata', 'macarrao'].map(cat => (
                  <Pressable
                    key={cat}
                    style={[s.catPill, selectedCategory === cat && s.catPillActive]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={[s.catPillText, selectedCategory === cat && s.catPillTextActive]}>
                      {cat === 'todos' ? 'Todos' : cat === 'batata' ? 'Batatas' : 'Macarrão'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Search Input */}
            <View style={s.searchWrap}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={s.searchTextInput}
                placeholder="Buscar prato por nome..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {/* Lista de Seleção de Produtos */}
            <View style={s.productsList}>
              {filteredProducts.map(product => {
                const promoItem = promoProducts.find(p => p.productId === product.id);
                const isSelected = !!promoItem;

                return (
                  <View key={product.id} style={[s.productItemRow, isSelected && s.productItemRowSelected]}>
                    <Pressable
                      style={s.productItemLeft}
                      onPress={() => handleToggleProduct(product)}
                    >
                      <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prodName}>{product.name}</Text>
                        <Text style={s.prodPriceOrig}>
                          Preço base: R$ {Number(product.price).toFixed(2)}
                        </Text>
                      </View>
                    </Pressable>

                    {isSelected && (
                      <View style={s.promoInputWrap}>
                        <Text style={s.promoInputLabel}>Promo (R$)</Text>
                        <TextInput
                          style={s.promoTextInput}
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
          </ScrollView>

          {/* Modal Footer */}
          <View style={s.modalFooter}>
            <Pressable
              style={s.modalCancelBtn}
              onPress={() => setIsItemModalVisible(false)}
            >
              <Text style={s.modalCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[s.modalSaveBtn, { backgroundColor: '#2563EB' }]}
              onPress={async () => {
                await savePromoSettings(superPromo, itemPromo, promoProducts, true);
                setIsItemModalVisible(false);
              }}
            >
              <Text style={s.modalSaveText}>Salvar Produtos e Banner</Text>
            </Pressable>
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
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  backBtn: { padding: 6, borderRadius: 10 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  refreshBtn: { padding: 6, borderRadius: 10, backgroundColor: '#FEF3C7' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Hero Card
  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  heroPillText: { fontSize: 10, fontWeight: '900', color: '#FCD34D', letterSpacing: 0.5 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusPillActive: { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
  statusPillPaused: { backgroundColor: 'rgba(156, 163, 175, 0.2)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusDotActive: { backgroundColor: '#34D399' },
  statusDotPaused: { backgroundColor: '#9CA3AF' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  heroSubtitle: { fontSize: 12, color: '#D1D5DB', lineHeight: 17, marginBottom: 16 },

  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '700' },
  metricValue: { fontSize: 16, fontWeight: '900', color: '#FFF', marginTop: 2 },
  metricDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Campaign High-Impact Card
  campaignCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bannerContainer: {
    width: '100%',
    height: 140,
    position: 'relative',
    backgroundColor: '#1F2937',
  },
  bannerImage: { width: '100%', height: '100%' },
  placeholderBanner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  placeholderTitle: { color: '#FFF', fontWeight: '900', fontSize: 15, marginTop: 4 },
  placeholderSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  bannerOverlay: { position: 'absolute', inset: 0 },
  bannerTopRow: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bannerBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  bannerStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  chipActive: { backgroundColor: 'rgba(16, 185, 129, 0.9)' },
  chipInactive: { backgroundColor: 'rgba(55, 65, 81, 0.85)' },
  bannerStatusChipText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },

  bannerBottomRow: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bannerBottomLabel: { fontSize: 10, color: '#FCD34D', fontWeight: '700' },
  bannerBottomPrice: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  bannerPillScope: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bannerPillScopeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },

  cardContent: { padding: 16 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  typeBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  badgeMassa: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeMassaText: { fontSize: 9, fontWeight: '900', color: '#92400E' },
  badgeItem: { backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeItemText: { fontSize: 9, fontWeight: '900', color: '#1E40AF' },
  badgePrecoFixo: { backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgePrecoFixoText: { fontSize: 9, fontWeight: '800', color: '#6B7280' },
  campaignTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  campaignDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 12 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chipText: { fontSize: 11, fontWeight: '700', color: '#4B5563' },

  configBtnAmber: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    height: 44,
  },
  configBtnBlue: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    height: 44,
  },
  configBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  masterSaveBtn: {
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    height: 52,
    marginTop: 24,
  },
  masterSaveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14 },

  // Modais
  modalContainer: { flex: 1, backgroundColor: '#FFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  modalSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  modalCloseBtn: { padding: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  modalBody: { flex: 1, padding: 20 },

  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  modalSwitchTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  modalSwitchDesc: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  inputSectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  priceCurrency: { fontSize: 18, fontWeight: '900', color: '#9CA3AF', marginRight: 8 },
  priceTextInput: { flex: 1, fontSize: 20, fontWeight: '900', color: '#111827' },

  quickChipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  quickChipsLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700' },
  quickChipBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  quickChipBtnText: { fontSize: 11, fontWeight: '800', color: '#374151' },

  tabSelectorRow: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 3, marginBottom: 12 },
  tabSelectorBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabSelectorBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabSelectorText: { fontSize: 12, fontWeight: '800', color: '#6B7280' },
  tabSelectorTextActive: { color: '#111827' },

  modalThumbsScroll: { flexDirection: 'row', paddingVertical: 4 },
  thumbItem: {
    width: 90,
    height: 85,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  thumbItemSelected: { borderColor: '#D97706', backgroundColor: '#FFF' },
  thumbItemImg: { width: '100%', height: 48, borderRadius: 8 },
  thumbItemText: { fontSize: 9, fontWeight: '700', color: '#4B5563', marginTop: 4, textAlign: 'center' },

  urlTextInput: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 13,
    color: '#111827',
  },

  modalPreviewBox: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalPreviewImg: { width: '100%', height: '100%' },
  modalEmptyPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalEmptyPreviewText: { fontSize: 11, color: '#9CA3AF', fontWeight: '700', marginTop: 4 },

  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  catPillsRow: { flexDirection: 'row', gap: 4 },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F3F4F6' },
  catPillActive: { backgroundColor: '#2563EB' },
  catPillText: { fontSize: 10, fontWeight: '800', color: '#6B7280' },
  catPillTextActive: { color: '#FFF' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
    gap: 8,
  },
  searchTextInput: { flex: 1, fontSize: 12, color: '#111827', fontWeight: '600' },

  productsList: { gap: 8 },
  productItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
  },
  productItemRowSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  productItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  prodName: { fontSize: 13, fontWeight: '800', color: '#111827' },
  prodPriceOrig: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },

  promoInputWrap: { alignItems: 'flex-end', marginLeft: 8 },
  promoInputLabel: { fontSize: 9, fontWeight: '800', color: '#6B7280', marginBottom: 2 },
  promoTextInput: {
    width: 76,
    height: 36,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    backgroundColor: '#FFF',
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
    color: '#111827',
  },

  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
    backgroundColor: '#FFF',
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  modalSaveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
});