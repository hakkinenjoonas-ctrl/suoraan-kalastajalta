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

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: isNativeCapacitorRuntime() ? preferenceStorage : undefined,
  },
});
