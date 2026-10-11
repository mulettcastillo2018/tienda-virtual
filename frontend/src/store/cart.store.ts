import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api";
import type { Cart } from "@/lib/types";
import { useAuthStore } from "./auth.store";

export interface GuestLine {
  productId: string;
  quantity: number;
}

interface CartState {
  cart: Cart | null;
  loading: boolean;
  // Carrito de quien no ha iniciado sesión: vive en el navegador y la API lo
  // completa con los productos al día (POST /cart/guest).
  guestItems: GuestLine[];
  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  // Al iniciar sesión, lo que había en el carrito del navegador pasa al de la cuenta.
  mergeGuestCart: () => Promise<void>;
  // Tras comprar como invitado.
  clearGuestCart: () => void;
  itemCount: () => number;
}

const token = () => useAuthStore.getState().token;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: null,
      loading: false,
      guestItems: [],

      fetchCart: async () => {
        set({ loading: true });
        try {
          if (token()) {
            set({ cart: await apiFetch<Cart>("/cart", { token: token() }) });
            return;
          }
          const items = get().guestItems;
          if (items.length === 0) {
            set({ cart: { id: "guest", items: [] } });
            return;
          }
          const cart = await apiFetch<Cart>("/cart/guest", { method: "POST", body: JSON.stringify({ items }) });
          // Lo que ya no existe en la tienda sale del carrito del navegador.
          set({ cart, guestItems: cart.items.map(({ productId, quantity }) => ({ productId, quantity })) });
        } finally {
          set({ loading: false });
        }
      },

      addItem: async (productId, quantity = 1) => {
        if (token()) {
          await apiFetch("/cart/items", { method: "POST", token: token(), body: JSON.stringify({ productId, quantity }) });
        } else {
          const inCart = get().guestItems.find((line) => line.productId === productId)?.quantity ?? 0;
          // Las mismas reglas que el carrito de una cuenta: a la venta, con inventario y sin pasar del tope.
          await apiFetch("/cart/guest/check", { method: "POST", body: JSON.stringify({ productId, quantity, inCart }) });
          set({
            guestItems: inCart
              ? get().guestItems.map((line) => (line.productId === productId ? { ...line, quantity: inCart + quantity } : line))
              : [...get().guestItems, { productId, quantity }],
          });
        }
        await get().fetchCart();
      },

      updateItem: async (productId, quantity) => {
        if (token()) {
          await apiFetch(`/cart/items/${productId}`, { method: "PUT", token: token(), body: JSON.stringify({ quantity }) });
        } else {
          const current = get().guestItems.find((line) => line.productId === productId)?.quantity ?? 0;
          if (quantity > current) {
            await apiFetch("/cart/guest/check", { method: "POST", body: JSON.stringify({ productId, quantity: quantity - current, inCart: current }) });
          }
          set({ guestItems: get().guestItems.map((line) => (line.productId === productId ? { ...line, quantity } : line)) });
        }
        await get().fetchCart();
      },

      removeItem: async (productId) => {
        if (token()) await apiFetch(`/cart/items/${productId}`, { method: "DELETE", token: token() });
        else set({ guestItems: get().guestItems.filter((line) => line.productId !== productId) });
        await get().fetchCart();
      },

      clearCart: async () => {
        if (token()) await apiFetch("/cart", { method: "DELETE", token: token() });
        else set({ guestItems: [] });
        await get().fetchCart();
      },

      mergeGuestCart: async () => {
        const pending = get().guestItems;
        set({ guestItems: [] });
        // Lo que ya no se puede agregar (agotado, retirado) simplemente no pasa.
        for (const line of pending) {
          await apiFetch("/cart/items", { method: "POST", token: token(), body: JSON.stringify(line) }).catch(() => {});
        }
        await get().fetchCart();
      },

      clearGuestCart: () => set({ guestItems: [], cart: { id: "guest", items: [] } }),

      itemCount: () => get().cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    }),
    {
      name: "tienda-carrito",
      storage: createJSONStorage(() => localStorage),
      // Solo el carrito del navegador; el de la cuenta siempre se pide a la API.
      partialize: (state) => ({ guestItems: state.guestItems }),
    }
  )
);
