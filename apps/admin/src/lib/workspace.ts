/**
 * W3 UI isolation — path mapping between the Platform and Organization
 * workspaces. The two workspaces are separate routing spaces sharing feature
 * pages; guards use these maps so a user landing in the wrong space is
 * bounced to the equivalent page of their own workspace (links keep working
 * across spaces without ever mounting the foreign layout).
 */

/** Feature areas that exist in both workspaces (same page components). */
const SHARED_FEATURES = ['dashboard', 'projects', 'studies', 'donations'];

/** Map a platform path to its organization-workspace equivalent. */
export function orgPathFor(platformPath: string): string {
  const [, first] = platformPath.split('/');
  if (SHARED_FEATURES.includes(first)) return `/org${platformPath}`;
  return '/org/dashboard';
}

/** Map an organization-workspace path back to its platform equivalent. */
export function platformPathFor(orgPath: string): string {
  const rest = orgPath.replace(/^\/org(?=\/|$)/, '') || '/dashboard';
  const [, first] = rest.split('/');
  if (SHARED_FEATURES.includes(first)) return rest;
  return '/dashboard'; // team/settings have no platform twin
}
