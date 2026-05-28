// OneSignal Web Push SDK loader.
//
// Loads the v16 SDK from CDN lazily, exposes typed helpers around the global
// OneSignal object, and is safe to import even when ONESIGNAL_APP_ID is absent
// (every method becomes a no-op).

import { api } from "./api";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalSDK) => void | Promise<void>>;
    OneSignal?: OneSignalSDK;
  }
}

interface OneSignalSDK {
  init(opts: {
    appId: string;
    allowLocalhostAsSecureOrigin?: boolean;
    serviceWorkerPath?: string;
    notifyButton?: { enable: boolean };
  }): Promise<void>;
  login(externalUserId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: {
    requestPermission(): Promise<void>;
    permission: boolean;
    isPushSupported(): boolean;
  };
  User: {
    PushSubscription: {
      readonly id: string | null;
      readonly token: string | null;
      readonly optedIn: boolean;
      optIn(): Promise<void>;
      optOut(): Promise<void>;
      addEventListener(event: "change", cb: (event: unknown) => void): void;
    };
  };
}

let initPromise: Promise<OneSignalSDK | null> | null = null;
let cachedAppId: string | null | undefined;

async function getAppId(): Promise<string | null> {
  if (cachedAppId !== undefined) return cachedAppId;
  try {
    const config = await api.notifications.config();
    cachedAppId = config.onesignal.appId;
    return cachedAppId;
  } catch {
    cachedAppId = null;
    return null;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function ensureOneSignal(): Promise<OneSignalSDK | null> {
  if (typeof window === "undefined") return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const appId = await getAppId();
    if (!appId) return null;

    window.OneSignalDeferred = window.OneSignalDeferred ?? [];
    await loadScriptOnce("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js");

    return new Promise<OneSignalSDK>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("OneSignal SDK timeout")), 15_000);
      window.OneSignalDeferred!.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: "/OneSignalSDKWorker.js"
          });
          window.OneSignal = OneSignal;
          clearTimeout(timer);
          resolve(OneSignal);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  })();

  return initPromise;
}

export async function identifyUser(externalUserId: string): Promise<void> {
  const os = await ensureOneSignal();
  if (!os) return;
  await os.login(externalUserId);
  // Mirror the identity to the backend so it can target this user.
  await api.me.registerOneSignal(externalUserId).catch(() => {});
}

export async function optInToPush(): Promise<{ ok: boolean; reason?: string }> {
  const os = await ensureOneSignal();
  if (!os) return { ok: false, reason: "not_configured" };
  if (!os.Notifications.isPushSupported()) return { ok: false, reason: "push_unsupported" };
  await os.Notifications.requestPermission();
  if (!os.Notifications.permission) return { ok: false, reason: "permission_denied" };
  if (!os.User.PushSubscription.optedIn) {
    await os.User.PushSubscription.optIn();
  }
  return { ok: true };
}

export async function optOutOfPush(): Promise<void> {
  const os = await ensureOneSignal();
  if (!os) return;
  if (os.User.PushSubscription.optedIn) await os.User.PushSubscription.optOut();
}

export async function getPushStatus(): Promise<{ supported: boolean; permission: boolean; optedIn: boolean; subscriptionId: string | null }> {
  const os = await ensureOneSignal();
  if (!os) return { supported: false, permission: false, optedIn: false, subscriptionId: null };
  return {
    supported: os.Notifications.isPushSupported(),
    permission: os.Notifications.permission,
    optedIn: os.User.PushSubscription.optedIn,
    subscriptionId: os.User.PushSubscription.id
  };
}
