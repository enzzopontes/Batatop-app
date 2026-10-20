import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, TextInput, Switch, Platform,
} from 'react-native';
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
    setModalVisible(true);
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

  const handleSave = async () => {
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

  const activeCoupons = coupons.filter(c => c.active);
  const inactiveCoupons = coupons.filter(c => !c.active);

  const formatExpiry = (dateStr) => {
    if (!dateStr) return 'Permanente';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  if (checkingAdmin) {
    return (
      <View style={[s.container, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#E3A008" />
      </View>
    );
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
          <Text style={s.headerSub}>{activeCoupons.length} ativo(s) · {inactiveCoupons.length} inativo(s)</Text>
        </View>
        <Pressable style={s.addBtn} onPress={() => openModal()}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={s.addBtnText}>Novo Cupom</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#E3A008" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
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
          ) : activeCoupons.map(c => (
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
            />
          ))}

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

      {/* Modal de Criação / Edição */}
      <Modal visible={modalVisible} animationType="slide" statusBarTranslucent navigationBarTranslucent presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaProvider>
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

              {/* Preview em tempo real */}
              {form.value.trim() !== '' && (
                <View style={s.ticketPreviewWrapper}>
                  <Text style={s.fieldLabel}>Pré-visualização do Ticket</Text>
                  <View style={s.previewCard}>
                    <View style={s.previewHeader}>
                      <View style={s.previewTag}>
                        <Ionicons name="pricetag" size={12} color="#C1440E" />
                        <Text style={s.previewTagText}>{preview.code}</Text>
                      </View>
                      <Text style={s.previewBadgeValue}>{preview.title}</Text>
                    </View>
                    <Text style={s.previewDesc}>{preview.description}</Text>
                    {!!preview.minOrderText && (
                      <Text style={s.previewMinOrder}>{preview.minOrderText}</Text>
                    )}
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
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={s.saveBtnText}>
                    {editingCoupon ? 'Salvar Alterações' : 'Criar Cupom'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

// ─── Componente TicketCard (Estilo iFood Portal) ──────────────────────
function TicketCard({ coupon, formatExpiry, copiedId, onCopy, onEdit, onDelete, onToggle, onToggleHome }) {
  const isActive = coupon.active;
  const isHome = coupon.show_on_home;
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {coupon.badge_label ? (
              <View style={[s.statusPill, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[s.statusPillText, { color: '#92400E' }]}>{coupon.badge_label}</Text>
              </View>
            ) : null}
            {isHome ? (
              <View style={[s.statusPill, { backgroundColor: '#FEF3C7', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                <Ionicons name="home" size={10} color="#D97706" />
                <Text style={[s.statusPillText, { color: '#92400E' }]}>Home</Text>
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
      </View>

      {/* Ticket Cutout Line com Picote Tracejado (iFood Standard) */}
      <View style={s.cutoutRow}>
        <View style={s.cutoutCircleLeft} />
        <View style={s.cutoutDashedLine} />
        <View style={s.cutoutCircleRight} />
      </View>

      {/* Footer com Ações */}
      <View style={s.ticketFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
              {isHome ? 'Na Home' : 'Home'}
            </Text>
          </Pressable>
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
});
