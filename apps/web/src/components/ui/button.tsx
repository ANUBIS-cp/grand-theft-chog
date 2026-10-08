import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ink' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-pink text-ink shadow-hard hover:bg-pink-deep hover:text-white',
  secondary: 'bg-paper-raised text-ink shadow-hard hover:bg-white',
  ink: 'bg-ink text-paper-raised shadow-[3px_3px_0_0_var(--color-pink)] hover:bg-night',
  danger: 'bg-jail text-white shadow-hard hover:brightness-95',
  ghost: 'border-transparent bg-transparent text-ink shadow-none hover:bg-ink-faint',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-14 px-6 font-display text-[22px] uppercase tracking-wide leading-none pt-1',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 rounded-[6px] border-2 border-ink font-semibold',
        'transition-[transform,box-shadow,background-color,color] duration-150 ease-out',
        'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </button>
  );
}
