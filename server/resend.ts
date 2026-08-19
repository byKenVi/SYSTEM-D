import { Resend } from 'resend';

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
  replyTo?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeEmailSubject(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

async function getCredentials(): Promise<ResendCredentials> {
  let apiKey: string | undefined;
  let fromEmail: string | undefined;

  // Priorité 1 : variable d'environnement directe
  if (process.env.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
    fromEmail = process.env.RESEND_FROM_EMAIL;
  } else {
    // Priorité 2 : connector Replit (fallback de transition)
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

    if (!xReplitToken) {
      throw new Error('Resend non configuré : RESEND_API_KEY absent et token Replit introuvable.');
    }

    const connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X-Replit-Token': xReplitToken,
        },
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings?.settings?.api_key) {
      throw new Error('Resend non configuré : connector introuvable et RESEND_API_KEY absent.');
    }

    apiKey = connectionSettings.settings.api_key as string;
    fromEmail = connectionSettings.settings.from_email as string;
  }

  if (!fromEmail) {
    throw new Error('Resend non configuré : RESEND_FROM_EMAIL absent. Définir cette variable dans les secrets Replit.');
  }

  // Reply-to optionnel — ignoré si absent
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL || undefined;

  return { apiKey, fromEmail, replyTo };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail, replyTo } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
    replyTo,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
  product_work_order: "Bon de travail produit",
};

function getAppUrl(): string {
  return process.env.NODE_ENV === 'development'
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'https://servicessystemed.app';
}

// ── Fonctions d'envoi ────────────────────────────────────────────────────────

export async function sendFormSubmissionEmail(data: {
  email: string;
  name: string;
  formType: string;
  formNumber: string;
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    const typeLabel = escapeHtml(FORM_TYPE_LABELS[data.formType] || data.formType);
    const name = escapeHtml(data.name);
    const formNumber = escapeHtml(data.formNumber);

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: sanitizeEmailSubject(`Formulaire ${data.formNumber} reçu — Système-D`),
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Formulaire reçu</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${name}, votre formulaire <strong>${typeLabel}</strong> (${formNumber}) a bien été soumis.
            Notre équipe va l'examiner sous peu.
          </p>
          <a href="${getAppUrl()}/portal/forms" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Voir mes formulaires
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("[resend] sendFormSubmissionEmail error:", err);
  }
}

export async function sendFormStatusEmail(data: {
  email: string;
  name: string;
  formNumber: string;
  newStatus: string;
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    const statusLabels: Record<string, string> = {
      in_review: "En révision",
      approved: "Approuvé",
      completed: "Complété",
    };
    const statusLabel = escapeHtml(statusLabels[data.newStatus] || data.newStatus);
    const name = escapeHtml(data.name);
    const formNumber = escapeHtml(data.formNumber);

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: sanitizeEmailSubject(`Formulaire ${data.formNumber} — ${statusLabels[data.newStatus] || data.newStatus}`),
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Mise à jour de votre formulaire</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${name}, le statut de votre formulaire <strong>${formNumber}</strong> a été mis à jour : <strong>${statusLabel}</strong>.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[resend] sendFormStatusEmail error:", err);
  }
}

export async function sendFormAdminNotificationEmail(data: {
  adminEmail: string;
  clientName: string;
  formType: string;
  formNumber: string;
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    const typeLabel = escapeHtml(FORM_TYPE_LABELS[data.formType] || data.formType);
    const clientName = escapeHtml(data.clientName);
    const formNumber = escapeHtml(data.formNumber);

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.adminEmail,
      ...(replyTo ? { replyTo } : {}),
      subject: sanitizeEmailSubject(`Nouveau formulaire ${data.formNumber} soumis — ${data.clientName}`),
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Nouveau formulaire soumis</h2>
          <p style="margin: 0 0 24px; color: #555;">
            <strong>${clientName}</strong> a soumis un formulaire <strong>${typeLabel}</strong> (${formNumber}).
          </p>
          <a href="${getAppUrl()}/admin/forms" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Voir les formulaires
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("[resend] sendFormAdminNotificationEmail error:", err);
  }
}

