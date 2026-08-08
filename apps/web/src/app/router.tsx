import { AlertTriangle } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom';

import { AppShell } from '../components/layout/AppShell';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { useCurrentUser } from '../features/auth/hooks';
import { ApiClientError } from '../lib/api';

const AuthPage = lazy(() =>
  import('../features/auth/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const ActivityPage = lazy(() =>
  import('../features/activity/ActivityPage').then((module) => ({ default: module.ActivityPage })),
);
const ExportsPage = lazy(() =>
  import('../features/exports/ExportsPage').then((module) => ({ default: module.ExportsPage })),
);
const OrderDetailPage = lazy(() =>
  import('../features/orders/OrderDetailPage').then((module) => ({
    default: module.OrderDetailPage,
  })),
);
const OrderFormPage = lazy(() =>
  import('../features/orders/OrderFormPage').then((module) => ({ default: module.OrderFormPage })),
);
const OrdersPage = lazy(() =>
  import('../features/orders/OrdersPage').then((module) => ({ default: module.OrdersPage })),
);
const SecurityPage = lazy(() =>
  import('../features/settings/SecurityPage').then((module) => ({
    default: module.SecurityPage,
  })),
);

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
          <Spinner label="Loading page…" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function ProtectedLayout() {
  const user = useCurrentUser();
  if (user.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <Spinner label="Loading account…" />
      </div>
    );
  }
  if (user.error instanceof ApiClientError && user.error.status === 401) {
    return <Navigate to="/login" replace />;
  }
  if (user.error) throw user.error;
  return <AppShell />;
}

function ErrorPage() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg p-4">
      <Card className="w-full max-w-lg p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
          Something went wrong
        </h1>
        <Alert variant="warning" className="mt-4 text-left">
          {message}
        </Alert>
        <Button className="mt-6" onClick={() => window.location.assign('/orders')}>
          Return to dashboard
        </Button>
      </Card>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RouteSuspense>
        <AuthPage mode="login" />
      </RouteSuspense>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: '/signup',
    element: (
      <RouteSuspense>
        <AuthPage mode="signup" />
      </RouteSuspense>
    ),
    errorElement: <ErrorPage />,
  },
  {
    element: <ProtectedLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '/activity',
        element: (
          <RouteSuspense>
            <ActivityPage />
          </RouteSuspense>
        ),
      },
      {
        path: '/exports',
        element: (
          <RouteSuspense>
            <ExportsPage />
          </RouteSuspense>
        ),
      },
      {
        path: '/orders',
        element: (
          <RouteSuspense>
            <OrdersPage />
          </RouteSuspense>
        ),
      },
      {
        path: '/orders/new',
        element: (
          <RouteSuspense>
            <OrderFormPage mode="create" />
          </RouteSuspense>
        ),
      },
      {
        path: '/orders/:orderId',
        element: (
          <RouteSuspense>
            <OrderDetailPage />
          </RouteSuspense>
        ),
      },
      {
        path: '/orders/:orderId/edit',
        element: (
          <RouteSuspense>
            <OrderFormPage mode="edit" />
          </RouteSuspense>
        ),
      },
      {
        path: '/settings/security',
        element: (
          <RouteSuspense>
            <SecurityPage />
          </RouteSuspense>
        ),
      },
    ],
  },
  { path: '/', element: <Navigate to="/orders" replace /> },
  { path: '*', element: <Navigate to="/orders" replace /> },
]);
