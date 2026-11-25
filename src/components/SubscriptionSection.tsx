import React, { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { BillingStatus } from '../types/creator';
import { apiFetch, parseApiJson, setWorkspaceToken } from '../utils/api';
import {
  PADDLE_CLIENT_TOKEN,
  PADDLE_PRICE_ID,
  subscribeWithPaddle,
} from '../utils/paddle';

interface SubscriptionSectionProps {
  billing: BillingStatus | null;
  billingLoading: boolean;
  blockedNotice?: string | null;
  onBillingUpdate: (next: BillingStatus) => void;
  onEnterStudio?: () => void;
}

const PRO_PACKAGE_FEATURES = [
  'Viral Hooks — 3-second opening hooks, text overlays & camera cues',
  'Video Scripts — Timestamped beat sheets & auto-scrolling teleprompter',
  'Captions & Tags — Platform-native SEO copy for TikTok, Reels & YouTube',
  'Subtitle Studio — Audio/video transcription, 9:16 preview & .SRT / .VTT export',
  'Short Clips — Long-form video repurposer with cut markers & overlays',
];

function formatDateLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const SubscriptionSection: React.FC<SubscriptionSectionProps> = ({
  billing,
  billingLoading,
  blockedNotice,
  onBillingUpdate,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingNote || billing?.isSubscribed) return;

    let attempts = 0;
    const maxAttempts = 16;
    const interval = window.setInterval(async () => {
      attempts += 1;
      try {
        const res = await apiFetch('/api/billing/status?sync=1');
        const status = await parseApiJson<BillingStatus>(
          res,
          'Unable to verify subscription status.'
        );
        if (status.token) setWorkspaceToken(status.token);
        if (status.isSubscribed) {
          window.clearInterval(interval);
          setPendingNote(null);
          setSuccessNote('Pro subscription active.');
          onBillingUpdate(status);
        }
      } catch {
        // Keep polling until maxAttempts
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [pendingNote, billing?.isSubscribed, onBillingUpdate]);

  const ensureWorkspaceReady = async (): Promise<BillingStatus> => {
    if (billing?.workspaceId) return billing;
    const res = await apiFetch('/api/billing/status');
    const status = await parseApiJson<BillingStatus>(
      res,
      'Unable to initialize billing workspace.'
    );
    if (status.token) setWorkspaceToken(status.token);
    onBillingUpdate(status);
    return status;
  };

  const confirmTransactionWithServer = async (
    transactionId: string,
    customerEmail?: string
  ) => {
    setVerifying(true);
    setError(null);
    setPendingNote(null);
    setSuccessNote(null);
    try {
      const res = await apiFetch('/api/billing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          ...(customerEmail ? { email: customerEmail } : {}),
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The backend billing server is not running on this host.');
      }
      const data = (await res.json()) as {
        confirmed?: boolean;
        pending?: boolean;
        error?: string;
        billing?: BillingStatus;
      };
      if (data.billing) {
        if (data.billing.token) setWorkspaceToken(data.billing.token);
        onBillingUpdate(data.billing);
      }
      if (res.status === 202 || data.pending) {
        setPendingNote(
          data.error ||
            'Checkout completed. Waiting for Paddle webhook confirmation...'
        );
        return;
      }
      if (!res.ok || !data.confirmed) {
        throw new Error(data.error || 'Could not confirm your subscription.');
      }
      setSuccessNote('Pro subscription active.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to verify Paddle transaction.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const syncStatusAfterCheckout = async () => {
    try {
      const res = await apiFetch('/api/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await parseApiJson<{ billing: BillingStatus }>(
        res,
        'Unable to verify subscription status.'
      );
      if (data.billing.token) setWorkspaceToken(data.billing.token);
      onBillingUpdate(data.billing);
      if (!data.billing.isSubscribed) {
        setPendingNote(
          'Checkout submitted. Waiting for Paddle confirmation...'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to verify subscription status.'
      );
    }
  };

  const handleSubscribe = async () => {
    setSubmitting(true);
    setError(null);
    setPendingNote(null);
    setSuccessNote(null);

    try {
      const activeBilling = await ensureWorkspaceReady();
      const checkoutRes = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: PADDLE_PRICE_ID,
          clientEnv: PADDLE_CLIENT_TOKEN.startsWith('test_') ? 'sandbox' : 'live',
        }),
      });
      const checkoutData = await parseApiJson<{
        transactionId?: string;
        fallbackToClientItems?: boolean;
        billing?: BillingStatus;
      }>(checkoutRes, 'Unable to initialize Paddle checkout.');

      if (checkoutData.billing) {
        onBillingUpdate(checkoutData.billing);
      }

      const prefillEmail =
        activeBilling.customerEmail || activeBilling.account?.email || undefined;

      await subscribeWithPaddle({
        email: prefillEmail,
        workspaceId: activeBilling.workspaceId,
        transactionId: checkoutData.transactionId,
        onComplete: async ({ transactionId, customerEmail }) => {
          setSubmitting(false);
          const resolvedTxnId = transactionId || checkoutData.transactionId;
          if (resolvedTxnId) {
            await confirmTransactionWithServer(
              resolvedTxnId,
              customerEmail || prefillEmail
            );
          } else {
            await syncStatusAfterCheckout();
          }
        },
        onClose: () => {
          setSubmitting(false);
        },
        onError: (msg) => {
          setSubmitting(false);
          setError(msg);
        },
      });
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof Error ? err.message : 'Unable to launch Paddle checkout.'
      );
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    setError(null);
    setSuccessNote(null);
    try {
      const res = await apiFetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveFrom: 'next_billing_period' }),
      });
      const data = await parseApiJson<{ canceled?: boolean; billing: BillingStatus }>(
        res,
        'Unable to cancel subscription.'
      );
      onBillingUpdate(data.billing);
      setConfirmCancelOpen(false);
      setSuccessNote(
        data.billing.cancelAt
          ? `Pro subscription scheduled to end on ${formatDateLabel(data.billing.cancelAt)}.`
          : 'Pro subscription canceled.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel subscription.');
    } finally {
      setCanceling(false);
    }
  };

  if (billingLoading && !billing) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="rounded-2xl border border-white/10 bg-[#0D121C] p-10 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-rose-400 mx-auto" />
          <p className="text-sm text-slate-300">Loading Pro package...</p>
        </div>
      </div>
    );
  }

  const isSubscribed = Boolean(billing?.isSubscribed);
  const nextBilledLabel = formatDateLabel(billing?.nextBilledAt);
  const cancelAtLabel = formatDateLabel(billing?.cancelAt);

  return (
    <div className="max-w-xl mx-auto py-4 space-y-5">
      {!isSubscribed && blockedNotice && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/35 bg-amber-950/35 px-5 py-3.5 text-sm text-amber-200 flex items-center gap-3"
        >
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{blockedNotice}</span>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-[#0D121C] p-7 sm:p-8 space-y-6">
        <div className="space-y-2 border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
            <span>Package Type</span>
            <span aria-hidden="true">·</span>
            <span className="text-rose-400">Pro</span>
            {isSubscribed && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {cancelAtLabel
                    ? `Active until ${cancelAtLabel}`
                    : nextBilledLabel
                    ? `Active · Renews ${nextBilledLabel}`
                    : 'Active'}
                </span>
              </>
            )}
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight text-white">
            Pro
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Unlimited access to every creator studio suite after your 3 free trial runs.
          </p>
        </div>

        <ul className="space-y-3 text-sm text-slate-200">
          {PRO_PACKAGE_FEATURES.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{item}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {pendingNote && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3.5 py-3 text-sm text-amber-200 leading-relaxed">
            {pendingNote}
          </div>
        )}

        {successNote && (
          <div
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200"
          >
            {successNote}
          </div>
        )}

        <div className="pt-2 space-y-3">
          {!isSubscribed ? (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={submitting || verifying}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {submitting || verifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              {verifying
                ? 'Verifying payment...'
                : submitting
                ? 'Opening Paddle checkout...'
                : 'Subscribe to Pro'}
            </button>
          ) : (
            !cancelAtLabel && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmCancelOpen((v) => !v)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/35 px-5 py-2.5 text-sm font-medium text-red-300 hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel Pro Subscription
                </button>

                {confirmCancelOpen && (
                  <div className="rounded-xl border border-red-500/35 bg-red-950/25 p-4 space-y-3">
                    <div className="flex items-start gap-2.5 text-xs text-red-200 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>
                        Your Pro package will stay active until the end of the current billing period.
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleCancelSubscription}
                        disabled={canceling}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                      >
                        {canceling ? 'Canceling...' : 'Confirm Cancellation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelOpen(false)}
                        disabled={canceling}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                      >
                        Keep Pro
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
};
