import { useEffect, useRef, useState } from 'react';
import './TextDialog.css';

interface TextDialogProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function TextDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: TextDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  return (
    <div className="text-dialog-overlay" onClick={onCancel}>
      <div
        className="text-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="text-dialog__title">{title}</h3>
        {label && <label className="text-dialog__label">{label}</label>}
        <input
          ref={inputRef}
          className="text-dialog__input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="text-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
