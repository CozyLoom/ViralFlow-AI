import React, { useEffect, useState } from 'react';
import {
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Film,
  KeyRound,
  Loader2,
  LogOut,
  Save,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  AvatarPreset,
  BillingStatus,
  Platform,
  UserAccount,
} from '../types/creator';
import { apiFetch, parseApiJson, setWorkspaceToken } from '../utils/api';
import { AVATAR_OPTIONS, getAvatarImage, getInitials } from '../utils/avatars';
import studioHeroCinemaImg from '../assets/images/studio_hero_cinema_1795500268220.jpg';
import cinemaOpticsImg from '../assets/images/cinema_optics_desk_1795500270761.jpg';

interface AccountSectionProps {
  account: UserAccount | null;
  billing: BillingStatus | null;
  onAccountUpdate: (account: UserAccount | null, billing?: BillingStatus) => void;
  onOpenSubscription: () => void;
  onOpenStudio: () => void;
}

const PLATFORMS: Platform[] = [
  'TikTok',
  'Instagram Reels',
  'YouTube Shorts',
  'YouTube Long-Form',
];

function formatMemberDate(iso?: string): string {
  if (!iso) return 'Today';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Today';
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
  });
}

export const AccountSection: React.FC<AccountSectionProps> = ({
  account,
  billing,
  onAccountUpdate,
  onOpenSubscription,
  onOpenStudio,
}) => {
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [showPassword, setShowPassword] = useState(false);

  // Auth form state
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [niche, setNiche] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState<Platform>('TikTok');
  const [avatarPreset, setAvatarPreset] = useState<AvatarPreset>('studio');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile editor state (when signed in)
  const [profileName, setProfileName] = useState(account?.displayName || '');
  const [profileHandle, setProfileHandle] = useState(account?.handle || '');
  const [profileNiche, setProfileNiche] = useState(account?.niche || '');
  const [profilePlatform, setProfilePlatform] = useState<Platform>(
    account?.primaryPlatform || 'TikTok'
  );
  const [profileBio, setProfileBio] = useState(account?.bio || '');
  const [profileAvatar, setProfileAvatar] = useState<AvatarPreset>(
    account?.avatarPreset || 'studio'
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSecurityPasswords, setShowSecurityPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (account) {
      setProfileName(account.displayName);
      setProfileHandle(account.handle);
      setProfileNiche(account.niche);
      setProfilePlatform(account.primaryPlatform);
      setProfileBio(account.bio);
      setProfileAvatar(account.avatarPreset);
    }
  }, [account]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAuthError('Enter a valid email address.');
      return;
    }

    if (authMode === 'register') {
      if (displayName.trim().length < 2) {
        setAuthError('Enter your creator or studio name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setAuthError('Choose a password with at least 8 characters.');
        return;
      }
    } else if (!password) {
      setAuthError('Enter your account password.');
      return;
    }

    setAuthLoading(true);
    try {
      const endpoint =
        authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        authMode === 'register'
          ? {
              email: cleanEmail,
              password,
              displayName: displayName.trim(),
              handle: handle.trim(),
              niche: niche.trim(),
              primaryPlatform,
              avatarPreset,
            }
          : {
              email: cleanEmail,
              password,
            };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson<{
        account: UserAccount;
        billing: BillingStatus;
      }>(
        res,
        authMode === 'register'
          ? 'Unable to create your account.'
          : 'Unable to sign in.'
      );

      if (data.billing?.token) {
        setWorkspaceToken(data.billing.token);
      }
      setPassword('');
      onAccountUpdate(data.account, data.billing);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Authentication failed.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileNotice(null);

    if (profileName.trim().length < 2) {
      setProfileError('Display name must be at least 2 characters.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await apiFetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profileName.trim(),
          handle: profileHandle.trim(),
          niche: profileNiche.trim(),
          primaryPlatform: profilePlatform,
          bio: profileBio.trim(),
          avatarPreset: profileAvatar,
        }),
      });
      const data = await parseApiJson<{
        account: UserAccount;
        billing: BillingStatus;
      }>(res, 'Unable to update creator profile.');

      onAccountUpdate(data.account, data.billing);
      setProfileNotice('Creator profile updated.');
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Unable to save profile.'
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await apiFetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await parseApiJson<{ updated: boolean }>(
        res,
        'Unable to update password.'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Password updated.');
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Unable to update password.'
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      const data = await parseApiJson<{
        signedOut: boolean;
        billing: BillingStatus;
      }>(res, 'Unable to sign out.');
      if (data.billing?.token) {
        setWorkspaceToken(data.billing.token);
      }
      onAccountUpdate(null, data.billing);
    } catch {
      onAccountUpdate(null);
    } finally {
      setSigningOut(false);
    }
  };

  const freeLimit = billing?.freeLimit ?? 3;
  const freeRemaining = billing?.freeRemaining ?? freeLimit;
  const isSubscribed = Boolean(billing?.isSubscribed);
  const canUseApp = Boolean(billing?.canUseApp);

  // Signed-Out View: Create Account / Sign In
  if (!account) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Visual Studio Identity Showcase */}
          <section className="lg:col-span-6 rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C] flex flex-col justify-between">
            <div className="relative h-56 sm:h-64 bg-[#070A10] shrink-0">
              {!imgErrors.showcase ? (
                <img
                  src={cinemaOpticsImg}
                  alt="Creator cinema optics and desk workspace"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setImgErrors((prev) => ({ ...prev, showcase: true }))
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#0D121C] to-black flex items-center justify-center">
                  <Film className="w-10 h-10 text-slate-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D121C] via-[#0D121C]/45 to-transparent pointer-events-none" />
              <div className="absolute bottom-5 left-7 right-7">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
                  <span>Creator Account</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {isSubscribed
                      ? 'Pro Subscription Linked'
                      : `${freeRemaining} of ${freeLimit} Free Runs Ready`}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-7 sm:p-8 flex-1 flex flex-col justify-between gap-8">
              <div className="space-y-3">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white text-balance leading-[1.12]">
                  Build your creator profile across every studio suite.
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  Save your handle, platform focus, and content niche while keeping your 3-generation free trial and Paddle Pro subscription synced in one place.
                </p>
              </div>

              <div className="divide-y divide-white/10 border-t border-white/10 text-sm">
                <div className="py-4">
                  <h3 className="font-semibold text-white">
                    01. Fresh 3-Run Trial &amp; Pro Access
                  </h3>
                  <p className="text-slate-400 mt-1 text-xs sm:text-sm leading-relaxed">
                    Every newly created account starts with a fresh 3-generation free trial, and any Paddle Pro subscription links straight to your account.
                  </p>
                </div>
                <div className="py-4">
                  <h3 className="font-semibold text-white">
                    02. Studio Voice &amp; Platform Defaults
                  </h3>
                  <p className="text-slate-400 mt-1 text-xs sm:text-sm leading-relaxed">
                    Set your primary network and niche once to keep hooks, scripts, and SEO captions tailored to your channel.
                  </p>
                </div>
                <div className="pt-4">
                  <h3 className="font-semibold text-white">
                    03. Private Credential Security
                  </h3>
                  <p className="text-slate-400 mt-1 text-xs sm:text-sm leading-relaxed">
                    Passwords are salted and hashed on the server, and billing email stays synced with your Paddle receipts.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right: Create Account / Sign In Form */}
          <section className="lg:col-span-6 rounded-2xl border border-white/10 bg-[#0D121C] p-7 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-white">
                    {authMode === 'register'
                      ? 'Create Creator Account'
                      : 'Sign In'}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {authMode === 'register'
                      ? 'Set up your studio profile in under a minute.'
                      : 'Welcome back. Access your saved creator profile and plan.'}
                  </p>
                </div>

                <div
                  role="tablist"
                  aria-label="Account authentication mode"
                  className="flex items-center gap-1 p-1 bg-[#070A10] border border-white/10 rounded-lg shrink-0"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'register'}
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      authMode === 'register'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'login'}
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      authMode === 'login'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sign In
                  </button>
                </div>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <>
                    <div>
                      <span className="block text-xs font-medium text-slate-400 mb-2">
                        Choose profile portrait
                      </span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {AVATAR_OPTIONS.map((opt) => {
                          const selected = avatarPreset === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAvatarPreset(opt.id)}
                              className={`flex items-center gap-2 pr-3 pl-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                selected
                                  ? 'border-rose-500 bg-rose-500/15 text-white'
                                  : 'border-white/10 bg-[#070A10] text-slate-300 hover:border-white/25'
                              }`}
                            >
                              {opt.src && !imgErrors[`opt-${opt.id}`] ? (
                                <img
                                  src={opt.src}
                                  alt={opt.label}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setImgErrors((prev) => ({
                                      ...prev,
                                      [`opt-${opt.id}`]: true,
                                    }))
                                  }
                                  className="w-6 h-6 rounded-md object-cover shrink-0"
                                />
                              ) : (
                                <span className="w-6 h-6 rounded-md bg-slate-800 text-slate-200 text-[11px] font-semibold flex items-center justify-center shrink-0">
                                  {getInitials(displayName)}
                                </span>
                              )}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="auth-display-name"
                          className="block text-sm font-medium text-slate-200 mb-1.5"
                        >
                          Display name
                        </label>
                        <input
                          id="auth-display-name"
                          type="text"
                          required
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Maya Lin"
                          className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="auth-handle"
                          className="block text-sm font-medium text-slate-200 mb-1.5"
                        >
                          Creator handle
                        </label>
                        <input
                          id="auth-handle"
                          type="text"
                          value={handle}
                          onChange={(e) => setHandle(e.target.value)}
                          placeholder="@mayalin.studio"
                          className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-sm font-medium text-slate-200 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@creatorstudio.com"
                    className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-medium text-slate-200 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={authMode === 'register' ? 8 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        authMode === 'register'
                          ? 'At least 8 characters'
                          : 'Enter your password'
                      }
                      className="w-full rounded-lg border border-slate-700 bg-[#070A10] pl-3.5 pr-11 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {authMode === 'register' && (
                  <>
                    <div>
                      <span className="block text-sm font-medium text-slate-200 mb-1.5">
                        Primary platform
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#070A10] border border-white/10 rounded-lg">
                        {PLATFORMS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPrimaryPlatform(p)}
                            className={`px-2.5 py-2 text-xs font-medium rounded-md transition-colors truncate ${
                              primaryPlatform === p
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {p.replace('Instagram ', 'IG ').replace('YouTube ', 'YT ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="auth-niche"
                        className="block text-sm font-medium text-slate-200 mb-1.5"
                      >
                        Content niche <span className="text-slate-500 font-normal">(optional)</span>
                      </label>
                      <input
                        id="auth-niche"
                        type="text"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        placeholder="Filmmaking, Tech Reviews, Fitness Coaching..."
                        className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                      />
                    </div>
                  </>
                )}

                {authError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300"
                  >
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {authLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : authMode === 'register' ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  {authLoading
                    ? authMode === 'register'
                      ? 'Creating account...'
                      : 'Signing in...'
                    : authMode === 'register'
                    ? 'Create Creator Account'
                    : 'Sign In to Studio'}
                </button>
              </form>
            </div>

            <div className="border-t border-white/10 pt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                {canUseApp
                  ? 'Prefer to explore first?'
                  : 'Need to activate your plan?'}
              </span>
              <button
                type="button"
                onClick={canUseApp ? onOpenStudio : onOpenSubscription}
                className="font-semibold text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap shrink-0"
              >
                {canUseApp ? 'Back to Studio' : 'Go to Subscription'}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Signed-In View: Creator Profile & Account Console
  const activeAvatarSrc = getAvatarImage(profileAvatar);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Profile Banner */}
      <section className="rounded-2xl overflow-hidden border border-white/10 bg-[#0D121C]">
        <div className="relative h-36 sm:h-44 bg-[#070A10]">
          {!imgErrors.banner ? (
            <img
              src={studioHeroCinemaImg}
              alt="Creator studio backdrop"
              referrerPolicy="no-referrer"
              onError={() =>
                setImgErrors((prev) => ({ ...prev, banner: true }))
              }
              className="w-full h-full object-cover opacity-70"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-slate-900 via-[#0D121C] to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D121C] via-[#0D121C]/50 to-transparent pointer-events-none" />
        </div>

        <div className="px-6 sm:px-8 pb-7 -mt-10 relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 min-w-0">
            {activeAvatarSrc && !imgErrors[`profile-${profileAvatar}`] ? (
              <img
                src={activeAvatarSrc}
                alt={account.displayName}
                referrerPolicy="no-referrer"
                onError={() =>
                  setImgErrors((prev) => ({
                    ...prev,
                    [`profile-${profileAvatar}`]: true,
                  }))
                }
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-[#0D121C] ring-1 ring-white/20 bg-[#070A10] shrink-0"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-[#0D121C] ring-1 ring-white/20 bg-slate-800 text-white font-display text-2xl font-bold flex items-center justify-center shrink-0">
                {getInitials(account.displayName)}
              </div>
            )}

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-400">
                <span className="font-mono text-slate-300">{account.handle}</span>
                <span aria-hidden="true">·</span>
                <span>{account.primaryPlatform}</span>
                {account.niche && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-[220px]">{account.niche}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>Joined {formatMemberDate(account.createdAt)}</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
                {account.displayName}
              </h2>
              {account.bio && (
                <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                  {account.bio}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={canUseApp ? onOpenStudio : onOpenSubscription}
              className="px-4 py-2 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
            >
              {canUseApp ? 'Open Studio' : 'Activate Subscription'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#070A10] text-xs font-medium text-slate-200 hover:bg-white/[0.06] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </section>

      {/* Two-Column Profile Editor + Account & Security */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Creator Profile & Defaults */}
        <section className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0D121C] p-6 sm:p-8 space-y-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="font-display text-xl font-semibold text-white">
              Creator Profile &amp; Studio Defaults
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Customize how your workspace appears and pre-set your primary creative focus.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div>
              <span className="block text-xs font-medium text-slate-400 mb-2">
                Profile portrait
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {AVATAR_OPTIONS.map((opt) => {
                  const selected = profileAvatar === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setProfileAvatar(opt.id)}
                      className={`flex items-center gap-2 pr-3 pl-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? 'border-rose-500 bg-rose-500/15 text-white'
                          : 'border-white/10 bg-[#070A10] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {opt.src && !imgErrors[`edit-${opt.id}`] ? (
                        <img
                          src={opt.src}
                          alt={opt.label}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setImgErrors((prev) => ({
                              ...prev,
                              [`edit-${opt.id}`]: true,
                            }))
                          }
                          className="w-6 h-6 rounded-md object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-md bg-slate-800 text-slate-200 text-[11px] font-semibold flex items-center justify-center shrink-0">
                          {getInitials(profileName)}
                        </span>
                      )}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="block text-sm font-medium text-slate-200 mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-handle"
                  className="block text-sm font-medium text-slate-200 mb-1.5"
                >
                  Creator handle
                </label>
                <input
                  id="profile-handle"
                  type="text"
                  value={profileHandle}
                  onChange={(e) => setProfileHandle(e.target.value)}
                  placeholder="@creator"
                  className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-200 mb-1.5">
                Primary platform
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#070A10] border border-white/10 rounded-lg">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProfilePlatform(p)}
                    className={`px-2.5 py-2 text-xs font-medium rounded-md transition-colors truncate ${
                      profilePlatform === p
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-niche"
                className="block text-sm font-medium text-slate-200 mb-1.5"
              >
                Content niche
              </label>
              <input
                id="profile-niche"
                type="text"
                value={profileNiche}
                onChange={(e) => setProfileNiche(e.target.value)}
                placeholder="Creator Education, SaaS Marketing, Cinematic Storytelling..."
                className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profile-bio"
                  className="block text-sm font-medium text-slate-200"
                >
                  Channel bio
                </label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {profileBio.length} / 280
                </span>
              </div>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={280}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                placeholder="Tell the studio about your voice, target audience, and signature video style..."
                className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
              />
            </div>

            {profileError && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300"
              >
                {profileError}
              </div>
            )}

            {profileNotice && (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200 flex items-center gap-2"
              >
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{profileNotice}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {profileSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Account Overview & Password Security */}
        <section className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0D121C] p-6 sm:p-8 space-y-7">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-xl font-semibold text-white">
                Account &amp; Plan
              </h3>
              <button
                type="button"
                onClick={onOpenSubscription}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {isSubscribed ? 'Manage Plan' : 'Activate Pro'}
              </button>
            </div>

            <dl className="divide-y divide-white/10 text-sm border-y border-white/10">
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Account email</dt>
                <dd className="text-slate-200 truncate max-w-[220px]">
                  {account.email}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Studio access</dt>
                <dd
                  className={`font-medium tabular-nums ${
                    isSubscribed
                      ? 'text-emerald-400'
                      : freeRemaining > 0
                      ? 'text-slate-200'
                      : 'text-amber-300'
                  }`}
                >
                  {isSubscribed
                    ? 'ViralFlow Pro · Active'
                    : freeRemaining > 0
                    ? `Free Trial · ${freeRemaining} / ${freeLimit} left`
                    : 'Trial Complete · Locked'}
                </dd>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <dt className="text-slate-400">Workspace ID</dt>
                <dd className="font-mono text-xs text-slate-300 truncate max-w-[200px]">
                  {account.workspaceId}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Password &amp; Security
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update the password protecting your creator workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSecurityPasswords((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                {showSecurityPasswords ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Show
                  </>
                )}
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Current password
                </label>
                <input
                  id="current-password"
                  type={showSecurityPasswords ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type={showSecurityPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-new-password"
                  type={showSecurityPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#070A10] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              {passwordError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2 text-xs text-red-300"
                >
                  {passwordError}
                </div>
              )}

              {passwordNotice && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-200 flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{passwordNotice}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={passwordSaving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#070A10] px-4 py-2.5 text-xs font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {passwordSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                {passwordSaving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};
