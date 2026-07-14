import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { nextDay } from '@/lib/googleCalendar';

export const maxDuration = 60;

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const MODEL = 'claude-opus-4-8';

const TOOLS: Anthropic.Tool[] = [
    {
        name: 'get_calendar_busy',
        description:
            "Fetch busy times (meetings, leave, appointments) from people's Google Calendars for a date range, via the free/busy API. " +
            "Call this when the question is about a specific person's availability and the 3D Schedule alone cannot answer it — " +
            "the 3D Schedule only shows project assignments, not meetings or leave. Requires the person's email address.",
        input_schema: {
            type: 'object',
            properties: {
                emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Email addresses of the people to check, e.g. ["someone.x@dwp.com"]',
                },
                startDate: { type: 'string', description: 'Range start, inclusive, format YYYY-MM-DD' },
                endDate: { type: 'string', description: 'Range end, inclusive, format YYYY-MM-DD' },
            },
            required: ['emails', 'startDate', 'endDate'],
        },
    },
];

// Query Google free/busy with the asking user's own OAuth token. Within a
// Workspace domain this typically covers every coworker whose free/busy
// visibility is on. Degrades to a plain-text explanation on any failure.
async function getCalendarBusy(input: any, accessToken: string | null): Promise<string> {
    const unavailable = (reason: string) =>
        `Google Calendar lookup unavailable (${reason}). Answer from the 3D Schedule data only and mention that personal calendars could not be checked.`;

    if (!accessToken) return unavailable('user is not signed in with Google');

    try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const emails: string[] = Array.isArray(input?.emails) ? input.emails.slice(0, 10) : [];
        if (emails.length === 0) return unavailable('no emails given');

        const fb = await calendar.freebusy.query({
            requestBody: {
                timeMin: `${input.startDate}T00:00:00+07:00`,
                timeMax: `${nextDay(input.endDate)}T00:00:00+07:00`,
                items: emails.map(id => ({ id })),
            },
        });

        const result: Record<string, unknown> = {};
        for (const email of emails) {
            const cal = fb.data.calendars?.[email];
            if (!cal || (cal.errors && cal.errors.length > 0)) {
                result[email] = 'calendar not visible';
            } else {
                result[email] = (cal.busy || []).map(b => ({ start: b.start, end: b.end }));
            }
        }
        return JSON.stringify({ busy: result, note: 'times are ISO timestamps; empty array = no busy blocks found' });
    } catch (err: any) {
        return unavailable(err?.message || 'network error');
    }
}

const buildSystemPrompt = (schedule: unknown, members: unknown) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
    const weekday = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'long' });
    return `You are the scheduling assistant for DWP's 3D Pipeline. You answer questions about the 3D team's workload and availability.

Today is ${weekday}, ${today} (Asia/Bangkok).

3D TEAM MEMBERS (JSON):
${JSON.stringify(members)}

3D SCHEDULE — current project requests (JSON):
${JSON.stringify(schedule)}

How to read the schedule data:
- Each request runs from "start" to "deadline" (dates). "assigned_to" is the responsible team member's email.
- "areas" are sub-tasks within a request; each may have its own "assigned_to" email (or a free-text "designer" name) and its own "start"/"target" dates.
- A person is BUSY on a given day if that day falls within the date range of a request assigned to them (or an area assigned to them / naming them as designer) that is not Completed.
- A person is likely AVAILABLE on days with no such overlap — but the 3D Schedule doesn't show meetings or leave.

If the question is about a specific person's day-level availability and their email is known, you may call get_calendar_busy to also check their Google Calendar. If the lookup fails, just say personal calendars couldn't be checked and answer from the schedule.

Answer style: short and concrete. Name the projects and dates that make someone busy (e.g. "Anna is on P123 Lobby Rendering until Fri Jul 17, then free"). Use day-month formats like "Mon 20 Jul". If the data can't answer the question, say so plainly rather than guessing.`;
};

export async function POST(request: NextRequest) {
    if (!CLAUDE_API_KEY) {
        return NextResponse.json({ error: 'CLAUDE_API_KEY not configured' }, { status: 500 });
    }

    try {
        const { messages, schedule, members } = await request.json();

        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
        }

        const client = new Anthropic({ apiKey: CLAUDE_API_KEY });
        const system = buildSystemPrompt(schedule ?? [], members ?? []);

        // The user's Google token (if signed in with Google) powers the free/busy tool.
        const authHeader = request.headers.get('authorization');
        const googleToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

        let convo: Anthropic.MessageParam[] = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content ?? ''),
        }));

        // Small manual tool loop (max 4 rounds) — one optional calendar lookup
        // rarely needs more than a single round trip.
        for (let i = 0; i < 4; i++) {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: 2048,
                system,
                tools: TOOLS,
                thinking: { type: 'adaptive' },
                output_config: { effort: 'low' },
                messages: convo,
            });

            if (response.stop_reason === 'tool_use') {
                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        const result = block.name === 'get_calendar_busy'
                            ? await getCalendarBusy(block.input, googleToken)
                            : `Unknown tool: ${block.name}`;
                        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
                    }
                }
                convo = [
                    ...convo,
                    { role: 'assistant', content: response.content },
                    { role: 'user', content: toolResults },
                ];
                continue;
            }

            const text = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                .map(b => b.text)
                .join('\n')
                .trim();

            return NextResponse.json({ response: text || "Sorry, I couldn't produce an answer for that." });
        }

        return NextResponse.json({ error: 'The assistant took too many steps. Please try rephrasing.' }, { status: 500 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal error';
        console.error('[Schedule Chat API]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
