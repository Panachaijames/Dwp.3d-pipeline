import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Set to 60 seconds to avoid 504 on large prompts / PDFs

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = 'gemini-3.1-pro-preview';
const FALLBACK_MODEL = 'gemini-3-pro-preview';

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        const { prompt, systemPrompt } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        const parts: any[] = [];

        // The frontend already extracts text from PDFs and appends it to `prompt` payload.
        // We do not download the raw PDFs here to avoid Vercel 504 execution timeouts.

        // Add the user text prompt at the end
        parts.push({ text: prompt });

        const body = {
            contents: [{ role: 'user', parts }],
            ...(systemPrompt && {
                systemInstruction: { parts: [{ text: systemPrompt }] },
            }),
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 4096,
            }
        };

        const makeRequest = async (model: string) => {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }
            );
            return res;
        };

        // Try primary model first
        let res;
        try {
            res = await makeRequest(PRIMARY_MODEL);
        } catch (err: any) {
            throw err;
        }

        // If high demand/unavailable/timeout (503 Service Unavailable, 429 Too Many Requests, 504 Timeout), try fallback
        if (!res.ok && (res.status === 503 || res.status === 429 || res.status === 504)) {
            console.warn(`[Gemini API] Primary model returned ${res.status}. Falling back to ${FALLBACK_MODEL}...`);
            res = await makeRequest(FALLBACK_MODEL);
        }

        if (!res.ok) {
            const err = typeof res.text === 'function' ? await res.text() : 'Timeout';
            return NextResponse.json({ error: `Gemini API error (${res.status}): ${err}` }, { status: res.status });
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        return NextResponse.json({ response: text });
    } catch (error: any) {
        console.error('[Gemini API] Exception:', error);
        if (error instanceof Error) {
            console.error('[Gemini API] Stack Trace:', error.stack);
        }
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
