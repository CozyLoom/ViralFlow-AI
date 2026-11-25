import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const WORKSPACE_COOKIE_NAME = 'vf_workspace';
const DATA_DIR = path.resolve(__dirname, '.data');
const BILLING_STATE_FILE = path.join(DATA_DIR, 'billing-state.json');
const BILLING_SECRET_FILE = path.join(DATA_DIR, 'billing-secret.key');

type PlanStatus = 'inactive' | 'active' | 'past_due' | 'canceled';

interface BillingManagementUrls {
  updatePaymentMethod?: string | null;
  cancel?: string | null;
}

interface WorkspaceRecord {
  id: string;
  isSubscribed: boolean;
  planStatus: PlanStatus;
  customerEmail: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  lastTransactionId: string | null;
  nextBilledAt: string | null;
  cancelAt: string | null;
  managementUrls: BillingManagementUrls | null;
  createdAt: string;
  updatedAt: string;
}

interface BillingStoreFile {
  workspaces: Record<string, WorkspaceRecord>;
}

interface AuthenticatedRequest extends Request {
  workspace?: WorkspaceRecord;
  workspaceToken?: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

let cachedSecret: string | null = null;
function getSigningSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (cachedSecret) return cachedSecret;

  try {
    ensureDataDir();
    if (fs.existsSync(BILLING_SECRET_FILE)) {
      const existing = fs.readFileSync(BILLING_SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(BILLING_SECRET_FILE, generated, { mode: 0o600 });
    cachedSecret = generated;
    return cachedSecret;
  } catch {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    return cachedSecret;
  }
}

let billingStore: BillingStoreFile = { workspaces: {} };

function loadBillingStore() {
  try {
    if (fs.existsSync(BILLING_STATE_FILE)) {
      const raw = fs.readFileSync(BILLING_STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as BillingStoreFile;
      if (parsed && parsed.workspaces && typeof parsed.workspaces === 'object') {
        billingStore = parsed;
      }
    }
  } catch (err) {
    console.error('[ViralFlow Billing] Failed to load billing store:', err);
  }
}

function saveBillingStore() {
  try {
    ensureDataDir();
    const tmpFile = `${BILLING_STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(billingStore, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, BILLING_STATE_FILE);
  } catch (err) {
    console.error('[ViralFlow Billing] Failed to persist billing store:', err);
  }
}

loadBillingStore();

function signWorkspaceId(workspaceId: string): string {
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(workspaceId)
    .digest('base64url');
  return `${workspaceId}.${sig}`;
}

function verifyWorkspaceToken(token: string | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [workspaceId, sig] = parts;
  if (!/^[a-f0-9-]{36}$/i.test(workspaceId) || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(workspaceId)
    .digest('base64url');

  const actualBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;
  return workspaceId;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }
  return cookies;
}

function setWorkspaceCookie(req: Request, res: Response, token: string) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (typeof req.headers.origin === 'string' && req.headers.origin.startsWith('https://'));

  const parts = [
    `${WORKSPACE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=31536000',
  ];

  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function verifySameOriginForCookieAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return true;
  }
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const forwardedHost =
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0].trim()
        : undefined;
    const expectedHost = forwardedHost || req.headers.host;
    return !expectedHost || originHost === expectedHost;
  } catch {
    return false;
  }
}

function sanitizeHttpsUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeWorkspaceRecord(id: string, raw?: Partial<WorkspaceRecord>): WorkspaceRecord {
  const now = new Date().toISOString();
  const rawStatus = raw?.planStatus as string | undefined;
  const planStatus: PlanStatus =
    rawStatus === 'active' || rawStatus === 'past_due' || rawStatus === 'canceled'
      ? rawStatus
      : 'inactive';
  return {
    id,
    isSubscribed: Boolean(raw?.isSubscribed),
    planStatus,
    customerEmail: raw?.customerEmail ?? null,
    paddleCustomerId: raw?.paddleCustomerId ?? null,
    paddleSubscriptionId: raw?.paddleSubscriptionId ?? null,
    lastTransactionId: raw?.lastTransactionId ?? null,
    nextBilledAt: raw?.nextBilledAt ?? null,
    cancelAt: raw?.cancelAt ?? null,
    managementUrls: raw?.managementUrls ?? null,
    createdAt: raw?.createdAt ?? now,
    updatedAt: raw?.updatedAt ?? now,
  };
}

function getOrCreateWorkspace(req: Request, res: Response): {
  workspace: WorkspaceRecord;
  token: string;
} {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[WORKSPACE_COOKIE_NAME];

  const verifiedId =
    verifyWorkspaceToken(bearerToken) || verifyWorkspaceToken(cookieToken);

  if (verifiedId) {
    const rawExisting = billingStore.workspaces[verifiedId];
    const existing = normalizeWorkspaceRecord(verifiedId, rawExisting);
    if (!rawExisting) {
      billingStore.workspaces[verifiedId] = existing;
      saveBillingStore();
    }
    const token = signWorkspaceId(existing.id);
    if (!cookieToken || verifyWorkspaceToken(cookieToken) !== existing.id) {
      setWorkspaceCookie(req, res, token);
    }
    return { workspace: existing, token };
  }

  const newId = crypto.randomUUID();
  const created = normalizeWorkspaceRecord(newId);
  billingStore.workspaces[newId] = created;
  saveBillingStore();
  const token = signWorkspaceId(newId);
  setWorkspaceCookie(req, res, token);
  return { workspace: created, token };
}

function formatBillingStatus(workspace: WorkspaceRecord, token?: string) {
  return {
    workspaceId: workspace.id,
    isSubscribed: workspace.isSubscribed,
    planStatus: workspace.planStatus,
    customerEmail: workspace.customerEmail,
    paddleCustomerId: workspace.paddleCustomerId,
    paddleSubscriptionId: workspace.paddleSubscriptionId,
    lastTransactionId: workspace.lastTransactionId,
    nextBilledAt: workspace.nextBilledAt,
    cancelAt: workspace.cancelAt,
    managementUrls: workspace.managementUrls,
    updatedAt: workspace.updatedAt,
    ...(token ? { token } : {}),
  };
}

async function syncSubscriptionFromPaddle(workspace: WorkspaceRecord): Promise<boolean> {
  const paddleApiKey = process.env.PADDLE_API_KEY;
  if (!paddleApiKey || !workspace.paddleSubscriptionId) return false;

  const subRes = await fetch(
    `https://api.paddle.com/subscriptions/${encodeURIComponent(workspace.paddleSubscriptionId)}`,
    {
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!subRes.ok) return false;

  const payload = (await subRes.json()) as {
    data?: {
      id?: string;
      status?: string;
      customer_id?: string;
      next_billed_at?: string | null;
      scheduled_change?: { action?: string; effective_at?: string | null } | null;
      management_urls?: { update_payment_method?: string | null; cancel?: string | null } | null;
    };
  };

  const sub = payload.data;
  if (!sub) return false;

  if (sub.customer_id) workspace.paddleCustomerId = sub.customer_id;
  workspace.nextBilledAt = sub.next_billed_at ?? null;
  workspace.cancelAt =
    sub.scheduled_change?.action === 'cancel'
      ? sub.scheduled_change.effective_at ?? null
      : null;

  if (sub.management_urls) {
    workspace.managementUrls = {
      updatePaymentMethod: sanitizeHttpsUrl(sub.management_urls.update_payment_method),
      cancel: sanitizeHttpsUrl(sub.management_urls.cancel),
    };
  }

  if (sub.status === 'canceled' || sub.status === 'paused') {
    workspace.isSubscribed = false;
    workspace.planStatus = 'canceled';
  } else if (sub.status === 'past_due') {
    workspace.planStatus = 'past_due';
  } else if (sub.status === 'active' || sub.status === 'trialing') {
    workspace.isSubscribed = true;
    workspace.planStatus = 'active';
  }

  workspace.updatedAt = new Date().toISOString();
  billingStore.workspaces[workspace.id] = workspace;
  saveBillingStore();
  return true;
}

function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!verifySameOriginForCookieAuth(req)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  const { workspace, token } = getOrCreateWorkspace(req, res);
  if (!workspace.isSubscribed) {
    return res.status(402).json({
      error:
        'An active ViralFlow Pro subscription is required. Complete payment in the Subscription section to unlock the app.',
      code: 'SUBSCRIPTION_REQUIRED',
      billing: formatBillingStatus(workspace, token),
    });
  }
  const authedReq = req as AuthenticatedRequest;
  authedReq.workspace = workspace;
  authedReq.workspaceToken = token;
  next();
}

function recordSuccessfulGeneration(req: Request) {
  const authedReq = req as AuthenticatedRequest;
  const workspace = authedReq.workspace;
  if (!workspace) return undefined;

  workspace.updatedAt = new Date().toISOString();
  billingStore.workspaces[workspace.id] = workspace;
  saveBillingStore();
  return formatBillingStatus(workspace, authedReq.workspaceToken);
}

function verifyPaddleSignature(
  signatureHeader: string | undefined,
  rawBody: Buffer,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const pairs = signatureHeader.split(';').map((part) => part.trim());
  let timestamp = '';
  const signatures: string[] = [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (key === 'ts') timestamp = val;
    if (key === 'h1' && val) signatures.push(val);
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || signatures.length === 0) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNum) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}:${rawBody.toString('utf8')}`;
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  return signatures.some((sig) => {
    try {
      const actualBuf = Buffer.from(sig, 'hex');
      return (
        actualBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(actualBuf, expectedBuf)
      );
    } catch {
      return false;
    }
  });
}

// Paddle Billing Webhook (raw body required BEFORE express.json)
app.post(
  '/api/webhooks/paddle',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req: Request, res: Response) => {
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(503).json({
        error: 'PADDLE_WEBHOOK_SECRET is not configured on the server.',
      });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    const sigHeader = req.headers['paddle-signature'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    if (!verifyPaddleSignature(signature, rawBody, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid Paddle webhook signature.' });
    }

    try {
      const event = JSON.parse(rawBody.toString('utf8')) as {
        event_type?: string;
        data?: {
          id?: string;
          status?: string;
          customer_id?: string;
          subscription_id?: string;
          next_billed_at?: string | null;
          scheduled_change?: { action?: string; effective_at?: string | null } | null;
          customer?: { email?: string };
          custom_data?: { userId?: string };
        };
      };

      const eventType = event.event_type || '';
      const data = event.data || {};
      const customUserId = data.custom_data?.userId;
      const subscriptionId =
        eventType.startsWith('subscription.') ? data.id : data.subscription_id;
      const customerId = data.customer_id;

      let workspace: WorkspaceRecord | undefined;
      if (customUserId && /^[a-f0-9-]{36}$/i.test(customUserId)) {
        workspace = billingStore.workspaces[customUserId]
          ? normalizeWorkspaceRecord(customUserId, billingStore.workspaces[customUserId])
          : normalizeWorkspaceRecord(customUserId);
      } else if (subscriptionId) {
        const matched = Object.values(billingStore.workspaces).find(
          (w) => w.paddleSubscriptionId === subscriptionId
        );
        if (matched) workspace = normalizeWorkspaceRecord(matched.id, matched);
      } else if (customerId) {
        const matched = Object.values(billingStore.workspaces).find(
          (w) => w.paddleCustomerId === customerId
        );
        if (matched) workspace = normalizeWorkspaceRecord(matched.id, matched);
      }

      if (workspace) {
        const now = new Date().toISOString();
        if (customerId) workspace.paddleCustomerId = customerId;
        if (subscriptionId) workspace.paddleSubscriptionId = subscriptionId;
        if (data.customer?.email) workspace.customerEmail = data.customer.email;
        if (data.next_billed_at !== undefined) workspace.nextBilledAt = data.next_billed_at;
        if (data.scheduled_change?.action === 'cancel') {
          workspace.cancelAt = data.scheduled_change.effective_at ?? null;
        }
        if (eventType.startsWith('transaction.') && data.id) {
          workspace.lastTransactionId = data.id;
        }

        if (eventType === 'subscription.canceled' || data.status === 'canceled') {
          workspace.isSubscribed = false;
          workspace.planStatus = 'canceled';
          workspace.cancelAt = null;
        } else if (eventType === 'subscription.past_due' || data.status === 'past_due') {
          workspace.planStatus = 'past_due';
        } else if (
          eventType === 'transaction.completed' ||
          eventType === 'transaction.paid' ||
          eventType === 'subscription.activated' ||
          eventType === 'subscription.created' ||
          eventType === 'subscription.resumed' ||
          (eventType === 'subscription.updated' && data.status === 'active')
        ) {
          workspace.isSubscribed = true;
          workspace.planStatus = 'active';
          if (eventType === 'subscription.resumed') {
            workspace.cancelAt = null;
          }
        }

        workspace.updatedAt = now;
        billingStore.workspaces[workspace.id] = workspace;
        saveBillingStore();
      }

      return res.json({ received: true });
    } catch (err) {
      console.error('[ViralFlow Billing] Webhook parse error:', err);
      return res.status(400).json({ error: 'Malformed webhook payload.' });
    }
  }
);

app.use(express.json({ limit: '10mb' }));

// Billing Status Route
app.get('/api/billing/status', async (req: Request, res: Response) => {
  const { workspace, token } = getOrCreateWorkspace(req, res);
  if (req.query.sync === '1' && workspace.paddleSubscriptionId && process.env.PADDLE_API_KEY) {
    try {
      await syncSubscriptionFromPaddle(workspace);
    } catch {
      // Return cached billing state if Paddle sync is temporarily unreachable
    }
  }
  res.json(formatBillingStatus(workspace, token));
});

// Update Workspace Billing Email
app.patch('/api/billing/email', (req: Request, res: Response) => {
  if (!verifySameOriginForCookieAuth(req)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  const { workspace, token } = getOrCreateWorkspace(req, res);
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid billing email address.' });
  }
  workspace.customerEmail = email.trim();
  workspace.updatedAt = new Date().toISOString();
  billingStore.workspaces[workspace.id] = workspace;
  saveBillingStore();
  return res.json({ billing: formatBillingStatus(workspace, token) });
});

// Sync Subscription Status & Management URLs from Paddle
app.post('/api/billing/sync', async (req: Request, res: Response) => {
  if (!verifySameOriginForCookieAuth(req)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  const { workspace, token } = getOrCreateWorkspace(req, res);
  if (workspace.paddleSubscriptionId && process.env.PADDLE_API_KEY) {
    try {
      await syncSubscriptionFromPaddle(workspace);
    } catch (err) {
      console.error('[ViralFlow Billing] Paddle sync error:', err);
      return res.status(502).json({
        error: 'Unable to sync subscription status with Paddle right now.',
        billing: formatBillingStatus(workspace, token),
      });
    }
  }
  return res.json({ billing: formatBillingStatus(workspace, token) });
});

// Cancel Subscription via Paddle Billing API
app.post('/api/billing/cancel', async (req: Request, res: Response) => {
  if (!verifySameOriginForCookieAuth(req)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  const { workspace, token } = getOrCreateWorkspace(req, res);
  if (!workspace.isSubscribed) {
    return res.status(400).json({ error: 'No active subscription to cancel.' });
  }

  const paddleApiKey = process.env.PADDLE_API_KEY;
  if (!paddleApiKey || !workspace.paddleSubscriptionId) {
    return res.status(400).json({
      error:
        'Configure PADDLE_API_KEY in Settings > Secrets and ensure a Paddle subscription ID is linked to cancel directly from the studio, or use the cancellation link in your Paddle receipt email.',
      billing: formatBillingStatus(workspace, token),
    });
  }

  const effectiveFrom =
    req.body?.effectiveFrom === 'immediately' ? 'immediately' : 'next_billing_period';

  try {
    const cancelRes = await fetch(
      `https://api.paddle.com/subscriptions/${encodeURIComponent(
        workspace.paddleSubscriptionId
      )}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paddleApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ effective_from: effectiveFrom }),
      }
    );

    if (!cancelRes.ok) {
      return res.status(502).json({
        error: 'Paddle could not process the cancellation request. Try again or use your Paddle customer portal link.',
        billing: formatBillingStatus(workspace, token),
      });
    }

    await syncSubscriptionFromPaddle(workspace);
    if (effectiveFrom === 'immediately') {
      workspace.isSubscribed = false;
      workspace.planStatus = 'canceled';
      workspace.updatedAt = new Date().toISOString();
      billingStore.workspaces[workspace.id] = workspace;
      saveBillingStore();
    }

    return res.json({
      canceled: true,
      billing: formatBillingStatus(workspace, token),
    });
  } catch (err) {
    console.error('[ViralFlow Billing] Cancel failed:', err);
    return res.status(502).json({
      error: 'Unable to contact Paddle to cancel subscription.',
      billing: formatBillingStatus(workspace, token),
    });
  }
});

