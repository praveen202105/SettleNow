import { ChevronLeft, ChevronRight } from 'lucide-react';

import { IconButton } from './IconButton';

export function Pagination({
  page,
  pageSize,
  setPage,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  total: number;
  totalPages: number;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <IconButton
          variant="ghost"
          className="h-9 min-h-9 w-9"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <span
          className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-blue-600 px-2 font-semibold text-white"
          aria-current="page"
        >
          {page}
        </span>
        <IconButton
          variant="ghost"
          className="h-9 min-h-9 w-9"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
