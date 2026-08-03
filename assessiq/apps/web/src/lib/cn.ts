// Tiny classnames helper — joins truthy class fragments. No dependency.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
