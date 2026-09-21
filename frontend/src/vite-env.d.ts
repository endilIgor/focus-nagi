/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/publishable key (public; never the service_role/secret key). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Optional absolute API origin. Leave empty to call same-origin /api (Vercel rewrite). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
