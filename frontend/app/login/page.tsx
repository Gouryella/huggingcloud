import { LoginForm } from '@/components/login-form';
import { ApiError, serverApiFetch } from '@/lib/api';
import type { UserMe } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  let initialRedirectTo: '/files' | '/setup/root-admin' | null = null;

  try {
    const me = await serverApiFetch<UserMe>('/api/me');
    initialRedirectTo = me.force_root_admin_setup ? '/setup/root-admin' : '/files';
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      // Ignore backend transient errors and continue rendering login form.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm initialRedirectTo={initialRedirectTo} />
    </div>
  );
}
