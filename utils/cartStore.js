import { useState, useEffect } from 'react';

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
    return cart.reduce((sum, item) => sum + item.precoNum * item.quantity, 0);
  }
};

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
