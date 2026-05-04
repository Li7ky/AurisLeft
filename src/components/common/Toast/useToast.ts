import { useContext } from 'react';
import { ToastContext } from './Toast';

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return {
    addToast: context.addToast,
    removeToast: context.removeToast,
    toasts: context.toasts,
  };
}