// Client Checkout Confirmation Route (verifies transaction via Paddle API or webhook state)
app.post('/api/billing/confirm', async (req: Request, res: Response) => {
  if (!verifySameOriginForCookieAuth(req)) {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }

  const { workspace, token } = getOrCreateWorkspace(req, res);
  const { transactionId, email } = req.body ?? {};

  if (
    typeof transactionId !== 'string' ||
    !/^txn_[a-zA-Z0-9]+$/.test(transactionId.trim())
  ) {
    return res.status(400).json({ error: 'Valid Paddle transaction ID is required.' });
  }

  const cleanTxnId = transactionId.trim();
  const cleanEmail =
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? email.trim()
      : null;

  if (workspace.isSubscribed) {
    if (cleanEmail && !workspace.customerEmail) {
      workspace.customerEmail = cleanEmail;
      workspace.updatedAt = new Date().toISOString();
      billingStore.workspaces[workspace.id] = workspace;
      saveBillingStore();
    }
    return res.json({
      confirmed: true,
      billing: formatBillingStatus(workspace, token),
    });
  }

  const paddleApiKey = process.env.PADDLE_API_KEY;
  if (!paddleApiKey) {
    return res.status(202).json({
      confirmed: false,
      pending: true,
      error:
        'Checkout completed. Add PADDLE_API_KEY or PADDLE_WEBHOOK_SECRET in Settings > Secrets so the server can verify your transaction and unlock the app.',
      billing: formatBillingStatus(workspace, token),
    });
  }

  try {
    const paddleRes = await fetch(
      `https://api.paddle.com/transactions/${encodeURIComponent(cleanTxnId)}`,
      {
        headers: {
          Authorization: `Bearer ${paddleApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!paddleRes.ok) {
      return res.status(502).json({
        error: 'Unable to verify transaction with Paddle yet. Please retry in a few seconds.',
        billing: formatBillingStatus(workspace, token),
      });
    }

    const paddlePayload = (await paddleRes.json()) as {
      data?: {
        id?: string;
        status?: string;
        customer_id?: string;
        subscription_id?: string;
        custom_data?: { userId?: string };
      };
    };

    const txn = paddlePayload.data;
    const validStatus =
      txn?.status === 'completed' || txn?.status === 'paid' || txn?.status === 'billed';
    const customUserMatch =
      !txn?.custom_data?.userId || txn.custom_data.userId === workspace.id;

    if (!validStatus || !customUserMatch) {
      return res.status(402).json({
        error: 'Transaction is not yet completed for this workspace.',
        billing: formatBillingStatus(workspace, token),
      });
    }

    workspace.isSubscribed = true;
    workspace.planStatus = 'active';
    workspace.lastTransactionId = cleanTxnId;
    if (txn?.customer_id) workspace.paddleCustomerId = txn.customer_id;
    if (txn?.subscription_id) workspace.paddleSubscriptionId = txn.subscription_id;
    if (cleanEmail) workspace.customerEmail = cleanEmail;
    workspace.updatedAt = new Date().toISOString();
    billingStore.workspaces[workspace.id] = workspace;
    saveBillingStore();

    if (workspace.paddleSubscriptionId) {
      await syncSubscriptionFromPaddle(workspace).catch(() => {});
    }

    return res.json({
      confirmed: true,
      billing: formatBillingStatus(workspace, token),
    });
  } catch (err) {
    console.error('[ViralFlow Billing] Transaction verification failed:', err);
    return res.status(502).json({
      error: 'Could not reach Paddle to verify your subscription. Please try again shortly.',
      billing: formatBillingStatus(workspace, token),
    });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit for inline multimodal media
  },
});

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('MISSING_API_KEY: GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function handleApiError(res: Response, error: unknown, context: string) {
  console.error(`[ViralFlow API Error - ${context}]:`, error);
  const message = error instanceof Error ? error.message : 'Unexpected server error.';

  if (message.includes('MISSING_API_KEY')) {
    return res.status(500).json({
      error: 'Gemini API key is missing. Please add GEMINI_API_KEY in Settings > Secrets.',
    });
  }
  if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
    return res.status(403).json({
      error: 'Gemini API key was rejected. Please verify your key in Settings > Secrets.',
    });
  }
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error: 'API rate limit or quota reached. Please wait a moment and try again.',
    });
  }
  if (message.includes('File too large') || message.includes('LIMIT_FILE_SIZE')) {
    return res.status(413).json({
      error: 'Uploaded media exceeds the 20 MB direct-upload limit. Please compress the file or paste the transcript text instead.',
    });
  }

  return res.status(500).json({
    error: `Failed to ${context}. ${message}`,
  });
}

function parseJsonSafe<T>(rawText: string | undefined, fallbackError: string): T {
  if (!rawText) {
    throw new Error(fallbackError);
  }
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// 1. Viral Video Hooks Generator
app.post('/api/generate/hooks', requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const { topic, platform, audience, tone, count = 6 } = req.body ?? {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Please enter a video topic or idea.' });
    }

    const ai = getAiClient();
    const prompt = `You are a viral short-form video strategist for TikTok, Instagram Reels, and YouTube Shorts.
Generate ${Math.min(Math.max(Number(count) || 6, 3), 10)} distinct, scroll-stopping opening hooks (first 3 seconds) for this video idea:

Video Topic: ${topic.trim()}
Primary Platform: ${platform || 'TikTok'}
Target Audience: ${audience?.trim() || 'General creators & curious viewers'}
Tone / Style: ${tone || 'Direct & Punchy'}

Each hook must use a different psychological angle (e.g., Contrarian Truth, Curiosity Gap, Specific Mistake, Visual Pattern Interrupt, Relatable Confession, High-Stakes Result).
Keep spoken lines natural, punchy, and under 18 words so a creator can deliver them in 2–4 seconds.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topicSummary: { type: Type.STRING },
            hooks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  angle: { type: Type.STRING },
                  spokenHook: { type: Type.STRING },
                  onScreenText: { type: Type.STRING },
                  visualDirection: { type: Type.STRING },
                  targetPlatform: { type: Type.STRING },
                  retentionTrigger: { type: Type.STRING },
                  estimatedSeconds: { type: Type.NUMBER },
                },
                required: [
                  'id',
                  'angle',
                  'spokenHook',
                  'onScreenText',
                  'visualDirection',
                  'targetPlatform',
                  'retentionTrigger',
                  'estimatedSeconds',
                ],
              },
            },
          },
          required: ['topicSummary', 'hooks'],
        },
      },
    });

    const data = parseJsonSafe<Record<string, unknown>>(
      response.text,
      'No hook data returned from Gemini.'
    );
    const billing = recordSuccessfulGeneration(req);
    res.json({ ...data, billing });
  } catch (error) {
    handleApiError(res, error, 'generate viral hooks');
  }
});

