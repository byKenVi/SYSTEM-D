---
name: Notification auto-trigger pattern
description: How form status changes map to notification records and what categories/types are used.
---

# Rule
When a form changes status, call `buildStatusNotification(formType, fromStatus, toStatus, formNumber, formId)` and fire `storage.createNotification(...)` non-blocking with `.catch()`.

# Status → Notification mapping
- draft → submitted: category=compte, type=reception_soumission (triggered in submitted block)
- any → in_review: category=compte, type=devis_preparation
- any → approved + livraison: category=livraison, type=colis_expedie
- any → approved + copacking: category=commande, type=commande_approuvee
- any → approved + other: category=compte, type=nouveau_devis
- any → completed + livraison: category=livraison, type=colis_livre
- any → completed + copacking: category=commande, type=commande_expediee
- any → completed + other: category=compte, type=dossier_complete

# Categories
compte | livraison | commande | projet | inventaire

**Why:** Centralized helper keeps notification logic out of route handlers; fire-and-forget avoids blocking form PUT response if notification write fails.

**How to apply:** Add new entries to buildStatusNotification() when new form types or status transitions are introduced.
