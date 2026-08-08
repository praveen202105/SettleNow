import { useQuery } from '@tanstack/react-query';

import { authApi } from './api';

export const authQueryKey = ['auth', 'me'] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: authApi.currentUser,
    retry: false,
  });
}