// 2. Video Script Writer
app.post('/api/generate/script', requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const { topic, platform, durationSec = 45, tone, keyPoints } = req.body ?? {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Please describe the video concept or title.' });
    }

    const ai = getAiClient();
    const targetDuration = Math.min(Math.max(Number(durationSec) || 45, 15), 600);
    const prompt = `You are an expert creator scriptwriter and director.
Write a complete, production-ready video script tailored for ${platform || 'TikTok'}.

Topic / Premise: ${topic.trim()}
Target Duration: ${targetDuration} seconds
Tone: ${tone || 'Conversational & High-Retention'}
Key Points to Cover: ${keyPoints?.trim() || 'Cover the sharpest insights, clear examples, and an engaging payoff.'}

Structure the script with exact timestamps (00:00, 00:03, etc.), a high-retention opening hook, a re-hook / retention loop, tightly paced body beats with explicit visual directions and B-roll cues, and a clear call to action.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            targetPlatform: { type: Type.STRING },
            estimatedDurationSec: { type: Type.NUMBER },
            hook: { type: Type.STRING },
            retentionLoop: { type: Type.STRING },
            beats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  section: { type: Type.STRING },
                  spokenLine: { type: Type.STRING },
                  visualAction: { type: Type.STRING },
                  bRollCue: { type: Type.STRING },
                },
                required: ['timestamp', 'section', 'spokenLine', 'visualAction', 'bRollCue'],
              },
            },
            callToAction: { type: Type.STRING },
            pacingNotes: { type: Type.STRING },
          },
          required: [
            'title',
            'targetPlatform',
            'estimatedDurationSec',
            'hook',
            'retentionLoop',
            'beats',
            'callToAction',
            'pacingNotes',
          ],
        },
      },
    });

    const data = parseJsonSafe<Record<string, unknown>>(
      response.text,
      'No script returned from Gemini.'
    );
    const billing = recordSuccessfulGeneration(req);
    res.json({ ...data, billing });
  } catch (error) {
    handleApiError(res, error, 'create video script');
  }
});

// 3. Captions & Hashtags Generator
app.post('/api/generate/captions', requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const { videoSummary, niche, goal, cta } = req.body ?? {};
    if (!videoSummary || typeof videoSummary !== 'string' || !videoSummary.trim()) {
      return res.status(400).json({ error: 'Please provide a summary or transcript of your video.' });
    }

    const ai = getAiClient();
    const prompt = `You are a cross-platform social media growth strategist.
Write optimized captions, titles, SEO keywords, and strategic hashtags for TikTok, Instagram Reels, and YouTube based on this video:

Video Summary / Transcript: ${videoSummary.trim()}
Creator Niche: ${niche?.trim() || 'Creator Education & Storytelling'}
Post Goal: ${goal || 'Maximize saves, shares, and comments'}
Desired Call-to-Action: ${cta?.trim() || 'Encourage comments or saves'}

Rules:
- TikTok: punchy search-optimized caption + 4–6 targeted hashtags (mix of niche and broad) + SEO keywords.
- Instagram Reels: scroll-stopping first-line hook before the fold, engaging body caption, and 6–10 curated hashtags.
- YouTube Shorts / Video: clickable title under 65 characters, rich SEO description with natural keywords, and comma-ready video tags.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tiktok: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['caption', 'seoKeywords', 'hashtags'],
            },
            instagram: {
              type: Type.OBJECT,
              properties: {
                firstLineHook: { type: Type.STRING },
                caption: { type: Type.STRING },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['firstLineHook', 'caption', 'hashtags'],
            },
            youtube: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'description', 'tags'],
            },
          },
          required: ['tiktok', 'instagram', 'youtube'],
        },
      },
    });

    const data = parseJsonSafe<Record<string, unknown>>(
      response.text,
      'No captions returned from Gemini.'
    );
    const billing = recordSuccessfulGeneration(req);
    res.json({ ...data, billing });
  } catch (error) {
    handleApiError(res, error, 'generate captions and hashtags');
  }
});

