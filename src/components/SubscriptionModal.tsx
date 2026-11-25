import React, { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, RefreshCw, X } from 'lucide-react';
import { BillingStatus } from '../types/creator';
import { getAuthHeaders, parseApiJson, setWorkspaceToken } from '../utils/api';
import { subscribeWithPaddle } from '../utils/paddle';

interface SubscriptionModalProps {
  open: boolean;
  reason?: 'exhausted' | 'upgrade';
  billing: BillingStatus | null;
  onClose: () => void;
  onBillingUpdate: (next: BillingStatus) => void;
}

const PLAN_FEATURES = [
  'Unlimited AI generations across Hooks, Scripts, Captions, Subtitles & Short Clips',
  'Direct audio & video transcription up to 20 MB per file',
  'Built-in teleprompter, 9:16 caption preview & .SRT / .VTT / .JSON exports',
  'Instant cross-module handoffs from viral hooks to full production scripts',
];

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  open,
  reason = 'upgrade',
  billing,
  onClose,
  onBillingUpdate,
}) => {
  const [email, setEmail] = useState(billing?.customerEmail || '');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (billing?.customerEmail && !email) {
      setEmail(billing.customerEmail);
    }
  }, [billing?.customerEmail, email]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPendingNote(null);
      setSubmitting(false);
      setVerifying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !verifying) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, verifying, onClose]);

  if (!open) return null;

  const ensureWorkspaceReady = async (): Promise<BillingStatus> => {
    if (billing?.workspaceId) return billing;
    const res = await fetch('/api/billing/status', {
      headers: getAuthHeaders(),
    });
    const status = await parseApiJson<BillingStatus>(res, 'Unable to initialize workspace.');
    if (status.token) setWorkspaceToken(status.token);
    onBillingUpdate(status);
    return status;
  };

  const confirmTransactionWithServer = async (
    transactionId: string,
    customerEmail: string
  ) => {
    setVerifying(true);
    setError(null);
    setPendingNote(null);
    try {
      const res = await fetch('/api/billing/confirm', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ transactionId, email: customerEmail }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server did not return JSON confirmation.');
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
            'Checkout completed. Waiting for server verification to activate Pro.'
        );
        return;
      }
      if (!res.ok || !data.confirmed) {
        throw new Error(data.error || 'Could not confirm your subscription.');
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to verify Paddle transaction.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleRefreshStatus = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/status', {
        headers: getAuthHeaders(),
      });
      const status = await parseApiJson<BillingStatus>(res, 'Unable to refresh plan status.');
      if (status.token) setWorkspaceToken(status.token);
      onBillingUpdate(status);
      if (status.isSubscribed) {
        onClose();
      } else {
        setPendingNote(
          'Subscription is not active on this workspace yet. If you just completed payment, wait a few seconds for Paddle webhook delivery and refresh again.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh billing status.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address for your Paddle receipt and account.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setPendingNote(null);

    try {
      const activeBilling = await ensureWorkspaceReady();
      await subscribeWithPaddle({
        email: trimmedEmail,
        workspaceId: activeBilling.workspaceId,
        onComplete: async ({ transactionId, customerEmail }) => {
          setSubmitting(false);
          if (transactionId) {
            await confirmTransactionWithServer(
              transactionId,
              customerEmail || trimmedEmail
            );
          } else {
            await handleRefreshStatus();
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

  const trialUsed = billing?.trialUsed ?? 0;
  const trialLimit = billing?.trialLimit ?? 3;
  const trialRemaining =
    billing?.trialRemaining ?? Math.max(0, trialLimit - trialUsed);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0D121C] text-slate-100 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span>ViralFlow Pro</span>
              <span aria-hidden="true">·</span>
              <span>
                {billing?.isSubscribed
                  ? 'Active subscription'
                  : `${trialUsed} of ${trialLimit} free generations used`}
              </span>
            </div>
            <h2
              id="subscription-modal-title"
              className="font-display text-2xl font-bold tracking-tight text-white"
            >
              {reason === 'exhausted'
                ? 'Your 3 free studio runs are complete'
                : 'Upgrade to ViralFlow Pro'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting || verifying}
            aria-label="Close subscription dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-100">
              For active TikTok, Instagram &amp; YouTube creators
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              {reason === 'exhausted'
                ? 'Subscribe via Paddle to unlock unlimited studio generations across every creator tool.'
                : `You have ${trialRemaining} free generation${trialRemaining === 1 ? '' : 's'} remaining. Upgrade anytime for unlimited production runs.`}
            </p>
          </div>

          <ul className="space-y-2.5 border-y border-white/10 py-4 text-sm text-slate-200">
            {PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{feature}</span>
              </li>
            ))}
          </ul>

          <form onSubmit={handleSubscribe} className="space-y-4">
            <div>
              <label
                htmlFor="paddle-checkout-email"
                className="block text-sm font-medium text-slate-200 mb-1.5"
              >
                Billing email
              </label>
              <input
                id="paddle-checkout-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@creatorstudio.com"
                disabled={submitting || verifying}
                className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            {pendingNote && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3.5 py-3 text-sm text-amber-200 space-y-2.5">
                <p className="leading-relaxed">{pendingNote}</p>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={verifying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
                  Refresh Subscription Status
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || verifying}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0"
              >
                {reason === 'exhausted' ? 'Not now' : 'Keep Free Trial'}
              </button>
              <button
                type="submit"
                disabled={submitting || verifying}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {(submitting || verifying) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {verifying
                  ? 'Verifying payment...'
                  : submitting
                  ? 'Opening Paddle...'
                  : 'Subscribe with Paddle'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
