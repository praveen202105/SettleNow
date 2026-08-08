import { useQuery } from '@tanstack/react-query';

import { authApi } from './api';

export const authQueryKey = ['auth', 'me'] as const;
export const authConfigQueryKey = ['auth', 'config'] as const;

export function useAuthConfig() {
  return useQuery({
    queryKey: authConfigQueryKey,
    queryFn: authApi.config,
    staleTime: 5 * 60 * 1_000,
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: authApi.currentUser,
    retry: false,
  });
}
