import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, TextInput, Switch, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../supabaseConfig';
import { checkIsAdmin } from '../../utils/isAdmin';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import CouponTemplateSelectorModal from '../../components/admin/CouponTemplateSelectorModal';
import SwipeableBottomSheetModal from '../../components/SwipeableBottomSheetModal';
import { AdminListSkeleton } from '../../components/Skeleton';
import { ThemedAlertHost, showSuccessAlert, showErrorAlert } from '../../components/ThemedAlert';
import HomeCouponCard from '../../components/HomeCouponCard';
import { Image as ExpoImage } from 'expo-image';

// ─── Helpers de formatação e geração ────────────────────────────────
function formatBR(value) {
  const n = Number(value);
  if (isNaN(n)) return '0';
  return n % 1 === 0 ? String(n) : String(n).replace('.', ',');
}

function buildDefaultExpiry(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(23, 59, 0, 0);
  return d;
}

function generateCode(value, type) {
  if (!value) return '';
  const clean = String(value).replace(',', '').replace('.', '');
  return `DESCONTO${clean}${type === 'fixed' ? 'RS' : 'PCT'}`;
}

function generateTitle(value, type, code, showCodeInTitle) {
  if (showCodeInTitle && code) return code;
  if (!value) return '';
  return type === 'fixed' ? `R$ ${formatBR(value)}` : `${formatBR(value)}%`;
}

function generateDescription(value, type, categories) {
  if (!value) return '';
  const symbol = generateTitle(value, type);
  const alvo = categories?.length ? categories.join(', ') : 'batatas selecionadas';
  return `${symbol} pra ${alvo}.`;
}

function generateMinOrderText(minOrderValue) {
  if (!minOrderValue) return '';
  return `Válido para pedidos acima de R$ ${formatBR(minOrderValue)}.`;
}

