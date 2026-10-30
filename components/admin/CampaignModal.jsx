import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import NotificationDeviceMockup from './NotificationDeviceMockup';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';
import { ThemedAlertHost } from '../ThemedAlert';
import { CAMPAIGN_TEMPLATES } from '../../constants/campaignTemplates';
import { supabase } from '../../supabaseConfig';

const THEME = {
  primary: '#E3A008',
  primaryDark: '#B47B04',
  terracotta: '#C1440E',
  bgWarm: '#F7F4EF',
  cardBg: '#FFFFFF',
  textDark: '#1F1B16',
  textMuted: '#78716C',
  border: '#E7E5E4',
};

export default function CampaignModal({
  visible,
  onClose,
  onSuccess,
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [submitting, setSubmitting] = useState(false);

  // Campos da Campanha
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [badgeLabel, setBadgeLabel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sendImmediately, setSendImmediately] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Cupom Integrado
  const [hasCoupon, setHasCoupon] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [discountType, setDiscountType] = useState('percentage'); // 'percentage' | 'fixed'
  const [discountValue, setDiscountValue] = useState('15');
  const [minOrderValue, setMinOrderValue] = useState('40');
  const [couponDaysValid, setCouponDaysValid] = useState('7');

  const applyTemplate = (tpl) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTitle(tpl.title);
    setBody(tpl.body);
    setBadgeLabel(tpl.badge);
    setImageUrl(tpl.suggestedBanner);
    if (tpl.suggestedCouponCode) {
      setHasCoupon(true);
      setCouponCode(tpl.suggestedCouponCode);
      setDiscountType(tpl.suggestedDiscountType);
      setDiscountValue(tpl.suggestedDiscountValue);
      setMinOrderValue(tpl.suggestedMinOrder);
    }
  };

  const resetForm = () => {
    setTitle('');
    setBody('');
    setBadgeLabel('');
    setImageUrl('');
    setSendImmediately(false);
    setHasCoupon(true);
    setCouponCode('');
    setDiscountType('percentage');
    setDiscountValue('15');
    setMinOrderValue('40');
    setCouponDaysValid('7');
    setActiveTab('editor');
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Atenção', 'Informe o título da notificação.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Atenção', 'Informe o texto/corpo da notificação.');
      return;
    }

    try {
      setSubmitting(true);
      let createdCouponId = null;

      // 1. Criação do Cupom no Supabase (se habilitado)
      if (hasCoupon && couponCode.trim()) {
        const cleanCode = couponCode.trim().toUpperCase();
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + (parseInt(couponDaysValid, 10) || 7));
        expDate.setHours(23, 59, 59, 999);

        const discountNum = parseFloat(discountValue.replace(',', '.')) || 0;
        const minOrderNum = parseFloat(minOrderValue.replace(',', '.')) || 0;

        const couponPayload = {
          code: cleanCode,
          type: discountType,
          value: discountNum,
          min_order_value: minOrderNum > 0 ? minOrderNum : null,
          expires_at: expDate.toISOString(),
          active: true,
          template_origin: 'campaign',
          badge_label: badgeLabel || 'CAMPANHA',
          show_on_home: true,
          home_priority: 10,
          rules_text: `Cupom de campanha especial Batata Top. Válido até ${expDate.toLocaleDateString('pt-BR')}.`,
        };

        const { data: cupomCriado, error: couponError } = await supabase
          .from('coupons')
          .insert(couponPayload)
          .select('id')
          .single();

        if (couponError) {
          console.warn('Aviso ao criar cupom:', couponError.message);
          // Continua sem quebrar se o código já existir ou se falhar pontualmente
        } else {
          createdCouponId = cupomCriado?.id || null;
        }
      }

      // 2. Criação da Campanha
      const sendTime = sendImmediately ? new Date() : scheduledDate;

      const campaignPayload = {
        title: title.trim(),
        body: body.trim(),
        badge_label: badgeLabel.trim() || null,
        image_url: imageUrl.trim() || null,
        coupon_id: createdCouponId,
        scheduled_for: sendTime.toISOString(),
        status: sendImmediately ? 'processing' : 'scheduled',
        target_audience: 'all',
      };

      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .insert(campaignPayload)
        .select('id')
        .single();

      if (campaignError) {
        throw new Error(campaignError.message);
      }

      // 3. Se envio imediato, engatilha a Edge Function
      if (sendImmediately && campaignData?.id) {
        supabase.functions.invoke('dispatch-campaign-push', {
          body: { campaignId: campaignData.id },
        }).catch((fnErr) => {
          console.warn('Erro ao disparar Edge Function imediatamente:', fnErr);
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Sucesso!',
        sendImmediately
          ? 'Campanha enviada para a fila de disparo em massa!'
          : 'Campanha agendada com sucesso!'
      );

      resetForm();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar campanha:', err);
      Alert.alert('Erro', err.message || 'Falha ao salvar campanha.');
    } finally {
      setSubmitting(false);
    }
  };

  const discountLabel = hasCoupon && couponCode
    ? discountType === 'percentage'
      ? `${discountValue}% OFF`
      : `R$ ${discountValue} OFF`
    : null;

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={[s.sheet, { height: '92%', maxHeight: '92%' }]}
      scrollable
    >
      <View style={s.modalContainer}>
        {/* Header do Modal */}
        <View style={s.header}>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={THEME.textDark} />
          </Pressable>
          <Text style={s.headerTitle}>Nova Campanha Push</Text>
          <Pressable
            onPress={handleSave}
            disabled={submitting}
            style={[s.saveBtn, submitting && s.saveBtnDisabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={s.saveBtnText}>
                {sendImmediately ? 'Disparar' : 'Agendar'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Tab Switcher */}
        <View style={s.tabBar}>
          <Pressable
            style={[s.tabItem, activeTab === 'editor' && s.tabItemActive]}
            onPress={() => setActiveTab('editor')}
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={activeTab === 'editor' ? THEME.terracotta : THEME.textMuted}
            />
            <Text
              style={[s.tabText, activeTab === 'editor' && s.tabTextActive]}
            >
              Configurar Campanha
            </Text>
          </Pressable>

          <Pressable
            style={[s.tabItem, activeTab === 'preview' && s.tabItemActive]}
            onPress={() => setActiveTab('preview')}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={18}
              color={activeTab === 'preview' ? THEME.terracotta : THEME.textMuted}
            />
            <Text
              style={[s.tabText, activeTab === 'preview' && s.tabTextActive]}
            >
              Preview iFood
            </Text>
          </Pressable>
        </View>

        {activeTab === 'preview' ? (
          <ScrollView contentContainerStyle={s.previewScroll}>
            <Text style={s.previewHeadline}>
              Prévia Visual em Tempo Real
            </Text>
            <Text style={s.previewSub}>
              Exatamente como aparecerá no iPhone / Android dos seus clientes.
            </Text>

            <NotificationDeviceMockup
              title={title}
              body={body}
              imageUrl={imageUrl}
              couponCode={hasCoupon ? couponCode : null}
              discountLabel={discountLabel}
              badgeLabel={badgeLabel}
            />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={s.scrollContent}>
            {/* Seletor Rápido de Templates Comemorativos */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Ionicons name="sparkles" size={18} color={THEME.primary} />
                <Text style={s.sectionTitle}>Templates Rápidos (Feriados & Gatilhos)</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.templatesTrack}
              >
                {CAMPAIGN_TEMPLATES.map((tpl) => (
                  <Pressable
                    key={tpl.id}
                    style={s.templateCard}
                    onPress={() => applyTemplate(tpl)}
                  >
                    <View style={[s.templateIconWrap, { backgroundColor: `${tpl.iconColor}15` }]}>
                      <Ionicons name={tpl.icon} size={20} color={tpl.iconColor} />
                    </View>
                    <Text style={s.templateName}>{tpl.name}</Text>
                    <Text style={s.templateBadge}>{tpl.badge}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Conteúdo do Push */}
            <View style={s.cardSection}>
              <Text style={s.cardSectionTitle}>Mensagem Push</Text>

              <Text style={s.inputLabel}>Título da Notificação *</Text>
              <TextInput
                style={s.input}
                placeholder="Ex: ❤️ Mãe merece Batata Top quentinha!"
                value={title}
                onChangeText={setTitle}
                maxLength={65}
              />

              <Text style={s.inputLabel}>Mensagem / Corpo *</Text>
              <TextInput
                style={[s.input, s.textArea]}
                placeholder="Ex: Batata recheada com muito queijo e bacon. Aproveite desconto exclusivo de R$ 10!"
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={3}
                maxLength={180}
              />

              <Text style={s.inputLabel}>URL da Foto / Imagem de Destaque (Opcional)</Text>
              <TextInput
                style={s.input}
                placeholder="https://... (link da foto no Supabase Storage ou web)"
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
              />

              <Text style={s.inputLabel}>Etiqueta / Tag da Notificação</Text>
              <TextInput
                style={s.input}
                placeholder="Ex: ESPECIAL, PROMOÇÃO, LIMITADO"
                value={badgeLabel}
                onChangeText={setBadgeLabel}
                autoCapitalize="characters"
              />
            </View>

            {/* Cupom Integrado */}
            <View style={s.cardSection}>
              <View style={s.rowBetween}>
                <View>
                  <Text style={s.cardSectionTitle}>Gerar Cupom Automático</Text>
                  <Text style={s.cardSectionSub}>Cria o cupom no sistema e atrela ao push</Text>
                </View>
                <Switch
                  value={hasCoupon}
                  onValueChange={setHasCoupon}
                  trackColor={{ false: '#D6D3D1', true: THEME.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {hasCoupon ? (
                <View style={s.couponFields}>
                  <Text style={s.inputLabel}>Código do Cupom *</Text>
                  <TextInput
                    style={[s.input, s.inputUppercase]}
                    placeholder="Ex: MAETOP15"
                    value={couponCode}
                    onChangeText={(val) => setCouponCode(val.toUpperCase())}
                    autoCapitalize="characters"
                  />

                  <View style={s.rowInputs}>
                    <View style={s.flex1}>
                      <Text style={s.inputLabel}>Tipo</Text>
                      <View style={s.typeToggleRow}>
                        <Pressable
                          style={[s.typeBtn, discountType === 'percentage' && s.typeBtnActive]}
                          onPress={() => setDiscountType('percentage')}
                        >
                          <Text style={[s.typeBtnText, discountType === 'percentage' && s.typeBtnTextActive]}>
                            % Porcentagem
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[s.typeBtn, discountType === 'fixed' && s.typeBtnActive]}
                          onPress={() => setDiscountType('fixed')}
                        >
                          <Text style={[s.typeBtnText, discountType === 'fixed' && s.typeBtnTextActive]}>
                            R$ Fixo
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={s.flex1}>
                      <Text style={s.inputLabel}>Valor do Desconto *</Text>
                      <TextInput
                        style={s.input}
                        placeholder={discountType === 'percentage' ? '15' : '10.00'}
                        value={discountValue}
                        onChangeText={setDiscountValue}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={s.rowInputs}>
                    <View style={s.flex1}>
                      <Text style={s.inputLabel}>Pedido Mínimo (R$)</Text>
                      <TextInput
                        style={s.input}
                        placeholder="Ex: 40"
                        value={minOrderValue}
                        onChangeText={setMinOrderValue}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={s.flex1}>
                      <Text style={s.inputLabel}>Validade (Dias)</Text>
                      <TextInput
                        style={s.input}
                        placeholder="Ex: 7"
                        value={couponDaysValid}
                        onChangeText={setCouponDaysValid}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Agendamento & Disparo */}
            <View style={s.cardSection}>
              <View style={s.rowBetween}>
                <View>
                  <Text style={s.cardSectionTitle}>Disparar Imediatamente</Text>
                  <Text style={s.cardSectionSub}>Envia para todos agora sem agendamento</Text>
                </View>
                <Switch
                  value={sendImmediately}
                  onValueChange={setSendImmediately}
                  trackColor={{ false: '#D6D3D1', true: THEME.terracotta }}
                  thumbColor="#FFF"
                />
              </View>

              {!sendImmediately ? (
                <View style={s.scheduleBox}>
                  <Text style={s.inputLabel}>Data e Horário do Disparo</Text>
                  <View style={s.schedulePickersRow}>
                    <Pressable
                      style={s.dateTimeBtn}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={18} color={THEME.textDark} />
                      <Text style={s.dateTimeBtnText}>
                        {scheduledDate.toLocaleDateString('pt-BR')}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={s.dateTimeBtn}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Ionicons name="time-outline" size={18} color={THEME.textDark} />
                      <Text style={s.dateTimeBtnText}>
                        {scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Pressable>
                  </View>

                  {showDatePicker && (
                    <DateTimePicker
                      value={scheduledDate}
                      mode="date"
                      display="default"
                      onChange={(event, selected) => {
                        setShowDatePicker(false);
                        if (selected) {
                          const updated = new Date(scheduledDate);
                          updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                          setScheduledDate(updated);
                        }
                      }}
                    />
                  )}

                  {showTimePicker && (
                    <DateTimePicker
                      value={scheduledDate}
                      mode="time"
                      display="default"
                      onChange={(event, selected) => {
                        setShowTimePicker(false);
                        if (selected) {
                          const updated = new Date(scheduledDate);
                          updated.setHours(selected.getHours(), selected.getMinutes());
                          setScheduledDate(updated);
                        }
                      }}
                    />
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>
        )}
        <ThemedAlertHost />
      </View>
    </SwipeableBottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: THEME.bgWarm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: THEME.bgWarm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: THEME.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.textDark,
  },
  saveBtn: {
    backgroundColor: THEME.terracotta,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: THEME.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: THEME.terracotta,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textMuted,
    marginLeft: 6,
  },
  tabTextActive: {
    color: THEME.terracotta,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewScroll: {
    padding: 16,
    alignItems: 'center',
  },
  previewHeadline: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.textDark,
    marginTop: 8,
  },
  previewSub: {
    fontSize: 13,
    color: THEME.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.textDark,
    marginLeft: 6,
  },
  templatesTrack: {
    paddingRight: 16,
  },
  templateCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    width: 140,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  templateIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  templateName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.textDark,
    textAlign: 'center',
    marginBottom: 4,
  },
  templateBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.terracotta,
    textTransform: 'uppercase',
  },
  cardSection: {
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.textDark,
    marginBottom: 4,
  },
  cardSectionSub: {
    fontSize: 12,
    color: THEME.textMuted,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textDark,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: THEME.bgWarm,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: THEME.textDark,
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
  },
  inputUppercase: {
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  couponFields: {
    marginTop: 4,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  flex1: {
    flex: 1,
  },
  typeToggleRow: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: THEME.bgWarm,
  },
  typeBtnActive: {
    backgroundColor: THEME.primary,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textMuted,
  },
  typeBtnTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  scheduleBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  schedulePickersRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.bgWarm,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 12,
    borderRadius: 8,
  },
  dateTimeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textDark,
    marginLeft: 8,
  },
});
