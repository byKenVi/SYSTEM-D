import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";

/* ── Types ── */
export interface SystemdProduct {
  zohoItemId: string;
  name: string;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: number;
  // Champs enrichis depuis zoho_catalog
  status?: string | null;
  productType?: string | null;
  unit?: string | null;
  canBeSold?: boolean | null;
  zohoLastModifiedTime?: string | null;
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

/* ── Helpers ── */
function readCart(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function writeCart(key: string, items: CartItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* quota exceeded or private-mode — silent */
  }
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

/* ── Provider ──
 * storageKey isolates carts per contact:
 *   - real client  → "cart_systemd_{contactId}"
 *   - admin view-as → "cart_systemd_viewas_{viewAsContactId}"
 *   - fallback      → "cart_systemd"
 */
export function CartProvider({
  children,
  storageKey = "cart_systemd",
}: {
  children: React.ReactNode;
  storageKey?: string;
}) {
  const [items, setItems] = useState<CartItem[]>(() => readCart(storageKey));
  const prevKeyRef = useRef(storageKey);

  /* When storageKey changes (e.g., from init-key to real contactId key),
     re-load from the new localStorage slot so carts never bleed across contacts. */
  useEffect(() => {
    if (storageKey !== prevKeyRef.current) {
      prevKeyRef.current = storageKey;
      setItems(readCart(storageKey));
    }
  }, [storageKey]);

  /* Persist on every items change */
  useEffect(() => {
    writeCart(storageKey, items);
  }, [items, storageKey]);

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

  const clearCart = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [storageKey]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}
