/**
 * Extract Linear ticket ID from branch/worktree name.
 * Handles prefixes like "pedros/atl-4096-some-description"
 * Pattern: TEAM-NUMBER (e.g. atl-4096)
 */
export function extractTicketIdFromBranch(branchName: string): string | null {
  // Strip any path prefix (e.g. "pedros/" or "feature/")
  const name = branchName.includes('/') ? branchName.split('/').pop()! : branchName;
  const match = name.match(/^([a-zA-Z]+)-(\d+)/);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}
