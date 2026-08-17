// server/step3-guardrails.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
var routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
var storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
var schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
var formEditor = readFileSync(new URL("../client/src/pages/form-editor.tsx", import.meta.url), "utf8");
var portalForms = readFileSync(new URL("../client/src/pages/portal/forms.tsx", import.meta.url), "utf8");
var adminForms = readFileSync(new URL("../client/src/pages/admin/forms.tsx", import.meta.url), "utf8");
var boutique = readFileSync(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
test("les cinq formulaires historiques, leurs brouillons et leurs validations restent branch\xE9s", () => {
  for (const type of ["entreposage", "copacking", "inspection", "livraison", "tri"]) {
    assert.match(formEditor, new RegExp(`${type}:`));
  }
  assert.match(formEditor, /form\.status === "draft"/);
  assert.match(formEditor, /validateBeforeSubmit/);
  assert.match(routes, /approvedQuantity/);
  assert.match(routes, /generateFormPdf\(form, contact, uploads\)/);
  assert.match(routes, /createFormSalesOrder\(/);
  assert.match(routes, /createZohoProject\(/);
});
test("le bon de travail produit est cr\xE9\xE9 par une route et un type d\xE9di\xE9s", () => {
  assert.match(routes, /\/api\/portal\/product-work-orders/);
  assert.match(routes, /formType: "product_work_order"/);
  assert.match(routes, /sourceProductId: product\.id/);
  assert.match(routes, /sourceProductName: product\.name/);
  assert.match(routes, /storage\.createFormSubmission/);
  assert.match(portalForms, /product_work_order: "Bon de travail produit"/);
  assert.match(adminForms, /product_work_order: "Bon de travail produit"/);
  assert.match(boutique, /\/api\/portal\/product-work-orders/);
  assert.doesNotMatch(portalForms, /SelectItem value="product_work_order"/);
});
test("le type produit sort avant les validations et automatisations historiques", () => {
  const isolatedBranch = routes.indexOf('if (form.formType === "product_work_order")');
  const legacyNumericUpdate = routes.indexOf("if (approvedQuantity !== undefined", isolatedBranch);
  const legacySalesOrder = routes.indexOf("createFormSalesOrder({", isolatedBranch);
  assert.ok(isolatedBranch > -1);
  assert.ok(legacyNumericUpdate > isolatedBranch);
  assert.ok(legacySalesOrder > isolatedBranch);
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /return res\.json\(updated\)/);
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /createZohoProject\(/);
  assert.match(routes.slice(isolatedBranch, legacyNumericUpdate), /zoho_project_create_error/);
  assert.doesNotMatch(routes.slice(isolatedBranch, legacyNumericUpdate), /createFormSalesOrder\(/);
  assert.match(routes, /\/api\/portal\/restock-requests/);
});
test("le projet BTP poss\xE8de un nom et une description op\xE9rationnels", () => {
  const projects = readFileSync(new URL("./zoho-projects.ts", import.meta.url), "utf8");
  assert.match(projects, /product_work_order: "BTP"/);
  assert.match(projects, /sourceProductName/);
  assert.match(projects, /sourceProductSku/);
  assert.match(projects, /requestedQuantity/);
});
test("la r\xE9servation locale est idempotente et ne d\xE9cr\xE9mente pas Zoho", () => {
  const start = storage.indexOf("async reserveSystemdOrderStock");
  const end = storage.indexOf("\n  async ", start + 10);
  const reservationMethod = storage.slice(start, end);
  assert.match(schema, /stock_reservation_status/);
  assert.match(schema, /stock_reserved_at/);
  assert.match(reservationMethod, /stockReservationStatus === "reserved"/);
  assert.match(reservationMethod, /already_reserved/);
  assert.match(reservationMethod, /\.for\("update"\)/);
  assert.match(reservationMethod, /stock_to_reserve/);
  assert.doesNotMatch(reservationMethod, /setZohoItemStock|pushItemToZoho|updateZohoItemClient/);
});
test("un retry pay\xE9 r\xE9utilise la commande et la r\xE9servation existantes", () => {
  const retry = routes.indexOf('previousOrder?.status === "paid"');
  const pendingInsert = routes.indexOf("storage.tryInsertSystemdOrder", retry);
  assert.ok(retry > -1);
  assert.ok(pendingInsert > retry);
  assert.match(routes.slice(retry, pendingInsert), /reserveSystemdOrderStock\(previousOrder\.id\)/);
});

// server/shopify-credit-policy.test.ts
import assert2 from "node:assert/strict";
import test2 from "node:test";

// server/shopify-credit-policy.ts
function normalizeShopifyStoreUrl(value) {
  let normalized = String(value ?? "").trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  normalized = normalized.trim().toLowerCase();
  if (!normalized) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return normalized.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0].replace(/\.$/, "");
  }
}
function isShopifyCreditSufficient(available, required) {
  const availableAmount = Number(available);
  const requiredAmount = Number(required);
  return Number.isFinite(availableAmount) && Number.isFinite(requiredAmount) && requiredAmount >= 0 && availableAmount + 1e-4 >= requiredAmount;
}
function shopifyCreditHttpStatus(message) {
  if (message === "Cr\xE9dit insuffisant." || message === "Montant invalide.") return 400;
  if (message === "Rep Shopify introuvable.") return 404;
  return 503;
}

// server/shopify-credit-policy.test.ts
test2("normalise toutes les formes de l'URL de la boutique Mapei", () => {
  assert2.equal(normalizeShopifyStoreUrl("HTTPS://TNT5AR-KI.MYSHOPIFY.COM/"), "tnt5ar-ki.myshopify.com");
  assert2.equal(normalizeShopifyStoreUrl("https%3A%2F%2Ftnt5ar-ki.myshopify.com%2F"), "tnt5ar-ki.myshopify.com");
  assert2.equal(normalizeShopifyStoreUrl("tnt5ar-ki.myshopify.com/admin/orders"), "tnt5ar-ki.myshopify.com");
});
test2("un cr\xE9dit insuffisant bloque le checkout", () => {
  assert2.equal(isShopifyCreditSufficient("99.99", "100.00"), false);
  assert2.equal(shopifyCreditHttpStatus("Cr\xE9dit insuffisant."), 400);
});
test2("un cr\xE9dit \xE9gal ou sup\xE9rieur autorise le checkout", () => {
  assert2.equal(isShopifyCreditSufficient("100.00", "100.00"), true);
  assert2.equal(isShopifyCreditSufficient("125.00", "100.00"), true);
});
test2("une indisponibilit\xE9 Shopify reste une erreur de service", () => {
  assert2.equal(shopifyCreditHttpStatus("Cr\xE9dit Shopify indisponible."), 503);
  assert2.equal(shopifyCreditHttpStatus("Connexion Shopify requise."), 503);
});

// server/mapi-portal-ui.test.ts
import assert3 from "node:assert/strict";
import { readFileSync as readFileSync2 } from "node:fs";
import test3 from "node:test";
var boutique2 = readFileSync2(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
var customerDetail = readFileSync2(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
var forms = readFileSync2(new URL("../client/src/pages/portal/forms.tsx", import.meta.url), "utf8");
var routes2 = readFileSync2(new URL("./routes.ts", import.meta.url), "utf8");
test3("le portail expose Mes reps et un seul onglet Mes commandes", () => {
  assert3.match(boutique2, /Mes reps/);
  assert3.match(boutique2, /Mes commandes/);
  assert3.match(forms, /Mes Soumissions/);
  assert3.doesNotMatch(boutique2, /row-order-submission/);
  assert3.doesNotMatch(boutique2, /TabsTrigger value="systemd-orders"/);
});
test3("le checkout r\xE9sout automatiquement le rep par l'email authentifi\xE9", () => {
  assert3.match(boutique2, /Rep à débiter/);
  assert3.match(boutique2, /JSON\.stringify\(\{ items: payload \}\)/);
  assert3.doesNotMatch(boutique2, /data-testid="select-checkout-rep"/);
  assert3.match(routes2, /findMapiRepByEmail\(authenticatedEmail\)/);
  assert3.match(routes2, /Aucun compte crédit Shopify n’est associé à votre utilisateur/);
  assert3.match(routes2, /paymentMethod: "shopify_credit"/);
});
test3("Mes reps lit les soldes Mapei et identifie le compte de l'utilisateur", () => {
  assert3.match(boutique2, /\/api\/portal\/mapi\/reps/);
  assert3.match(boutique2, /Crédit disponible/);
  assert3.match(routes2, /isCurrentContact: !!authenticatedEmail/);
});
test3("la fiche rep lit le cr\xE9dit Shopify sans proposer d'ajustement manuel", () => {
  assert3.match(customerDetail, /\/api\/portal\/mapi\/reps\/by-shopify-customer/);
  assert3.match(customerDetail, /Crédit Shopify du rep/);
  assert3.match(customerDetail, /Les crédits reps se gèrent dans Shopify/);
  assert3.doesNotMatch(customerDetail, /button-credit-rep|button-submit-credit/);
  assert3.match(routes2, /Système D est en lecture et synchronisation uniquement/);
});
test3("les op\xE9rations Shopify sensibles sont journalis\xE9es", () => {
  for (const eventType of [
    "shopify_reps_sync",
    "shopify_credit_read",
    "shopify_credit_checkout",
    "shopify_token_invalid",
    "shopify_permission_insufficient"
  ]) {
    assert3.match(routes2, new RegExp(eventType));
  }
});

// server/final-uiux-review.test.ts
import assert4 from "node:assert/strict";
import { readFileSync as readFileSync3 } from "node:fs";
import test4 from "node:test";
var app = readFileSync3(new URL("../client/src/App.tsx", import.meta.url), "utf8");
var landing = readFileSync3(new URL("../client/src/pages/landing.tsx", import.meta.url), "utf8");
var adminBoutique = readFileSync3(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
var adminSystemdDetail = readFileSync3(new URL("../client/src/pages/admin/systemd-product-detail.tsx", import.meta.url), "utf8");
var portalBoutique = readFileSync3(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
var portalSystemdDetail = readFileSync3(new URL("../client/src/pages/portal/systemd-product-detail.tsx", import.meta.url), "utf8");
var portalDeliveries = readFileSync3(new URL("../client/src/pages/portal/livraisons.tsx", import.meta.url), "utf8");
var routes3 = readFileSync3(new URL("./routes.ts", import.meta.url), "utf8");
test4("la fiche produit Syst\xE8me D admin reste dans le layout admin", () => {
  assert4.match(app, /\/admin\/boutique\/systemd\/:zohoItemId/);
  assert4.match(adminBoutique, /navigate\(`\/admin\/boutique\/systemd\//);
  assert4.doesNotMatch(adminBoutique, /window\.open\(`\/portal\/systemd/);
  assert4.match(adminSystemdDetail, /Vue administrateur en lecture seule/);
  assert4.match(adminSystemdDetail, /Voir côté client/);
});
test4("les commandes Syst\xE8me D sont visibles et traitables dans Boutique", () => {
  assert4.match(adminBoutique, /Commandes Système D à traiter/);
  assert4.match(adminBoutique, /Marquer en traitement/);
  assert4.match(adminBoutique, /Marquer traitée/);
  assert4.match(adminBoutique, /\/api\/admin\/systemd-orders/);
});
test4("les KPI boutique agr\xE8gent Shopify et les commandes Syst\xE8me D pay\xE9es", () => {
  assert4.match(routes3, /const allSystemdOrders = await storage\.getSystemdOrders\(\)/);
  assert4.match(routes3, /paidSystemdOrders/);
  assert4.match(routes3, /kpis\.ordersThisMonth \+= systemdThisMonth\.length/);
  assert4.match(routes3, /kpis\.valueThisMonth \+= systemdValue\(systemdThisMonth\)/);
});
test4("la landing reste courte et centr\xE9e sur les trois actions du portail", () => {
  assert4.match(landing, /Gérez vos demandes, commandes et livraisons au même endroit/);
  assert4.match(landing, /Demander un service/);
  assert4.match(landing, /Commander des produits/);
  assert4.match(landing, /Suivre vos opérations/);
  assert4.doesNotMatch(landing, /FORM_TYPES|ADMIN_FEATURES|CLIENT_FEATURES/);
});
test4("le portail conserve le contexte produit et utilise un feedback panier discret", () => {
  assert4.match(portalBoutique, /systemdSearch/);
  assert4.match(portalBoutique, /systemdView/);
  assert4.match(portalBoutique, /ClipboardList/);
  assert4.match(portalSystemdDetail, /requestedReturnTo/);
  assert4.match(portalSystemdDetail, /object-contain/);
  assert4.match(portalSystemdDetail, /Le panier a été mis à jour/);
  assert4.doesNotMatch(portalSystemdDetail, /toast\(/);
});
test4("le flow livraison est expliqu\xE9 sans inventer de transporteur", () => {
  assert4.match(portalDeliveries, /Comment une livraison apparaît ici/);
  assert4.match(portalDeliveries, /aucune intégration transporteur n’est simulée/);
  assert4.match(portalDeliveries, /Les livraisons apparaîtront lorsqu’une demande de livraison sera soumise/);
});

// server/final-fixes-guardrails.test.ts
import assert5 from "node:assert/strict";
import { readFileSync as readFileSync4 } from "node:fs";
import test5 from "node:test";
var routes4 = readFileSync4(new URL("./routes.ts", import.meta.url), "utf8");
var app2 = readFileSync4(new URL("../client/src/App.tsx", import.meta.url), "utf8");
var adminBoutique2 = readFileSync4(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
var portalBoutique2 = readFileSync4(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
var adminOrder = readFileSync4(new URL("../client/src/pages/admin/order-detail.tsx", import.meta.url), "utf8");
var portalCustomer = readFileSync4(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
test5("les d\xE9tails Shopify utilisent integrationId et conservent un fallback local", () => {
  assert5.match(routes4, /function findShopifyIntegration/);
  assert5.match(routes4, /cachedOrderAsShopify/);
  assert5.match(routes4, /liveUnavailable: true/);
  assert5.match(adminOrder, /integrationId/);
  assert5.match(portalCustomer, /Dernières données synchronisées affichées/);
});
test5("les onglets et retours boutique sont conserv\xE9s dans l'URL", () => {
  assert5.match(adminBoutique2, /\/admin\/boutique\?tab=/);
  assert5.match(adminBoutique2, /setActiveTabState\(tab\)/);
  assert5.match(adminBoutique2, /addEventListener\("popstate"/);
  assert5.match(portalBoutique2, /next\.set\("tab", tab\)/);
  assert5.match(portalBoutique2, /<Tabs value=\{activeTab\}/);
  assert5.match(adminOrder, /returnTo/);
});
test5("les commandes Syst\xE8me D ont une vue et un workflow admin d\xE9di\xE9s", () => {
  assert5.match(app2, /path="\/admin\/orders" component=\{AdminOrders\}/);
  assert5.match(routes4, /\/api\/admin\/systemd-orders\/:id\/fulfillment/);
  assert5.match(routes4, /"processing", "completed"/);
  assert5.match(routes4, /systemd_order_fulfillment/);
  assert5.match(routes4, /type: "systemd_order_admin_action"/);
  assert5.match(routes4, /adminOnly: true/);
  assert5.doesNotMatch(routes4, /systemd_order[\s\S]{0,300}createZohoProject/);
});
test5("reconnecter Shopify r\xE9utilise l'int\xE9gration normalis\xE9e", () => {
  assert5.match(routes4, /normalizeShopifyStoreUrl\(integration\.storeUrl\) === normalizedStore/);
  assert5.match(routes4, /reconnected: Boolean\(existing\)/);
  assert5.match(routes4, /updateShopifyIntegration\(existing\.id/);
});

// server/final-lot-review.test.ts
import assert6 from "node:assert/strict";
import { readFileSync as readFileSync5 } from "node:fs";
import test6 from "node:test";
var routes5 = readFileSync5(new URL("./routes.ts", import.meta.url), "utf8");
var settings = readFileSync5(new URL("../client/src/pages/admin/settings.tsx", import.meta.url), "utf8");
var portalBoutique3 = readFileSync5(new URL("../client/src/pages/portal/boutique.tsx", import.meta.url), "utf8");
var adminBoutique3 = readFileSync5(new URL("../client/src/pages/admin/boutique.tsx", import.meta.url), "utf8");
var adminRep = readFileSync5(new URL("../client/src/pages/admin/customer-detail.tsx", import.meta.url), "utf8");
var portalRep = readFileSync5(new URL("../client/src/pages/portal/customer-detail.tsx", import.meta.url), "utf8");
var portalNotifications = readFileSync5(new URL("../client/src/pages/portal/notifications.tsx", import.meta.url), "utf8");
test6("d\xE9connecter une boutique conserve l'int\xE9gration et ses donn\xE9es", () => {
  assert6.match(routes5, /connectionStatus: "disconnected"/);
  assert6.match(routes5, /Produits, reps, commandes et historique conservés/);
  assert6.doesNotMatch(routes5.slice(routes5.indexOf('app.delete("/api/shopify-integrations/:id"'), routes5.indexOf("Test connexion Shopify")), /deleteShopifyIntegration/);
});
test6("les param\xE8tres pr\xE9parent plusieurs plateformes et plusieurs boutiques par client", () => {
  assert6.match(settings, /Ajouter une boutique/);
  assert6.match(settings, /Autre \/ à configurer/);
  assert6.match(settings, /availableClients = contacts \?\? \[\]/);
  assert6.match(settings, /Synchroniser les reps/);
});
test6("Zoho Projects se d\xE9connecte ind\xE9pendamment de Zoho Inventory", () => {
  assert6.match(settings, /Déconnecter Zoho Projects/);
  assert6.match(routes5, /zoho-projects\/disconnect/);
  assert6.match(routes5, /Zoho Inventory et les identifiants de projets historiques sont conservés/);
});
test6("les d\xE9penses reps agr\xE8gent les commandes Shopify et Syst\xE8me D", () => {
  assert6.match(routes5, /Number\(rep\.amountSpent \?\? 0\) \+ repSystemdOrders\.reduce/);
  assert6.match(routes5, /Number\(c\.total_spent \?\? 0\) \+ localOrders\.reduce/);
});
test6("aucun ajustement manuel de cr\xE9dit n'est expos\xE9 sur les fiches reps actives", () => {
  assert6.doesNotMatch(adminRep, /button-credit-rep|button-confirm-credit/);
  assert6.doesNotMatch(portalRep, /button-credit-rep|button-submit-credit/);
  assert6.match(adminRep, /Les crédits reps se gèrent dans Shopify/);
  assert6.match(portalRep, /Paiement commande Système D/);
  assert6.match(routes5, /Système D est en lecture et synchronisation uniquement/);
  assert6.match(routes5, /Les ajustements de crédit reps se gèrent dans Shopify/);
});
test6("les commandes client utilisent des tableaux coh\xE9rents pour les deux sources", () => {
  assert6.match(portalBoutique3, /min-w-\[920px\]/);
  assert6.match(portalBoutique3, /<TableHead>Source<\/TableHead>/);
  assert6.match(portalBoutique3, /<Badge variant="outline">Système D<\/Badge>/);
  assert6.match(portalBoutique3, /<Badge variant="outline">Shopify<\/Badge>/);
  assert6.doesNotMatch(adminBoutique3, />Clients Shopify</);
});
test6("ouvrir Notifications ne marque plus tout comme lu", () => {
  assert6.doesNotMatch(portalNotifications, /markAllReadSilent|Auto-marquer comme lu/);
  assert6.match(portalNotifications, /if \(!n\.isRead\) markRead\.mutate\(n\.id\)/);
  assert6.match(portalNotifications, /Tout marquer comme lu/);
});
