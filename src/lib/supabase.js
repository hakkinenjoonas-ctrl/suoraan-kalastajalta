import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";
export const DEFAULT_PUBLIC_APP_URL = "https://suoraan-kalastajalta.vercel.app";

const isNativeCapacitorRuntime = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const preferenceStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key) => {
    await Preferences.remove({ key });
  },
};

const nativeNoOpLock = async (_name, _timeout, fn) => await fn();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Capacitor restores authentication from Preferences. Treating the native
    // WebView URL as an auth callback can make a stale URL fragment look like a
    // newly issued session and trigger misleading device-clock warnings.
    detectSessionInUrl: !isNativeCapacitorRuntime(),
    storage: isNativeCapacitorRuntime() ? preferenceStorage : undefined,
    lock: isNativeCapacitorRuntime() ? nativeNoOpLock : undefined,
  },
});
