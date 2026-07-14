/**
 * Hard allowlist of emails allowed to open the Settings portal
 * (user management, outsource projects, and usage logs).
 *
 * This is intentionally stricter than the 'leader' role: even a user with the
 * 'leader' role cannot see Settings unless their email is listed here.
 * To grant another person access, add their (lowercase) email below.
 */
export const SETTINGS_ADMIN_EMAILS = [
    'panachai.t@dwp.com',
    'preeda.w@dwp.com',
];

export function isSettingsAdmin(email?: string | null): boolean {
    if (!email) return false;
    return SETTINGS_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
