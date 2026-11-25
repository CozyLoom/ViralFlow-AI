import React, { useEffect, useState } from 'react';
import {
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
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
  onEnterStudio: () => void;
}

const INCLUDED_MODULES = [
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
  onEnterStudio,
}) => {
  const [email, setEmail] = useState(billing?.customerEmail || '');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (billing?.customerEmail && !email) {
      setEmail(billing.customerEmail);
    }
  }, [billing?.customerEmail, email]);

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
          setSuccessNote('Payment verified. All studio tools are now unlocked.');
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
    customerEmail: string
  ) => {
    setVerifying(true);
    setError(null);
    setPendingNote(null);
    setSuccessNote(null);
    try {
      const res = await apiFetch('/api/billing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, email: customerEmail }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'The backend billing server is not running on this host.'
        );
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
            'Checkout completed. Waiting for Paddle webhook confirmation to unlock the app automatically...'
        );
        return;
      }
      if (!res.ok || !data.confirmed) {
        throw new Error(data.error || 'Could not confirm your subscription.');
      }
      setSuccessNote('Payment verified. All studio tools are now unlocked.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to verify Paddle transaction.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleRefreshStatus = async () => {
    setSyncing(true);
    setError(null);
    setSuccessNote(null);
    try {
      const res = await apiFetch('/api/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await parseApiJson<{ billing: BillingStatus }>(
        res,
        'Unable to refresh subscription status.'
      );
      if (data.billing.token) setWorkspaceToken(data.billing.token);
      onBillingUpdate(data.billing);
      if (data.billing.isSubscribed) {
        setPendingNote(null);
        setSuccessNote('Subscription status synced.');
      } else {
        setPendingNote(
          'No active subscription found for this workspace yet. Complete payment below or wait a few seconds for Paddle webhook confirmation.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to refresh subscription status.'
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address for your Paddle receipt and subscription.');
      return;
    }

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

      await subscribeWithPaddle({
        email: trimmedEmail,
        workspaceId: activeBilling.workspaceId,
        transactionId: checkoutData.transactionId,
        onComplete: async ({ transactionId, customerEmail }) => {
          setSubmitting(false);
          const resolvedTxnId = transactionId || checkoutData.transactionId;
          if (resolvedTxnId) {
            await confirmTransactionWithServer(
              resolvedTxnId,
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

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid billing email address.');
      return;
    }
    setSavingEmail(true);
    setError(null);
    setSuccessNote(null);
    try {
      const res = await apiFetch('/api/billing/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await parseApiJson<{ billing: BillingStatus }>(
        res,
        'Unable to update billing email.'
      );
      onBillingUpdate(data.billing);
      setSuccessNote('Billing email updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update billing email.');
    } finally {
      setSavingEmail(false);
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
          ? `Subscription scheduled to end on ${formatDateLabel(data.billing.cancelAt)}.`
          : 'Subscription cancellation processed.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel subscription.');
    } finally {
      setCanceling(false);
    }
  };

  if (billingLoading && !billing) {
    return (
      <div className="max-w-3xl mx-auto py-16">
        <div className="rounded-2xl border border-white/10 bg-[#0D121C] p-10 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-rose-400 mx-auto" />
          <h2 className="font-display text-xl font-semibold text-white">
            Checking Subscription Status
          </h2>
          <p className="text-sm text-slate-400">
            Verifying workspace access before loading studio modules.
          </p>
        </div>
      </div>
    );
  }

  const isSubscribed = Boolean(billing?.isSubscribed);
  const freeLimit = billing?.freeLimit ?? 3;
  const freeUsed = billing?.freeUsed ?? 0;
  const freeRemaining = billing?.freeRemaining ?? freeLimit;
  const inTrial = Boolean(billing && !isSubscribed && freeRemaining > 0);
  const nextBilledLabel = formatDateLabel(billing?.nextBilledAt);
  const cancelAtLabel = formatDateLabel(billing?.cancelAt);

  // Trial / Subscription Activation View
  if (!isSubscribed) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {blockedNotice && (
          <div
            role="status"
            className="rounded-xl border border-amber-500/35 bg-amber-950/35 px-5 py-3.5 text-sm text-amber-200 flex items-center gap-3"
          >
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{blockedNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Trial Status, Plan Details & What Unlocks */}
          <section className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0D121C] p-7 sm:p-8 flex flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-400 tabular-nums">
                {inTrial ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Free Trial Active
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {freeRemaining} of {freeLimit} free generations left
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-amber-300">
                      <Lock className="w-3.5 h-3.5" />
                      App Locked
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {freeUsed} / {freeLimit} Trial Used
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {billing?.planStatus === 'canceled'
                        ? 'Subscription Canceled'
                        : billing?.planStatus === 'past_due'
                        ? 'Payment Past Due'
                        : 'Subscription Required'}
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                  {inTrial
                    ? 'Try ViralFlow free, then activate Pro'
                    : billing?.planStatus === 'canceled'
                    ? 'Reactivate ViralFlow Pro to continue'
                    : 'Your 3-generation free trial is complete'}
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  {inTrial
                    ? `You have ${freeRemaining} free studio ${
                        freeRemaining === 1 ? 'generation' : 'generations'
                      } remaining across all five creator tools. Activate ViralFlow Pro anytime for unlimited access.`
                    : 'You have used all 3 free trial generations. Complete your Paddle subscription payment to unlock unlimited hooks, scripts, captions, subtitles, and short clips.'}
                </p>
              </div>

              {billing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                    <span>Free trial usage</span>
                    <span>
                      {freeUsed} / {freeLimit} used
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: freeLimit }).map((_, idx) => {
                      const used = idx < freeUsed;
                      return (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full ${
                            used ? 'bg-amber-400' : 'bg-emerald-500/75'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-white/10 pt-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400">
                  Included with ViralFlow Pro
                </p>
                <ul className="space-y-2.5 text-sm text-slate-200">
                  {INCLUDED_MODULES.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {billing?.workspaceId && (
              <div className="border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 tabular-nums">
                <span>Workspace ID</span>
                <span className="font-mono text-slate-300">{billing.workspaceId}</span>
              </div>
            )}
          </section>

          {/* Right: Paddle Payment Form */}
          <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0D121C] p-7 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-xl font-semibold text-white">
                  Activate Subscription
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {inTrial
                    ? 'Upgrade early or keep building with your remaining free runs.'
                    : 'Unlimited studio access opens automatically once your Paddle payment is confirmed.'}
                </p>
              </div>

              <form onSubmit={handleSubscribe} className="space-y-4">
                <div>
                  <label
                    htmlFor="subscription-email"
                    className="block text-sm font-medium text-slate-200 mb-1.5"
                  >
                    Billing email
                  </label>
                  <input
                    id="subscription-email"
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
                  <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3.5 py-3 text-sm text-amber-200 leading-relaxed">
                    {pendingNote}
                  </div>
                )}

                <button
                  type="submit"
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
                    : inTrial
                    ? 'Activate Pro Subscription'
                    : 'Subscribe & Unlock App'}
                </button>

                {inTrial && (
                  <button
                    type="button"
                    onClick={onEnterStudio}
                    className="w-full inline-flex items-center justify-center rounded-lg border border-white/10 bg-[#070A10] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
                  >
                    Continue Free Trial ({freeRemaining} left)
                  </button>
                )}
              </form>
            </div>

            <div className="border-t border-white/10 pt-5 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Already completed payment?</span>
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={syncing || verifying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#070A10] text-xs font-medium text-slate-200 hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Checking...' : 'Check Status'}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Unlocked View: Subscription Management Console
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#0D121C] p-7 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                {billing?.planStatus === 'past_due' ? 'Past Due' : 'Active Subscription'}
              </span>
              {cancelAtLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">Ends {cancelAtLabel}</span>
                </>
              )}
              {nextBilledLabel && !cancelAtLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">Renews {nextBilledLabel}</span>
                </>
              )}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              ViralFlow Pro
            </h2>
            <p className="text-sm text-slate-400">
              Manage your subscription status, billing email, payment method, and cancellation preferences.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefreshStatus}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#070A10] text-xs font-medium text-slate-200 hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Status'}
            </button>
            <button
              type="button"
              onClick={onEnterStudio}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
            >
              Open Production Studio
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {successNote && (
          <div
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
          >
            {successNote}
          </div>
        )}

        {/* Subscription Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Plan &amp; Billing Record</h3>
            <dl className="divide-y divide-white/10 text-sm border-y border-white/10">
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Status</dt>
                <dd className="font-medium text-emerald-400 capitalize">
                  {billing?.planStatus || 'active'}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Next billing date</dt>
                <dd className="text-slate-200 tabular-nums">
                  {cancelAtLabel
                    ? `Scheduled end: ${cancelAtLabel}`
                    : nextBilledLabel || 'Managed by Paddle'}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Workspace ID</dt>
                <dd className="font-mono text-xs text-slate-300 truncate max-w-[230px]">
                  {billing?.workspaceId}
                </dd>
              </div>
              {billing?.paddleSubscriptionId && (
                <div className="py-3 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">Subscription ID</dt>
                  <dd className="font-mono text-xs text-slate-300 truncate max-w-[230px]">
                    {billing.paddleSubscriptionId}
                  </dd>
                </div>
              )}
              {billing?.lastTransactionId && (
                <div className="py-3 flex items-center justify-between gap-4">
                  <dt className="text-slate-400">Last Transaction</dt>
                  <dd className="font-mono text-xs text-slate-300 truncate max-w-[230px]">
                    {billing.lastTransactionId}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="space-y-6">
            <form onSubmit={handleSaveEmail} className="space-y-3">
              <label
                htmlFor="manage-billing-email"
                className="block text-sm font-semibold text-white"
              >
                Billing Email
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="manage-billing-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@creatorstudio.com"
                  className="flex-1 rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={savingEmail}
                  className="px-4 py-2 rounded-lg border border-white/10 bg-[#070A10] text-xs font-semibold text-white hover:bg-white/[0.06] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {savingEmail ? 'Saving...' : 'Save Email'}
                </button>
              </div>
            </form>

            <div className="border-t border-white/10 pt-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Payment &amp; Plan Actions</h3>
              <div className="flex flex-wrap items-center gap-3">
                {billing?.managementUrls?.updatePaymentMethod && (
                  <a
                    href={billing.managementUrls.updatePaymentMethod}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#070A10] text-xs font-medium text-slate-200 hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
                  >
                    Update Payment Method
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                {!cancelAtLabel && (
                  <button
                    type="button"
                    onClick={() => setConfirmCancelOpen((v) => !v)}
                    className="px-3.5 py-2 rounded-lg border border-red-500/35 text-xs font-medium text-red-300 hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>

              {confirmCancelOpen && (
                <div className="rounded-xl border border-red-500/35 bg-red-950/25 p-4 space-y-3">
                  <div className="flex items-start gap-2.5 text-xs text-red-200 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      Your subscription will cancel at the end of the current billing period. Once ended, studio tools will lock until reactivated.
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
                      Keep Plan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
