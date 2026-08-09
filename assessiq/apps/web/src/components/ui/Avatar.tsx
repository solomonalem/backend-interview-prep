import { cn } from '../../lib/cn';

// Deterministic gradient from a name so each person has a stable color.
const gradients = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

function initials(name: string): string {
  // Skip punctuation-only words so "Candidate · RC2CYO" reads as CR, not C·.
  const parts = name.trim().split(/\s+/).filter((p) => /[a-z0-9]/i.test(p));
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({
  name,
  size = 'md',
  seed,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** Colour source when the display name isn't distinctive (e.g. every
   *  unlabelled candidate reads "Candidate · …"). Defaults to `name`. */
  seed?: string;
}) {
  const key = seed ?? name;
  const idx = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm',
        gradients[idx],
        sizes[size],
      )}
    >
      {initials(name)}
    </span>
  );
}