export async function sendSystemdOrderConfirmationEmail(data: {
  email: string;
  name: string;
  orderId: number;
  amount: string;
  repName: string;
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    const name = escapeHtml(data.name);
    const amount = escapeHtml(data.amount);
    const repName = escapeHtml(data.repName);
    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: sanitizeEmailSubject(`Commande Système D #${data.orderId} confirmée`),
      html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#ef5f18;padding:28px 32px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.75);">Services Système-D</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;">Commande confirmée ✓</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">
              Bonjour <strong>${name}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Votre commande <strong>#${data.orderId}</strong> a bien été enregistrée. Le crédit du représentant <strong>${repName}</strong> a été débité et notre équipe va maintenant préparer votre commande.
            </p>

            <!-- Order summary box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Résumé de la commande</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Numéro de commande</td>
                      <td align="right" style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;font-family:monospace;">#${data.orderId}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Montant total</td>
                      <td align="right" style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;">${amount}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Rep débité</td>
                      <td align="right" style="padding:4px 0;font-size:14px;color:#111827;">${repName}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:14px;color:#6b7280;">Statut</td>
                      <td align="right" style="padding:4px 0;">
                        <span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:2px 10px;border-radius:9999px;">Payée</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${getAppUrl()}/portal/boutique?tab=systemd-orders" style="display:inline-block;background:#ef5f18;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:700;">
                Voir ma commande →
              </a>
            </td></tr></table>

            <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
              Vous recevrez une confirmation dès que la commande sera traitée. Pour toute question, répondez directement à ce courriel.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© Services Système-D — <a href="${getAppUrl()}" style="color:#ef5f18;text-decoration:none;">servicessystemed.app</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error("[resend] sendSystemdOrderConfirmationEmail error:", err);
  }
}

export async function sendSystemdOrderAdminEmail(data: {
  email: string;
  orderId: number;
  clientName: string;
  amount: string;
  repName: string;
  repEmail: string;
  items: Array<{ name: string; quantity: number }>;
  stockStatus: string;
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    const clientName = escapeHtml(data.clientName);
    const amount = escapeHtml(data.amount);
    const repName = escapeHtml(data.repName);
    const repEmail = escapeHtml(data.repEmail);
    const stockStatus = escapeHtml(data.stockStatus);
    const itemsRows = data.items.map((item) => `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;">${escapeHtml(item.name)}</td>
        <td align="center" style="padding:10px 16px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;">${item.quantity}</td>
      </tr>`).join("");
    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: sanitizeEmailSubject(`Nouvelle commande Système D #${data.orderId} à traiter`),
      html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:28px 32px;border-bottom:4px solid #ef5f18;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Administration · Services Système-D</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;">Nouvelle commande à traiter</h1>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:14px 32px;">
            <p style="margin:0;font-size:14px;color:#c2410c;">
              🛒 &nbsp;<strong>Commande #${data.orderId}</strong> — action requise de votre part.
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">

            <!-- Client + Rep summary -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Informations client</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#6b7280;width:40%;">Client</td>
                      <td style="padding:5px 0;font-size:14px;font-weight:700;color:#111827;">${clientName}</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#6b7280;">Rep débité</td>
                      <td style="padding:5px 0;font-size:14px;color:#111827;">${repName} <span style="color:#9ca3af;">(${repEmail})</span></td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#6b7280;">Montant total</td>
                      <td style="padding:5px 0;font-size:18px;font-weight:800;color:#ef5f18;">${amount}</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#6b7280;">Stock</td>
                      <td style="padding:5px 0;font-size:14px;color:#111827;">${stockStatus}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Articles table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th align="left" style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Article</th>
                  <th align="center" style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Qté</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${getAppUrl()}/admin/boutique" style="display:inline-block;background:#ef5f18;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:700;">
                Traiter la commande →
              </a>
            </td></tr></table>

            <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
              Cette commande nécessite votre action. Connectez-vous au panneau d'administration pour la marquer en traitement et confirmer la réservation de stock.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© Services Système-D · Panneau admin — <a href="${getAppUrl()}/admin/boutique" style="color:#ef5f18;text-decoration:none;">servicessystemed.app</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error("[resend] sendSystemdOrderAdminEmail error:", err);
  }
}

export async function sendInviteEmail(contact: {
  name: string;
  email: string;
  companyName?: string | null;
}) {
  // Ce flux est bloquant — les erreurs remontent à l'appelant
  const { client, fromEmail, replyTo } = await getUncachableResendClient();
  const name = escapeHtml(contact.name);
  const companyName = contact.companyName ? escapeHtml(contact.companyName) : null;

  await client.emails.send({
    from: `Services Système-D <${fromEmail}>`,
    to: contact.email,
    ...(replyTo ? { replyTo } : {}),
    subject: sanitizeEmailSubject("Votre invitation au portail client – Services Système-D"),
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <h2 style="margin: 0 0 8px; color: #111;">Bienvenue sur le portail client de Services Système-D</h2>
        <p style="margin: 0 0 24px; color: #555;">
          Bonjour ${name},${companyName ? ` votre compte pour <strong>${companyName}</strong> est prêt.` : ''}<br/>
          Cliquez sur le bouton ci-dessous pour vous connecter et accéder à votre portail client.
        </p>
        <a href="${getAppUrl()}/api/login" style="display: inline-block; background: #ef5f18; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Accéder au portail
        </a>
        <p style="margin: 24px 0 0; font-size: 13px; color: #888;">
          Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce message.
        </p>
      </div>
    `,
  });
}
