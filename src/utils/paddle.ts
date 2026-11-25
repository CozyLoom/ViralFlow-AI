export const PADDLE_CLIENT_TOKEN =
  import.meta.env.VITE_PADDLE_CLIENT_TOKEN || 'live_503c49880fb49a1b9bd56cf32f9';

export const PADDLE_PRICE_ID =
  import.meta.env.VITE_PADDLE_PRICE_ID || 'pri_01m7yjd6zvcnzve0r9xgvn8t9q';

export interface PaddleCheckoutCompletedPayload {
  transactionId: string;
  customerEmail?: string;
}

interface PaddleEvent {
  name?: string;
  data?: {
    transaction_id?: string;
    customer?: {
      email?: string;
    };
  };
  error?: {
    detail?: string;
    message?: string;
  };
}

interface PaddleGlobal {
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
          const detail =
            event.error?.detail ||
            event.error?.message ||
            'Checkout encountered an error. Please try again.';
          activeHandlers.onError?.(detail);
        }
      },
    });
    initialized = true;
  }

  paddle.Checkout.open({
    items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
    customer: { email: params.email },
    customData: { userId: params.workspaceId },
    settings: {
      displayMode: 'overlay',
      theme: 'dark',
    },
  });
}
