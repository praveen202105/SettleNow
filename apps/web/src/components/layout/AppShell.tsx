import { useMutation } from '@tanstack/react-query';
import {
  Activity,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { authApi } from '../../features/auth/api';
import { authQueryKey, useCurrentUser } from '../../features/auth/hooks';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';
import { BrandMark } from '../brand/BrandMark';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Sheet } from '../ui/Sheet';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="size-9" />
      <div>
        <span className="block text-base font-bold tracking-tight text-slate-950">SettleFlow</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Settlements
        </span>
      </div>
    </div>
  );
}

const navItems = [
  { href: '/orders', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { href: '/orders/new', label: 'New Order', icon: PlusCircle, end: false },
  { href: '/activity', label: 'Activity', icon: Activity, end: false },
  { href: '/exports', label: 'Exports', icon: FileSpreadsheet, end: false },
  { href: '/settings/security', label: 'Security', icon: Settings, end: false },
];

function SidebarContent({ close }: { close?: () => void }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.removeQueries();
      queryClient.setQueryData(authQueryKey, undefined);
      void navigate('/login', { replace: true });
    },
  });
  const initial = user.data?.displayName?.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <Brand />
      </div>
      <div className="px-3 pt-5">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Workspace
        </p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Primary navigation">
        {navItems.map(({ end, href, icon: Icon, label }) => (
          <NavLink
            key={href}
            to={href}
            end={end}
            onClick={close}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
              )
            }
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user.data?.displayName || 'SettleFlow user'}
            </p>
            <p className="truncate text-xs text-slate-400">{user.data?.email}</p>
          </div>
          <IconButton
            variant="ghost"
            className="h-9 min-h-9 w-9"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label={logout.isPending ? 'Signing out' : 'Logout'}
          >
            <LogOut aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-app-bg">
      <a className="sr-only-focusable" href="#main-content">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 md:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <Sheet
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            title="Navigation"
            trigger={
              <IconButton variant="ghost" aria-label="Open navigation">
                <Menu aria-hidden="true" />
              </IconButton>
            }
          >
            <SidebarContent close={() => setMobileOpen(false)} />
          </Sheet>
          <Brand />
          <Button asChild size="sm" className="ml-auto">
            <NavLink to="/orders/new">New order</NavLink>
          </Button>
        </header>
        <main id="main-content" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
