import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, TextInput,
  Image, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://eucwoxjmjfqylyrqunwk.supabase.co';

// Mesma lógica do useProdutos.js: se image_url já é uma URL completa, usa direto;
// se não, monta a URL do bucket "Products" no Supabase Storage.
function resolveImageUrl(image_url) {
  if (!image_url) return null;
  if (image_url.startsWith('http')) return image_url;
  return `${SUPABASE_URL}/storage/v1/object/public/Products/${image_url.replace(/^\/products\//, '')}`;
}

const TABS = [
  { key: 'batata',   label: 'Batatas',   color: '#D97706', icon: 'flame-outline' },
  { key: 'macarrao', label: 'Macarrão',  color: '#EA580C', icon: 'restaurant-outline' },
  { key: 'bebida',   label: 'Bebidas',   color: '#2563EB', icon: 'cafe-outline' },
  { key: 'adicionais', label: 'Adicionais', color: '#7C3AED', icon: 'add-circle-outline' },
];

const EMPTY_PRODUCT = { name: '', description: '', price: '', image_url: '', category: 'batata', available: true };
const EMPTY_ADICIONAL = { name: '', price: '', adicional_categoria: null };

const ADIC_CATEGORIAS = [
  { key: 'proteinas', label: 'Proteínas Extra', color: '#DC2626' },
  { key: 'molhos',    label: 'Molhos e Cremes', color: '#D97706' },
  { key: 'queijos',   label: 'Queijos e Complementos', color: '#059669' },
];

