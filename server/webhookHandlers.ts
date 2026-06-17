import Stripe from 'stripe';
import { storage } from './storage';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Missing Replit connector environment variables');
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);
  }

  const data = await resp.json();
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret_key) {
    throw new Error('Stripe integration not connected');
  }

  return {
    secretKey: settings.secret_key,
    webhookSecret: settings.webhook_secret,
  };
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const { secretKey, webhookSecret } = await getStripeCredentials();
    const stripe = new Stripe(secretKey);

    if (!webhookSecret) {
      throw new Error(
        'Stripe webhook secret not configured. ' +
        'Connect Stripe via the Integrations tab to receive webhook events.'
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    await WebhookHandlers.handleEvent(stripe, event);
  }

  private static async handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== 'systemd_store') break;

        const sessionId = session.id;
        const order = await storage.getSystemdOrderByCheckoutSession(sessionId);

        if (!order) {
          console.warn(`[webhook] No systemd_order found for session ${sessionId}`);
          break;
        }

        await storage.updateSystemdOrder(order.id, {
          status: 'paid',
          stripePaymentIntentId: session.payment_intent as string | null,
          amount: session.amount_total ?? order.amount,
          currency: session.currency ?? order.currency,
        });

        console.log(`[webhook] SystemD order ${order.id} marked as paid (session ${sessionId})`);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== 'systemd_store') break;

        const order = await storage.getSystemdOrderByCheckoutSession(session.id);
        if (order && order.status === 'pending') {
          await storage.updateSystemdOrder(order.id, { status: 'expired' });
          console.log(`[webhook] SystemD order ${order.id} expired`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        // No direct session link here — handled via checkout.session.expired
        console.log(`[webhook] Payment failed for intent ${pi.id}`);
        break;
      }

      default:
        break;
    }
  }
}
