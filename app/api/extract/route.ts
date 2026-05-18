import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = 'gemini-3.1-flash-image-preview';

type Dimensions = {
    height?: number | null;
    width?: number | null;
    depth?: number | null;
    unit?: string;
};

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    try {
        const {
            imageToSend,
            originalImage,
            promptText,
            viewInstruction,
            includeAnalysis,
            dimensions,
        }: {
            imageToSend: string;
            originalImage?: string;
            promptText?: string;
            viewInstruction: string;
            includeAnalysis?: boolean;
            dimensions?: Dimensions;
        } = await request.json();

        if (!imageToSend) {
            return NextResponse.json({ error: 'imageToSend is required' }, { status: 400 });
        }

        let dimensionDirective = '';
        const hasAnyDim = !!(dimensions && (dimensions.height || dimensions.width || dimensions.depth));
        if (hasAnyDim && dimensions) {
            const unit = dimensions.unit || 'in';
            const defs: string[] = [];
            if (dimensions.height) defs.push(`  • HEIGHT = ${dimensions.height}${unit} — the TOP-to-BOTTOM dimension (vertical)`);
            if (dimensions.width) defs.push(`  • WIDTH = ${dimensions.width}${unit} — the LEFT-to-RIGHT dimension of the FRONT face (horizontal, visible from a front view)`);
            if (dimensions.depth) defs.push(`  • DEPTH = ${dimensions.depth}${unit} — the FRONT-to-BACK dimension (horizontal, visible from a side view)`);
            const sample = dimensions.width || dimensions.height || dimensions.depth;
            dimensionDirective = `\n\nAlso mark up the rendered object with clean technical dimension arrows on the white background. The size measurements are (for YOUR internal reference — these names tell you which arrow to draw where, but do NOT write the names in the image):\n${defs.join('\n')}\n\nRules:\n  - Each arrow's tips touch the actual edges of the object.\n  - Label each arrow with ONLY the numeric value + unit (e.g. "${sample}${unit}") placed next to the midpoint. Do NOT write the words "height", "width", or "depth" — let the arrow's position and direction convey which dimension it is.\n  - Only draw arrows for dimensions that are clearly visible given the camera angle of THIS view (e.g. skip WIDTH on a pure side profile; skip DEPTH on a pure front view; on a 3/4 / perspective view all three are visible).\n  - Each dimension appears AT MOST ONCE in the image — do NOT duplicate any arrow.\n  - Position each arrow CORRECTLY according to the definitions above — do not mix up width (front face left-to-right) and depth (front-to-back).\n  - Use the supplied numeric values EXACTLY as given; do not invent, round, or change them.`;
        }

        const framingInstruction = hasAnyDim
            ? `Frame the shot so the OBJECT itself fills the majority of the image (its silhouette should occupy roughly 60–75% of the canvas), with comfortable but tight margins around it for the dimension arrows. Do NOT render the object small with huge empty whitespace around it. Render the object at a CONSISTENT size across views — a side profile should not be drastically smaller than a 3/4 view.`
            : `Frame the shot so the OBJECT itself fills the majority of the image (its silhouette should occupy roughly 75–90% of the canvas). Do NOT render the object small with huge empty whitespace around it.`;

        const baseInstruction = hasAnyDim
            ? `Render the object on a pure white background from the requested camera angle, completely removing any original background remnants. ${framingInstruction}`
            : `Render the object on a pure white background from the requested camera angle, completely removing any original background remnants. ${framingInstruction} Do NOT draw any annotations, dimension lines, arrows, text, numbers, watermarks, or labels in the image. Output the object ONLY.`;

        const parts: any[] = [
            {
                text: `Task: Identify the object inside the pre-masked white area of the FIRST image.\nObject Details: "${promptText || ''}"\n\nCAMERA / VIEW INSTRUCTION (this defines the camera angle of the OUTPUT — you MUST mentally rotate the object to match it, do NOT copy the camera angle of the source image): ${viewInstruction}\n\n${baseInstruction}${dimensionDirective}\nReturn EXACTLY ONE IMAGE part.`,
            },
            {
                inlineData: { mimeType: 'image/png', data: imageToSend },
            },
        ];

        const responseModalities = ['IMAGE'];

        if (includeAnalysis && originalImage) {
            parts.push({
                text: 'The SECOND image below is the original unmasked source image. Use it ONLY to understand the original context, lighting, and materials for your precise JSON analysis.',
            });
            parts.push({
                inlineData: { mimeType: 'image/png', data: originalImage },
            });

            parts[0].text += `\n\nAlso return a TEXT part containing a highly precise and detailed JSON analysis of the extracted object. You MUST use the original unmasked source image to accurately determine context and properties. The JSON MUST strictly follow this schema:\n{\n  "specific_object_name": "String (highly specific, e.g., 'Mid-century modern teak lounge chair')",\n  "object_category": "String",\n  "primary_colors": ["Color1", "Color2"],\n  "materials_and_textures": ["Material1", "Material2"],\n  "style_design_era": "String",\n  "original_environment_context": "String (detailed description of where this object was located in the source image)",\n  "key_features": ["Feature1", "Feature2", "Feature3"],\n  "lighting_and_shadows": "String (describe the lighting on the object in the original image)",\n  "confidence_score": 0.99\n}`;
            responseModalities.unshift('TEXT');
        }

        const payload = {
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities },
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`;

        let lastError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const result = await response.json();
                const responseParts = result.candidates?.[0]?.content?.parts || [];
                const imagePart = responseParts.find((p: any) => p.inlineData);
                const textPart = responseParts.find((p: any) => p.text);

                return NextResponse.json({
                    imageData: imagePart?.inlineData?.data || null,
                    textData: textPart?.text || null,
                });
            } catch (err) {
                lastError = err;
                if (attempt < 4) {
                    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
                }
            }
        }

        return NextResponse.json({ error: lastError?.message || 'Failed after 5 retries' }, { status: 502 });
    } catch (err: any) {
        console.error('Extract API error:', err);
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
    }
}