export default function AdminProdutos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('batata');
  const [products, setProducts] = useState([]);
  const [adicionais, setAdicionais] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal produto
  const [prodModalVisible, setProdModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [prodForm, setProdForm] = useState(EMPTY_PRODUCT);
  const [selectedAdicionais, setSelectedAdicionais] = useState([]);
  const [saving, setSaving] = useState(false);

  // Modal adicional
  const [adicModalVisible, setAdicModalVisible] = useState(false);
  const [editingAdic, setEditingAdic] = useState(null);
  const [adicForm, setAdicForm] = useState(EMPTY_ADICIONAL);

  // ─── Carregar dados ──────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);

      // Produtos
      const { data: prods, error: e1 } = await supabase
        .from('products')
        .select('*, product_adicionais(adicional_id, adicionais(*))')
        .order('name');
      if (e1) throw e1;

      // Adicionais
      const { data: adics, error: e2 } = await supabase
        .from('adicionais')
        .select('*')
        .order('name');
      if (e2) throw e2;

      setProducts(prods || []);
      setAdicionais(adics || []);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível carregar os produtos.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ─── Produto: Abrir modal ────────────────────────────────────────
  const openProdModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProdForm({
        name: product.name || '',
        description: product.description || '',
        price: String(product.price || ''),
        image_url: product.image_url || '',
        category: product.category || 'batata',
        available: product.available !== false,
      });
      const adicsIds = (product.product_adicionais || []).map(pa => pa.adicional_id);
      setSelectedAdicionais(adicsIds);
    } else {
      setEditingProduct(null);
      setProdForm({ ...EMPTY_PRODUCT, category: activeTab === 'adicionais' ? 'batata' : activeTab });
      setSelectedAdicionais([]);
    }
    setProdModalVisible(true);
  };

  // ─── Produto: Salvar ────────────────────────────────────────────
  const handleSaveProduct = async () => {
    const { name, description, price, image_url, category, available } = prodForm;
    if (!name.trim()) { Alert.alert('Atenção', 'Informe o nome do produto.'); return; }
    const priceNum = parseFloat(price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) { Alert.alert('Atenção', 'Preço inválido.'); return; }

    setSaving(true);
    try {
      let productId;
      if (editingProduct) {
        const { error } = await supabase.from('products').update({
          name: name.trim(), description: description.trim(),
          price: priceNum, image_url: image_url.trim(), category, available,
        }).eq('id', editingProduct.id);
        if (error) throw error;
        productId = editingProduct.id;
      } else {
        const { data, error } = await supabase.from('products').insert({
          name: name.trim(), description: description.trim(),
          price: priceNum, image_url: image_url.trim(), category, available: true,
        }).select().single();
        if (error) throw error;
        productId = data.id;
      }

      // Sincronizar adicionais
      await supabase.from('product_adicionais').delete().eq('product_id', productId);
      if (selectedAdicionais.length > 0) {
        await supabase.from('product_adicionais').insert(
          selectedAdicionais.map(aid => ({ product_id: productId, adicional_id: aid }))
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProdModalVisible(false);
      await loadProducts();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar o produto.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ─── Produto: Deletar ───────────────────────────────────────────
  const handleDeleteProduct = (product) => {
    Alert.alert('Deletar Produto', `Excluir "${product.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          await supabase.from('product_adicionais').delete().eq('product_id', product.id);
          const { error } = await supabase.from('products').delete().eq('id', product.id);
          if (error) throw error;
          await loadProducts();
        } catch { Alert.alert('Erro', 'Não foi possível deletar.'); }
      }},
    ]);
  };

  // ─── Produto: Toggle disponibilidade ────────────────────────────
  const handleToggleAvailable = async (product) => {
    try {
      await supabase.from('products').update({ available: !product.available }).eq('id', product.id);
      await loadProducts();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { Alert.alert('Erro', 'Não foi possível alterar a disponibilidade.'); }
  };

  // ─── Adicional: Abrir modal ──────────────────────────────────────
  const openAdicModal = (a = null) => {
    if (a) { setEditingAdic(a); setAdicForm({ name: a.name, price: String(a.price), adicional_categoria: a.adicional_categoria || null }); }
    else { setEditingAdic(null); setAdicForm(EMPTY_ADICIONAL); }
    setAdicModalVisible(true);
  };

  // ─── Adicional: Salvar ───────────────────────────────────────────
  const handleSaveAdic = async () => {
    if (!adicForm.name.trim()) { Alert.alert('Atenção', 'Informe o nome do adicional.'); return; }
    const priceNum = parseFloat(adicForm.price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) { Alert.alert('Atenção', 'Preço inválido.'); return; }
    setSaving(true);
    try {
      if (editingAdic) {
        await supabase.from('adicionais').update({ name: adicForm.name.trim(), price: priceNum, adicional_categoria: adicForm.adicional_categoria }).eq('id', editingAdic.id);
      } else {
        await supabase.from('adicionais').insert({ name: adicForm.name.trim(), price: priceNum, adicional_categoria: adicForm.adicional_categoria });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAdicModalVisible(false);
      await loadProducts();
    } catch { Alert.alert('Erro', 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  };

  // ─── Adicional: Deletar ──────────────────────────────────────────
  const handleDeleteAdic = (a) => {
    Alert.alert('Deletar Adicional', `Excluir "${a.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          await supabase.from('product_adicionais').delete().eq('adicional_id', a.id);
          await supabase.from('adicionais').delete().eq('id', a.id);
          await loadProducts();
        } catch { Alert.alert('Erro', 'Não foi possível deletar.'); }
      }},
    ]);
  };

  const toggleAdic = (id) => setSelectedAdicionais(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const filteredProducts = products.filter(p => p.category === activeTab);
  const currentTab = TABS.find(t => t.key === activeTab);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gerenciar Cardápio</Text>
          <Text style={s.headerSub}>{products.length} produto(s) cadastrado(s)</Text>
        </View>
        <Pressable
          style={[s.addBtn, { backgroundColor: currentTab?.color || '#FFB800' }]}
          onPress={() => activeTab === 'adicionais' ? openAdicModal() : openProdModal()}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={s.addBtnText}>{activeTab === 'adicionais' ? 'Adicional' : 'Produto'}</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabContent}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && { backgroundColor: tab.color, borderColor: tab.color }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#FFF' : '#6B7280'} />
            <Text style={[s.tabText, activeTab === tab.key && { color: '#FFF' }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#FFB800" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {activeTab === 'adicionais' ? (
            adicionais.length === 0 ? (
              <EmptyState icon="add-circle-outline" text="Nenhum adicional cadastrado" />
            ) : (
              adicionais.map(a => {
                const catInfo = ADIC_CATEGORIAS.find(c => c.key === a.adicional_categoria);
                return (
                <View key={a.id} style={s.adicCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adicName}>{a.name}</Text>
                    <Text style={s.adicPrice}>R$ {Number(a.price).toFixed(2).replace('.', ',')}</Text>
                    <View style={[s.catBadge, { backgroundColor: catInfo ? catInfo.color + '1A' : '#F3F4F6' }]}>
                      <Text style={[s.catBadgeText, { color: catInfo ? catInfo.color : '#9CA3AF' }]}>
                        {catInfo ? catInfo.label : 'Sem categoria'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.cardActions}>
                    <Pressable style={s.iconBtn} onPress={() => openAdicModal(a)}>
                      <Ionicons name="pencil-outline" size={18} color="#6B7280" />
                    </Pressable>
                    <Pressable style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleDeleteAdic(a)}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </Pressable>
                  </View>
                </View>
                );
              })
            )
          ) : (
            filteredProducts.length === 0 ? (
              <EmptyState icon="cube-outline" text="Nenhum produto nesta categoria" />
            ) : (
              filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={() => openProdModal(product)}
                  onDelete={() => handleDeleteProduct(product)}
                  onToggle={() => handleToggleAvailable(product)}
                />
              ))
            )
          )}
        </ScrollView>
      )}

      {/* Modal Produto */}
      <Modal visible={prodModalVisible} animationType="none" statusBarTranslucent navigationBarTranslucent presentationStyle="pageSheet" onRequestClose={() => setProdModalVisible(false)}>
        <SafeAreaProvider>
          <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</Text>
            <Pressable onPress={() => setProdModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            <Field label="Nome *" placeholder="Ex: Batata Strogonoff" value={prodForm.name} onChangeText={v => setProdForm(f => ({ ...f, name: v }))} />
            <Field label="Descrição" placeholder="Ingredientes, detalhes..." value={prodForm.description} onChangeText={v => setProdForm(f => ({ ...f, description: v }))} multiline />
            <Field label="Preço (R$) *" placeholder="0,00" value={prodForm.price} onChangeText={v => setProdForm(f => ({ ...f, price: v }))} keyboardType="decimal-pad" />
            <Field label="URL da Imagem" placeholder="/products/foto.jpg ou https://..." value={prodForm.image_url} onChangeText={v => setProdForm(f => ({ ...f, image_url: v }))} />

            <Text style={s.fieldLabel}>Categoria *</Text>
            <View style={s.categoryRow}>
              {TABS.filter(t => t.key !== 'adicionais').map(tab => (
                <Pressable
                  key={tab.key}
                  style={[s.categoryBtn, prodForm.category === tab.key && { backgroundColor: tab.color, borderColor: tab.color }]}
                  onPress={() => setProdForm(f => ({ ...f, category: tab.key }))}
                >
                  <Text style={[s.categoryBtnText, prodForm.category === tab.key && { color: '#FFF' }]}>{tab.label}</Text>
                </Pressable>
              ))}
            </View>

            {prodForm.category !== 'bebida' && adicionais.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Adicionais vinculados</Text>
                {[...ADIC_CATEGORIAS, { key: null, label: 'Sem categoria' }].map(cat => {
                  const grupo = adicionais.filter(a => (a.adicional_categoria || null) === cat.key);
                  if (grupo.length === 0) return null;
                  return (
                    <View key={cat.label} style={{ marginBottom: 12 }}>
                      <Text style={s.adicGroupLabel}>{cat.label}</Text>
                      <View style={s.adicList}>
                        {grupo.map(a => (
                          <Pressable key={a.id} style={s.adicItem} onPress={() => toggleAdic(a.id)}>
                            <View style={[s.checkbox, selectedAdicionais.includes(a.id) && { backgroundColor: '#FFB800', borderColor: '#FFB800' }]}>
                              {selectedAdicionais.includes(a.id) && <Ionicons name="checkmark" size={12} color="#FFF" />}
                            </View>
                            <Text style={s.adicItemText}>{a.name} — R$ {Number(a.price).toFixed(2)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <Pressable style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSaveProduct} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{editingProduct ? 'Salvar Alterações' : 'Criar Produto'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </SafeAreaProvider>
      </Modal>

      {/* Modal Adicional */}
      <Modal visible={adicModalVisible} animationType="none" statusBarTranslucent navigationBarTranslucent presentationStyle="formSheet" onRequestClose={() => setAdicModalVisible(false)}>
        <SafeAreaProvider>
          <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingAdic ? 'Editar Adicional' : 'Novo Adicional'}</Text>
            <Pressable onPress={() => setAdicModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </Pressable>
          </View>
          <View style={s.modalBody}>
            <Field label="Nome *" placeholder="Ex: Bacon Extra" value={adicForm.name} onChangeText={v => setAdicForm(f => ({ ...f, name: v }))} />
            <Field label="Preço (R$) *" placeholder="0,00" value={adicForm.price} onChangeText={v => setAdicForm(f => ({ ...f, price: v }))} keyboardType="decimal-pad" />

            <Text style={s.fieldLabel}>Categoria</Text>
            <View style={s.categoryRow}>
              {ADIC_CATEGORIAS.map(cat => (
                <Pressable
                  key={cat.key}
                  style={[s.categoryBtn, adicForm.adicional_categoria === cat.key && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => setAdicForm(f => ({ ...f, adicional_categoria: f.adicional_categoria === cat.key ? null : cat.key }))}
                >
                  <Text style={[s.categoryBtnText, adicForm.adicional_categoria === cat.key && { color: '#FFF' }]}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={[s.saveBtn, { backgroundColor: '#7C3AED' }, saving && { opacity: 0.7 }]} onPress={handleSaveAdic} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{editingAdic ? 'Salvar' : 'Criar Adicional'}</Text>}
            </Pressable>
          </View>
        </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function ProductCard({ product, onEdit, onDelete, onToggle }) {
  const resolvedImage = resolveImageUrl(product.image_url);
  return (
    <View style={s.prodCard}>
      {resolvedImage ? (
        <Image source={{ uri: resolvedImage }} style={s.prodImage} />
      ) : (
        <View style={[s.prodImage, s.prodImagePlaceholder]}>
          <Ionicons name="image-outline" size={24} color="#D1D5DB" />
        </View>
      )}
      <View style={s.prodInfoCol}>
        <Text style={s.prodName} numberOfLines={2}>{product.name}</Text>
        {!!product.description && <Text style={s.prodDesc} numberOfLines={1}>{product.description}</Text>}
        <Text style={s.prodPrice}>R$ {Number(product.price).toFixed(2).replace('.', ',')}</Text>
      </View>
      <View style={s.prodActions}>
        <Pressable style={[s.availBadge, { backgroundColor: product.available ? '#D1FAE5' : '#FEE2E2' }]} onPress={onToggle}>
          <Ionicons name={product.available ? 'eye-outline' : 'eye-off-outline'} size={13} color={product.available ? '#059669' : '#DC2626'} />
          <Text style={[s.availText, { color: product.available ? '#059669' : '#DC2626' }]}>
            {product.available ? 'Ativo' : 'Inativo'}
          </Text>
        </Pressable>
        <View style={s.cardActionsRow}>
          <Pressable style={s.iconBtn} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={17} color="#6B7280" />
          </Pressable>
          <Pressable style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={17} color="#DC2626" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Field({ label, placeholder, value, onChangeText, multiline, keyboardType }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

function EmptyState({ icon, text }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={48} color="#E5E7EB" />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  tabBar: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', maxHeight: 58 },
  tabContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },

  listContent: { padding: 12, gap: 10, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#D1D5DB', fontWeight: '600' },

  prodCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  prodImage: { width: 68, height: 68, borderRadius: 14, backgroundColor: '#F3F4F6', flexShrink: 0 },
  prodImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  prodInfoCol: { flex: 1, flexShrink: 1, minWidth: 0 },
  prodName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  prodDesc: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  prodPrice: { fontSize: 15, fontWeight: '900', color: '#D97706', marginTop: 4 },
  prodActions: { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  availBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  availText: { fontSize: 11, fontWeight: '700' },
  cardActionsRow: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },

  adicCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  adicName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  adicPrice: { fontSize: 13, fontWeight: '700', color: '#7C3AED', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  catBadgeText: { fontSize: 10, fontWeight: '800' },
  adicGroupLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  modalCloseBtn: { padding: 4, backgroundColor: '#F3F4F6', borderRadius: 10 },
  modalBody: { padding: 20, paddingBottom: 60 },

  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A1A1A', fontWeight: '600' },

  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  categoryBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  categoryBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },

  adicList: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16, overflow: 'hidden' },
  adicItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  adicItemText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  saveBtn: { backgroundColor: '#FFB800', borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
