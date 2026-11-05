import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COUPON_STORAGE_KEY = '@batata_selected_coupon';

let cart = [];
const listeners = new Set();

// Flag separada pra esconder o botão flutuante "ver carrinho" em telas
// específicas (ex: product detail), sem mexer no array do carrinho em si.
let floatingHidden = false;
const floatingListeners = new Set();

// Cupom selecionado na tela /cupons, persistido aqui pro checkout ler.
let selectedCoupon = null;
const couponListeners = new Set();

export const cartStore = {
  getCart() {
    return cart;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit() {
    listeners.forEach((l) => l([...cart]));
  },
  isFloatingHidden() {
    return floatingHidden;
  },
  subscribeFloating(listener) {
    floatingListeners.add(listener);
    return () => floatingListeners.delete(listener);
  },
  setFloatingHidden(hidden) {
    if (floatingHidden === hidden) return;
    floatingHidden = hidden;
    floatingListeners.forEach((l) => l(floatingHidden));
  },
  getCoupon() {
    return selectedCoupon;
  },
  subscribeCoupon(listener) {
    couponListeners.add(listener);
    return () => couponListeners.delete(listener);
  },
  setCoupon(coupon) {
    selectedCoupon = coupon;
    couponListeners.forEach((l) => l(selectedCoupon));
    if (coupon) {
      AsyncStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify(coupon)).catch(() => {});
    } else {
      AsyncStorage.removeItem(COUPON_STORAGE_KEY).catch(() => {});
    }
  },
  async loadSavedCoupon() {
    try {
      const raw = await AsyncStorage.getItem(COUPON_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.code)) {
          selectedCoupon = parsed;
          couponListeners.forEach((l) => l(selectedCoupon));
          return parsed;
        }
      }
    } catch {}
    return null;
  },
  addToCart(product) {
    const qty = product.quantidade || product.quantity || 1;
    const adIds = (product.adicionais || []).map(a => a.id).sort().join('-');
    const cartItemId = `${product.id}-${adIds}-${product.observacoes || ''}`;

    const existing = cart.find((item) => (item.cartItemId || item.id) === cartItemId);
    if (existing) {
      existing.quantity += qty;
    } else {
      cart.push({ ...product, cartItemId, quantity: qty });
    }
    this.emit();
  },
  updateCartItem(oldCartItemId, product) {
    const qty = product.quantidade || product.quantity || 1;
    const adIds = (product.adicionais || []).map(a => a.id).sort().join('-');
    const newCartItemId = `${product.id}-${adIds}-${product.observacoes || ''}`;

    const index = cart.findIndex((item) => (item.cartItemId || item.id) === oldCartItemId);
    if (index !== -1) {
      // Se já existe outro item igual na sacola (além do que estamos editando), funde as quantidades
      const otherIndex = cart.findIndex((item, i) => i !== index && (item.cartItemId || item.id) === newCartItemId);
      if (otherIndex !== -1) {
        cart[otherIndex].quantity += qty;
        cart.splice(index, 1);
      } else {
        cart[index] = { ...product, cartItemId: newCartItemId, quantity: qty };
      }
    } else {
      this.addToCart(product);
    }
    this.emit();
  },
  removeFromCart(cartItemId) {
    cart = cart.filter((item) => (item.cartItemId || item.id) !== cartItemId);
    this.emit();
  },
  updateQuantity(cartItemId, quantity) {
    if (quantity <= 0) {
      this.removeFromCart(cartItemId);
    } else {
      const item = cart.find((item) => (item.cartItemId || item.id) === cartItemId);
      if (item) {
        item.quantity = quantity;
      }
      this.emit();
    }
  },
  clearCart() {
    cart = [];
    this.setCoupon(null);
    this.emit();
  },
  getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  },
  getCartTotal() {
    return cart.reduce((sum, item) => {
      const precoCentavos =
        typeof item.precoNum === 'number' && !isNaN(item.precoNum)
          ? item.precoNum
          : Math.round(Number(item.price || item.preco || 0) * 100);
      const qty = Number(item.quantity || item.quantidade || 1) || 1;
      return sum + (isNaN(precoCentavos) ? 0 : precoCentavos) * qty;
    }, 0);
  }
};

// Carrega cupom pré-selecionado do AsyncStorage em segundo plano
cartStore.loadSavedCoupon();

export function useCart() {
  const [items, setItems] = useState(cartStore.getCart());
  const [hideFloating, setHideFloatingState] = useState(cartStore.isFloatingHidden());
  const [coupon, setCouponState] = useState(cartStore.getCoupon());

  useEffect(() => {
    return cartStore.subscribe(setItems);
  }, []);

  useEffect(() => {
    return cartStore.subscribeFloating(setHideFloatingState);
  }, []);

  useEffect(() => {
    return cartStore.subscribeCoupon(setCouponState);
  }, []);

  useEffect(() => {
    if (!coupon && !cartStore.getCoupon()) {
      cartStore.loadSavedCoupon().then((saved) => {
        if (saved) setCouponState(saved);
      });
    }
  }, []);

  return {
    items,
    count: cartStore.getCartCount(),
    total: cartStore.getCartTotal(),
    add: (p) => cartStore.addToCart(p),
    updateItem: (oldId, p) => cartStore.updateCartItem(oldId, p),
    remove: (id) => cartStore.removeFromCart(id),
    updateQty: (id, q) => cartStore.updateQuantity(id, q),
    clear: () => cartStore.clearCart(),
    // Telas como o product detail usam isso pra esconder o botão
    // flutuante "ver carrinho" enquanto estão em foco.
    hideFloating,
    setHideFloating: (hidden) => cartStore.setFloatingHidden(hidden),
    // Cupom selecionado na tela /cupons.
    coupon,
    setCoupon: (c) => cartStore.setCoupon(c),
  };
}
