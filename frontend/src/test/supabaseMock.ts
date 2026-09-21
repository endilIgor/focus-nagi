import { vi } from "vitest";

export interface FakeSession {
  access_token: string;
  user: { id: string; email: string };
}

/** In-memory stand-in for the parts of supabase-js Auth the app uses. */
export function createFakeSupabase(initial: FakeSession | null = null) {
  let session: FakeSession | null = initial;
  const listeners = new Set<(event: string, session: FakeSession | null) => void>();
  const emit = (event: string) => listeners.forEach((l) => l(event, session));

  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
      session = { access_token: `token-for-${email}`, user: { id: "user-1", email } };
      emit("SIGNED_IN");
      return { data: { session, user: session.user }, error: null };
    }),
    signOut: vi.fn(async (_options?: { scope?: string }) => {
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    }),
    updateUser: vi.fn(async (_attrs: { password?: string }) => ({ data: { user: session?.user ?? null }, error: null })),
    onAuthStateChange: vi.fn((cb: (event: string, s: FakeSession | null) => void) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
  };

  return {
    auth,
    get session() {
      return session;
    },
    set session(value: FakeSession | null) {
      session = value;
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Holder swapped per test; the mocked ../api/supabase module delegates to it. */
export const fake: { current: FakeSupabase } = { current: createFakeSupabase() };

export const supabaseModuleMock = {
  getSupabase: () => fake.current,
  getAccessToken: async () => (await fake.current.auth.getSession()).data.session?.access_token ?? null,
  refreshAccessToken: async () => (await fake.current.auth.refreshSession()).data.session?.access_token ?? null,
  assertPublicSupabaseKey: () => undefined,
};

export function authError(status: number, code: string, message = "error") {
  return { name: "AuthApiError", status, code, message };
}
