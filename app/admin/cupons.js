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

// ─── Helpers de geração automática ─────────────────────────────────
function formatBR(value) {
  const n = Number(value);
  if (isNaN(n)) return '0';
  return n % 1 === 0 ? String(n) : String(n).replace('.', ',');
}

function buildDefaultExpiry() {
  const d = new Date();
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
  linhas.push(`Data de validade: Somente até ${formatExpiryPTBR(expiresAt)} (horário de Brasília)${qtdeTexto}.`);
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
  expiresAt: buildDefaultExpiry(),
  restrictedCategories: [],
  quantityAvailable: '',
  maxUsesPerUser: '',
  rulesText: '', // editável depois de gerado
  rulesEdited: false,
  customCode: '',
  showCodeInTitle: false,
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
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);

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

  const openModal = (coupon = null) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setForm({
        value: coupon.discount_value != null ? String(coupon.discount_value) : '',
        type: coupon.discount_type === 'percentage' ? 'percentage' : 'fixed',
        minOrderValue: coupon.min_order_value != null ? String(coupon.min_order_value) : '',
        expiresAt: coupon.expires_at ? new Date(coupon.expires_at) : buildDefaultExpiry(),
        restrictedCategories: coupon.restricted_categories || [],
        quantityAvailable: coupon.max_uses != null ? String(coupon.max_uses) : '',
        maxUsesPerUser: coupon.max_uses_per_user != null ? String(coupon.max_uses_per_user) : '',
        rulesText: coupon.rules_text || '',
        rulesEdited: true, // não sobrescreve regras já salvas manualmente
        customCode: coupon.code || '',
        showCodeInTitle: !!coupon.show_code_in_title,
      });
    } else {
      setEditingCoupon(null);
      setForm(EMPTY_FORM);
    }
    setModalVisible(true);
  };

  // ─── Atualiza um campo e recalcula os campos automáticos ─────────
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
    };
  }, [form.value, form.type, form.minOrderValue, form.restrictedCategories, form.customCode, form.showCodeInTitle]);

  const toggleRestrictedCategory = (cat) => {
    setForm(f => {
      const has = f.restrictedCategories.includes(cat);
      const restrictedCategories = has
        ? f.restrictedCategories.filter(c => c !== cat)
        : [...f.restrictedCategories, cat];
      return { ...f, restrictedCategories };
    });
  };

  const handleSave = async () => {
    const valueNum = parseFloat(String(form.value).replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor de desconto válido.');
      return;
    }

    let minOrderValue = null;
    if (form.minOrderValue.trim() !== '') {
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
    if (form.quantityAvailable.trim() !== '') {
      quantityAvailable = parseInt(form.quantityAvailable, 10);
      if (isNaN(quantityAvailable) || quantityAvailable <= 0) {
        Alert.alert('Atenção', 'Quantidade disponível deve ser maior que zero.');
        return;
      }
    }

    let maxUsesPerUser = null;
    if (form.maxUsesPerUser.trim() !== '') {
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
      expires_at: form.expiresAt.toISOString(),
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

  const handleToggleActive = async (coupon) => {
    try {
      await supabase.from('coupons').update({ active: !coupon.active }).eq('id', coupon.id);
      await loadCoupons();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar o status.');
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
    if (!dateStr) return 'Sem expiração';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  if (checkingAdmin) {
    return (
      <View style={[s.container, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#A855F7" />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gerenciar Cupons</Text>
          <Text style={s.headerSub}>{activeCoupons.length} ativo(s) · {inactiveCoupons.length} inativo(s)</Text>
        </View>
        <Pressable style={s.addBtn} onPress={() => openModal()}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={s.addBtnText}>Novo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#A855F7" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          <Text style={s.sectionTitle}>Cupons Ativos ({activeCoupons.length})</Text>
          {activeCoupons.length === 0 ? (
            <View style={s.emptySection}><Text style={s.emptySectionText}>Nenhum cupom ativo</Text></View>
          ) : activeCoupons.map(c => (
            <CouponCard key={c.id} coupon={c} formatExpiry={formatExpiry} onEdit={() => openModal(c)} onDelete={() => handleDelete(c)} onToggle={() => handleToggleActive(c)} />
          ))}

          {inactiveCoupons.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>Cupons Inativos ({inactiveCoupons.length})</Text>
              {inactiveCoupons.map(c => (
                <CouponCard key={c.id} coupon={c} formatExpiry={formatExpiry} onEdit={() => openModal(c)} onDelete={() => handleDelete(c)} onToggle={() => handleToggleActive(c)} />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="none" statusBarTranslucent navigationBarTranslucent presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaProvider>
          <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}</Text>
            <Pressable onPress={() => setModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>

            {/* Tipo + Valor */}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Tipo *</Text>
                <View style={s.typeRow}>
                  {[{ key: 'fixed', label: 'R$' }, { key: 'percentage', label: '%' }].map(t => (
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
              <View style={{ flex: 2 }}>
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

            {/* Código customizado (opcional) */}
            <Text style={s.fieldLabel}>Código do cupom (opcional)</Text>
            <TextInput
              style={s.input}
              placeholder="Deixe vazio pra gerar automático"
              value={form.customCode}
              onChangeText={v => updateField({ customCode: v.toUpperCase() })}
              autoCapitalize="characters"
              maxLength={20}
              placeholderTextColor="#9CA3AF"
            />

            {/* Mostrar código no título */}
            <View style={s.permanentRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Mostrar código no título</Text>
                <Text style={s.permanentSub}>Em vez de "10%", o título vira o código do cupom</Text>
              </View>
              <Switch
                value={form.showCodeInTitle}
                onValueChange={v => updateField({ showCodeInTitle: v })}
                trackColor={{ false: '#E5E7EB', true: '#A855F7' }}
                thumbColor="#FFF"
              />
            </View>

            {/* Min order */}
            <Text style={s.fieldLabel}>Pedido mínimo *</Text>
            <TextInput
              style={s.input}
              placeholder="Ex: 15,00"
              value={form.minOrderValue}
              onChangeText={v => updateField({ minOrderValue: v })}
              keyboardType="decimal-pad"
              placeholderTextColor="#9CA3AF"
            />

            {/* Data/hora expiração */}
            <Text style={s.fieldLabel}>Expira em *</Text>
            <Pressable style={s.input} onPress={() => setShowDatePicker(true)}>
              <Text style={{ color: '#1A1A1A', fontWeight: '600' }}>
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

            {/* Qtde disponível */}
            <Text style={s.fieldLabel}>Quantidade disponível</Text>
            <TextInput
              style={s.input}
              placeholder="Deixe vazio para ilimitado"
              value={form.quantityAvailable}
              onChangeText={v => updateField({ quantityAvailable: v })}
              keyboardType="number-pad"
              placeholderTextColor="#9CA3AF"
            />

            {/* Limite de uso por pessoa */}
            <Text style={s.fieldLabel}>Limite de uso por pessoa</Text>
            <TextInput
              style={s.input}
              placeholder="Deixe vazio para ilimitado"
              value={form.maxUsesPerUser}
              onChangeText={v => updateField({ maxUsesPerUser: v })}
              keyboardType="number-pad"
              placeholderTextColor="#9CA3AF"
            />

            {/* Categorias (opcional) */}
            {availableCategories.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Restaurantes/Categorias (opcional)</Text>
                <View style={s.chipsWrap}>
                  {availableCategories.map(cat => {
                    const selected = form.restrictedCategories.includes(cat);
                    return (
                      <Pressable key={cat} style={[s.chip, selected && s.chipSelected]} onPress={() => toggleRestrictedCategory(cat)}>
                        <Text style={[s.chipText, selected && s.chipTextSelected]}>{cat}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Regras (geradas, editáveis) */}
            <Text style={s.fieldLabel}>Regras (geradas automaticamente, editável)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={form.rulesText}
              onChangeText={v => setForm(f => ({ ...f, rulesText: v, rulesEdited: true }))}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              placeholderTextColor="#9CA3AF"
            />

            {/* Preview em tempo real */}
            {form.value.trim() !== '' && (
              <>
                <Text style={s.fieldLabel}>Pré-visualização</Text>
                <View style={s.previewCard}>
                  <View style={s.previewTitleRow}>
                    <Ionicons name="pricetag" size={16} color="#10B981" />
                    <Text style={s.previewTitle}>{preview.title}</Text>
                  </View>
                  <Text style={s.previewDescription}>{preview.description}</Text>
                  {!!preview.minOrderText && <Text style={s.previewMeta}>{preview.minOrderText}</Text>}
                </View>
              </>
            )}

            <Pressable style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{editingCoupon ? 'Salvar Alterações' : 'Criar Cupom'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function CouponCard({ coupon, formatExpiry, onEdit, onDelete, onToggle }) {
  const isActive = coupon.active;
  const value = coupon.discount_value;
  return (
    <View style={[s.couponCard, isActive && s.couponCardActive]}>
      <View style={s.couponLeft}>
        <View style={[s.couponIconBg, { backgroundColor: isActive ? '#F3E8FF' : '#F3F4F6' }]}>
          <Ionicons name="pricetag-outline" size={18} color={isActive ? '#A855F7' : '#9CA3AF'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.couponCode}>{coupon.code}</Text>
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
        <Switch value={isActive} onValueChange={onToggle} trackColor={{ false: '#E5E7EB', true: '#A855F7' }} thumbColor="#FFF" style={{ transform: [{ scale: 0.8 }] }} />
        <View style={s.couponBtns}>
          <Pressable style={s.iconBtn} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={16} color="#6B7280" />
          </Pressable>
          <Pressable style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: '#A855F7' },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 10 },
  emptySection: { backgroundColor: '#FFF', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 8 },
  emptySectionText: { color: '#9CA3AF', fontWeight: '600', fontSize: 14 },
  couponCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10, borderWidth: 1.5, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  couponCardActive: { borderColor: '#E9D5FF' },
  couponLeft: { flex: 1, flexDirection: 'row', gap: 12 },
  couponIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  couponCode: { fontSize: 16, fontWeight: '900', color: '#1A1A1A', letterSpacing: 0.5 },
  couponTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  couponValue: { fontSize: 12, fontWeight: '700', color: '#A855F7', marginTop: 2 },
  couponMinOrder: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 2 },
  couponDescription: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  couponMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  couponMetaText: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  couponMetaDot: { fontSize: 10, color: '#D1D5DB' },
  couponActions: { alignItems: 'flex-end', gap: 8 },
  couponBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  modalCloseBtn: { padding: 4, backgroundColor: '#F3F4F6', borderRadius: 10 },
  modalBody: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A1A1A', fontWeight: '600', marginBottom: 16, justifyContent: 'center' },
  textarea: { minHeight: 100, paddingTop: 12 },
  row: { flexDirection: 'row', gap: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  typeBtnActive: { backgroundColor: '#A855F7', borderColor: '#A855F7' },
  typeBtnText: { fontSize: 16, fontWeight: '900', color: '#6B7280' },
  typeBtnTextActive: { color: '#FFF' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
  chipSelected: { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  chipTextSelected: { color: '#A855F7' },
  saveBtn: { backgroundColor: '#A855F7', borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  permanentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16 },
  permanentSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  previewCard: { borderRadius: 14, padding: 16, backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16 },
  previewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  previewTitle: { fontSize: 18, fontWeight: '900', color: '#166534' },
  previewDescription: { fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 4 },
  previewMeta: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
});
