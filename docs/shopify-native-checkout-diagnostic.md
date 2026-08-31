# Diagnostic séparé — checkout Shopify natif / Store Credit

## Périmètre

Ce diagnostic concerne uniquement le parcours Shopify natif utilisé par Ridgie
(draft order, facture et checkout Shopify). Il ne concerne pas le parcours de
commande Système D et ne doit pas conduire à supprimer la création de commandes
Shopify depuis Système D.

## État du diagnostic

La cause exacte n'est pas confirmée depuis cet environnement : l'Admin Shopify
atteint l'écran de vérification de connexion, sans session authentifiée, et les
variables d'exécution donnant accès à la boutique ne sont pas présentes. Il est
donc interdit de conclure que le bouton est corrigé ou d'attribuer le problème à
Système D.

Le script `scripts/diagnose-shopify-order-visibility.ts` produit un état en
lecture seule et expurgé des URL de facture, adresses, e-mails et jetons. Il
recherche notamment `#D1`, `#1007`, Kevin/Ridgie, le 25 août, aujourd'hui et la
chronologie Store Credit.

## Reproduction contrôlée du parcours natif

1. Ouvrir `#D1` dans Shopify Admin et relever son statut, son client exact, sa
   devise, son total, son adresse de livraison et l'éventuelle commande liée.
2. Renvoyer la facture depuis Shopify vers une adresse contrôlée, puis ouvrir le
   lien dans une fenêtre privée. Ne pas utiliser un lien de checkout ancien.
3. S'authentifier avec le compte client qui possède réellement le Store Credit.
   Tester séparément le nouveau compte client et Shop Pay si les deux sont
   proposés.
4. Vérifier que le crédit affiché appartient au même customer ID que `#D1`, que
   la devise est CAD et que le solde couvre le total final, livraison et taxes
   comprises.
5. Compléter une adresse canadienne valide et confirmer qu'au moins un tarif de
   livraison est retourné. Sans tarif, capturer la réponse réseau correspondante.
6. Cliquer une seule fois sur « Valider le paiement » avec les outils de
   développement ouverts. Conserver l'erreur console et la requête réseau qui
   échoue, y compris son statut HTTP et son code Shopify, mais jamais les cookies,
   jetons ou URL de checkout complètes.
7. Refaire le test avec les extensions de checkout/applications désactivées sur
   un thème/configuration de test. Si le clic fonctionne alors, réactiver les
   extensions une par une pour identifier l'extension fautive.
8. Vérifier enfin si une commande a malgré tout été créée (`#1007`, commandes du
   25 août et du jour) avant toute nouvelle tentative ou modification de crédit.

## Arbre de décision

- Aucun Store Credit affiché : mauvais customer ID, client non connecté, ou
  configuration des comptes clients/Shop Pay non compatible. Corriger
  l'association client et le mode de connexion avant de retester.
- Crédit affiché, bouton inactif avant le clic : total final supérieur au solde,
  devise non CAD, adresse incomplète ou absence de tarif de livraison.
- Clic sans requête réseau : erreur JavaScript ou extension de checkout. La
  première exception console et le test sans extensions donnent l'action exacte.
- Requête réseau en échec : le code/HTTP Shopify est la cause opérationnelle à
  corriger (validation, configuration ou incident Shopify).
- Réponse réussie mais aucune navigation : vérifier d'abord si la commande a été
  créée pour éviter un doublon, puis isoler le script/extension qui bloque la
  transition visuelle.

## Condition de GO

Le checkout natif ne passe à GO qu'après une reproduction réussie de bout en
bout ou après capture d'un blocage déterministe avec son action corrective
précise. Un simple écran de vérification de connexion ou une hypothèse de
configuration reste un NO-GO.
