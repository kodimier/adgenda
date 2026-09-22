import type { ReactNode } from "react";

export const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition duration-200 focus:border-accent focus:ring-2 focus:ring-accent-soft";

export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/30 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="sheet-in max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
