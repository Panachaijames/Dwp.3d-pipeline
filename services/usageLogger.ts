import { supabase } from './supabaseClient';

/**
 * Lightweight, fire-and-forget usage logger for the 3D Pipeline site.
 *
 * Writes rows into the `threed_usage_events` Supabase table so leaders can see
 * who signed in and which features / API functions they used. Logging must
 * NEVER throw into the app, so every path is wrapped defensively and failures
 * are swallowed (e.g. before the migration has been applied).
 */

export type UsageEventType = 'login' | 'logout' | 'page_view' | 'api_call';

interface UsageActor {
    email?: string | null;
    name?: string | null;
    role?: string | null;
}

interface LogUsageInput {
    eventType: UsageEventType;
    feature?: string | null;
    detail?: Record<string, unknown> | null;
    /** Override the ambient actor (used for login events fired mid-sign-in). */
    actor?: UsageActor;
}

// The "current user", kept in sync by AuthContext via setUsageActor(). Page
// views and API calls read this so callers don't have to thread the user
// through every call site.
let currentActor: UsageActor = {};

export function setUsageActor(actor: UsageActor): void {
    currentActor = actor || {};
}

export function clearUsageActor(): void {
    currentActor = {};
}

// Debounce repeated page views of the same feature so tab re-renders / initial
// + explicit navigation don't create duplicate rows.
const lastPageView: Record<string, number> = {};
const PAGE_VIEW_DEBOUNCE_MS = 15_000;

export function logUsage({ eventType, feature, detail, actor }: LogUsageInput): void {
    try {
        if (typeof window === 'undefined') return;

        if (eventType === 'page_view' && feature) {
            const now = Date.now();
            if (lastPageView[feature] && now - lastPageView[feature] < PAGE_VIEW_DEBOUNCE_MS) {
                return;
            }
            lastPageView[feature] = now;
        }

        const who = actor || currentActor;

        const row = {
            email: who.email ?? null,
            name: who.name ?? null,
            role: who.role ?? null,
            event_type: eventType,
            feature: feature ?? null,
            detail: detail ?? null,
            path: window.location?.pathname ?? null,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        };

        // Fire-and-forget. Any error (including "table does not exist" before the
        // migration is applied) is logged at debug level and otherwise ignored.
        void supabase
            .from('threed_usage_events')
            .insert(row)
            .then(({ error }) => {
                if (error) console.debug('[usage] insert skipped:', error.message);
            });
    } catch (err) {
        console.debug('[usage] log failed:', err);
    }
}
