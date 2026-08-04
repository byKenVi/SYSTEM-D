import { createContext, useContext, useCallback, useState } from "react";

/* ── Types ── */
export interface SystemdProduct {
  zohoItemId: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: number;
}

export interface CartItem {
  product: SystemdProduct;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: SystemdProduct, qty: number) => void;
  updateQty: (zohoItemId: string, qty: number) => void;
  removeItem: (zohoItemId: string) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

/* ── Context ── */
export const CartContext = createContext<CartContextValue>({
  items: [],
  addItem: () => {},
  updateQty: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalItems: 0,
  subtotal: 0,
});

export function useCart() {
  return useContext(CartContext);
}

/* ── Provider ── */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: SystemdProduct, qty: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.zohoItemId === product.zohoItemId);
      if (existing) {
        return prev.map((i) =>
          i.product.zohoItemId === product.zohoItemId
            ? { ...i, quantity: Math.min(i.quantity + qty, product.stock) }
            : i
        );
      }
      return [...prev, { product, quantity: Math.min(qty, product.stock) }];
    });
  }, []);

  const updateQty = useCallback((zohoItemId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((i) => i.product.zohoItemId !== zohoItemId);
      return prev.map((i) =>
        i.product.zohoItemId === zohoItemId ? { ...i, quantity: qty } : i
      );
    });
  }, []);

  const removeItem = useCallback((zohoItemId: string) => {
    setItems((prev) => prev.filter((i) => i.product.zohoItemId !== zohoItemId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}
