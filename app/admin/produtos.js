import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, TextInput,
  Image, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';
import { AdminListSkeleton } from '../../components/Skeleton';
import { ThemedAlertHost } from '../../components/ThemedAlert';
import SwipeableBottomSheetModal from '../../components/SwipeableBottomSheetModal';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://eucwoxjmjfqylyrqunwk.supabase.co';

function resolveImageUrl(image_url) {
  if (!image_url) return null;
  if (image_url.startsWith('http')) return image_url;
  return `${SUPABASE_URL}/storage/v1/object/public/Products/${image_url.replace(/^\/products\//, '')}`;
}

const TABS = [
  { key: 'batata', label: 'Batatas', icon: 'flame-outline' },
  { key: 'macarrao', label: 'Macarrão', icon: 'restaurant-outline' },
  { key: 'bebida', label: 'Bebidas', icon: 'cafe-outline' },
  { key: 'adicionais', label: 'Adicionais', icon: 'layers-outline' },
];

const EMPTY_PRODUCT = { name: '', description: '', price: '', image_url: '', category: 'batata', available: true };
const EMPTY_ADICIONAL = { name: '', price: '', adicional_categoria: 'proteinas' };

export const ADIC_CATEGORIAS = [
  { key: 'proteinas', label: 'Proteínas Extra', color: '#DC2626', icon: 'nutrition-outline' },
  { key: 'queijos', label: 'Queijos e Recheios', color: '#059669', icon: 'pizza-outline' },
  { key: 'molhos', label: 'Molhos e Cremes', color: '#D97706', icon: 'water-outline' },
  { key: 'complementos', label: 'Complementos', color: '#7C3AED', icon: 'sparkles-outline' },
];

export function getAdicionalCategory(a) {
  if (a.adicional_categoria) return a.adicional_categoria;
  const lower = (a.name || '').toLowerCase();
  if (
    lower.includes('bacon') ||
    lower.includes('frango') ||
    lower.includes('carne') ||
    lower.includes('alcatra') ||
    lower.includes('calabresa') ||
    lower.includes('costela') ||
    lower.includes('camarão')
  )
    return 'proteinas';
  if (
    lower.includes('catupiry') ||
    lower.includes('cheddar') ||
    lower.includes('mussarela') ||
    lower.includes('queijo') ||
    lower.includes('parmesão') ||
    lower.includes('provolone') ||
    lower.includes('gorgonzola')
  )
    return 'queijos';
  if (
    lower.includes('molho') ||
    lower.includes('maionese') ||
    lower.includes('barbecue') ||
    lower.includes('creme') ||
    lower.includes('alho') ||
    lower.includes('rosé')
  )
    return 'molhos';
  return 'complementos';
}

