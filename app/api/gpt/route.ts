import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const apiKey = process.env.GPT_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GPT_API_KEY not configured' }, { status: 500 });
    }

    try {
        const { prompt, systemPrompt, imageData } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        const client = new OpenAI({ apiKey });

        const combinedText = systemPrompt
            ? `System Instructions:\n${systemPrompt}\n\nUser Request:\n${prompt}`
            : prompt;

        // Build input — multimodal if image is provided
        let combinedInput: any = combinedText;
        if (imageData && typeof imageData === 'string' && imageData.startsWith('data:')) {
            combinedInput = [
                { type: 'input_image', image_url: imageData },
                { type: 'input_text', text: combinedText },
            ];
        }

        // Based on the user's provided document structure
        const response: any = await (client as any).responses.create({
            model: "gpt-5.4",
            input: combinedInput
        });

        let text = "";
        if (response.output_text) {
            text = response.output_text;
        } else if (response.output && Array.isArray(response.output) && response.output.length > 0) {
            const outputMsg = response.output[0];
            if (outputMsg.content && Array.isArray(outputMsg.content) && outputMsg.content.length > 0) {
                text = outputMsg.content[0].text || "";
            }
        }

        if (!text) {
            text = JSON.stringify(response);
        }

        return NextResponse.json({ response: text });
    } catch (error: any) {
        console.error('[GPT API] Exception:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
