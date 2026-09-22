import type { LinkStatus } from '@assessiq/types';

/**
 * What became of a candidate link.
 *
 * Derived, never stored: a link's state is a function of its session and its
 * expiry, and a column would immediately disagree with one of them. Lives here
 * rather than inside a service because both the assessment view and the
 * candidate record's journey render the same five words, and two copies of
 * this would eventually tell the manager two different things about one link.
 */
export interface LinkStatusInput {
  opened_at: Date | null;
  /** null means no expiry — the link stays open until it is used. */
  expires_at: Date | null;
  session: { status: string } | null;
}

export function deriveLinkStatus(link: LinkStatusInput): LinkStatus {
  if (link.session) {
    switch (link.session.status) {
      case 'in_progress':
        return 'in_progress';
      case 'submitted':
        return 'submitted';
      case 'expired':
        return 'expired';
      default:
        return 'opened'; // a session exists but was never started
    }
  }
  if (link.expires_at !== null && link.expires_at.getTime() < Date.now()) return 'expired';
  if (link.opened_at) return 'opened';
  return 'not_opened';
}
