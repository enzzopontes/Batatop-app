import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, TextInput, Switch, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../supabaseConfig';
import { checkIsAdmin } from '../../utils/isAdmin';
import {
  fetchHomeCouponsConfig,
  saveHomeCouponsConfig,
  DEFAULT_HOME_COUPONS_CONFIG,
} from '../../utils/homeCoupons';
import { COLORS, RADIUS, SPACING, SHADOWS } from '../../constants/theme';
import CouponTemplateSelectorModal from '../../components/admin/CouponTemplateSelectorModal';

// ─── Helpers de geração automática ─────────────────────────────────
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
  const alvo = categories?.length ? categories.join(', ') : 'todas as batatas';
  return `${symbol} OFF pra ${alvo}.`;
}

function generateMinOrderText(minOrderValue) {
  if (!minOrderValue) return '';
  return `Válido para pedidos acima de R$ ${formatBR(minOrderValue)}.`;
}

function formatExpiryPTBR(date) {
  if (!date) return '';
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
    linhas.push(`Válido para pedidos acima de R$ ${formatBR(minOrderValue)} (sem considerar taxa de entrega).`);
  }
  const qtdeTexto = quantityAvailable ? ` ou até esgotar ${quantityAvailable} cupons` : '';
  linhas.push(`Validade: até ${formatExpiryPTBR(expiresAt)} (horário de Brasília)${qtdeTexto}.`);
  linhas.push('Forma de pagamento: aceito no app e na entrega.');
  linhas.push(
    maxUsesPerUser
      ? `Limite de uso: ${maxUsesPerUser} vez(es) por cliente.`
      : 'Limite de uso: ilimitado por cliente.'
  );
  linhas.push('Cupom não cumulativo com outras promoções ativas.');
  return linhas.join('\n');
}

