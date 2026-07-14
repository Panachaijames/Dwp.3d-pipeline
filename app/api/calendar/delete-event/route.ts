import { NextRequest, NextResponse } from 'next/server';
import { calendarClientFromRequest, findEvent, CALENDAR_ID, toDateStr, buildSummary } from '@/lib/googleCalendar';

export async function POST(req: NextRequest) {
    try {
        const { eventId, projectName, requestName, startDate, deadline, projectNumber, requestId } = await req.json();

        // startDate/deadline bound the title-search window; summary/requestId
        // locate the event when no eventId is stored (same matching as update).
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

        const existing = await findEvent(calendar, { eventId, requestId, summary, startStr, endStr });

        if (!existing?.id) {
            return NextResponse.json({ ok: true, deleted: false, note: 'event not found' }, { status: 200 });
        }

        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: existing.id });
        return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
    } catch (error: any) {
        console.error('Google Calendar delete error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