// 4. Subtitle Generator (supports uploaded audio/video file OR pasted transcript/script)
app.post('/api/generate/subtitles', requireActiveSubscription, upload.single('media'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { transcriptText, durationSec = 45, maxWordsPerCue = 6, language = 'English' } = req.body ?? {};

    if (!file && (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim())) {
      return res.status(400).json({
        error: 'Upload a video/audio file or paste your spoken script/transcript to generate subtitles.',
      });
    }

    const ai = getAiClient();
    const wordsLimit = Math.min(Math.max(Number(maxWordsPerCue) || 6, 3), 12);

    let sourceTranscript = transcriptText?.trim() || '';

    // If audio file is uploaded, transcribe cleanly with gemini-3.5-transcribe first when audio/*
    if (file && file.mimetype.startsWith('audio/')) {
      const transcribeRes = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: file.mimetype,
                data: file.buffer.toString('base64'),
              },
            },
            {
              text: `Transcribe this audio verbatim in ${language}, including natural sentence punctuation.`,
            },
          ],
        },
      });
      if (transcribeRes.text) {
        sourceTranscript = transcribeRes.text.trim();
      }
    }

    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

    if (file && file.mimetype.startsWith('video/')) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    } else if (file && file.mimetype.startsWith('audio/') && !sourceTranscript) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    const instructionText = file
      ? `Analyze the uploaded media${sourceTranscript ? ` and its verbatim transcript below` : ''} and generate perfectly timed short-form subtitle cues in ${language}.
${sourceTranscript ? `Transcript:\n${sourceTranscript}\n` : ''}
Requirements:
- Keep each subtitle cue concise (${wordsLimit} words max per cue) for crisp vertical video readability.
- Provide exact startTime and endTime formatted as "00:00:01,200" (SRT format HH:MM:SS,mmm) plus numeric startSeconds and endSeconds.
- Ensure cues are strictly sequential and non-overlapping.
- Identify 1-2 high-impact emphasisWords per cue that should be highlighted visually.`
      : `Convert the following spoken script/transcript into timed short-form subtitle cues in ${language} across a ${Number(durationSec) || 45}-second speaking cadence (~145 words/minute).

Transcript:
${sourceTranscript}

Requirements:
- Keep each subtitle cue concise (${wordsLimit} words max per cue) for crisp vertical video readability.
- Format startTime and endTime as "00:00:01,200" (SRT format HH:MM:SS,mmm) plus numeric startSeconds and endSeconds.
- Ensure cues are strictly sequential and non-overlapping.
- Identify 1-2 high-impact emphasisWords per cue that should be highlighted visually.`;

    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            transcript: { type: Type.STRING },
            cues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  startSeconds: { type: Type.NUMBER },
                  endSeconds: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                  emphasisWords: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'index',
                  'startTime',
                  'endTime',
                  'startSeconds',
                  'endSeconds',
                  'text',
                  'emphasisWords',
                ],
              },
            },
          },
          required: ['detectedLanguage', 'transcript', 'cues'],
        },
      },
    });

    const data = parseJsonSafe<Record<string, unknown>>(
      response.text,
      'No subtitle cues returned from Gemini.'
    );
    const billing = recordSuccessfulGeneration(req);
    res.json({ ...data, billing });
  } catch (error) {
    handleApiError(res, error, 'generate subtitles');
  }
});

