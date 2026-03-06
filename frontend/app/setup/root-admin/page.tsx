import { redirect } from 'next/navigation';

import { SetupRootAdminForm } from '@/components/setup-root-admin-form';
import { ApiError, serverApiFetch } from '@/lib/api';
import type { UserMe } from '@/lib/types';

export default async function SetupRootAdminPage() {
  try {
    const me = await serverApiFetch<UserMe>('/api/me');
    if (!me.force_root_admin_setup) {
      redirect('/files');
    }

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <SetupRootAdminForm />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }
}
