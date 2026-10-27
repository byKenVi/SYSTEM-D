# Audit — commandes CRM → Inventory (colis), suivi, courriels, transporteurs

Date : 2026-10-26 · Suite de l'appel avec Ridgie · Sources : doc officielle Zoho (liens en fin de document) + code du dépôt.
Légende : ✅ confirmé par la doc · ⚠️ non confirmé / à tester dans l'org · ❌ pas possible nativement.

## 0. Changement de stratégie demandé

Avant : paiement → CRM « Commandes client » → *Commande planifier* → **Books** (bon de commande confirmé, rabais 100 % à la facturation).
Maintenant : *Commande planifier* → **Inventory** (colis à préparer). Pas de facture ; on veut seulement **sortir le stock** et **garder la valeur** de la commande. Le rabais 100 % et le tag « Source » Books n'ont plus de raison d'être.

## 1. Ce qui est possible

### 1.1 Envoyer la commande dans Inventory — ✅
- Inventory a ses propres commandes client (`POST /inventory/v1/salesorders`) : le code les utilise déjà (`server/zoho-api.ts`). Les prix et la valeur de la commande y restent, donc la trace de « 200 $ pour telle boutique » est conservée sans facture.
- Colis : `POST /packages?salesorder_id=…` (requis : `date`, `line_items` avec `so_line_item_id` + `quantity`). Statut initial **Not Shipped**.
- Expédition : `POST /shipmentorders` (requis : `package_ids`, `salesorder_id`, `shipment_number`, `date`, `delivery_method`, `tracking_number`). Le colis passe à **Shipped**.
- Livraison : `POST /shipmentorders/{id}/status/delivered`.
- Scope OAuth déjà en place : `ZohoInventory.FullAccess.all`.

### 1.2 Sortie du stock sans facture — ✅ (à valider dans l'org)
En mode de stock **physique**, le stock baisse à la **création de l'expédition** (shipment order), pas à la facture. Avant ça il est seulement « réservé » (commande confirmée). ⚠️ Vérifier que l'org est bien en mode physique : Paramètres → Préférences → Général → Mode de suivi du stock. (Les anciennes factures Books ne sont plus nécessaires.)
Conséquence : le stock ne diminue pas quand la commande arrive à « premier stage », mais quand le colis est **expédié**. Il est réservé entre-temps.

### 1.3 MISE À JOUR 2026-10-27 — le « Picking » existe nativement : les **listes de prélèvement** (Picklists) ✅
Le kanban *Colis* a 3 colonnes fixes (Emballages non expédiés / Expédiés / Livrés), non personnalisables. Mais Inventory a un module **Picklists** (à activer dans Paramètres) qui joue exactement le rôle du « picking » **avant** l'emballage : statuts *Yet to Start → In Progress → On Hold → Completed*, assignation à un préparateur, puis création du colis depuis la liste. API : `POST /picklists` (`location_id`, `parent_entity: salesorder`, `line_items` requis), `POST /picklists/{id}/setstatus`, `GET /picklists?filter_by=Status.InProgress…`. Flux retenu : commande planifiée → liste de prélèvement (« Picking ») → colis non expédié (« Emballage ») → expédition → livré. Le paragraphe ci-dessous reste valable pour les étapes qui n'existent pas dans Inventory.

### 1.3b Étapes de préparation (« Picking », « Emballage »…) — ❌ natif / ✅ via notre app
Un colis Inventory n'a que **3 statuts fixes** : Not Shipped → Shipped → Delivered. Aucun statut personnalisé n'est documenté. Donc « en préparation / en emballage » doit vivre **ailleurs** :
- picklist de statut dans le CRM (nouvelles valeurs à ajouter à la main dans Zoho : l'app n'a que `settings.fields.READ`), et/ou
- un champ personnalisé sur la commande Inventory, et/ou la table de l'app.
La personne de l'entrepôt ne pourrait donc pas changer ces étapes *dans Inventory* ; elle les change dans le CRM ou dans notre app. **Décision à prendre avec Ridgie (section 4).**

