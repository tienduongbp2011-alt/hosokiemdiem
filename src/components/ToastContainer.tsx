import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-[calc(100vw-2.5rem)]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const styles =
          toast.type === 'success'
            ? 'bg-[#175933] text-white border-[#0f3f23]'
            : toast.type === 'error'
              ? 'bg-[#8E1018] text-white border-[#5e080e]'
              : 'bg-[#3d2b1f] text-[#FDF6DF] border-[#F6CF62]';

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 border shadow-md text-[15px] leading-snug ${styles}`}
          >
            <span className="mt-0.5 shrink-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-[#F6CF62]" />}
            </span>
            <p className="flex-1 m-0">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-0.5 opacity-80 hover:opacity-100 shrink-0"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
