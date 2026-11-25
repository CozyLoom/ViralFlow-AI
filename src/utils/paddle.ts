export const PADDLE_CLIENT_TOKEN =
  import.meta.env.VITE_PADDLE_CLIENT_TOKEN || 'live_503c49880fb49a1b9bd56cf32f9';

export const PADDLE_PRICE_ID =
  import.meta.env.VITE_PADDLE_PRICE_ID || 'pri_01m7yjd6zvcnzve0r9xgvn8t9q';

export interface PaddleCheckoutCompletedPayload {
  transactionId: string;
  customerEmail?: string;
}

interface PaddleEventError {
  type?: string;
  code?: string;
  detail?: string;
  message?: string;
}

interface PaddleEvent {
  name?: string;
  code?: string;
  detail?: string;
  data?: {
    transaction_id?: string;
    customer?: {
      email?: string;
    };
  };
  error?: PaddleEventError;
}

interface PaddleGlobal {
  Environment?: {
    set: (env: 'sandbox' | 'production') => void;
  };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email: string };
      customData?: Record<string, string>;
      settings?: {
        displayMode?: 'overlay' | 'inline';
        theme?: 'dark' | 'light';
        locale?: string;
      };
    }) => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

interface ActiveCheckoutHandlers {
  onComplete: (payload: PaddleCheckoutCompletedPayload) => void;
  onClose?: () => void;
  onError?: (message: string) => void;
}

let initialized = false;
let activeHandlers: ActiveCheckoutHandlers | null = null;

function formatPaddleErrorMessage(event: PaddleEvent): string {
  const code = event.error?.code || event.code || '';
  const detail =
    event.error?.detail ||
    event.error?.message ||
    event.detail ||
    '';

  if (
    code === 'transaction_checkout_not_enabled' ||
    detail.includes('transaction_checkout_not_enabled')
  ) {
    return 'Paddle checkouts are not enabled for this seller account yet (transaction_checkout_not_enabled). Complete your Paddle onboarding and domain approval in the Paddle Dashboard, or set sandbox VITE_PADDLE_CLIENT_TOKEN and VITE_PADDLE_PRICE_ID environment variables for testing.';
  }

  if (detail) {
    return code ? `${detail} (${code})` : detail;
  }
  if (code) {
    return `Paddle checkout error: ${code}. Verify your Paddle token, price ID, and domain approval.`;
  }
  return 'Checkout encountered an error. Please verify your Paddle configuration and try again.';
}

async function waitForPaddleSdk(timeoutMs = 3500): Promise<PaddleGlobal> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.Paddle && typeof window.Paddle.Initialize === 'function') {
      return window.Paddle;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    'Paddle checkout script could not be loaded. Please disable ad blockers or check your internet connection and try again.'
  );
}

export async function subscribeWithPaddle(params: {
  email: string;
  workspaceId: string;
  onComplete: (payload: PaddleCheckoutCompletedPayload) => void;
  onClose?: () => void;
  onError?: (message: string) => void;
}): Promise<void> {
  const paddle = await waitForPaddleSdk();

  activeHandlers = {
    onComplete: params.onComplete,
    onClose: params.onClose,
    onError: params.onError,
  };

  if (!initialized) {
    if (PADDLE_CLIENT_TOKEN.startsWith('test_') && paddle.Environment?.set) {
      paddle.Environment.set('sandbox');
    }

    paddle.Initialize({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (!activeHandlers || !event?.name) return;
        if (event.name === 'checkout.completed') {
          const transactionId = event.data?.transaction_id || '';
          const customerEmail = event.data?.customer?.email;
          activeHandlers.onComplete({ transactionId, customerEmail });
        } else if (event.name === 'checkout.closed') {
          activeHandlers.onClose?.();
        } else if (event.name === 'checkout.error') {
          activeHandlers.onError?.(formatPaddleErrorMessage(event));
        }
      },
    });
    initialized = true;
  }

  try {
    paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      customer: { email: params.email },
      customData: { userId: params.workspaceId },
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to open Paddle checkout.';
    activeHandlers.onError?.(message);
  }
}
