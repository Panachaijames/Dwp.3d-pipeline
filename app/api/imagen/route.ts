import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { prompt, targetModel, singleImage, imageData } = body;

        let modelId = 'imagen-4.0-ultra-generate-001';
        if (targetModel === 'nano-banana') {
            modelId = 'gemini-3.1-flash-image-preview';
        }

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        let promptsToRun: string[] = [];

        if (singleImage) {
            // Single image mode: use the full prompt as-is (e.g. for material board variations)
            promptsToRun = [prompt.trim()];
        } else {
            // Parse the generated prompt into distinct sections
            // Look for Markdown headers (##, ###) or bolded section names (**Section Name**)
            let sections: string[] = [];

            // Split by major headers or double newlines that look like distinct prompts
            const lines = prompt.split('\n');
            let currentSection = "";

            for (const line of lines) {
                // If line is a header like "### Prompt for Midjourney" or "**Lobby Area**"
                if (line.match(/^#{2,4}\s+.*$/) || line.match(/^\*\*[^*]+\*\*$/)) {
                    if (currentSection.trim().length > 20) {
                        sections.push(currentSection.trim());
                    }
                    currentSection = line + "\n";
                } else {
                    currentSection += line + "\n";
                }
            }
            if (currentSection.trim().length > 20) {
                sections.push(currentSection.trim());
            }

            // If no clear sections found, or just 1 big block, default to the 4 angle approach
            if (sections.length <= 1) {
                const basePrompt = sections.length === 1 ? sections[0] : prompt.trim();
                const angles = [
                    "Front/Eye-level view",
                    "Aerial/Bird's-eye view",
                    "Dynamic Perspective/Worm's-eye view",
                    "Close up detailed view"
                ];
                promptsToRun = angles.map(angle => `${basePrompt}\n\nCamera Angle: ${angle}. Make it highly detailed and photorealistic.`);
            } else {
                // We have multiple sections. Just generate an image for each one.
                // Cap it at maximum 8 images to prevent massive rate limits/timeouts on Vercel
                promptsToRun = sections.slice(0, 8);
            }
        }

        const base64Images: string[] = [];
        const generationErrors: string[] = [];

        // Execute in pairs (2 concurrent calls at a time) to avoid aggressive rate limiting
        for (let i = 0; i < promptsToRun.length; i += 2) {
            const chunk = promptsToRun.slice(i, i + 2);
            const chunkPromises = chunk.map(async (finalPrompt, chunkIndex) => {
                const globalIndex = i + chunkIndex;

                let attempt = 0;
                let resultImageData: string | null = null;
                let lastAttemptError: string | null = null;

                while (attempt < 3 && !resultImageData) {
                    try {
                        if (attempt > 0) {
                            // Wait between retries (exponential backoff)
                            await new Promise(r => setTimeout(r, attempt * 1500));
                        }

                        if (modelId === 'gemini-3.1-flash-image-preview') {
                            // Nano Banana uses the generateContent endpoint with contents array.
                            // imageData may be a single data URL or an array of data URLs (for
                            // multi-image edits / compositing). Each is attached as inlineData.
                            const parts: any[] = [];
                            const imageList: string[] = Array.isArray(imageData)
                                ? imageData.filter((s): s is string => typeof s === 'string')
                                : (typeof imageData === 'string' ? [imageData] : []);
                            for (const img of imageList) {
                                if (!img.startsWith('data:')) continue;
                                const m = img.match(/^data:(image\/\w+);base64,(.+)$/);
                                if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
                            }
                            parts.push({ text: finalPrompt });
                            const reqBody = { contents: [{ parts }] };
                            const res = await fetch(
                                `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(reqBody),
                                }
                            );
                            if (!res.ok) {
                                const errorText = await res.text();
                                lastAttemptError = `Nano Banana API error (${res.status}): ${errorText.slice(0, 700)}`;
                                console.warn(`[Nano Banana] Attempt ${attempt + 1} failed for prompt ${globalIndex}:`, errorText);
                            } else {
                                const data = await res.json();
                                const responseParts = data.candidates?.[0]?.content?.parts || [];
                                for (const part of responseParts) {
                                    if (part.inlineData && part.inlineData.data) {
                                        resultImageData = part.inlineData.data; // Already Base64
                                        break;
                                    }
                                }
                                if (!resultImageData) {
                                    const textResponse = responseParts
                                        .map((part: any) => typeof part.text === 'string' ? part.text : '')
                                        .filter(Boolean)
                                        .join(' ')
                                        .trim();
                                    lastAttemptError = textResponse
                                        ? `Nano Banana returned text instead of an image: ${textResponse.slice(0, 700)}`
                                        : 'Nano Banana response contained no image data.';
                                }
                            }
                        } else {
                            // Imagen 4 uses the predict endpoint with instances array
                            const reqBody = {
                                instances: [
                                    { prompt: finalPrompt }
                                ],
                                parameters: { sampleCount: 1 }
                            };

                            const res = await fetch(
                                `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${GEMINI_API_KEY}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(reqBody),
                                }
                            );

                            if (!res.ok) {
                                const errorText = await res.text();
                                lastAttemptError = `Imagen API error (${res.status}): ${errorText.slice(0, 700)}`;
                                console.warn(`[Imagen] Attempt ${attempt + 1} failed for prompt ${globalIndex}:`, errorText);
                            } else {
                                const data = await res.json();
                                resultImageData = data.predictions?.[0]?.bytesBase64Encoded || null;
                                if (!resultImageData) {
                                    lastAttemptError = 'Imagen response contained no image data.';
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`Fetch exception on attempt ${attempt + 1} for prompt ${globalIndex}`, e);
                        lastAttemptError = e instanceof Error ? e.message : String(e);
                    }
                    attempt++;
                }
                if (!resultImageData && lastAttemptError) {
                    generationErrors.push(`Prompt ${globalIndex + 1}: ${lastAttemptError}`);
                }
                return resultImageData;
            });

            const chunkResults = await Promise.all(chunkPromises);
            base64Images.push(...chunkResults.filter(Boolean));
        }

        if (base64Images.length === 0) {
            const detail = generationErrors.join('\n').slice(0, 2000);
            return NextResponse.json({
                error: 'No valid images generated. Please try again.',
                ...(detail ? { detail } : {}),
            }, { status: 500 });
        }

        return NextResponse.json({
            images: base64Images.map((b64: string) => `data:image/jpeg;base64,${b64}`)
        });
    } catch (error: any) {
        console.error('[Imagen API] Exception:', error);
        return NextResponse.json({ error: error.message || 'Internal error connecting to Imagen' }, { status: 500 });
    }
}
