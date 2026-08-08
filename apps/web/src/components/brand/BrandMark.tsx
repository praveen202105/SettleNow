import { cn } from '../../lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('shrink-0 text-blue-600 drop-shadow-sm', className)}
      focusable="false"
      viewBox="0 0 48 48"
    >
      <rect width="48" height="48" rx="14" fill="currentColor" />
      <rect
        x="11"
        y="14"
        width="26"
        height="20"
        rx="3.5"
        fill="none"
        stroke="white"
        strokeWidth="3"
      />
      <path d="M12.5 20.5h23" fill="none" stroke="white" strokeWidth="3" />
    </svg>
  );
}