### 1.4 Miroir du statut Inventory → CRM — ✅ avec réserve
- Les règles de workflow Inventory (webhook, fonction personnalisée, alerte courriel) sont documentées pour les modules **Commandes client, Factures, Bons d'achat, Factures fournisseur**. ⚠️ **Colis et Expéditions ne sont pas listés** comme modules de workflow, et il n'y a pas de déclencheur « changement de statut » dédié (seulement créé / modifié + conditions).
- Solution robuste, sans dépendre de ça : notre app **interroge Inventory** (`GET /packages?filter_by=Shipped|Delivered`, toutes les ~5 min, une seule org donc quota négligeable) et met à jour le statut de la commande CRM. Option complémentaire : webhook sur modification de la commande client Inventory si le test montre qu'il se déclenche à l'expédition.
- Le CRM Sales_Orders peut recevoir de nouveaux statuts (« Expédiée », « Livrée ») — création manuelle dans Zoho, aucune suppression.

### 1.5 Courriels au client final — ✅ mais pas par Zoho
Piège : dans Inventory, le **client** est le propriétaire de la boutique (Mapei…), pas l'acheteur. Les courriels natifs Zoho (case « Send Notification to Customer », icône courriel) vont au client Inventory et sont **manuels**. Pour écrire à l'acheteur (courriel de la commande Shopify) :
- **Notre app envoie** (Resend est déjà branché, `server/resend.ts`) à chaque changement d'étape : « en préparation », « en emballage », « expédiée + n° de suivi », « livrée ».
- Alternative pour l'étape « expédiée » : créer le *fulfillment* dans Shopify avec le numéro de suivi, Shopify envoie alors son courriel d'expédition natif. ⚠️ À vérifier : scopes `write_fulfillments`/équivalents (l'app a `read_orders`/`write_orders`) et doc Shopify (shopify.dev inaccessible depuis cet environnement).

### 1.6 Transporteurs et suivi — partiel
- ✅ Intégrations natives Inventory (Amérique du Nord) : **UPS** et **USPS** en direct ; **Canada Post, Canpar, Purolator, FedEx** via EasyPost (on saisit les identifiants du compte transporteur dans Zoho). Étiquettes, tarifs et suivi depuis le colis (« Ship via Carrier »).
- ⚠️ La doc ne dit pas si le suivi transporteur passe **automatiquement** le colis à Delivered (confirmé seulement pour USPS). Sans ça, « livré » se coche à la main ou par notre app.
- ⚠️ **Un compte transporteur par client** (chaque boutique son code UPS) : non documenté ; une organisation Zoho = vraisemblablement un seul compte par transporteur. À confirmer avec le support Zoho.
- **Shippo / ShipStation** : aucun connecteur natif trouvé. Zoho a déjà son équivalent (EasyPost, Envia, Easyship…). **Recommandation : ne pas ajouter Shippo** dans un premier temps ; utiliser les intégrations natives avec **notre** compte UPS. Shippo ne se justifie que si le multi-comptes par client est impossible dans Zoho.

### 1.7 Vitesse de synchronisation (point 1 de l'appel) — ✅
Aujourd'hui tout passe par du **polling** (`server/shopify-orders-sync.ts`, fréquence par boutique ; défaut 0 = désactivé). Une commande faite à 16 h peut donc arriver tard, puis attendre encore le rattrapage CRM.
Solution recommandée, **meilleure que des plages horaires** : les **webhooks Shopify** (`orders/create` / `orders/paid`). Délai de quelques secondes, **zéro coût de quota** (c'est Shopify qui nous appelle), le polling reste en filet de sécurité. Aucun webhook Shopify n'est enregistré dans le code actuellement ; l'URL du serveur est publique donc exploitable. ⚠️ Détails officiels (vérification HMAC, reprises) à relire sur shopify.dev avant d'implémenter.
Plan B si on garde le polling : fréquence plus courte en heures ouvrables (ex. 5 min de 8 h à 18 h, 30 min sinon) ; faisable, mais inutile avec les webhooks.

## 2. Impact sur le code existant

| Élément | Sort |
|---|---|
| `server/crm-planned-orders.ts` (CRM → Books) | Remplacé/adapté : *Commande planifier* → commande Inventory confirmée + colis « Not Shipped » + stage 1. Le diagnostic `scripts/check-planned-order.ts` reste utile. |
| Rabais 100 %, `ZOHO_BOOKS_ORDER_SOURCE_FIELD_ID`, automatisation Books | Plus nécessaires. À retirer après validation. |
| Webhook `/api/webhooks/zoho-crm/sales-order-planned` + secret | Conservé tel quel (même déclencheur CRM). |
| Rattrapage 30 min | Conservé (filet de sécurité). |
| Nouveau : poller Inventory → CRM (statuts) | À créer. |
| Nouveau : courriels d'étape (Resend) | À créer. |
| Nouveau : webhooks Shopify | À créer. |
| Page « livraison » de l'app | Afficher statut + n° de suivi (miroir). |

## 3. Contraintes à respecter
- CRM et Inventory sont **en production** : aucune suppression, aucune donnée « de test » ; tests sur une commande réelle choisie par Ridgie.
- Le connecteur Zoho_360 (360 Autowrap) n'a **pas** été utilisé pour cet audit.
- Les nouveaux statuts CRM, le premier stage et les modèles de courriel se créent côté Zoho par un humain.

## 4. Décisions à prendre avec Ridgie
1. **Qui change les étapes « préparation / emballage » ?** (a) l'équipe dans le CRM (picklist), (b) dans notre app, (c) seulement Not Shipped/Shipped/Delivered dans Inventory. Recommandation : (a) + miroir automatique.
2. Le stock peut sortir **à l'expédition** (natif) ; est-ce acceptable (réservé avant) ?
3. Courriel d'expédition : Shopify natif (avec suivi) ou le nôtre pour toutes les étapes ?
4. Compte UPS : le nôtre pour tous, ou un par client (à confirmer chez Zoho) ?
5. Valider les webhooks Shopify (au lieu des plages horaires).

## 5. Ordre d'implémentation proposé
1. Webhooks Shopify (règle le délai, indépendant du reste).
2. CRM *Commande planifier* → Inventory : commande + colis « Not Shipped » (remplace Books).
3. Poller Inventory → statut CRM + page livraison de l'app.
4. Courriels d'étape + suivi.
5. Transporteurs (étiquettes UPS), selon réponses Zoho.

## 6. Sources
- Inventory API — Packages : https://www.zoho.com/inventory/api/v1/packages/
- Inventory API — Shipment Orders : https://www.zoho.com/inventory/api/v1/shipmentorders/
- Packages : https://www.zoho.com/us/inventory/help/sales-orders/packages.html
- Shipments : https://www.zoho.com/us/inventory/help/sales-orders/shipments.html
- Automatisation (workflows) : https://www.zoho.com/inventory/help/settings/automation.html
- Transporteurs US/Canada : https://www.zoho.com/inventory/help/shipping-carriers/shipping-us.html
- Mode de stock (physique vs comptable) : https://www.zoho.com/inventory/kb/items/item-decrease.html

## Addendum 2026-10-27 — recherches complémentaires
- **Suivi / « livré » automatique** ✅ : Zoho documente l'intégration **AfterShip** (suivi en temps réel, passe l'expédition à *Delivered* automatiquement). Avec un compte **EasyPost** personnel, le suivi remonte via un webhook EasyPost dont l'URL est donnée par Zoho. Repli : « Marquer livré » manuel.
- **Un compte UPS par client** ⚠️ : avec un compte EasyPost à nous, chaque compte transporteur (un par boutique) s'ajoute côté EasyPost, et Zoho affiche « tous les transporteurs configurés ». Plausible, à confirmer par un test (non explicite dans la doc Zoho).
- **Zoho Flow** ✅ : déclencheurs Inventory *Package created/updated* et *Shipment created/updated* existent → option « quasi temps réel » en complément de l'interrogation périodique de l'app (Flow = produit supplémentaire, quotas selon forfait).
- **Zoho CRM Notifications API** ✅ : canal temps réel sur Sales_Orders, mais expire au bout d'une semaine max (à renouveler) ; le webhook de workflow actuel suffit.
- **Shopify** : les webhooks ne sont « pas toujours garantis » → réconciliation périodique par `updated_at` (déjà notre polling, gardé). Créer une expédition avec suivi + `notifyCustomer` exige des scopes de fulfillment (`write_merchant_managed_fulfillment_orders` ou équivalent) **absents** de `SHOPIFY_OFFLINE_SCOPES` → ré-autorisation unique de la boutique. `fulfillmentEventCreate` permet d'enregistrer « en livraison » côté Shopify (le statut DELIVERED reste à confirmer).
