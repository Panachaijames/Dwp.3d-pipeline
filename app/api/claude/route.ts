import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Set to 60 seconds to avoid 504 on large prompts

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = 'claude-opus-4-6';

export async function POST(request: NextRequest) {
    if (!CLAUDE_API_KEY) {
        return NextResponse.json({ error: 'CLAUDE_API_KEY not configured' }, { status: 500 });
    }

    try {
        const { prompt, systemPrompt } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        const body: Record<string, unknown> = {
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            messages: [
                { role: 'user', content: prompt },
            ],
        };

        if (systemPrompt) {
            body.system = systemPrompt;
        }

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: `Claude API error (${res.status}): ${err}` }, { status: res.status });
        }

        const data = await res.json();
        const text = data.content?.[0]?.text ?? '';

        return NextResponse.json({ response: text });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal error';
        console.error('[Claude API]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
