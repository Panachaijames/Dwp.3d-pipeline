import { NextRequest, NextResponse } from 'next/server';
import { calendarClientFromRequest, findEvent, CALENDAR_ID, REQUEST_ID_PROP, toDateStr, nextDay, buildSummary } from '@/lib/googleCalendar';

export async function POST(req: NextRequest) {
    try {
        const { eventId, projectName, requestName, startDate, deadline, description, projectNumber, requestId } = await req.json();

        if (!deadline || !projectName) {
            return NextResponse.json({ error: 'Missing required fields (projectName, deadline)' }, { status: 400 });
        }

        const calendar = calendarClientFromRequest(req);
        if (!calendar) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }

        const startStr = toDateStr(startDate);
        const endStr = toDateStr(deadline);
        const summary = buildSummary(projectName, projectNumber, requestName);
        const body = {
            summary,
            description: description || undefined,
            start: { date: startStr },
            end: { date: nextDay(endStr) },
            ...(requestId ? { extendedProperties: { private: { [REQUEST_ID_PROP]: String(requestId) } } } : {}),
        };

        // Find the event by id → request-id property → exact title; create it if
        // nothing matches, so requests booked before this sync existed still work.
        const existing = await findEvent(calendar, { eventId, requestId, summary, startStr, endStr });

        if (!existing?.id) {
            const created = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: body });
            return NextResponse.json({ ok: true, eventId: created.data.id, created: true }, { status: 200 });
        }

        const patched = await calendar.events.patch({
            calendarId: CALENDAR_ID,
            eventId: existing.id,
            requestBody: body,
        });

        return NextResponse.json({ ok: true, eventId: patched.data.id }, { status: 200 });
    } catch (error: any) {
        console.error('Google Calendar update error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
