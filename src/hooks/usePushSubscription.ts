import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { VAPID_PUBLIC_KEY } from "@/lib/push-config";
import { savePushSubscription, removePushSubscription } from "@/lib/push.functions";

export type PushState =
  | "checking"
  | "ready" // subscribed on this device
  | "off" // supported, not subscribed yet
  | "unsupported"
  | "open-in-new-tab"
  | "install-on-ios"
  | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function usePushSubscription() {
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // On iOS this API only exists once the site is installed to the home screen.
        setState(isIos() ? "install-on-ios" : "unsupported");
        return;
      }
      if (window.top !== window.self) {
        setState("open-in-new-tab");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "ready" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return false;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }));

      const json = subscription.toJSON();
      await save({
        data: {
          endpoint: subscription.endpoint,
          p256dh: json.keys?.["p256dh"] ?? "",
          auth: json.keys?.["auth"] ?? "",
          userAgent: navigator.userAgent,
        },
      });
      setState("ready");
      return true;
    } catch (error) {
      console.error("[push] could not subscribe", error);
      return false;
    } finally {
      setBusy(false);
    }
  }, [save]);

  const disableDevice = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await remove({ data: { endpoint: subscription.endpoint } }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [remove]);

  return { state, busy, enable, disableDevice };
}
