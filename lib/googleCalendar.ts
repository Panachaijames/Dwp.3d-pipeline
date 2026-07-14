import { google, calendar_v3 } from 'googleapis';
import { NextRequest } from 'next/server';

/**
 * Direct Google Calendar access using the signed-in user's OAuth token
 * (same pattern as the Drive routes). Replaces the old Apps Script webhook.
 *
 * Events live on GOOGLE_CALENDAR_ID — set it to a shared team calendar that
 * all 3D members can edit; it defaults to each acting user's own calendar.
 */

export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// Private extended property stamped on every event so updates/deletes can find
// the event even after renames.
export const REQUEST_ID_PROP = 'dwp3dRequestId';

const APP_TIMEZONE = 'Asia/Bangkok';

export function calendarClientFromRequest(req: NextRequest): calendar_v3.Calendar | null {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: authHeader.split(' ')[1] });
    return google.calendar({ version: 'v3', auth: oauth2Client });
}

/** Normalize a date input (YYYY-MM-DD, ISO timestamp, or epoch ms) to YYYY-MM-DD in app time. */
export const toDateStr = (value: string | number | undefined | null): string => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value ? new Date(value) : new Date();
    return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
};

/** Google all-day events use an EXCLUSIVE end date. */
export const nextDay = (dateStr: string): string => {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};

export const buildSummary = (projectName: string, projectNumber?: string, requestName?: string) =>
    `[3D Request] ${projectNumber ? projectNumber + ' - ' : ''}${projectName} - ${requestName || 'New Workflow'}`;

/** Locate a request's event: by eventId, then by request-id property, then by exact title. */
export async function findEvent(
    calendar: calendar_v3.Calendar,
    opts: { eventId?: string | null; requestId?: string | null; summary?: string; startStr: string; endStr: string },
): Promise<calendar_v3.Schema$Event | null> {
    if (opts.eventId) {
        try {
            const r = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: opts.eventId });
            if (r.data && r.data.status !== 'cancelled') return r.data;
        } catch { /* fall through to the other strategies */ }
    }

    if (opts.requestId) {
        try {
            const r = await calendar.events.list({
                calendarId: CALENDAR_ID,
                privateExtendedProperty: [`${REQUEST_ID_PROP}=${opts.requestId}`],
                maxResults: 10,
            });
            const hit = r.data.items?.find(ev => ev.status !== 'cancelled');
            if (hit) return hit;
        } catch { /* fall through */ }
    }

    if (opts.summary) {
        const timeMin = new Date(opts.startStr); timeMin.setMonth(timeMin.getMonth() - 12);
        const timeMax = new Date(opts.endStr); timeMax.setMonth(timeMax.getMonth() + 12);
        try {
            const r = await calendar.events.list({
                calendarId: CALENDAR_ID,
                q: opts.summary,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                maxResults: 100,
            });
            const hit = r.data.items?.find(ev => ev.summary === opts.summary && ev.status !== 'cancelled');
            if (hit) return hit;
        } catch { /* fall through */ }
    }

    return null;
}
