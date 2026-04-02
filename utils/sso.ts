/**
 * Cross-Domain SSO Utility
 * 
 * Builds URLs with SSO parameters appended so that the target app
 * can pick up the session without requiring a new Google login.
 * 
 * The receiving app's AuthContext should parse `sso_token`, `sso_expiry`,
 * and `sso_user` from the URL search params on mount.
 */

/**
 * Builds a URL with the current user's SSO session appended as query params.
 * If no session exists, returns the original URL unchanged.
 */
export function buildSSOUrl(targetUrl: string): string {
    if (typeof window === 'undefined') return targetUrl;

    const token = localStorage.getItem('dwp_access_token');
    const expiry = localStorage.getItem('dwp_token_expiry');
    const userStr = localStorage.getItem('dwp_user');

    if (!token || !userStr) return targetUrl;

    try {
        const url = new URL(targetUrl);
        url.searchParams.set('sso_token', token);
        if (expiry) url.searchParams.set('sso_expiry', expiry);
        // Base64 encode user JSON to avoid URL encoding issues with special chars
        url.searchParams.set('sso_user', btoa(userStr));
        return url.toString();
    } catch {
        // If targetUrl is not a valid absolute URL (e.g. protocol handlers), return as-is
        return targetUrl;
    }
}

/**
 * Opens a URL in a new tab with SSO params injected.
 */
export function openWithSSO(targetUrl: string): void {
    window.open(buildSSOUrl(targetUrl), '_blank', 'noopener,noreferrer');
}
