'use client';

import { useContext } from 'react';

import { AppPreferencesContext } from '@/components/providers/app-preferences-provider';

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return context;
}
