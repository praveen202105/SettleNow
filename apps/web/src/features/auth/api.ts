import type {
  AuthConfigResponse,
  GoogleAuthorizationResponse,
  GoogleAuthStartInput,
  LoginInput,
  SignupInput,
  UserResponse,
} from '@settleflow/shared';

import { apiRequest } from '../../lib/api';

export const authApi = {
  config: () => apiRequest<AuthConfigResponse>('/auth/config'),
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
  startGoogle: (input: GoogleAuthStartInput) =>
    apiRequest<GoogleAuthorizationResponse>('/auth/google/start', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  signup: (input: SignupInput) =>
    apiRequest<UserResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  unlinkGoogle: () =>
    apiRequest<UserResponse>('/auth/google/link', {
      method: 'DELETE',
    }),
};
