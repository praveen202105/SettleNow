import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { queryClient } from '../lib/query';
import { router } from './router';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        richColors
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: 'rounded-xl border border-slate-200 bg-white shadow-xl',
            title: 'text-sm font-semibold text-slate-900',
            description: 'text-sm text-slate-500',
          },
        }}
      />
    </QueryClientProvider>
  );
}
