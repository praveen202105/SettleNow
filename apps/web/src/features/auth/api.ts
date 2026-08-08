import type { LoginInput, SignupInput, UserResponse } from '@settleflow/shared';

import { apiRequest } from '../../lib/api';

export const authApi = {
  currentUser: () => apiRequest<UserResponse>('/auth/me'),
  login: (input: LoginInput) =>
    apiRequest<UserResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () =>
    apiRequest<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  signup: (input: SignupInput) =>
    apiRequest<UserResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
