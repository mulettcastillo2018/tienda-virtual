"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, User } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";

export function Navbar() {
  const user = useAuthStore((state) => state.user);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const itemCount = useCartStore((state) => state.itemCount());

  useEffect(() => {
    if (user) fetchCart();
  }, [user, fetchCart]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="brand-gradient-text text-xl font-extrabold tracking-tight">
          Tienda Virtual
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Catálogo
          </Link>
          <Link
            href={user ? "/account" : "/login"}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <User size={16} />
            {user ? user.email.split("@")[0] : "Ingresar"}
          </Link>
          <Link href="/cart" className="relative flex items-center text-muted-foreground hover:text-foreground">
            <ShoppingCart size={20} />
            {itemCount > 0 ? (
              <span className="badge-new absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold">
                {itemCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}
