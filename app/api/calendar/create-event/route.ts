import { NextRequest, NextResponse } from 'next/server';
import { calendarClientFromRequest, CALENDAR_ID, REQUEST_ID_PROP, toDateStr, nextDay, buildSummary } from '@/lib/googleCalendar';

export async function POST(req: NextRequest) {
    try {
        const { projectName, requestName, startDate, deadline, description, projectNumber, requestId } = await req.json();

        if (!projectName || !deadline) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const calendar = calendarClientFromRequest(req);
        if (!calendar) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }

        const startStr = toDateStr(startDate);
        const endStr = toDateStr(deadline);

        const created = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: {
                summary: buildSummary(projectName, projectNumber, requestName),
                description: description || 'Generated from DWP 3D Pipeline',
                start: { date: startStr },
                end: { date: nextDay(endStr) },
                ...(requestId ? { extendedProperties: { private: { [REQUEST_ID_PROP]: String(requestId) } } } : {}),
            },
        });

        return NextResponse.json({ ok: true, eventId: created.data.id }, { status: 200 });
    } catch (error: any) {
        console.error('Google Calendar create error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
