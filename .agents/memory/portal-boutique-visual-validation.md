---
name: Portal Boutique visual validation
description: Practical constraints for validating authenticated Boutique layouts and action states.
---

Responsive product tables with action columns need explicit width allocation; otherwise intrinsic button content can expand the table past the usable viewport even when wrapped in a horizontal scroller.

**Why:** The product action labels are longer than the inventory columns, so an auto-layout table can clip the rightmost controls at desktop widths before responsive scrolling becomes useful.

**How to apply:** When changing Boutique list actions, validate the authenticated client view at desktop and narrow widths, measure the rightmost action cell, and keep the action column reachable without overlay.

OIDC visual tests must configure claims in a fresh browser session after restarting the application; a restart can clear the test issuer override used by the browser tester.

**Why:** A browser test may reach the real consent page instead of the app when it reuses a session after the workflow restart.

**How to apply:** Set the intended client claims before navigating to `/api/login`, then verify the portal identity and catalog badge before judging UI behavior.

When a display state depends on external credit data that is unavailable for the test account, a browser-local response mock can cover that branch while preserving a real authenticated session and untouched application data.

**Why:** A real catalog may only expose one balance outcome, leaving status-specific layout regressions untested.

**How to apply:** Intercept only the target read endpoint, return the smallest response needed to exercise the label, capture evidence, and remove the interception before finishing the test.