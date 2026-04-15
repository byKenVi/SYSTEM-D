import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
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
    const appUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://workspace.masdouk1.replit.app';
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: fromEmail || 'SYSTEM D <onboarding@resend.dev>',
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
    const appUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://workspace.masdouk1.replit.app';
    const typeLabel = FORM_TYPE_LABELS[data.formType] || data.formType;

    await client.emails.send({
      from: fromEmail || 'SYSTEM D <onboarding@resend.dev>',
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
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'https://workspace.masdouk1.replit.app';

  await client.emails.send({
    from: fromEmail || 'SYSTEM D <onboarding@resend.dev>',
    to: contact.email,
    subject: `You've been invited to SYSTEM D`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <h2 style="margin: 0 0 8px;">You're invited to SYSTEM D</h2>
        <p style="margin: 0 0 24px; color: #555;">
          Hi ${contact.name},${contact.companyName ? ` your account for <strong>${contact.companyName}</strong> is ready.` : ''} 
          Click the button below to sign in and access your client portal.
        </p>
        <a href="${appUrl}/api/login" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
          Sign in to SYSTEM D
        </a>
        <p style="margin: 24px 0 0; font-size: 13px; color: #888;">
          If you weren't expecting this invitation, you can ignore this email.
        </p>
      </div>
    `,
  });
}
