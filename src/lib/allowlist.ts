/**
 * Checks if a URL's host is allowed based on ALLOW_HOSTS environment variable
 * @param url - URL to check
 * @returns true if host is allowed, false otherwise
 */
export function isHostAllowed(url: string): boolean {
  const allowHosts = process.env.ALLOW_HOSTS;

  if (!allowHosts) {
    throw new Error('ALLOW_HOSTS environment variable not configured');
  }

  let hostname: string;
  try {
    const parsedUrl = new URL(url);
    hostname = parsedUrl.hostname;
  } catch (error) {
    // Invalid URL
    return false;
  }

  const allowedHosts = allowHosts.split(',').map(host => host.trim());

  for (const allowedHost of allowedHosts) {
    // Exact match
    if (hostname === allowedHost) {
      return true;
    }

    // Subdomain match: hooks.make.com should match if make.com is allowed
    // Check if hostname ends with .allowedHost
    if (hostname.endsWith('.' + allowedHost)) {
      return true;
    }

    // Also check if allowedHost ends with hostname (for reverse case)
    // This handles cases where allowedHost might be a subdomain
    if (allowedHost.endsWith('.' + hostname)) {
      return true;
    }
  }

  return false;
}