function formatExpiryPTBR(date) {
  if (!date) return 'Sem expiração';
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  const hora = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} às ${hora}h${min}`;
}

function generateRulesText({ minOrderValue, expiresAt, quantityAvailable, maxUsesPerUser }) {
  const linhas = [];
  if (minOrderValue) {
    linhas.push(`Válido para pedidos acima de R$ ${formatBR(minOrderValue)} (sem considerar a taxa de entrega).`);
  }
  const qtdeTexto = quantityAvailable ? ` ou até atingir ${quantityAvailable} cupons` : '';
  if (expiresAt) {
    linhas.push(`Data de validade: Somente até ${formatExpiryPTBR(expiresAt)} (horário de Brasília)${qtdeTexto}.`);
  } else {
    linhas.push(`Cupom permanente (sem data de expiração)${qtdeTexto}.`);
  }
  linhas.push('Forma de pagamento: pague pelo app/site ou na entrega.');
  linhas.push(
    maxUsesPerUser
      ? `Limite de uso: ${maxUsesPerUser}x por usuário.`
      : 'Limite de uso: ilimitado por usuário.'
  );
  linhas.push('Cupom válido apenas para batatas selecionadas.');
  return linhas.join('\n');
}

const EMPTY_FORM = {
  value: '',
  type: 'fixed', // 'fixed' = R$, 'percentage' = %
  minOrderValue: '',
  expiresAt: buildDefaultExpiry(7),
  isPermanent: false,
  restrictedCategories: [],
  quantityAvailable: '',
  maxUsesPerUser: '',
  rulesText: '',
  rulesEdited: false,
  customCode: '',
  showCodeInTitle: false,
  showOnHome: false,
  homePriority: '0',
  bannerImageUrl: '',
  badgeLabel: '',
  isBannerHighlight: false,
  templateOrigin: 'custom',
};

export default function AdminCupons() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/'); return; }
        const isAdmin = await checkIsAdmin(user.id);
        if (!isAdmin) { router.replace('/'); return; }
        setCheckingAdmin(false);
      } catch {
        router.replace('/');
      }
    })();
  }, []);

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [libraryImages, setLibraryImages] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState('all'); // 'all' | 'products' | 'banners'

  const loadLibraryImages = useCallback(async () => {
    try {
      setLoadingLibrary(true);
      const list = [];

      // 1. Produtos do cardápio com imagem (bucket Products)
      const { data: dbProducts } = await supabase
        .from('products')
        .select('id, name, image_url, category')
        .not('image_url', 'is', null);

      if (Array.isArray(dbProducts)) {
        dbProducts.forEach((p) => {
          if (!p.image_url) return;
          const cleanName = p.image_url.replace(/^\/products\//, '');
          const pubUrl = `https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/Products/${cleanName}`;
          list.push({
            id: `prod-${p.id}`,
            name: p.name,
            url: pubUrl,
            previewUri: pubUrl,
            category: 'products',
            categoryLabel: p.category ? String(p.category).toUpperCase() : 'CARDÁPIO',
          });
        });
      }

      // 2. Imagens enviadas na galeria (uploaded_images)
      const { data: dbImages } = await supabase
        .from('uploaded_images')
        .select('id, name, mime_type, category, data, uploaded_at')
        .order('uploaded_at', { ascending: false });

      if (Array.isArray(dbImages)) {
        dbImages.forEach((img) => {
          const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatopiacanga.com.br';
          const url = `${apiBase}/api/images/${img.id}`;
          const previewUri = img.data
            ? `data:${img.mime_type || 'image/jpeg'};base64,${img.data}`
            : url;

          list.push({
            id: `upload-${img.id}`,
            name: img.name || 'Galeria de Mídia',
            url: previewUri,
            previewUri,
            category: 'banners',
            categoryLabel: 'GALERIA',
          });
        });
      }

      // 3. Cupons com banner_image_url existente
      const { data: bannerCoupons } = await supabase
        .from('coupons')
        .select('id, code, title, banner_image_url')
        .not('banner_image_url', 'is', null);

      if (Array.isArray(bannerCoupons)) {
        bannerCoupons.forEach((c) => {
          if (!c.banner_image_url) return;
          if (!list.some(item => item.url === c.banner_image_url)) {
            list.push({
              id: `coupon-${c.id}`,
              name: c.title || c.code || 'Banner Cadastrado',
              url: c.banner_image_url,
              previewUri: c.banner_image_url,
              category: 'banners',
              categoryLabel: 'BANNERS',
            });
          }
        });
      }

      setLibraryImages(list);
    } catch (err) {
      console.warn('Erro ao carregar biblioteca de imagens:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (libraryModalVisible) {
      loadLibraryImages();
    }
  }, [libraryModalVisible, loadLibraryImages]);

  const loadCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCoupons(data || []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os cupons.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('products').select('category');
      if (error) throw error;
      const unique = Array.from(
        new Set((data || []).map(p => p.category).filter(Boolean))
      ).sort();
      setAvailableCategories(unique);
    } catch {
      setAvailableCategories([]);
    }
  }, []);

  useEffect(() => {
    if (!checkingAdmin) {
      loadCoupons();
      loadCategories();
    }
  }, [checkingAdmin, loadCoupons, loadCategories]);

  const handleStartCreation = () => {
    setTemplateModalVisible(true);
  };

  const handleSelectTemplate = (tmpl) => {
    setTemplateModalVisible(false);
    setEditingCoupon(null);
    const expDate = buildDefaultExpiry(tmpl.suggestedDaysValid || 7);
    const initialForm = {
      ...EMPTY_FORM,
      value: tmpl.suggestedValue,
      type: tmpl.suggestedType,
      customCode: tmpl.suggestedCode,
      minOrderValue: tmpl.suggestedMinOrder,
      expiresAt: expDate,
      isPermanent: false,
      maxUsesPerUser: tmpl.suggestedMaxUsesPerUser || '1',
      quantityAvailable: tmpl.suggestedQuantity || '',
      showOnHome: tmpl.showOnHome ?? true,
      isBannerHighlight: tmpl.isBannerHighlight ?? true,
      badgeLabel: tmpl.badge || '',
      templateOrigin: tmpl.tag || 'template',
      rulesEdited: false,
    };
    initialForm.rulesText = generateRulesText({
      minOrderValue: parseFloat(tmpl.suggestedMinOrder) || 0,
      expiresAt: expDate,
      quantityAvailable: tmpl.suggestedQuantity,
      maxUsesPerUser: tmpl.suggestedMaxUsesPerUser,
    });
    setForm(initialForm);
    setTimeout(() => {
      setModalVisible(true);
    }, 180);
  };

  const handleSelectScratch = () => {
    setTemplateModalVisible(false);
    setEditingCoupon(null);
    const expDate = buildDefaultExpiry(7);
    const initialForm = {
      ...EMPTY_FORM,
      expiresAt: expDate,
      isPermanent: false,
      rulesEdited: false,
    };
    initialForm.rulesText = generateRulesText({
      minOrderValue: 0,
      expiresAt: expDate,
      quantityAvailable: '',
      maxUsesPerUser: '',
    });
    setForm(initialForm);
    setTimeout(() => {
      setModalVisible(true);
    }, 180);
  };

  const openModal = (coupon = null) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setForm({
        value: coupon.discount_value != null ? String(coupon.discount_value) : '',
        type: coupon.discount_type === 'percentage' ? 'percentage' : 'fixed',
        minOrderValue: coupon.min_order_value != null ? String(coupon.min_order_value) : '',
        expiresAt: coupon.expires_at ? new Date(coupon.expires_at) : buildDefaultExpiry(7),
        isPermanent: !coupon.expires_at,
        restrictedCategories: coupon.restricted_categories || [],
        quantityAvailable: coupon.max_uses != null ? String(coupon.max_uses) : '',
        maxUsesPerUser: coupon.max_uses_per_user != null ? String(coupon.max_uses_per_user) : '',
        rulesText: coupon.rules_text || '',
        rulesEdited: Boolean(coupon.rules_text),
        customCode: coupon.code || '',
        showCodeInTitle: !!coupon.show_code_in_title,
        showOnHome: !!coupon.show_on_home,
        homePriority: String(coupon.home_priority ?? 0),
        bannerImageUrl: coupon.banner_image_url || '',
        badgeLabel: coupon.badge_label || '',
        isBannerHighlight: !!coupon.is_banner_highlight,
        templateOrigin: coupon.template_origin || 'custom',
      });
      setModalVisible(true);
    } else {
      handleStartCreation();
    }
  };

  const updateField = (patch) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (!next.rulesEdited) {
        next.rulesText = generateRulesText({
          minOrderValue: parseFloat(String(next.minOrderValue).replace(',', '.')) || 0,
          expiresAt: next.isPermanent ? null : next.expiresAt,
          quantityAvailable: next.quantityAvailable,
          maxUsesPerUser: next.maxUsesPerUser,
        });
      }
      return next;
    });
  };

  const preview = useMemo(() => {
    const valueNum = parseFloat(String(form.value).replace(',', '.'));
    const code = form.customCode.trim().toUpperCase() || generateCode(valueNum, form.type);
    return {
      code,
      title: generateTitle(valueNum, form.type, code, form.showCodeInTitle),
      description: generateDescription(valueNum, form.type, form.restrictedCategories),
      minOrderText: generateMinOrderText(parseFloat(String(form.minOrderValue).replace(',', '.'))),
      badge: form.badgeLabel ? form.badgeLabel.trim() : '',
    };
  }, [form.value, form.type, form.minOrderValue, form.restrictedCategories, form.customCode, form.showCodeInTitle, form.badgeLabel]);

  const toggleRestrictedCategory = (cat) => {
    setForm(f => {
      const has = f.restrictedCategories.includes(cat);
      const restrictedCategories = has
        ? f.restrictedCategories.filter(c => c !== cat)
        : [...f.restrictedCategories, cat];
      return { ...f, restrictedCategories };
    });
  };

  const handleCopyCode = async (code, id) => {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedId(id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // noop
    }
  };

  const handlePickBannerImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'Precisamos de permissão para acessar sua galeria.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (pickerResult.canceled) return;
      const asset = pickerResult.assets[0];

      // Tenta upload direto no bucket coupon-banners
      const fileName = `banner-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: storageErr } = await supabase.storage
        .from('coupon-banners')
        .upload(fileName, blob, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });

      if (!storageErr) {
        const { data: publicData } = supabase.storage
          .from('coupon-banners')
          .getPublicUrl(fileName);

        if (publicData?.publicUrl) {
          updateField({ bannerImageUrl: publicData.publicUrl });
          showSuccessAlert('Imagem do banner vinculada com sucesso!', 'Pronto');
          return;
        }
      }

      // Fallback para uploaded_images caso storage falhe
      if (asset.base64) {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { error: uploadErr } = await supabase
          .from('uploaded_images')
          .insert({
            id,
            name: fileName,
            data: asset.base64,
            mime_type: asset.mimeType || 'image/jpeg',
            category: 'promo',
            uploaded_at: new Date().toISOString(),
          });

        if (!uploadErr) {
          const fallbackUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app'}/api/images/${id}`;
          updateField({ bannerImageUrl: fallbackUrl });
          showSuccessAlert('Imagem vinculada com sucesso!', 'Pronto');
          return;
        }
      }

      updateField({ bannerImageUrl: asset.uri });
    } catch (err) {
      console.warn('Erro ao selecionar imagem do banner:', err);
      Alert.alert('Erro', 'Não foi possível carregar a imagem selecionada.');
    }
  };

  const handleSave = async () => {
    if (form.isBannerHighlight && !form.bannerImageUrl?.trim()) {
      Alert.alert('Atenção', 'Informe a URL da imagem ou escolha da galeria para destacar como banner.');
      return;
    }

    const valueNum = parseFloat(String(form.value).replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor de desconto válido.');
      return;
    }

    if (form.type === 'percentage' && (valueNum <= 0 || valueNum > 100)) {
      Alert.alert('Atenção', 'O desconto percentual deve estar entre 1% e 100%.');
      return;
    }

    let minOrderValue = null;
    if (String(form.minOrderValue).trim() !== '') {
      minOrderValue = parseFloat(String(form.minOrderValue).replace(',', '.'));
      if (isNaN(minOrderValue) || minOrderValue <= 0) {
        Alert.alert('Atenção', 'Valor mínimo do pedido deve ser maior que zero.');
        return;
      }
    }

    if (!form.isPermanent && form.expiresAt < new Date()) {
      Alert.alert('Atenção', 'A data de expiração não pode estar no passado.');
      return;
    }

    let quantityAvailable = null;
    if (String(form.quantityAvailable).trim() !== '') {
      quantityAvailable = parseInt(form.quantityAvailable, 10);
      if (isNaN(quantityAvailable) || quantityAvailable <= 0) {
        Alert.alert('Atenção', 'Quantidade disponível deve ser maior que zero.');
        return;
      }
    }

    let maxUsesPerUser = null;
    if (String(form.maxUsesPerUser).trim() !== '') {
      maxUsesPerUser = parseInt(form.maxUsesPerUser, 10);
      if (isNaN(maxUsesPerUser) || maxUsesPerUser <= 0) {
        Alert.alert('Atenção', 'Limite por pessoa deve ser maior que zero.');
        return;
      }
    }

    const code = form.customCode.trim() ? form.customCode.trim().toUpperCase() : generateCode(valueNum, form.type);
    const duplicate = coupons.find(
      c => c.code?.toUpperCase() === code.toUpperCase() && c.id !== editingCoupon?.id
    );
    if (duplicate) {
      Alert.alert('Atenção', 'Já existe um cupom com esse código.');
      return;
    }

    const title = generateTitle(valueNum, form.type, code, form.showCodeInTitle);
    const description = generateDescription(valueNum, form.type, form.restrictedCategories);

    const payload = {
      code,
      title,
      description,
      rules_text: form.rulesText,
      discount_value: valueNum,
      discount_type: form.type,
      min_order_value: minOrderValue,
      restricted_categories: form.restrictedCategories.length ? form.restrictedCategories : null,
      max_uses: quantityAvailable,
      max_uses_per_user: maxUsesPerUser,
      expires_at: form.isPermanent ? null : form.expiresAt.toISOString(),
      show_code_in_title: form.showCodeInTitle,
      show_on_home: form.showOnHome,
      home_priority: parseInt(form.homePriority, 10) || 0,
      banner_image_url: form.bannerImageUrl ? form.bannerImageUrl.trim() : null,
      badge_label: form.badgeLabel ? form.badgeLabel.trim() : null,
      is_banner_highlight: form.isBannerHighlight,
      template_origin: form.templateOrigin || 'custom',
    };

    setSaving(true);
    try {
      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(payload).eq('id', editingCoupon.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('coupons').insert({
          ...payload,
          active: true,
          current_uses: 0,
        });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      await loadCoupons();
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar o cupom.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHome = async (coupon) => {
    const nextVal = !coupon.show_on_home;
    try {
      await supabase.from('coupons').update({ show_on_home: nextVal }).eq('id', coupon.id);
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, show_on_home: nextVal } : c));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o cupom.');
    }
  };

  const handleToggleBannerHighlight = async (coupon) => {
    if (!coupon.banner_image_url) {
      Alert.alert(
        'Sem imagem de banner',
        'Este cupom não possui imagem vinculada. Clique em "Editar" para adicionar a imagem do banner primeiro.'
      );
      return;
    }
    const nextVal = !coupon.is_banner_highlight;
    try {
      await supabase.from('coupons').update({ is_banner_highlight: nextVal }).eq('id', coupon.id);
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_banner_highlight: nextVal } : c));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showSuccessAlert(nextVal ? 'Banner ativado no carrossel da Home!' : 'Banner removido do carrossel da Home.', 'Pronto');
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o status do banner.');
    }
  };

  const handleToggleActive = async (coupon) => {
    const nextVal = !coupon.active;
    try {
      await supabase.from('coupons').update({ active: nextVal }).eq('id', coupon.id);
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, active: nextVal } : c));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar o status do cupom.');
    }
  };

  const handleDelete = (coupon) => {
    Alert.alert('Deletar Cupom', `Excluir o cupom "${coupon.code}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('coupons').delete().eq('id', coupon.id);
            await loadCoupons();
          } catch {
            Alert.alert('Erro', 'Não foi possível deletar.');
          }
        }
      },
    ]);
  };

  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'banners' | 'active'

  const activeCoupons = coupons.filter(c => c.active);
  const inactiveCoupons = coupons.filter(c => !c.active);
  const bannerCoupons = coupons.filter(c => Boolean(c.banner_image_url) || c.is_banner_highlight);
  const activeBannersCount = coupons.filter(c => c.is_banner_highlight && Boolean(c.banner_image_url)).length;

  const formatExpiry = (dateStr) => {
    if (!dateStr) return 'Permanente';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  if (checkingAdmin) {
    return <AdminListSkeleton count={4} />;
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header iFood Style */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gestão de Cupons</Text>
          <Text style={s.headerSub}>{activeCoupons.length} ativo(s) · {activeBannersCount} banner(s) no ar</Text>
        </View>
        <Pressable style={s.addBtn} onPress={() => openModal()}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={s.addBtnText}>Novo Cupom</Text>
        </Pressable>
      </View>

      {/* Abas de Navegação / Filtro */}
      <View style={s.filterTabsRow}>
        <Pressable
          style={[s.filterTabBtn, filterTab === 'all' && s.filterTabBtnActive]}
          onPress={() => setFilterTab('all')}
        >
          <Text style={[s.filterTabBtnText, filterTab === 'all' && s.filterTabBtnTextActive]}>
            Todos ({coupons.length})
          </Text>
        </Pressable>

        <Pressable
          style={[s.filterTabBtn, filterTab === 'banners' && s.filterTabBtnActive]}
          onPress={() => setFilterTab('banners')}
        >
          <Ionicons
            name="images-outline"
            size={13}
            color={filterTab === 'banners' ? '#FFF' : '#C1440E'}
            style={{ marginRight: 4 }}
          />
          <Text style={[s.filterTabBtnText, filterTab === 'banners' && s.filterTabBtnTextActive]}>
            Banners Home ({activeBannersCount})
          </Text>
        </Pressable>

        <Pressable
          style={[s.filterTabBtn, filterTab === 'active' && s.filterTabBtnActive]}
          onPress={() => setFilterTab('active')}
        >
          <Text style={[s.filterTabBtnText, filterTab === 'active' && s.filterTabBtnTextActive]}>
            Ativos ({activeCoupons.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <AdminListSkeleton count={4} />
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {filterTab === 'banners' ? (
            <>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>Banners Promocionais da Home</Text>
                <View style={s.badgeCounter}>
                  <Text style={s.badgeCounterText}>{bannerCoupons.length}</Text>
                </View>
              </View>

              {bannerCoupons.length === 0 ? (
                <View style={s.emptySection}>
                  <Ionicons name="images-outline" size={36} color="#D1D5DB" />
                  <Text style={s.emptySectionText}>Nenhum banner cadastrado</Text>
                  <Text style={[s.headerSub, { textAlign: 'center', marginTop: 4 }]}>
                    Edite ou crie um cupom e ative a opção "Destacar como Banner no Carrossel".
                  </Text>
                </View>
              ) : (
                bannerCoupons.map(c => (
                  <TicketCard
                    key={c.id}
                    coupon={c}
                    formatExpiry={formatExpiry}
                    copiedId={copiedId}
                    onCopy={handleCopyCode}
                    onEdit={() => openModal(c)}
                    onDelete={() => handleDelete(c)}
                    onToggle={() => handleToggleActive(c)}
                    onToggleHome={() => handleToggleHome(c)}
                    onToggleBanner={() => handleToggleBannerHighlight(c)}
                  />
                ))
              )}
            </>
          ) : filterTab === 'active' ? (
            <>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>Cupons Ativos</Text>
                <View style={s.badgeCounter}>
                  <Text style={s.badgeCounterText}>{activeCoupons.length}</Text>
                </View>
              </View>

              {activeCoupons.length === 0 ? (
                <View style={s.emptySection}>
                  <Ionicons name="ticket-outline" size={32} color="#D1D5DB" />
                  <Text style={s.emptySectionText}>Nenhum cupom ativo no momento</Text>
                </View>
              ) : (
                activeCoupons.map(c => (
                  <TicketCard
                    key={c.id}
                    coupon={c}
                    formatExpiry={formatExpiry}
                    copiedId={copiedId}
                    onCopy={handleCopyCode}
                    onEdit={() => openModal(c)}
                    onDelete={() => handleDelete(c)}
                    onToggle={() => handleToggleActive(c)}
                    onToggleHome={() => handleToggleHome(c)}
                    onToggleBanner={() => handleToggleBannerHighlight(c)}
                  />
                ))
              )}
            </>
          ) : (
            <>
              {/* Cupons Ativos */}
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>Cupons Ativos</Text>
                <View style={s.badgeCounter}>
                  <Text style={s.badgeCounterText}>{activeCoupons.length}</Text>
                </View>
              </View>

              {activeCoupons.length === 0 ? (
                <View style={s.emptySection}>
                  <Ionicons name="ticket-outline" size={32} color="#D1D5DB" />
                  <Text style={s.emptySectionText}>Nenhum cupom ativo no momento</Text>
                </View>
              ) : (
                activeCoupons.map(c => (
                  <TicketCard
                    key={c.id}
                    coupon={c}
                    formatExpiry={formatExpiry}
                    copiedId={copiedId}
                    onCopy={handleCopyCode}
                    onEdit={() => openModal(c)}
                    onDelete={() => handleDelete(c)}
                    onToggle={() => handleToggleActive(c)}
                    onToggleHome={() => handleToggleHome(c)}
                    onToggleBanner={() => handleToggleBannerHighlight(c)}
                  />
                ))
              )}

              {/* Cupons Inativos */}
              {inactiveCoupons.length > 0 && (
                <>
                  <View style={[s.sectionHeaderRow, { marginTop: 24 }]}>
                    <Text style={[s.sectionTitle, { color: '#6B7280' }]}>Cupons Inativos</Text>
                    <View style={[s.badgeCounter, { backgroundColor: '#E5E7EB' }]}>
                      <Text style={[s.badgeCounterText, { color: '#4B5563' }]}>{inactiveCoupons.length}</Text>
                    </View>
                  </View>

                  {inactiveCoupons.map(c => (
                    <TicketCard
                      key={c.id}
                      coupon={c}
                      formatExpiry={formatExpiry}
                      copiedId={copiedId}
                      onCopy={handleCopyCode}
                      onEdit={() => openModal(c)}
                      onDelete={() => handleDelete(c)}
                      onToggle={() => handleToggleActive(c)}
                      onToggleHome={() => handleToggleHome(c)}
                      onToggleBanner={() => handleToggleBannerHighlight(c)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Modal Guiado de Templates */}
      <CouponTemplateSelectorModal
        visible={templateModalVisible}
        onClose={() => setTemplateModalVisible(false)}
        onSelectTemplate={handleSelectTemplate}
        onSelectScratch={handleSelectScratch}
      />

      {/* Modal de Criação / Edição */}
      <SwipeableBottomSheetModal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={[s.sheet, { height: '92%', maxHeight: '92%' }]}
        scrollable
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={s.modalIconBg}>
                <Ionicons name="ticket" size={18} color="#C1440E" />
              </View>
              <View>
                <Text style={s.modalTitle}>{editingCoupon ? 'Editar Cupom' : 'Configurar Cupom'}</Text>
                {form.templateOrigin !== 'custom' && (
                  <Text style={s.modalSub}>
                    Template: {form.badgeLabel || 'Ideia Guia'}
                  </Text>
                )}
              </View>
            </View>
            <Pressable onPress={() => setModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </Pressable>
          </View>

            <ScrollView contentContainerStyle={s.modalBody}>
              {/* Tipo + Valor */}
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Tipo de Desconto *</Text>
                  <View style={s.typeRow}>
                    {[{ key: 'percentage', label: '%' }, { key: 'fixed', label: 'R$' }].map(t => (
                      <Pressable
                        key={t.key}
                        style={[s.typeBtn, form.type === t.key && s.typeBtnActive]}
                        onPress={() => updateField({ type: t.key })}
                      >
                        <Text style={[s.typeBtnText, form.type === t.key && s.typeBtnTextActive]}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={s.fieldLabel}>Valor *</Text>
                  <TextInput
                    style={s.input}
                    placeholder={form.type === 'percentage' ? '10' : '5,00'}
                    value={form.value}
                    onChangeText={v => updateField({ value: v })}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Código customizado */}
              <Text style={s.fieldLabel}>Código do Cupom (opcional)</Text>
              <TextInput
                style={s.input}
                placeholder="Vazio = gera automático (ex: DESCONTO10PCT)"
                value={form.customCode}
                onChangeText={v => updateField({ customCode: v.toUpperCase() })}
                autoCapitalize="characters"
                maxLength={20}
                placeholderTextColor="#9CA3AF"
              />

              {/* Badge / Etiqueta Promocional */}
              <Text style={s.fieldLabel}>Badge / Etiqueta Promocional (opcional)</Text>
              <TextInput
                style={s.input}
                placeholder="Ex: NOVIDADE, 1º PEDIDO, IMPERDÍVEL"
                value={form.badgeLabel}
                onChangeText={v => updateField({ badgeLabel: v.toUpperCase() })}
                autoCapitalize="characters"
                maxLength={18}
                placeholderTextColor="#9CA3AF"
              />

              {/* Pedido mínimo */}
              <Text style={s.fieldLabel}>Pedido Mínimo (R$)</Text>
              <TextInput
                style={s.input}
                placeholder="Ex: 30,00 (deixe vazio se não houver)"
                value={form.minOrderValue}
                onChangeText={v => updateField({ minOrderValue: v })}
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />

              {/* Mostrar código no título */}
              <View style={s.switchCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.switchCardLabel}>Mostrar código no título</Text>
                  <Text style={s.switchCardSub}>Exibe o código no card em vez de "10% OFF"</Text>
                </View>
                <Switch
                  value={form.showCodeInTitle}
                  onValueChange={v => updateField({ showCodeInTitle: v })}
                  trackColor={{ false: '#E5E7EB', true: '#E3A008' }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Exibir na Home */}
              <View style={s.switchCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.switchCardLabel}>Exibir na Home</Text>
                  <Text style={s.switchCardSub}>Destaca o cupom na vitrine da tela inicial</Text>
                </View>
                <Switch
                  value={form.showOnHome}
                  onValueChange={v => updateField({ showOnHome: v })}
                  trackColor={{ false: '#E5E7EB', true: '#E3A008' }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Destacar como Banner no Carrossel */}
              <View style={s.switchCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.switchCardLabel}>Destacar como Banner no Carrossel</Text>
                  <Text style={s.switchCardSub}>Vincular imagem promocional de destaque na Home</Text>
                </View>
                <Switch
                  value={form.isBannerHighlight}
                  onValueChange={v => updateField({ isBannerHighlight: v })}
                  trackColor={{ false: '#E5E7EB', true: '#E3A008' }}
                  thumbColor="#FFF"
                />
              </View>

              {form.isBannerHighlight && (
                <View style={s.bannerConfigBox}>
                  <Text style={s.bannerHintText}>
                    💡 Proporção recomendada: 16:9 (ex: 1080×608 ou 720×405) ou 2:1 (ex: 1000×500). A caixa da Home se adapta à proporção real da imagem sem bordas pretas.
                  </Text>
                  <Text style={s.fieldLabel}>URL da Imagem do Banner *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="https://... ou escolha da galeria"
                    value={form.bannerImageUrl}
                    onChangeText={v => updateField({ bannerImageUrl: v })}
                    autoCapitalize="none"
                    placeholderTextColor="#9CA3AF"
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      style={[s.bannerPickBtn, { flex: 1, marginTop: 0 }]}
                      onPress={() => setLibraryModalVisible(true)}
                    >
                      <Ionicons name="images-outline" size={16} color="#C1440E" style={{ marginRight: 6 }} />
                      <Text style={s.bannerPickBtnText}>Banco de Imagens</Text>
                    </Pressable>

                    <Pressable
                      style={[s.bannerPickBtn, { flex: 1, marginTop: 0 }]}
                      onPress={handlePickBannerImage}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color="#C1440E" style={{ marginRight: 6 }} />
                      <Text style={s.bannerPickBtnText}>Subir da Galeria</Text>
                    </Pressable>
                  </View>

                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>Selo / Badge (opcional)</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ex: MAIS PEDIDA, 50% OFF, LIMITADO"
                    value={form.badgeLabel}
                    onChangeText={v => updateField({ badgeLabel: v })}
                    placeholderTextColor="#9CA3AF"
                  />

                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>Prioridade na Home (0 a 100)</Text>
                  <TextInput
                    style={s.input}
                    placeholder="0"
                    value={form.homePriority}
                    onChangeText={v => updateField({ homePriority: v })}
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />

                  {Boolean(form.bannerImageUrl) && (
                    <View style={s.bannerPreviewWrap}>
                      <Text style={s.fieldLabel}>Pré-visualização do Banner</Text>
                      <View style={s.bannerPreviewContainer}>
                        <Image
                          source={{ uri: form.bannerImageUrl }}
                          style={s.bannerPreviewImage}
                          resizeMode="cover"
                        />
                        {Boolean(form.badgeLabel) && (
                          <View style={s.bannerPreviewBadge}>
                            <Text style={s.bannerPreviewBadgeText}>{form.badgeLabel}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Validade / Permanente */}
              <View style={s.switchCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={s.switchCardLabel}>Cupom Permanente</Text>
                  <Text style={s.switchCardSub}>Sem data de expiração</Text>
                </View>
                <Switch
                  value={form.isPermanent}
                  onValueChange={v => updateField({ isPermanent: v })}
                  trackColor={{ false: '#E5E7EB', true: '#E3A008' }}
                  thumbColor="#FFF"
                />
              </View>

              {!form.isPermanent && (
                <>
                  <Text style={s.fieldLabel}>Data de Expiração *</Text>
                  <Pressable style={s.inputDate} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color="#C1440E" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#1A1A1A', fontWeight: '700', fontSize: 14 }}>
                      {formatExpiryPTBR(form.expiresAt)}
                    </Text>
                  </Pressable>
                  {showDatePicker && (
                    <DateTimePicker
                      value={form.expiresAt}
                      mode="date"
                      minimumDate={new Date()}
                      onChange={(_, selected) => {
                        setShowDatePicker(false);
                        if (!selected) return;
                        const merged = new Date(form.expiresAt);
                        merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                        updateField({ expiresAt: merged });
                        if (Platform.OS === 'ios') setShowTimePicker(true);
                        else setTimeout(() => setShowTimePicker(true), 200);
                      }}
                    />
                  )}
                  {showTimePicker && (
                    <DateTimePicker
                      value={form.expiresAt}
                      mode="time"
                      onChange={(_, selected) => {
                        setShowTimePicker(false);
                        if (!selected) return;
                        const merged = new Date(form.expiresAt);
                        merged.setHours(selected.getHours(), selected.getMinutes());
                        updateField({ expiresAt: merged });
                      }}
                    />
                  )}
                </>
              )}

              {/* Limites de uso */}
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Limite Global</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ilimitado"
                    value={form.quantityAvailable}
                    onChangeText={v => updateField({ quantityAvailable: v })}
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Limite por Pessoa</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Ilimitado"
                    value={form.maxUsesPerUser}
                    onChangeText={v => updateField({ maxUsesPerUser: v })}
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Categorias Restritas */}
              {availableCategories.length > 0 && (
                <>
                  <Text style={s.fieldLabel}>Categorias Válidas (opcional)</Text>
                  <View style={s.chipsWrap}>
                    {availableCategories.map(cat => {
                      const selected = form.restrictedCategories.includes(cat);
                      return (
                        <Pressable
                          key={cat}
                          style={[s.chip, selected && s.chipSelected]}
                          onPress={() => toggleRestrictedCategory(cat)}
                        >
                          <Text style={[s.chipText, selected && s.chipTextSelected]}>{cat}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Regras geradas */}
              <Text style={s.fieldLabel}>Regras do Cupom (editável)</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={form.rulesText}
                onChangeText={v => setForm(f => ({ ...f, rulesText: v, rulesEdited: true }))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
              />

              {/* Preview em tempo real com o Design da Home */}
              {form.value.trim() !== '' && (
                <View style={s.ticketPreviewWrapper}>
                  <Text style={s.fieldLabel}>Pré-visualização (Design da Home)</Text>
                  <View style={{ alignItems: 'center', marginVertical: 8 }}>
                    <HomeCouponCard
                      coupon={{
                        codigo: preview.code,
                        valor: formatBR(form.value),
                        unidade: form.type === 'percentage' ? '%' : 'R$',
                        descricaoDesconto: preview.description,
                        raw: {
                          code: preview.code,
                          discount_value: parseFloat(String(form.value).replace(',', '.')) || 0,
                          discount_type: form.type,
                          min_order_value: parseFloat(String(form.minOrderValue).replace(',', '.')) || null,
                          expires_at: form.isPermanent ? null : form.expiresAt?.toISOString(),
                          title: preview.title,
                          description: preview.description,
                          badge_label: form.badgeLabel || null,
                        },
                      }}
                      onCardPress={() => {}}
                    />
                  </View>
                </View>
              )}

              {/* Botão de Salvar */}
              <Pressable
                style={[s.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
                ) : (
                  <Text style={s.saveBtnText}>
                    {editingCoupon ? 'Salvar Alterações' : 'Criar Cupom'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
            <ThemedAlertHost />
          </View>
      </SwipeableBottomSheetModal>

      {/* Modal Seletor do Banco de Imagens do App */}
      <Modal
        visible={libraryModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLibraryModalVisible(false)}
      >
        <View style={s.libraryModalOverlay}>
          <View style={s.libraryModalContent}>
            <View style={s.libraryModalHeader}>
              <View>
                <Text style={s.libraryModalTitle}>Banco de Imagens do App</Text>
                <Text style={s.libraryModalSub}>Toque em uma imagem para vinculá-la ao banner</Text>
              </View>
              <Pressable
                onPress={() => setLibraryModalVisible(false)}
                style={s.libraryModalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#1A1A1A" />
              </Pressable>
            </View>

            {/* Abas de Categorias da Biblioteca */}
            <View style={s.libraryTabsRow}>
              <Pressable
                style={[s.libraryTabBtn, libraryCategory === 'all' && s.libraryTabBtnActive]}
                onPress={() => setLibraryCategory('all')}
              >
                <Text style={[s.libraryTabBtnText, libraryCategory === 'all' && s.libraryTabBtnTextActive]}>
                  Todas ({libraryImages.length})
                </Text>
              </Pressable>

              <Pressable
                style={[s.libraryTabBtn, libraryCategory === 'products' && s.libraryTabBtnActive]}
                onPress={() => setLibraryCategory('products')}
              >
                <Text style={[s.libraryTabBtnText, libraryCategory === 'products' && s.libraryTabBtnTextActive]}>
                  Cardápio ({libraryImages.filter(i => i.category === 'products').length})
                </Text>
              </Pressable>

              <Pressable
                style={[s.libraryTabBtn, libraryCategory === 'banners' && s.libraryTabBtnActive]}
                onPress={() => setLibraryCategory('banners')}
              >
                <Text style={[s.libraryTabBtnText, libraryCategory === 'banners' && s.libraryTabBtnTextActive]}>
                  Galeria & Banners ({libraryImages.filter(i => i.category === 'banners').length})
                </Text>
              </Pressable>
            </View>

            {loadingLibrary ? (
              <View style={s.libraryLoading}>
                <ActivityIndicator size="small" color="#C1440E" />
                <Text style={s.libraryLoadingText}>Carregando imagens do catálogo...</Text>
              </View>
            ) : libraryImages.length === 0 ? (
              <View style={s.libraryEmpty}>
                <Ionicons name="images-outline" size={40} color="#D1D5DB" />
                <Text style={s.libraryEmptyText}>Nenhuma imagem encontrada no banco.</Text>
                <Text style={s.libraryEmptySub}>Você pode enviar da sua galeria pelo botão "Subir da Galeria".</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={s.libraryGrid} showsVerticalScrollIndicator={false}>
                {libraryImages
                  .filter((img) => libraryCategory === 'all' || img.category === libraryCategory)
                  .map((img) => (
                    <Pressable
                      key={img.id}
                      style={[
                        s.libraryCard,
                        form.bannerImageUrl === img.url && s.libraryCardSelected,
                      ]}
                      onPress={() => {
                        updateField({ bannerImageUrl: img.url });
                        setLibraryModalVisible(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        showSuccessAlert('Imagem vinculada ao banner!', 'Pronto');
                      }}
                    >
                      <ExpoImage
                        source={{ uri: img.previewUri }}
                        style={s.libraryCardImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={s.libraryCardInfo}>
                        <View style={s.libraryCategoryTag}>
                          <Text style={s.libraryCategoryTagText}>{img.categoryLabel || 'CARDÁPIO'}</Text>
                        </View>
                        <Text style={s.libraryCardName} numberOfLines={1}>
                          {img.name}
                        </Text>
                      </View>
                      {form.bannerImageUrl === img.url && (
                        <View style={s.libraryCardCheck}>
                          <Ionicons name="checkmark-circle" size={20} color="#059669" />
                        </View>
                      )}
                    </Pressable>
                  ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Componente TicketCard (Estilo iFood Portal) ──────────────────────
function TicketCard({ coupon, formatExpiry, copiedId, onCopy, onEdit, onDelete, onToggle, onToggleHome, onToggleBanner }) {
  const isActive = coupon.active;
  const isHome = coupon.show_on_home;
  const isBanner = Boolean(coupon.is_banner_highlight);
  const value = coupon.discount_value;
  const isCopied = copiedId === coupon.id;

  return (
    <View style={[s.ticketCard, !isActive && s.ticketCardInactive]}>
      {/* Top Section */}
      <View style={s.ticketBody}>
        <View style={s.ticketHeaderRow}>
          <Pressable
            style={s.couponCodeBadge}
            onPress={() => onCopy(coupon.code, coupon.id)}
          >
            <Ionicons name="pricetag" size={13} color="#C1440E" />
            <Text style={s.couponCodeText}>{coupon.code}</Text>
            <Ionicons
              name={isCopied ? "checkmark-circle" : "copy-outline"}
              size={13}
              color={isCopied ? "#059669" : "#9CA3AF"}
            />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {coupon.badge_label ? (
              <View style={[s.statusPill, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[s.statusPillText, { color: '#92400E' }]}>{coupon.badge_label}</Text>
              </View>
            ) : null}
            {isHome ? (
              <View style={[s.statusPill, { backgroundColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                <Ionicons name="home" size={10} color="#D97706" />
                <Text style={[s.statusPillText, { color: '#92400E' }]}>Vitrine</Text>
              </View>
            ) : null}
            {isBanner ? (
              <View style={[s.statusPill, { backgroundColor: '#DCFCE7', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                <Ionicons name="images" size={10} color="#15803D" />
                <Text style={[s.statusPillText, { color: '#15803D' }]}>Banner</Text>
              </View>
            ) : null}
            <View style={[s.statusPill, isActive ? s.statusPillActive : s.statusPillInactive]}>
              <Text style={[s.statusPillText, isActive ? s.statusPillTextActive : s.statusPillTextInactive]}>
                {isActive ? 'Ativo' : 'Pausado'}
              </Text>
            </View>
          </View>
        </View>

        {/* Valor do desconto em destaque */}
        <View style={s.discountValueRow}>
          <Text style={s.discountValueText}>
            {coupon.discount_type === 'percentage'
              ? `${value}% OFF`
              : `R$ ${Number(value).toFixed(2)} OFF`}
          </Text>
        </View>

        {coupon.title && coupon.title !== coupon.code && (
          <Text style={s.ticketTitleText}>{coupon.title}</Text>
        )}

        {/* Metadados resumidos */}
        <View style={s.metaContainer}>
          {coupon.min_order_value != null && (
            <View style={s.metaItem}>
              <Ionicons name="cart-outline" size={13} color="#6B7280" />
              <Text style={s.metaItemText}>
                Mínimo: R$ {Number(coupon.min_order_value).toFixed(2)}
              </Text>
            </View>
          )}

          <View style={s.metaItem}>
            <Ionicons name="people-outline" size={13} color="#6B7280" />
            <Text style={s.metaItemText}>
              Usos: {coupon.current_uses || 0}{coupon.max_uses ? `/${coupon.max_uses}` : ' (ilimitado)'}
            </Text>
          </View>

          <View style={s.metaItem}>
            <Ionicons name="time-outline" size={13} color="#6B7280" />
            <Text style={s.metaItemText}>
              Validade: {formatExpiry(coupon.expires_at)}
            </Text>
          </View>
        </View>

        {/* Visualização do Banner anexado ao Cupom */}
        {coupon.banner_image_url ? (
          <View style={s.ticketBannerWrap}>
            <Image
              source={{ uri: coupon.banner_image_url }}
              style={s.ticketBannerImg}
              resizeMode="cover"
            />
            <View style={s.ticketBannerInfo}>
              <View
                style={[
                  s.bannerStatusTag,
                  isBanner ? s.bannerStatusTagActive : s.bannerStatusTagInactive,
                ]}
              >
                <Ionicons
                  name={isBanner ? "images" : "images-outline"}
                  size={12}
                  color={isBanner ? "#15803D" : "#6B7280"}
                />
                <Text
                  style={[
                    s.bannerStatusTagText,
                    isBanner ? { color: '#15803D' } : { color: '#6B7280' },
                  ]}
                >
                  {isBanner ? 'No Carrossel da Home' : 'Fora do Carrossel'}
                </Text>
              </View>
              {coupon.badge_label ? (
                <Text style={s.ticketBannerBadgeText}>Selo: {coupon.badge_label}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* Ticket Cutout Line com Picote Tracejado (iFood Standard) */}
      <View style={s.cutoutRow}>
        <View style={s.cutoutCircleLeft} />
        <View style={s.cutoutDashedLine} />
        <View style={s.cutoutCircleRight} />
      </View>

      {/* Footer com Ações */}
      <View style={s.ticketFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <Pressable
            style={s.toggleBtn}
            onPress={onToggle}
          >
            <Ionicons
              name={isActive ? "pause-circle-outline" : "play-circle-outline"}
              size={16}
              color={isActive ? "#D97706" : "#059669"}
            />
            <Text style={[s.toggleBtnText, { color: isActive ? "#D97706" : "#059669" }]}>
              {isActive ? 'Pausar' : 'Ativar'}
            </Text>
          </Pressable>

          <Pressable
            style={[s.toggleBtn, isHome && { backgroundColor: '#FEF3C7' }]}
            onPress={onToggleHome}
          >
            <Ionicons
              name={isHome ? "home" : "home-outline"}
              size={15}
              color={isHome ? "#D97706" : "#6B7280"}
            />
            <Text style={[s.toggleBtnText, { color: isHome ? "#D97706" : "#6B7280" }]}>
              {isHome ? 'Vitrine' : 'Pôr Vitrine'}
            </Text>
          </Pressable>

          {coupon.banner_image_url ? (
            <Pressable
              style={[
                s.toggleBtn,
                isBanner && { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
              ]}
              onPress={onToggleBanner}
            >
              <Ionicons
                name={isBanner ? "images" : "images-outline"}
                size={15}
                color={isBanner ? "#15803D" : "#6B7280"}
              />
              <Text
                style={[
                  s.toggleBtnText,
                  { color: isBanner ? "#15803D" : "#6B7280" },
                ]}
              >
                {isBanner ? 'Banner No Ar' : 'Pôr Banner'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={s.actionBtnsGroup}>
          <Pressable style={s.actionBtn} onPress={onEdit}>
            <Ionicons name="pencil" size={14} color="#374151" />
            <Text style={s.actionBtnText}>Editar</Text>
          </Pressable>
          <Pressable style={[s.actionBtn, s.deleteActionBtn]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={14} color="#DC2626" />
            <Text style={s.deleteActionBtnText}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Estilos iFood Portal (Âmbar #E3A008 / Terracota #C1440E) ───────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#6B7280', marginTop: 1, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#C1440E',
    shadowColor: '#C1440E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 40 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  badgeCounter: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeCounterText: { fontSize: 11, fontWeight: '900', color: '#92400E' },
  emptySection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  emptySectionText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13, marginTop: 6 },

  // Ticket Card
  ticketCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FEF3C7',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  ticketCardInactive: {
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    opacity: 0.8,
  },
  ticketBody: { padding: 16, paddingBottom: 12 },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  couponCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  couponCodeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusPillActive: { backgroundColor: '#D1FAE5' },
  statusPillInactive: { backgroundColor: '#E5E7EB' },
  statusPillText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  statusPillTextActive: { color: '#065F46' },
  statusPillTextInactive: { color: '#4B5563' },
  discountValueRow: { marginTop: 2 },
  discountValueText: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  ticketTitleText: { fontSize: 13, fontWeight: '700', color: '#4B5563', marginTop: 2 },
  metaContainer: { marginTop: 10, gap: 5 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaItemText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },

  // Picote do ticket
  cutoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
    position: 'relative',
  },
  cutoutCircleLeft: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    marginLeft: -8,
    borderRightWidth: 1.5,
    borderRightColor: '#FEF3C7',
  },
  cutoutCircleRight: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    marginRight: -8,
    borderLeftWidth: 1.5,
    borderLeftColor: '#FEF3C7',
  },
  cutoutDashedLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E5E7EB',
    borderStyle: 'dashed',
    marginHorizontal: 4,
  },

  // Footer do ticket
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  toggleBtnText: { fontSize: 12, fontWeight: '800' },
  actionBtnsGroup: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  deleteActionBtn: { backgroundColor: '#FEE2E2' },
  deleteActionBtnText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  // Modal
  sheet: {
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  modalCloseBtn: { padding: 4, backgroundColor: '#F3F4F6', borderRadius: 8 },
  modalBody: { padding: 18, paddingBottom: 50 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '700',
    marginBottom: 14,
  },
  inputDate: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  textarea: { minHeight: 90, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  typeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  typeBtnActive: { backgroundColor: '#C1440E', borderColor: '#C1440E' },
  typeBtnText: { fontSize: 14, fontWeight: '900', color: '#6B7280' },
  typeBtnTextActive: { color: '#FFF' },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  switchCardLabel: { fontSize: 13, fontWeight: '800', color: '#1A1A1A' },
  switchCardSub: { fontSize: 11, color: '#6B7280', marginTop: 1, fontWeight: '500' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  chipSelected: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  chipTextSelected: { color: '#92400E' },
  ticketPreviewWrapper: { marginBottom: 14 },
  previewCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  previewTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewTagText: { fontSize: 13, fontWeight: '900', color: '#C1440E', letterSpacing: 0.5 },
  previewBadgeValue: { fontSize: 14, fontWeight: '900', color: '#92400E' },
  previewDesc: { fontSize: 12, color: '#4B5563', fontWeight: '700', marginTop: 2 },
  previewMinOrder: { fontSize: 11, color: '#78350F', fontWeight: '500', marginTop: 2 },
  saveBtn: {
    backgroundColor: '#C1440E',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#C1440E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  bannerConfigBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  bannerPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#C1440E',
    borderRadius: 12,
    height: 44,
    marginTop: 6,
    paddingHorizontal: 14,
  },
  bannerPickBtnText: {
    color: '#C1440E',
    fontWeight: '800',
    fontSize: 13,
  },
  bannerPreviewWrap: {
    marginTop: 14,
  },
  bannerPreviewContainer: {
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerPreviewBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#C1440E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bannerPreviewBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  filterTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterTabBtnActive: {
    backgroundColor: '#C1440E',
  },
  filterTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  filterTabBtnTextActive: {
    color: '#FFF',
  },
  ticketBannerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  ticketBannerImg: {
    width: 76,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  ticketBannerInfo: {
    flex: 1,
  },
  bannerStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  bannerStatusTagActive: {
    backgroundColor: '#DCFCE7',
  },
  bannerStatusTagInactive: {
    backgroundColor: '#F3F4F6',
  },
  bannerStatusTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  ticketBannerBadgeText: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  bannerHintText: {
    fontSize: 11,
    color: '#92400E',
    marginBottom: 8,
    lineHeight: 16,
    fontWeight: '500',
  },
  libraryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  libraryModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  libraryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  libraryModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  libraryModalSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  libraryModalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  libraryTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  libraryTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  libraryTabBtnActive: {
    backgroundColor: '#C1440E',
  },
  libraryTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  libraryTabBtnTextActive: {
    color: '#FFF',
  },
  libraryLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  libraryLoadingText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  libraryEmpty: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  libraryEmptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  libraryEmptySub: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 12,
    justifyContent: 'space-between',
  },
  libraryCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  libraryCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  libraryCardImg: {
    width: '100%',
    height: 110,
    backgroundColor: '#F3F4F6',
  },
  libraryCardInfo: {
    padding: 8,
  },
  libraryCategoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  libraryCategoryTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
  },
  libraryCardName: {
    fontSize: 11,
    color: '#1F2937',
    fontWeight: '700',
  },
  libraryCardCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
