import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ExternalLink, Package, Ruler, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SystemdProduct } from "@/contexts/cart-context";

function money(amount: number | null | undefined) {
  return amount == null ? "—" : amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

export default function AdminSystemdProductDetail() {
  const { zohoItemId } = useParams<{ zohoItemId: string }>();
  const [, navigate] = useLocation();
  const requestedReturnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  const backUrl = requestedReturnTo.startsWith("/admin/boutique")
    ? requestedReturnTo
    : "/admin/boutique?tab=systemd";

  const { data: product, isLoading, isError, refetch } = useQuery<SystemdProduct>({
    queryKey: ["/api/portal/systemd-products", zohoItemId],
    queryFn: async () => {
      const response = await fetch(`/api/portal/systemd-products/${zohoItemId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger ce produit Système D.");
      return response.json();
    },
    enabled: Boolean(zohoItemId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-44" />
        <div className="grid gap-8 lg:grid-cols-[minmax(280px,440px)_1fr]">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-[430px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" className="-ml-2" onClick={() => navigate(backUrl)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux produits Système D
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <h1 className="text-xl font-bold">Produit indisponible</h1>
              <p className="mt-2 text-sm text-muted-foreground">Le détail n’a pas pu être chargé. Les données du catalogue n’ont pas été modifiées.</p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>Réessayer</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <div className="space-y-6" data-testid="page-admin-systemd-product-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="-ml-2" onClick={() => navigate(backUrl)} data-testid="button-back-admin-systemd">
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux produits Système D
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open(`/portal/systemd/${product.zohoItemId}`, "_blank", "noopener,noreferrer")}
          data-testid="button-view-client-systemd"
        >
          Voir côté client <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(280px,440px)_1fr]">
        <div className="mx-auto flex aspect-square w-full max-w-[440px] items-center justify-center overflow-hidden rounded-2xl border bg-muted/30">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-4" />
          ) : (
            <Package className="h-24 w-24 text-muted-foreground/20" />
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Produit Système D</Badge>
              <Badge className={inStock ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                {inStock ? "Disponible" : "Rupture de stock"}
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            {product.sku && <p className="mt-2 font-mono text-sm text-muted-foreground">SKU {product.sku}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card><CardContent className="p-4"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Prix</p><p className="mt-1 text-2xl font-mono font-bold">{money(product.price)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Inventaire</p><p className="mt-1 text-2xl font-mono font-bold">{product.stock} unité{product.stock !== 1 ? "s" : ""}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Description</h2>
              <p className="mt-3 text-sm leading-6">{product.description || "Aucune description disponible."}</p>
            </CardContent>
          </Card>

          {(product.productType || product.unit || product.status) && (
            <Card>
              <CardContent className="p-5">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"><Tag className="h-4 w-4" /> Détails du catalogue</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {product.productType && <div><dt className="text-muted-foreground">Catégorie</dt><dd className="font-semibold">{product.productType}</dd></div>}
                  {product.unit && <div><dt className="flex items-center gap-1 text-muted-foreground"><Ruler className="h-3 w-3" /> Unité</dt><dd className="font-semibold">{product.unit}</dd></div>}
                  {product.status && <div><dt className="text-muted-foreground">Statut catalogue</dt><dd className="font-semibold">{product.status === "active" ? "Actif" : product.status}</dd></div>}
                </dl>
              </CardContent>
            </Card>
          )}

          <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            Vue administrateur en lecture seule. Les achats et le panier restent disponibles uniquement dans le portail client.
          </p>
        </div>
      </div>
    </div>
  );
}
