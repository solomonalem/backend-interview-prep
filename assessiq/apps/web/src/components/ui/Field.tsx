import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const base =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600 mb-1.5">{children}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'resize-none leading-relaxed', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(base, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}
