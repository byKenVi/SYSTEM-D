import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  // Prefer direct env var (most reliable)
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || 'SYSTEM D <onboarding@resend.dev>',
    };
  }

  // Fall back to Replit connector proxy
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('Resend not connected');
  }

  return {
    apiKey: connectionSettings.settings.api_key as string,
    fromEmail: connectionSettings.settings.from_email as string,
  };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

const FORM_TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Tri",
  inspection: "Inspection",
  copacking: "Co-packing",
  livraison: "Livraison",
};

export async function sendFormSubmissionEmail(data: {
  email: string;
  name: string;
  formType: string;
  formNumber: string;
}) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const appUrl = process.env.NODE_ENV === 'development'
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://servicessystemed.app';
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: fromEmail ? `Services Système-D <${fromEmail}>` : 'Services Système-D <onboarding@resend.dev>',
      to: data.email,
      subject: `Formulaire ${data.formNumber} reçu — Système-D`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Formulaire reçu</h2>
          <p style="margin: 0 0 24px; color: #555;">
            Bonjour ${data.name}, votre formulaire <strong>${typeLabel}</strong> (${data.formNumber}) a bien été soumis.
            Notre équipe va l'examiner sous peu.
          </p>
          <a href="${appUrl}/portal/forms" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Voir mes formulaires
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("sendFormSubmissionEmail error:", err);
  }
}

export async function sendFormStatusEmail(data: {
  email: string;
  name: string;
  formNumber: string;
  newStatus: string;
}) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const statusLabels: Record<string, string> = {
      in_review: "En révision",
      approved: "Approuvé",
      completed: "Complété",
    };
    const statusLabel = statusLabels[data.newStatus] || data.newStatus;

    await client.emails.send({
      from: fromEmail || 'SYSTEM D <onboarding@resend.dev>',
      to: data.email,
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
    console.error("sendFormStatusEmail error:", err);
  }
}

export async function sendFormAdminNotificationEmail(data: {
  adminEmail: string;
  clientName: string;
  formType: string;
  formNumber: string;
}) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const appUrl = process.env.NODE_ENV === 'development'
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://servicessystemed.app';
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: fromEmail ? `Services Système-D <${fromEmail}>` : 'Services Système-D <onboarding@resend.dev>',
      to: data.adminEmail,
      subject: `Nouveau formulaire ${data.formNumber} soumis — ${data.clientName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
          <h2 style="margin: 0 0 8px;">Nouveau formulaire soumis</h2>
          <p style="margin: 0 0 24px; color: #555;">
            <strong>${data.clientName}</strong> a soumis un formulaire <strong>${typeLabel}</strong> (${data.formNumber}).
          </p>
          <a href="${appUrl}/admin/forms" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
            Voir les formulaires
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("sendFormAdminNotificationEmail error:", err);
  }
}

export async function sendInviteEmail(contact: {
  name: string;
  email: string;
  companyName?: string | null;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const appUrl = process.env.NODE_ENV === 'development'
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'https://servicessystemed.app';

  await client.emails.send({
    from: fromEmail ? `Services Système-D <${fromEmail}>` : 'Services Système-D <onboarding@resend.dev>',
    to: contact.email,
    subject: `Votre invitation au portail client – Services Système-D`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <h2 style="margin: 0 0 8px; color: #111;">Bienvenue sur le portail client de Services Système-D</h2>
        <p style="margin: 0 0 24px; color: #555;">
          Bonjour ${contact.name},${contact.companyName ? ` votre compte pour <strong>${contact.companyName}</strong> est prêt.` : ''}<br/>
          Cliquez sur le bouton ci-dessous pour vous connecter et accéder à votre portail client.
        </p>
        <a href="${appUrl}/api/login" style="display: inline-block; background: #ef5f18; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Accéder au portail
        </a>
        <p style="margin: 24px 0 0; font-size: 13px; color: #888;">
          Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce message.
        </p>
      </div>
    `,
  });
}
