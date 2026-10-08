'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

/** A bottom sheet on phones, a centred card on wider screens. Accessible (focus trap, Esc, labelled). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/45 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[14px] border-2 border-b-0 border-ink bg-paper-raised p-5 pb-8',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[12px] sm:border-b-2 sm:shadow-hard',
            'data-[state=open]:animate-[sheet-in_220ms_cubic-bezier(.2,.9,.3,1)]',
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-[30px] uppercase leading-[0.95]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1.5 text-[14px] text-ink-soft">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-ink-faint"
              aria-label="Close"
            >
              <X size={20} weight="bold" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