const EMPTY_FORM = {
  value: '',
  type: 'fixed', // 'fixed' = R$, 'percentage' = %
  minOrderValue: '',
  expiresAt: buildDefaultExpiry(7),
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [homeConfig, setHomeConfig] = useState(DEFAULT_HOME_COUPONS_CONFIG);
  const [tempHomeConfig, setTempHomeConfig] = useState(DEFAULT_HOME_COUPONS_CONFIG);
  const [homeConfigModalVisible, setHomeConfigModalVisible] = useState(false);
  const [savingHomeConfig, setSavingHomeConfig] = useState(false);

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

  const loadHomeConfig = useCallback(async () => {
    try {
      const cfg = await fetchHomeCouponsConfig();
      setHomeConfig(cfg);
      setTempHomeConfig(cfg);
    } catch {
      // ignore
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
      loadHomeConfig();
    }
  }, [checkingAdmin, loadCoupons, loadCategories, loadHomeConfig]);

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
    setModalVisible(true);
  };

  const handleSelectScratch = () => {
    setTemplateModalVisible(false);
    setEditingCoupon(null);
    const expDate = buildDefaultExpiry(7);
    const initialForm = {
      ...EMPTY_FORM,
      expiresAt: expDate,
      rulesEdited: false,
    };
    initialForm.rulesText = generateRulesText({
      minOrderValue: 0,
      expiresAt: expDate,
      quantityAvailable: '',
      maxUsesPerUser: '',
    });
    setForm(initialForm);
    setModalVisible(true);
  };

  const openModal = (coupon = null) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setForm({
        value: coupon.discount_value != null ? String(coupon.discount_value) : '',
        type: coupon.discount_type === 'percentage' ? 'percentage' : 'fixed',
        minOrderValue: coupon.min_order_value != null ? String(coupon.min_order_value) : '',
        expiresAt: coupon.expires_at ? new Date(coupon.expires_at) : buildDefaultExpiry(7),
        restrictedCategories: coupon.restricted_categories || [],
        quantityAvailable: coupon.max_uses != null ? String(coupon.max_uses) : '',
        maxUsesPerUser: coupon.max_uses_per_user != null ? String(coupon.max_uses_per_user) : '',
        rulesText: coupon.rules_text || '',
        rulesEdited: true,
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
          expiresAt: next.expiresAt,
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
      title: generateTitle(valueNum, form.type, code, form.showCodeInTitle),
      description: generateDescription(valueNum, form.type, form.restrictedCategories),
      minOrderText: generateMinOrderText(parseFloat(String(form.minOrderValue).replace(',', '.'))),
      badge: form.badgeLabel.trim(),
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

  const handlePickBannerImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria para enviar a foto do banner.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: true,
      });

      if (pickerResult.canceled) return;
      const asset = pickerResult.assets[0];
      if (!asset.base64) {
        Alert.alert('Erro', 'Não foi possível ler os dados da foto.');
        return;
      }

      setUploadingImage(true);
      const mimeType = asset.mimeType || 'image/jpeg';
      const id = `coupon-banner-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const { error: insertErr } = await supabase
        .from('uploaded_images')
        .insert({
          id,
          name: asset.fileName || `${id}.jpg`,
          data: asset.base64,
          mime_type: mimeType,
          category: 'promo',
          uploaded_at: new Date().toISOString(),
        });

      if (insertErr) throw insertErr;

      const publicUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app'}/api/images/${id}`;
      updateField({ bannerImageUrl: publicUrl, isBannerHighlight: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error(err);
      Alert.alert('Erro no envio', 'Não foi possível fazer upload da foto de destaque.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const valueNum = parseFloat(String(form.value).replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor de desconto válido maior que zero.');
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

    if (form.expiresAt < new Date()) {
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

    if (form.isBannerHighlight && !form.bannerImageUrl.trim()) {
      Alert.alert('Foto necessária', 'Para destacar no carrossel da Home, selecione uma foto de destaque.');
      return;
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
      expires_at: form.expiresAt.toISOString(),
      show_on_home: form.showOnHome,
      home_priority: parseInt(form.homePriority, 10) || 0,
      banner_image_url: form.bannerImageUrl.trim() || null,
      badge_label: form.badgeLabel.trim() || null,
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
    Alert.alert('Excluir Cupom', `Deseja realmente apagar o cupom "${coupon.code}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('coupons').delete().eq('id', coupon.id);
            if (error) throw error;
            setCoupons(prev => prev.filter(c => c.id !== coupon.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o cupom.');
          }
        },
      },
    ]);
  };

  const handleSaveHomeConfig = async () => {
    setSavingHomeConfig(true);
    try {
      const saved = await saveHomeCouponsConfig(tempHomeConfig);
      setHomeConfig(saved);
      setHomeConfigModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar as configurações da home.');
    } finally {
      setSavingHomeConfig(false);
    }
  };

  const formatExpiry = (iso) => {
    if (!iso) return 'Sem expiração';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Inválido';
    return formatExpiryPTBR(d);
  };

  const activeCoupons = coupons.filter(c => c.active);
  const inactiveCoupons = coupons.filter(c => !c.active);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Central de Cupons</Text>
          <Text style={s.headerSub}>{activeCoupons.length} ativos · {inactiveCoupons.length} inativos</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable 
            style={s.homeBtn} 
            onPress={() => {
              setTempHomeConfig(homeConfig);
              setHomeConfigModalVisible(true);
            }}
          >
            <Ionicons name="home-outline" size={16} color={COLORS.secondary} />
            <Text style={s.homeBtnText}>Home</Text>
          </Pressable>
          <Pressable style={s.addBtn} onPress={handleStartCreation}>
            <Ionicons name="sparkles" size={16} color={COLORS.white} />
            <Text style={s.addBtnText}>Novo Cupom</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {/* Status Bar Home */}
          <Pressable 
            style={s.homeStatusCard} 
            onPress={() => {
              setTempHomeConfig(homeConfig);
              setHomeConfigModalVisible(true);
            }}
          >
            <View style={s.homeStatusIconBg}>
              <Ionicons name="sparkles" size={18} color={COLORS.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.homeStatusTitle}>
                Exibição na Home: {homeConfig.mode === 'auto' ? 'Modo Automático' : 'Modo Manual'}
              </Text>
              <Text style={s.homeStatusSub}>
                {homeConfig.mode === 'auto'
                  ? `Critério: ${homeConfig.auto_criteria === 'recent' ? 'Mais recentes' : 'Maior desconto'} (Máx: ${homeConfig.max_items || 5})`
                  : 'Apenas cupons marcados com "Na Home" aparecem na home'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </Pressable>

          {/* Cupons Ativos */}
          <Text style={s.sectionTitle}>Cupons Ativos ({activeCoupons.length})</Text>
          {activeCoupons.length === 0 ? (
            <View style={s.emptySection}><Text style={s.emptySectionText}>Nenhum cupom ativo no momento</Text></View>
          ) : activeCoupons.map(c => (
            <CouponCard 
              key={c.id} 
              coupon={c} 
              formatExpiry={formatExpiry} 
              onEdit={() => openModal(c)} 
              onDelete={() => handleDelete(c)} 
              onToggle={() => handleToggleActive(c)} 
              onToggleHome={() => handleToggleHome(c)}
            />
          ))}

          {/* Cupons Inativos */}
          {inactiveCoupons.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: SPACING[6] }]}>Cupons Inativos ({inactiveCoupons.length})</Text>
              {inactiveCoupons.map(c => (
                <CouponCard 
                  key={c.id} 
                  coupon={c} 
                  formatExpiry={formatExpiry} 
                  onEdit={() => openModal(c)} 
                  onDelete={() => handleDelete(c)} 
                  onToggle={() => handleToggleActive(c)} 
                  onToggleHome={() => handleToggleHome(c)}
                />
              ))}
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

      {/* Modal de Criação / Edição de Cupom em Blocos */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaProvider>
          <View style={[s.modalContainer, { paddingTop: insets.top }]}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{editingCoupon ? 'Editar Cupom' : 'Configurar Cupom'}</Text>
                <Text style={s.modalSub}>
                  {form.templateOrigin !== 'custom' ? `Baseado em Template: ${form.badgeLabel || 'Ideia'}` : 'Configuração Avançada'}
                </Text>
              </View>
              <Pressable onPress={() => setModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
              {/* BLOCO 1: REGRAS BÁSICAS */}
              <View style={s.formBlock}>
                <View style={s.blockHeader}>
                  <Ionicons name="pricetag" size={16} color={COLORS.primary} />
                  <Text style={s.blockTitle}>1. Regras Básicas do Desconto</Text>
                </View>

                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Tipo de Desconto *</Text>
                    <View style={s.typeRow}>
                      {[
                        { key: 'fixed', label: 'R$ Reais' },
                        { key: 'percentage', label: '% Porcento' },
                      ].map(t => (
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
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Valor do Desconto *</Text>
                    <TextInput
                      style={s.input}
                      placeholder={form.type === 'percentage' ? '15' : '10,00'}
                      value={form.value}
                      onChangeText={v => updateField({ value: v })}
                      keyboardType="decimal-pad"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                <Text style={s.fieldLabel}>Código de Ativação *</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ex: BEMVINDO15"
                  value={form.customCode}
                  onChangeText={v => updateField({ customCode: v.toUpperCase() })}
                  autoCapitalize="characters"
                  maxLength={20}
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={s.fieldLabel}>Badge / Etiqueta Promocional</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ex: NOVIDADE, 1º PEDIDO, IMPERDÍVEL"
                  value={form.badgeLabel}
                  onChangeText={v => updateField({ badgeLabel: v.toUpperCase() })}
                  autoCapitalize="characters"
                  maxLength={18}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* BLOCO 2: FOTO DE DESTAQUE & VITRINE HOME */}
              <View style={s.formBlock}>
                <View style={s.blockHeader}>
                  <Ionicons name="image" size={16} color={COLORS.secondary} />
                  <Text style={s.blockTitle}>2. Foto de Destaque & Carrossel Home</Text>
                </View>

                <View style={s.permanentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchTitle}>Destacar no Carrossel da Home</Text>
                    <Text style={s.switchSub}>Cria um banner no topo da Home com clique rápido</Text>
                  </View>
                  <Switch
                    value={form.isBannerHighlight}
                    onValueChange={v => updateField({ isBannerHighlight: v, showOnHome: v ? true : form.showOnHome })}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor={COLORS.white}
                  />
                </View>

                {form.isBannerHighlight && (
                  <View style={s.bannerUploadBox}>
                    {form.bannerImageUrl ? (
                      <View style={s.bannerPreviewWrapper}>
                        <ExpoImage
                          source={{ uri: form.bannerImageUrl }}
                          style={s.bannerPreviewImg}
                          contentFit="cover"
                        />
                        <Pressable style={s.changeImageBtn} onPress={handlePickBannerImage} disabled={uploadingImage}>
                          <Ionicons name="camera-reverse" size={16} color={COLORS.white} />
                          <Text style={s.changeImageText}>Trocar Foto</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={s.uploadPlaceholder} onPress={handlePickBannerImage} disabled={uploadingImage}>
                        {uploadingImage ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <Ionicons name="cloud-upload-outline" size={32} color={COLORS.primary} />
                            <Text style={s.uploadTitle}>Adicionar Foto do Banner</Text>
                            <Text style={s.uploadSub}>Recomendado: proporção 16:9 ou banner de produto</Text>
                          </>
                        )}
                      </Pressable>
                    )}

                    <View style={s.permanentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.switchTitle}>Listar na Seção de Cupons da Home</Text>
                        <Text style={s.switchSub}>Também exibe no carrossel horizontal de cupons</Text>
                      </View>
                      <Switch
                        value={form.showOnHome}
                        onValueChange={v => updateField({ showOnHome: v })}
                        trackColor={{ false: COLORS.border, true: COLORS.primary }}
                        thumbColor={COLORS.white}
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* BLOCO 3: REGRAS DE USO & RESTRIÇÕES */}
              <View style={s.formBlock}>
                <View style={s.blockHeader}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                  <Text style={s.blockTitle}>3. Regras de Uso & Proteção</Text>
                </View>

                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Pedido Mínimo (R$)</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Ex: 35,00"
                      value={form.minOrderValue}
                      onChangeText={v => updateField({ minOrderValue: v })}
                      keyboardType="decimal-pad"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Limite por Cliente</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Ex: 1 uso"
                      value={form.maxUsesPerUser}
                      onChangeText={v => updateField({ maxUsesPerUser: v })}
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                <Text style={s.fieldLabel}>Estoque Global de Cupons</Text>
                <TextInput
                  style={s.input}
                  placeholder="Vazio para cupons ilimitados"
                  value={form.quantityAvailable}
                  onChangeText={v => updateField({ quantityAvailable: v })}
                  keyboardType="number-pad"
                  placeholderTextColor={COLORS.textMuted}
                />

                {availableCategories.length > 0 && (
                  <>
                    <Text style={s.fieldLabel}>Categorias Permitidas</Text>
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
              </View>

              {/* BLOCO 4: VALIDADE & TERMOS */}
              <View style={s.formBlock}>
                <View style={s.blockHeader}>
                  <Ionicons name="time" size={16} color="#8E44AD" />
                  <Text style={s.blockTitle}>4. Validade & Termos Legais</Text>
                </View>

                <Text style={s.fieldLabel}>Data de Expiração *</Text>
                <Pressable style={s.inputDate} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  <Text style={s.dateText}>{formatExpiryPTBR(form.expiresAt)}</Text>
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

                <Text style={s.fieldLabel}>Termos de Uso (Automático / Editável)</Text>
                <TextInput
                  style={[s.input, s.textarea]}
                  value={form.rulesText}
                  onChangeText={v => setForm(f => ({ ...f, rulesText: v, rulesEdited: true }))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* LIVE PREVIEW */}
              {form.value.trim() !== '' && (
                <View style={s.previewCard}>
                  <View style={s.previewHeader}>
                    <Ionicons name="eye" size={16} color={COLORS.primary} />
                    <Text style={s.previewHeaderTitle}>Prévia Visual do Cliente</Text>
                  </View>
                  <View style={s.previewBody}>
                    <Text style={s.previewTitle}>{preview.title}</Text>
                    {preview.badge ? <Text style={s.previewBadge}>{preview.badge}</Text> : null}
                  </View>
                  <Text style={s.previewDescription}>{preview.description}</Text>
                  {!!preview.minOrderText && <Text style={s.previewMeta}>{preview.minOrderText}</Text>}
                </View>
              )}

              {/* SALVAR */}
              <Pressable style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={s.saveBtnText}>{editingCoupon ? 'Salvar Alterações' : 'Criar e Publicar Cupom'}</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaProvider>
      </Modal>

      {/* Modal de Configuração de Cupons da Home */}
      <Modal 
        visible={homeConfigModalVisible} 
        animationType="fade" 
        transparent 
        onRequestClose={() => setHomeConfigModalVisible(false)}
      >
        <View style={s.dialogOverlay}>
          <View style={s.dialogBox}>
            <View style={s.dialogHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="home" size={20} color={COLORS.secondary} />
                <Text style={s.dialogTitle}>Vitrine da Tela Inicial</Text>
              </View>
              <Pressable onPress={() => setHomeConfigModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={s.dialogSubtitle}>Escolha a inteligência de exibição na Home:</Text>

              <View style={s.configModeRow}>
                <Pressable
                  style={[s.configModeBtn, tempHomeConfig.mode === 'auto' && s.configModeBtnActive]}
                  onPress={() => setTempHomeConfig(prev => ({ ...prev, mode: 'auto' }))}
                >
                  <Ionicons name="flash-outline" size={18} color={tempHomeConfig.mode === 'auto' ? COLORS.secondary : COLORS.textMuted} />
                  <Text style={[s.configModeText, tempHomeConfig.mode === 'auto' && s.configModeTextActive]}>
                    Automático
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.configModeBtn, tempHomeConfig.mode === 'manual' && s.configModeBtnActive]}
                  onPress={() => setTempHomeConfig(prev => ({ ...prev, mode: 'manual' }))}
                >
                  <Ionicons name="hand-right-outline" size={18} color={tempHomeConfig.mode === 'manual' ? COLORS.secondary : COLORS.textMuted} />
                  <Text style={[s.configModeText, tempHomeConfig.mode === 'manual' && s.configModeTextActive]}>
                    Manual
                  </Text>
                </Pressable>
              </View>

              {tempHomeConfig.mode === 'auto' ? (
                <View style={s.configSection}>
                  <Text style={s.configLabel}>Critério de Seleção:</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    <Pressable
                      style={[s.criteriaBtn, tempHomeConfig.auto_criteria === 'highest_discount' && s.criteriaBtnActive]}
                      onPress={() => setTempHomeConfig(prev => ({ ...prev, auto_criteria: 'highest_discount' }))}
                    >
                      <Text style={[s.criteriaText, tempHomeConfig.auto_criteria === 'highest_discount' && s.criteriaTextActive]}>
                        Maior Desconto
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[s.criteriaBtn, tempHomeConfig.auto_criteria === 'recent' && s.criteriaBtnActive]}
                      onPress={() => setTempHomeConfig(prev => ({ ...prev, auto_criteria: 'recent' }))}
                    >
                      <Text style={[s.criteriaText, tempHomeConfig.auto_criteria === 'recent' && s.criteriaTextActive]}>
                        Mais Recentes
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={s.configLabel}>Quantidade Máxima:</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[3, 5, 8].map(qty => (
                      <Pressable
                        key={qty}
                        style={[s.qtyBtn, tempHomeConfig.max_items === qty && s.qtyBtnActive]}
                        onPress={() => setTempHomeConfig(prev => ({ ...prev, max_items: qty }))}
                      >
                        <Text style={[s.qtyText, tempHomeConfig.max_items === qty && s.qtyTextActive]}>
                          {qty} cupons
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={s.configSection}>
                  <View style={s.manualTipBox}>
                    <Ionicons name="information-circle-outline" size={20} color={COLORS.secondary} />
                    <Text style={s.manualTipText}>
                      No modo manual, use o botão de casinha na lista de cupons para escolher quais aparecem na vitrine da Home.
                    </Text>
                  </View>
                </View>
              )}

              <Pressable 
                style={[s.saveHomeBtn, savingHomeConfig && { opacity: 0.7 }]}
                onPress={handleSaveHomeConfig}
                disabled={savingHomeConfig}
              >
                {savingHomeConfig ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={s.saveHomeBtnText}>Salvar Preferências</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CouponCard({ coupon, formatExpiry, onEdit, onDelete, onToggle, onToggleHome }) {
  const isActive = coupon.active;
  const isHome = coupon.show_on_home;
  const isBanner = coupon.is_banner_highlight;
  const value = coupon.discount_value;

  return (
    <View style={[s.couponCard, isActive && s.couponCardActive]}>
      <View style={s.couponLeft}>
        <View style={[s.couponIconBg, { backgroundColor: isActive ? `${COLORS.primary}20` : '#F3F4F6' }]}>
          <Ionicons name="pricetag-outline" size={18} color={isActive ? COLORS.primary : '#9CA3AF'} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={s.couponCode}>{coupon.code}</Text>
            {coupon.badge_label ? (
              <View style={s.templateBadge}>
                <Text style={s.templateBadgeText}>{coupon.badge_label}</Text>
              </View>
            ) : null}
            {isBanner ? (
              <View style={s.bannerBadge}>
                <Ionicons name="image" size={10} color={COLORS.white} />
                <Text style={s.bannerBadgeText}>Banner</Text>
              </View>
            ) : null}
            {isHome ? (
              <View style={s.homeBadge}>
                <Ionicons name="home" size={10} color={COLORS.secondary} />
                <Text style={s.homeBadgeText}>Na Home</Text>
              </View>
            ) : null}
          </View>
          {!!coupon.title && <Text style={s.couponTitle}>{coupon.title}</Text>}
          <Text style={s.couponValue}>
            {coupon.discount_type === 'percentage' ? `${value}% de desconto` : `R$ ${Number(value).toFixed(2)} de desconto`}
          </Text>
          {coupon.min_order_value != null && (
            <Text style={s.couponMinOrder}>Pedido mínimo: R$ {Number(coupon.min_order_value).toFixed(2)}</Text>
          )}
          {!!coupon.description && <Text style={s.couponDescription}>{coupon.description}</Text>}
          <View style={s.couponMeta}>
            <Text style={s.couponMetaText}>Usos: {coupon.current_uses || 0}{coupon.max_uses ? `/${coupon.max_uses}` : ''}</Text>
            <Text style={s.couponMetaDot}>·</Text>
            <Text style={s.couponMetaText}>Válido: {formatExpiry(coupon.expires_at)}</Text>
          </View>
        </View>
      </View>
      <View style={s.couponActions}>
        <Switch
          value={isActive}
          onValueChange={onToggle}
          trackColor={{ false: '#E5E7EB', true: COLORS.primary }}
          thumbColor="#FFF"
          style={{ transform: [{ scale: 0.8 }] }}
        />
        <View style={s.couponBtns}>
          <Pressable 
            style={[s.iconBtn, isHome && s.iconBtnHomeActive]} 
            onPress={onToggleHome}
            hitSlop={4}
          >
            <Ionicons name={isHome ? "home" : "home-outline"} size={16} color={isHome ? COLORS.secondary : COLORS.textMuted} />
          </Pressable>
          <Pressable style={s.iconBtn} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={16} color={COLORS.textSecondary} />
          </Pressable>
          <Pressable style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundElevated },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
    paddingTop: SPACING[2],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING[2],
  },
  backBtn: { padding: SPACING[2] },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.secondary}12`,
    borderWidth: 1,
    borderColor: `${COLORS.secondary}30`,
  },
  homeBtnText: { color: COLORS.secondary, fontWeight: '800', fontSize: 12 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  addBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: SPACING[4], paddingBottom: SPACING[10] },
  homeStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING[3],
  },
  homeStatusIconBg: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.secondary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeStatusTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  homeStatusSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text, marginBottom: SPACING[2] },
  emptySection: { backgroundColor: COLORS.background, borderRadius: RADIUS.lg, padding: SPACING[6], alignItems: 'center' },
  emptySectionText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
  couponCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
    marginBottom: SPACING[2],
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  couponCardActive: { borderColor: `${COLORS.primary}40` },
  couponLeft: { flex: 1, flexDirection: 'row', gap: SPACING[3] },
  couponIconBg: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  couponCode: { fontSize: 15, fontWeight: '900', color: COLORS.text, letterSpacing: 0.5 },
  templateBadge: {
    backgroundColor: `${COLORS.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  templateBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.accent },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  bannerBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.white },
  homeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${COLORS.secondary}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  homeBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.secondary },
  couponTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  couponValue: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  couponMinOrder: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 1 },
  couponDescription: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  couponMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  couponMetaText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  couponMetaDot: { fontSize: 10, color: COLORS.border },
  couponActions: { alignItems: 'flex-end', gap: 8 },
  couponBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnHomeActive: { backgroundColor: `${COLORS.secondary}20`, borderWidth: 1, borderColor: COLORS.secondary },
  
  modalContainer: { flex: 1, backgroundColor: COLORS.backgroundElevated },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  modalSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  modalCloseBtn: { padding: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full },
  modalBody: { padding: SPACING[4], paddingBottom: SPACING[10], gap: SPACING[4] },
  formBlock: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING[2],
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: SPACING[2],
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  dateText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  textarea: { minHeight: 80, paddingTop: 10 },
  row: { flexDirection: 'row', gap: SPACING[3] },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  typeBtn: {
    flex: 1,
    height: 42,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundLight,
  },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  typeBtnTextActive: { color: COLORS.white },
  permanentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginVertical: 4,
  },
  switchTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  switchSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  bannerUploadBox: {
    gap: SPACING[2],
    marginTop: 6,
  },
  uploadPlaceholder: {
    height: 120,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    backgroundColor: `${COLORS.primary}08`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING[3],
    gap: 4,
  },
  uploadTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  uploadSub: { fontSize: 10, color: COLORS.textMuted },
  bannerPreviewWrapper: {
    position: 'relative',
    height: 130,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  bannerPreviewImg: { width: '100%', height: '100%' },
  changeImageBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  changeImageText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundLight,
  },
  chipSelected: { backgroundColor: `${COLORS.primary}20`, borderColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  chipTextSelected: { color: COLORS.primaryText },
  previewCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    gap: 4,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  previewHeaderTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' },
  previewBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  previewBadge: { fontSize: 10, fontWeight: '800', color: COLORS.secondary, backgroundColor: `${COLORS.secondary}15`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  previewDescription: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  previewMeta: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[2],
  },
  saveBtnText: { color: COLORS.white, fontWeight: '900', fontSize: 15 },

  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialogBox: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, overflow: 'hidden' },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dialogTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  dialogSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginBottom: SPACING[3] },
  configModeRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING[4] },
  configModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundLight,
  },
  configModeBtnActive: { borderColor: COLORS.secondary, backgroundColor: `${COLORS.secondary}10` },
  configModeText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  configModeTextActive: { color: COLORS.secondary },
  configSection: { marginBottom: SPACING[4] },
  configLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  criteriaBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundLight,
  },
  criteriaBtnActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}15` },
  criteriaText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  criteriaTextActive: { color: COLORS.primaryText },
  qtyBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundLight,
  },
  qtyBtnActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}15` },
  qtyText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  qtyTextActive: { color: COLORS.primaryText },
  manualTipBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: `${COLORS.secondary}10`,
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  manualTipText: { flex: 1, fontSize: 12, color: COLORS.secondary, lineHeight: 16, fontWeight: '500' },
  saveHomeBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: RADIUS.md,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveHomeBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 14 },
});
