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
