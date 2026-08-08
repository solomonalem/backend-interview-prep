/**
 * How a candidate link is named in the UI.
 *
 * Candidates have no account — a link's `candidate_label` is the only thing
 * that identifies one — so an unlabelled link must still be distinguishable
 * from every other unlabelled link. The old fallback was a constant
 * "Unlabeled", which rendered every such row with identical text AND an
 * identical avatar. Falling back to a slice of the link's token gives each one
 * a stable, unique handle the manager can actually refer to.
 *
 * Links created from now on get a "Candidate N" default server-side, so this
 * fallback mainly covers links minted before that existed.
 */
export function candidateDisplayName(link: {
  candidate_label: string | null;
  token: string;
}): string {
  const label = link.candidate_label?.trim();
  if (label) return label;
  return `Candidate · ${link.token.slice(0, 6).toUpperCase()}`;
}

/** True when we're showing a generated handle rather than a real name. */
export function isUnlabeled(link: { candidate_label: string | null }): boolean {
  return !link.candidate_label?.trim();
}
