import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://exuqgemipmaqdkficlfn.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6OpTn3AxVjMnpei8Bpsy7A_Y8kOXaZP";
export const DEFAULT_PUBLIC_APP_URL = "https://suoraan-kalastajalta.vercel.app";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