export default function AdminProdutos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('batata');
  const [products, setProducts] = useState([]);
  const [adicionais, setAdicionais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

      const { data: prods, error: e1 } = await supabase
        .from('products')
        .select('*, product_adicionais(adicional_id, adicionais(*))')
        .order('name');
      if (e1) throw e1;

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

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

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
      const adicsIds = (product.product_adicionais || []).map((pa) => pa.adicional_id);
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
    if (!name.trim()) {
      Alert.alert('Atenção', 'Informe o nome do produto.');
      return;
    }
    const priceNum = parseFloat(price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Atenção', 'Preço inválido.');
      return;
    }

    setSaving(true);
    try {
      let productId;
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            name: name.trim(),
            description: description.trim(),
            price: priceNum,
            image_url: image_url.trim(),
            category,
            available,
          })
          .eq('id', editingProduct.id);
        if (error) throw error;
        productId = editingProduct.id;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({
            name: name.trim(),
            description: description.trim(),
            price: priceNum,
            image_url: image_url.trim(),
            category,
            available: true,
          })
          .select()
          .single();
        if (error) throw error;
        productId = data.id;
      }

      await supabase.from('product_adicionais').delete().eq('product_id', productId);
      if (selectedAdicionais.length > 0) {
        await supabase.from('product_adicionais').insert(
          selectedAdicionais.map((aid) => ({ product_id: productId, adicional_id: aid }))
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
    Alert.alert('Deletar Produto', `Excluir "${product.name}" do cardápio?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('product_adicionais').delete().eq('product_id', product.id);
            const { error } = await supabase.from('products').delete().eq('id', product.id);
            if (error) throw error;
            await loadProducts();
          } catch {
            Alert.alert('Erro', 'Não foi possível deletar.');
          }
        },
      },
    ]);
  };

  // ─── Produto: Fast Stock Pause Toggle ───────────────────────────
  const handleToggleAvailable = async (product) => {
    const nextStatus = !product.available;
    // Optimistic update
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, available: nextStatus } : p)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const { error } = await supabase
        .from('products')
        .update({ available: nextStatus })
        .eq('id', product.id);
      if (error) throw error;
    } catch {
      Alert.alert('Erro', 'Não foi possível alterar a disponibilidade.');
      await loadProducts();
    }
  };

  // ─── Adicional: Abrir modal ──────────────────────────────────────
  const openAdicModal = (a = null) => {
    if (a) {
      setEditingAdic(a);
      setAdicForm({
        name: a.name,
        price: String(a.price),
        adicional_categoria: a.adicional_categoria || getAdicionalCategory(a),
      });
    } else {
      setEditingAdic(null);
      setAdicForm(EMPTY_ADICIONAL);
    }
    setAdicModalVisible(true);
  };

  // ─── Adicional: Salvar ───────────────────────────────────────────
  const handleSaveAdic = async () => {
    if (!adicForm.name.trim()) {
      Alert.alert('Atenção', 'Informe o nome do adicional.');
      return;
    }
    const priceNum = parseFloat(adicForm.price.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Atenção', 'Preço inválido.');
      return;
    }
    setSaving(true);
    try {
      if (editingAdic) {
        await supabase
          .from('adicionais')
          .update({
            name: adicForm.name.trim(),
            price: priceNum,
            adicional_categoria: adicForm.adicional_categoria,
          })
          .eq('id', editingAdic.id);
      } else {
        await supabase.from('adicionais').insert({
          name: adicForm.name.trim(),
          price: priceNum,
          adicional_categoria: adicForm.adicional_categoria,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAdicModalVisible(false);
      await loadProducts();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Adicional: Deletar ──────────────────────────────────────────
  const handleDeleteAdic = (a) => {
    Alert.alert('Deletar Adicional', `Excluir "${a.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('product_adicionais').delete().eq('adicional_id', a.id);
            await supabase.from('adicionais').delete().eq('id', a.id);
            await loadProducts();
          } catch {
            Alert.alert('Erro', 'Não foi possível deletar.');
          }
        },
      },
    ]);
  };

  const toggleAdic = (id) =>
    setSelectedAdicionais((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAllCategory = (catKey) => {
    const catAdics = adicionais.filter((a) => getAdicionalCategory(a) === catKey);
    const catIds = catAdics.map((a) => a.id);
    const allSelected = catIds.every((id) => selectedAdicionais.includes(id));
    if (allSelected) {
      setSelectedAdicionais((prev) => prev.filter((id) => !catIds.includes(id)));
    } else {
      setSelectedAdicionais((prev) => Array.from(new Set([...prev, ...catIds])));
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = p.category === activeTab;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    });
  }, [products, activeTab, searchQuery]);

  const filteredAdicionais = useMemo(() => {
    if (!searchQuery.trim()) return adicionais;
    const q = searchQuery.toLowerCase();
    return adicionais.filter((a) => (a.name || '').toLowerCase().includes(q));
  }, [adicionais, searchQuery]);

  const counts = useMemo(() => {
    return {
      batata: products.filter((p) => p.category === 'batata').length,
      macarrao: products.filter((p) => p.category === 'macarrao').length,
      bebida: products.filter((p) => p.category === 'bebida').length,
      adicionais: adicionais.length,
    };
  }, [products, adicionais]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gestor de Cardápio</Text>
          <Text style={s.headerSub}>{products.length} itens cadastrados</Text>
        </View>
        <Pressable
          style={s.addBtn}
          onPress={() => (activeTab === 'adicionais' ? openAdicModal() : openProdModal())}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={s.addBtnText}>{activeTab === 'adicionais' ? 'Adicional' : 'Produto'}</Text>
        </Pressable>
      </View>

      {/* Sticky iFood Category Pills Bar */}
      <View style={s.stickyPillBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <Pressable
                key={tab.key}
                style={[s.tabPill, isActive && s.tabPillActive]}
                onPress={() => {
                  setActiveTab(tab.key);
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#EA1D2C' : '#6B7280'}
                />
                <Text style={[s.tabText, isActive && s.tabTextActive]}>{tab.label}</Text>
                <View style={[s.badgeCount, isActive && s.badgeCountActive]}>
                  <Text style={[s.badgeCountText, isActive && s.badgeCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Live Search Bar */}
        <View style={s.searchBarContainer}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Buscar item no cardápio..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={s.searchInput}
            placeholderTextColor="#9CA3AF"
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Lista */}
      {loading ? (
        <AdminListSkeleton count={5} />
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {activeTab === 'adicionais' ? (
            filteredAdicionais.length === 0 ? (
              <EmptyState icon="layers-outline" text="Nenhum adicional cadastrado" />
            ) : (
              ADIC_CATEGORIAS.map((cat) => {
                const groupItems = filteredAdicionais.filter((a) => getAdicionalCategory(a) === cat.key);
                if (groupItems.length === 0) return null;
                return (
                  <View key={cat.key} style={s.adicSectionCard}>
                    <View style={s.adicSectionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={cat.icon} size={15} color={cat.color} />
                        <Text style={s.adicSectionTitle}>{cat.label}</Text>
                      </View>
                      <Text style={s.adicSectionCount}>{groupItems.length} itens</Text>
                    </View>

                    {groupItems.map((a) => (
                      <View key={a.id} style={s.adicItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.adicName}>{a.name}</Text>
                          <Text style={s.adicPrice}>+ R$ {Number(a.price).toFixed(2).replace('.', ',')}</Text>
                        </View>
                        <View style={s.cardActionsRow}>
                          <Pressable style={s.iconBtn} onPress={() => openAdicModal(a)}>
                            <Ionicons name="pencil-outline" size={16} color="#4B5563" />
                          </Pressable>
                          <Pressable
                            style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]}
                            onPress={() => handleDeleteAdic(a)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#DC2626" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })
            )
          ) : filteredProducts.length === 0 ? (
            <EmptyState icon="cube-outline" text="Nenhum produto nesta categoria" />
          ) : (
            filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => openProdModal(product)}
                onDelete={() => handleDeleteProduct(product)}
                onToggle={() => handleToggleAvailable(product)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Modal Produto */}
      <SwipeableBottomSheetModal
        visible={prodModalVisible}
        onRequestClose={() => setProdModalVisible(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={[s.sheet, { height: '92%', maxHeight: '92%' }]}
        scrollable
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</Text>
            <Pressable onPress={() => setProdModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={20} color="#1A1A1A" />
            </Pressable>
          </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              <Field
                label="Nome *"
                placeholder="Ex: Batata Strogonoff"
                value={prodForm.name}
                onChangeText={(v) => setProdForm((f) => ({ ...f, name: v }))}
              />
              <Field
                label="Descrição"
                placeholder="Ingredientes e detalhes..."
                value={prodForm.description}
                onChangeText={(v) => setProdForm((f) => ({ ...f, description: v }))}
                multiline
              />
              <Field
                label="Preço (R$) *"
                placeholder="0,00"
                value={prodForm.price}
                onChangeText={(v) => setProdForm((f) => ({ ...f, price: v }))}
                keyboardType="decimal-pad"
              />
              <Field
                label="URL da Imagem"
                placeholder="/products/foto.jpg ou https://..."
                value={prodForm.image_url}
                onChangeText={(v) => setProdForm((f) => ({ ...f, image_url: v }))}
              />

              <Text style={s.fieldLabel}>Categoria *</Text>
              <View style={s.categoryRow}>
                {TABS.filter((t) => t.key !== 'adicionais').map((tab) => (
                  <Pressable
                    key={tab.key}
                    style={[
                      s.categoryBtn,
                      prodForm.category === tab.key && s.categoryBtnActive,
                    ]}
                    onPress={() => setProdForm((f) => ({ ...f, category: tab.key }))}
                  >
                    <Text
                      style={[
                        s.categoryBtnText,
                        prodForm.category === tab.key && s.categoryBtnTextActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {prodForm.category !== 'bebida' && adicionais.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={s.fieldLabel}>
                    Adicionais Permitidos ({selectedAdicionais.length})
                  </Text>
                  {ADIC_CATEGORIAS.map((cat) => {
                    const grupo = adicionais.filter((a) => getAdicionalCategory(a) === cat.key);
                    if (grupo.length === 0) return null;
                    const allSelected = grupo.every((a) => selectedAdicionais.includes(a.id));

                    return (
                      <View key={cat.key} style={s.adicGroupCard}>
                        <View style={s.adicGroupHeader}>
                          <Text style={s.adicGroupLabel}>{cat.label}</Text>
                          <Pressable onPress={() => toggleAllCategory(cat.key)}>
                            <Text style={s.adicSelectAllText}>
                              {allSelected ? 'Desmarcar todos' : 'Marcar todos'}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={s.adicGrid}>
                          {grupo.map((a) => {
                            const isChecked = selectedAdicionais.includes(a.id);
                            return (
                              <Pressable
                                key={a.id}
                                style={[s.adicPill, isChecked && s.adicPillSelected]}
                                onPress={() => toggleAdic(a.id)}
                              >
                                <Ionicons
                                  name={isChecked ? 'checkbox' : 'square-outline'}
                                  size={16}
                                  color={isChecked ? '#EA1D2C' : '#9CA3AF'}
                                />
                                <Text
                                  style={[s.adicPillText, isChecked && s.adicPillTextSelected]}
                                  numberOfLines={1}
                                >
                                  {a.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <Pressable
                style={[s.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSaveProduct}
                disabled={saving}
              >
                {saving ? (
                  <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
                ) : (
                  <Text style={s.saveBtnText}>
                    {editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
            <ThemedAlertHost />
          </View>
      </SwipeableBottomSheetModal>

      {/* Modal Adicional */}
      <SwipeableBottomSheetModal
        visible={adicModalVisible}
        onRequestClose={() => setAdicModalVisible(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={[s.sheet, { height: '72%', maxHeight: '72%' }]}
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingAdic ? 'Editar Adicional' : 'Novo Adicional'}</Text>
            <Pressable onPress={() => setAdicModalVisible(false)} style={s.modalCloseBtn}>
              <Ionicons name="close" size={20} color="#1A1A1A" />
            </Pressable>
          </View>
            <View style={s.modalBody}>
              <Field
                label="Nome *"
                placeholder="Ex: Bacon Crocante"
                value={adicForm.name}
                onChangeText={(v) => setAdicForm((f) => ({ ...f, name: v }))}
              />
              <Field
                label="Preço (R$) *"
                placeholder="0,00"
                value={adicForm.price}
                onChangeText={(v) => setAdicForm((f) => ({ ...f, price: v }))}
                keyboardType="decimal-pad"
              />

              <Text style={s.fieldLabel}>Categoria</Text>
              <View style={s.categoryRowWrap}>
                {ADIC_CATEGORIAS.map((cat) => (
                  <Pressable
                    key={cat.key}
                    style={[
                      s.categoryChip,
                      adicForm.adicional_categoria === cat.key && {
                        backgroundColor: cat.color + '1A',
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() =>
                      setAdicForm((f) => ({
                        ...f,
                        adicional_categoria: cat.key,
                      }))
                    }
                  >
                    <Ionicons
                      name={cat.icon}
                      size={14}
                      color={adicForm.adicional_categoria === cat.key ? cat.color : '#6B7280'}
                    />
                    <Text
                      style={[
                        s.categoryChipText,
                        adicForm.adicional_categoria === cat.key && {
                          color: cat.color,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[s.saveBtn, { backgroundColor: '#1A1A1A' }, saving && { opacity: 0.7 }]}
                onPress={handleSaveAdic}
                disabled={saving}
              >
                {saving ? (
                  <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
                ) : (
                  <Text style={s.saveBtnText}>{editingAdic ? 'Salvar' : 'Criar Adicional'}</Text>
                )}
              </Pressable>
            </View>
            <ThemedAlertHost />
          </View>
      </SwipeableBottomSheetModal>
    </View>
  );
}

function ProductCard({ product, onEdit, onDelete, onToggle }) {
  const resolvedImage = resolveImageUrl(product.image_url);
  const isAvailable = product.available !== false;

  return (
    <View style={[s.prodCard, !isAvailable && s.prodCardPaused]}>
      {/* Thumbnail */}
      <View style={s.prodImageWrapper}>
        {resolvedImage ? (
          <Image
            source={{ uri: resolvedImage }}
            style={[s.prodImage, !isAvailable && { opacity: 0.5 }]}
          />
        ) : (
          <View style={[s.prodImage, s.prodImagePlaceholder]}>
            <Ionicons name="image-outline" size={22} color="#D1D5DB" />
          </View>
        )}
        {!isAvailable && (
          <View style={s.pausedBadgeOverlay}>
            <Text style={s.pausedBadgeText}>Pausado</Text>
          </View>
        )}
      </View>

      {/* Info Column */}
      <View style={s.prodInfoCol}>
        <Text style={s.prodName} numberOfLines={1}>
          {product.name}
        </Text>
        {!!product.description && (
          <Text style={s.prodDesc} numberOfLines={2}>
            {product.description}
          </Text>
        )}
        <View style={s.priceRow}>
          <Text style={s.prodPrice}>
            R$ {Number(product.price).toFixed(2).replace('.', ',')}
          </Text>
          {product.product_adicionais && product.product_adicionais.length > 0 && (
            <View style={s.adicsCountPill}>
              <Text style={s.adicsCountText}>
                {product.product_adicionais.length} adics
              </Text>
            </View>
          )}
        </View>

        {/* Quick Pause & Actions */}
        <View style={s.bottomRow}>
          <View style={s.switchWrapper}>
            <Switch
              value={isAvailable}
              onValueChange={onToggle}
              trackColor={{ false: '#D1D5DB', true: '#10B981' }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
            <Text style={[s.switchLabel, { color: isAvailable ? '#059669' : '#9CA3AF' }]}>
              {isAvailable ? 'Disponível' : 'Pausado'}
            </Text>
          </View>

          <View style={s.cardActionsRow}>
            <Pressable style={s.iconBtn} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={16} color="#4B5563" />
            </Pressable>
            <Pressable style={[s.iconBtn, { backgroundColor: '#FEE2E2' }]} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function Field({ label, placeholder, value, onChangeText, multiline, keyboardType }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 75, textAlignVertical: 'top' }]}
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
      <Ionicons name={icon} size={44} color="#D1D5DB" />
      <Text style={s.emptyText}>{text}</Text>
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
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#EA1D2C',
  },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  // Sticky Pills Bar
  stickyPillBar: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  tabContent: { gap: 6, flexDirection: 'row', paddingRight: 8 },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  tabPillActive: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  tabText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#FFF' },
  badgeCount: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  badgeCountActive: {
    backgroundColor: '#374151',
  },
  badgeCountText: { fontSize: 10, fontWeight: '800', color: '#6B7280' },
  badgeCountTextActive: { color: '#FFF' },

  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#1A1A1A', paddingVertical: 0 },

  listContent: { padding: 12, gap: 10, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  // Product Card (iFood style)
  prodCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  prodCardPaused: {
    backgroundColor: '#FAFAFA',
    opacity: 0.85,
  },
  prodImageWrapper: { position: 'relative', width: 72, height: 72 },
  prodImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#F3F4F6' },
  prodImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  pausedBadgeOverlay: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  pausedBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },

  prodInfoCol: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
  prodName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  prodDesc: { fontSize: 11, color: '#6B7280', marginTop: 2, lineHeight: 15 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  prodPrice: { fontSize: 14, fontWeight: '900', color: '#1A1A1A' },
  adicsCountPill: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  adicsCountText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  switchWrapper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  switchLabel: { fontSize: 11, fontWeight: '700' },
  cardActionsRow: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Adicionais Sections
  adicSectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 8,
  },
  adicSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  adicSectionTitle: { fontSize: 12, fontWeight: '800', color: '#374151', textTransform: 'uppercase' },
  adicSectionCount: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  adicItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  adicName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  adicPrice: { fontSize: 12, fontWeight: '800', color: '#D97706', marginTop: 1 },

  // Modals
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
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  modalCloseBtn: { padding: 4, backgroundColor: '#F3F4F6', borderRadius: 8 },
  modalBody: { padding: 16, paddingBottom: 50 },

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
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
  },

  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  categoryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  categoryBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  categoryBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  categoryBtnTextActive: { color: '#FFF' },

  categoryRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },

  // Adicionais selection groups inside product modal
  adicGroupCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 8,
  },
  adicGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  adicGroupLabel: { fontSize: 11, fontWeight: '800', color: '#1A1A1A', textTransform: 'uppercase' },
  adicSelectAllText: { fontSize: 10, fontWeight: '700', color: '#EA1D2C' },
  adicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  adicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  adicPillSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  adicPillText: { fontSize: 11, fontWeight: '600', color: '#4B5563', maxWidth: 120 },
  adicPillTextSelected: { color: '#991B1B', fontWeight: '700' },

  saveBtn: {
    backgroundColor: '#EA1D2C',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});