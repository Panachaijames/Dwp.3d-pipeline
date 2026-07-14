import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

// Helper to get AI instance
const getAI = (useVertex = false) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    if (useVertex) {
        return new GoogleGenAI({
            vertexai: true,
            project: process.env.GOOGLE_CLOUD_PROJECT || 'dwpaivibecode',
            location: 'us-central1',
        });
    }

    return new GoogleGenAI({ apiKey });
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, aspectRatio = '16:9', imageInput } = body;

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        let operation;
        let clientUsedForPolling: GoogleGenAI | null = null;
        let vertexErrorMsg = '';

        // Try Vertex AI first
        try {
            console.log(`[API] Attempting Video Gen via Vertex AI (${aspectRatio})...`);
            const client = getAI(true);

            const videoRequest: any = {
                model: 'veo-3.1-generate-preview',
                prompt: prompt,
                config: { aspectRatio: aspectRatio },
            };

            if (imageInput) {
                const base64Data = imageInput.includes('base64,') ? imageInput.split('base64,')[1] : imageInput;
                let mimeType = 'image/png';
                if (imageInput.startsWith('data:')) {
                    mimeType = imageInput.split(';')[0].split(':')[1];
                }
                videoRequest.image = {
                    imageBytes: base64Data,
                    mimeType: mimeType
                };
            }

            operation = await client.models.generateVideos(videoRequest);
            clientUsedForPolling = client;
        } catch (vertexError: any) {
            vertexErrorMsg = vertexError?.message || String(vertexError);
            console.warn("[API] Vertex AI Video Gen failed:", vertexErrorMsg);

            // Fallback to API Key client
            try {
                const client = getAI(false);

                const videoRequest: any = {
                    model: 'veo-2.0-generate-001',
                    prompt: prompt,
                    config: { aspectRatio: aspectRatio },
                };

                if (imageInput) {
                    const base64Data = imageInput.includes('base64,') ? imageInput.split('base64,')[1] : imageInput;
                    let mimeType = 'image/png';
                    if (imageInput.startsWith('data:')) {
                        mimeType = imageInput.split(';')[0].split(':')[1];
                    }
                    videoRequest.image = {
                        imageBytes: base64Data,
                        mimeType: mimeType
                    };
                }

                operation = await client.models.generateVideos(videoRequest);
                clientUsedForPolling = client;
            } catch (fallbackError: any) {
                const fallbackErrorMsg = fallbackError?.message || String(fallbackError);
                console.error("[API] Fallback Video Gen also failed:", fallbackErrorMsg);

                return NextResponse.json({
                    error: `Both Vertex AI and API Key clients failed.`,
                    vertexError: vertexErrorMsg,
                    fallbackError: fallbackErrorMsg
                }, { status: 500 });
            }
        }

        if (!clientUsedForPolling || !operation) {
            return NextResponse.json({ error: 'No client initialized or operation failed to start' }, { status: 500 });
        }

        // Polling
        try {
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                operation = await clientUsedForPolling.operations.get({ operation: operation });
                console.log('[API] Video generation status:', operation.done);
            }
        } catch (pollError: any) {
            return NextResponse.json({
                error: 'Polling failed',
                details: pollError?.message || String(pollError)
            }, { status: 500 });
        }

        // Log full response for debugging
        console.log('[API] Full operation response:', JSON.stringify(operation, null, 2));

        // Try multiple possible paths to the video URI
        const videoUri =
            operation.response?.generatedVideos?.[0]?.video?.uri ||
            operation.response?.generatedVideos?.[0]?.uri ||
            operation.response?.videos?.[0]?.uri ||
            operation.result?.generatedVideos?.[0]?.video?.uri ||
            operation.result?.videos?.[0]?.uri ||
            (operation as any).generatedVideos?.[0]?.video?.uri ||
            (operation as any).videos?.[0]?.uri;

        if (videoUri) {
            console.log("[API] Video Generation Success (URI):", videoUri);
            return NextResponse.json({ videoUrl: videoUri });
        }

        // Check for inline video bytes
        const videoBytes =
            operation.response?.generatedVideos?.[0]?.video?.videoBytes ||
            operation.result?.generatedVideos?.[0]?.video?.videoBytes ||
            (operation as any).generatedVideos?.[0]?.video?.videoBytes;

        if (videoBytes) {
            console.log("[API] Video Generation Success (Bytes): Found inline video data");
            const videoUrl = `data:video/mp4;base64,${videoBytes}`;
            return NextResponse.json({ videoUrl: videoUrl });
        }

        // Return full operation for debugging
        return NextResponse.json({
            error: 'Video generated but no URI found in response',
            operationKeys: Object.keys(operation || {}),
            responseKeys: Object.keys(operation?.response || {}),
            fullOperation: JSON.stringify(operation).substring(0, 2000) // Limit size
        }, { status: 500 });

    } catch (outerError: any) {
        console.error("[API] Unexpected error:", outerError);
        return NextResponse.json({
            error: 'Unexpected server error',
            details: outerError?.message || String(outerError)
        }, { status: 500 });
    }
}
