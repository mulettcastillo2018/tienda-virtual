import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import type { Cart } from "@/lib/types";
import { useAuthStore } from "./auth.store";

interface CartState {
  cart: Cart | null;
  loading: boolean;
  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  loading: false,

  fetchCart: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    set({ loading: true });
    try {
      const cart = await apiFetch<Cart>("/cart", { token });
      set({ cart });
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (productId, quantity = 1) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("Debes iniciar sesión");
    await apiFetch("/cart/items", {
      method: "POST",
      token,
      body: JSON.stringify({ productId, quantity }),
    });
    await get().fetchCart();
  },

  updateItem: async (productId, quantity) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    await apiFetch(`/cart/items/${productId}`, {
      method: "PUT",
      token,
      body: JSON.stringify({ quantity }),
    });
    await get().fetchCart();
  },

  removeItem: async (productId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    await apiFetch(`/cart/items/${productId}`, { method: "DELETE", token });
    await get().fetchCart();
  },

  clearCart: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    await apiFetch("/cart", { method: "DELETE", token });
    await get().fetchCart();
  },

  itemCount: () => get().cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
}));