// 5. Long-to-Short Clip Repurposer (supports uploaded video/audio OR long-form transcript/outline)
app.post('/api/generate/clips', requireActiveSubscription, upload.single('media'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const {
      sourceText,
      totalDurationMinutes = 12,
      targetClipCount = 4,
      platforms = 'TikTok, Instagram Reels, YouTube Shorts',
    } = req.body ?? {};

    if (!file && (!sourceText || typeof sourceText !== 'string' || !sourceText.trim())) {
      return res.status(400).json({
        error: 'Upload a video/audio file or paste a long-form video transcript/outline to extract short clips.',
      });
    }

    const ai = getAiClient();
    const clipCount = Math.min(Math.max(Number(targetClipCount) || 4, 2), 8);

    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
    if (file) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    parts.push({
      text: `You are a viral short-form video editor repurposing a long-form video into ${clipCount} high-retention vertical clips for ${platforms}.
${file ? 'Analyze the uploaded media directly and extract the strongest standalone moments.' : `Analyze this long-form video transcript / outline (estimated total length: ${totalDurationMinutes} minutes):\n\n${sourceText.trim()}`}

For each extracted clip:
- Choose a self-contained segment between 20 and 58 seconds long that has a clear beginning, insight/story arc, and payoff.
- Provide accurate startTime and endTime ("MM:SS") along with numeric startSeconds and endSeconds.
- Write a bold, curiosity-driven hookOverlay (max 8 words) to display over the first 3 seconds of the 9:16 vertical frame.
- Provide the exact or tightly edited transcriptExcerpt for the clip, explain whyItWorks for short-form retention, recommend target platforms, and draft a ready-to-post suggestedCaption with 4–5 hashtags.`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sourceSummary: { type: Type.STRING },
            clips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  startSeconds: { type: Type.NUMBER },
                  endSeconds: { type: Type.NUMBER },
                  durationSec: { type: Type.NUMBER },
                  hookOverlay: { type: Type.STRING },
                  transcriptExcerpt: { type: Type.STRING },
                  whyItWorks: { type: Type.STRING },
                  recommendedPlatforms: { type: Type.ARRAY, items: { type: Type.STRING } },
                  suggestedCaption: { type: Type.STRING },
                  hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'id',
                  'title',
                  'startTime',
                  'endTime',
                  'startSeconds',
                  'endSeconds',
                  'durationSec',
                  'hookOverlay',
                  'transcriptExcerpt',
                  'whyItWorks',
                  'recommendedPlatforms',
                  'suggestedCaption',
                  'hashtags',
                ],
              },
            },
          },
          required: ['sourceSummary', 'clips'],
        },
      },
    });

    const data = parseJsonSafe<Record<string, unknown>>(
      response.text,
      'No short clips returned from Gemini.'
    );
    const billing = recordSuccessfulGeneration(req);
    res.json({ ...data, billing });
  } catch (error) {
    handleApiError(res, error, 'extract short clips');
  }
});

// Multer error middleware
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({
      error: `Upload error: ${err.message}. Maximum direct file upload size is 20 MB.`,
    });
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ViralFlow AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
