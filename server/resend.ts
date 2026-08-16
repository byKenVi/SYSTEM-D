import { Resend } from 'resend';

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
  replyTo?: string;
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
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: `Formulaire ${data.formNumber} reçu — Système-D`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Formulaire reçu</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${data.name}, votre formulaire <strong>${typeLabel}</strong> (${data.formNumber}) a bien été soumis.
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
    const statusLabel = statusLabels[data.newStatus] || data.newStatus;

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: `Formulaire ${data.formNumber} — ${statusLabel}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Mise à jour de votre formulaire</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${data.name}, le statut de votre formulaire <strong>${data.formNumber}</strong> a été mis à jour : <strong>${statusLabel}</strong>.
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
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.adminEmail,
      ...(replyTo ? { replyTo } : {}),
      subject: `Nouveau formulaire ${data.formNumber} soumis — ${data.clientName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Nouveau formulaire soumis</h2>
          <p style="margin: 0 0 24px; color: #555;">
            <strong>${data.clientName}</strong> a soumis un formulaire <strong>${typeLabel}</strong> (${data.formNumber}).
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
    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: `Commande Système D #${data.orderId} confirmée`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Commande confirmée</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${data.name}, votre commande <strong>#${data.orderId}</strong> de <strong>${data.amount}</strong> est confirmée.
            Le crédit du rep <strong>${data.repName}</strong> a été débité. Notre équipe va maintenant traiter la commande.
          </p>
          <a href="${getAppUrl()}/portal/boutique?tab=orders&orderId=${data.orderId}" style="display: inline-block; background: #ef5f18; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Voir ma commande
          </a>
        </div>
      `,
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
}) {
  try {
    const { client, fromEmail, replyTo } = await getUncachableResendClient();
    await client.emails.send({
      from: `Services Système-D <${fromEmail}>`,
      to: data.email,
      ...(replyTo ? { replyTo } : {}),
      subject: `Nouvelle commande Système D #${data.orderId} à traiter`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Nouvelle commande à traiter</h2>
          <p style="margin: 0 0 24px; color: #555;">
            La commande <strong>#${data.orderId}</strong> de <strong>${data.clientName}</strong>, d'un montant de
            <strong>${data.amount}</strong>, a été payée avec le crédit de <strong>${data.repName}</strong>.
          </p>
          <a href="${getAppUrl()}/admin/orders#systemd-${data.orderId}" style="display: inline-block; background: #ef5f18; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Traiter la commande
          </a>
        </div>
      `,
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

  await client.emails.send({
    from: `Services Système-D <${fromEmail}>`,
    to: contact.email,
    ...(replyTo ? { replyTo } : {}),
    subject: `Votre invitation au portail client – Services Système-D`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <h2 style="margin: 0 0 8px; color: #111;">Bienvenue sur le portail client de Services Système-D</h2>
        <p style="margin: 0 0 24px; color: #555;">
          Bonjour ${contact.name},${contact.companyName ? ` votre compte pour <strong>${contact.companyName}</strong> est prêt.` : ''}<br/>
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
