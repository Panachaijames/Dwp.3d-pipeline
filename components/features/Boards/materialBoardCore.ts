// Material-board generation core, lifted out of PromptGenWorkspace so the Boards
// studio can generate boards without a Prompt Gen result. The style templates and
// two-pass composite flow are kept byte-compatible with Prompt Gen's versions —
// if you tune a prompt here, tune it there too until Prompt Gen's copy is retired.

export type MBTargetModel = 'imagen-4' | 'nano-banana';

export type MBBoardStatus = 'complete' | 'empty-fallback' | 'failed';

export interface MBBoardEntry {
    src: string | null;
    styleName: string;
    status?: MBBoardStatus;
    warning?: string;
}

export function compressImage(dataUrl: string, maxPx = 2048, quality = 0.85): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        // Never leave the promise pending on a decode failure (corrupt file, or a
        // type that passes the "image/*" check but the browser can't decode) —
        // fall back to the original data URL so downstream error handling fires.
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// ---------------------------------------------------------------------------
// Image → Material Inventory derivation (the Boards studio's replacement for
// Prompt Gen's forced "## Material Board" section). The output shape matches
// what extractMaterialInventory() produces from a Prompt Gen result, so the
// style templates below consume either source interchangeably.
// ---------------------------------------------------------------------------

export const MATERIAL_INVENTORY_SYSTEM = `You are a materials specialist at dwp | design worldwide partnership, analysing reference imagery for interior architectural projects. You identify materials, finishes, and tones with product-catalogue precision. Reply with ONLY the requested markdown section — no preamble, no commentary, no image-generation prompt.`;

export const MATERIAL_INVENTORY_PROMPT = `Analyse this image. It may be an interior render/photo, a flat-lay material board, or a mood image. Identify every key material and finish visible.

Reply with EXACTLY this structure and nothing else:

## Material Board

**Material Inventory**
- MATERIAL NAME IN CAPS (e.g. FLUTED GOLDEN TEAK, WHITE MACAUBAS QUARTZITE, BRUSHED BRASS) — finish type (e.g. honed, polished, brushed, matte, lacquered, reeded); colour/tone description; brand or source if identifiable; category (stone, wood, metal, fabric, glass, paint/lacquer, flooring)

List between 6 and 14 materials, one bullet per material, ordered from most to least dominant. Focus purely on materials and finishes — no spatial composition, no furniture descriptions, no image-generation prompt.`;

const readLlmText = async (res: Response): Promise<string> => {
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    const text = (data.response || data.text || '').trim();
    if (!text) throw new Error('Empty response from the model');
    return text;
};

/** Upload image → "## Material Board" inventory markdown, via /api/gemini (vision). */
export async function deriveInventoryFromImage(imageData: string, extraContext?: string): Promise<string> {
    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: extraContext?.trim()
                ? `${MATERIAL_INVENTORY_PROMPT}\n\nAdditional context from the designer:\n${extraContext.trim()}`
                : MATERIAL_INVENTORY_PROMPT,
            systemPrompt: MATERIAL_INVENTORY_SYSTEM,
            imageData,
        }),
    });
    const text = await readLlmText(res);
    // Normalize: ensure the section header exists and strip any stray image-prompt subsection
    const withHeader = /##\s*Material\s*Board/i.test(text) ? text : `## Material Board\n\n${text}`;
    return extractMaterialInventory(withHeader) || withHeader;
}

// Extract the Material Board section from generated/derived content
export const extractMaterialBoard = (content: string): string | null => {
    const regex = /##\s*Material\s*Board[\s\S]*?(?=\n##\s|$)/i;
    const match = content.match(regex);
    return match ? match[0].trim() : null;
};

// Extract only the material inventory list — strips the embedded "Material Board Image Prompt"
// subsection so its composition instructions don't conflict with the style template prompts
export const extractMaterialInventory = (content: string): string | null => {
    const mbSection = extractMaterialBoard(content);
    if (!mbSection) return null;
    const stripped = mbSection.replace(/#{1,3}\s*Material Board Image Prompt[\s\S]*/i, '').trim();
    return stripped.length > 20 ? stripped : mbSection;
};

// ---------------------------------------------------------------------------
// Furniture-reference analysis (chair + plant) for the two-pass composite
// ---------------------------------------------------------------------------

export const MATERIAL_BOARD_REFERENCE_ANALYSIS_PROMPT = `Analyze this reference image in detail. The image may be a material/mood board OR an interior room render - handle both cases. Your description will be fed to an image generation model that needs to reproduce the EXACT furniture pieces visible here, so be hyper-specific.

1. IMAGE TYPE - Is this a flat-lay material board, or a 3D interior room render? State which.

2. PRIMARY CHAIR / SEATING - Start with the most prominent chair or seating piece. Describe it like a product listing - at minimum 60 words:
   - Overall silhouette: is it a wing chair, lounge chair, club chair, swivel chair, slipper chair, hooded/cocoon chair, armless, with arms, low/tall back?
   - The back: straight, curved, hooded, scooped, fan-shaped, with or without ears?
   - The seat: square, rounded, deep, shallow, single cushion or none?
   - The arms: integrated, scrolled, flat, missing, curved inward?
   - The base: legs (number, shape, material), plinth, swivel base, sled?
   - Upholstery material: boucle, velvet, leather, fabric, linen, etc.
   - Upholstery colour: precise tone (e.g. "warm taupe boucle", "oxblood velvet", "cream leather").
   - Proportions: tall, wide, low, etc.
   - Any distinctive feature that would let someone identify THIS chair in a lineup of 50 chairs.

3. PRIMARY PLANT / TREE / BOTANICAL - Identify only the single most useful plant, small tree, or botanical accent to pair with the chair. Describe its type, leaf shape, scale, pot if visible, colour, and pose. If no plant/tree is visible, say "No plant/tree visible."

4. DO NOT COPY - Briefly list any visible beds, tables, lamps, ottomans, stools, benches, mirrors, bags, vases, decor accessories, extra chairs, or other objects that should be ignored.
5. LAYOUT & COMPOSITION - how the selected chair and plant/tree can sit together compactly.
6. SURFACE / BACKGROUND - base surface, walls, ground.
7. COLOUR PALETTE - dominant tones and mood.
8. LIGHTING - type, direction, warmth.
9. OVERALL AESTHETIC - minimal, luxurious, coastal, moody, eclectic, etc.

Be specific and descriptive. This analysis will be used together with the image itself to recreate the same furniture/objects in a new flat-lay material concept board.`;

export const MATERIAL_BOARD_REFERENCE_ANALYSIS_SYSTEM = "You are an expert interior design analyst. Provide a concise, structured analysis of the uploaded image. The output will be used for a clean material board, so focus only on one primary chair/seating piece and one primary plant/tree/botanical accent. Explicitly ignore beds, tables, lamps, ottomans, stools, benches, mirrors, bags, vases, accessories, extra chairs, and other decor. Avoid brand names. Keep under 300 words.";

export async function analyzeMaterialBoardReference(imageSrc: string): Promise<string | null> {
    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: MATERIAL_BOARD_REFERENCE_ANALYSIS_PROMPT,
            systemPrompt: MATERIAL_BOARD_REFERENCE_ANALYSIS_SYSTEM,
            imageData: imageSrc,
        }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
        throw new Error(result.error || 'Reference analysis failed');
    }
    return (result.response || result.text || null) as string | null;
}

// ---------------------------------------------------------------------------
// Style templates (byte-compatible with Prompt Gen)
// ---------------------------------------------------------------------------

export const MB_NO_TEXT_RULES = "Absolute no-text rule: no readable text anywhere in the image. Do not create title cards, project-name cards, specification headers, collection headers, material legends, numbered lists, detail lists, labels, codes, callouts, captions, UI markers, typography, blank label cards, or engraved plates. Use material names only to choose the appearance of physical swatches; never print those names in the image.";

// 5 distinct material board style variations inspired by real-world mood board photography
export const MATERIAL_BOARD_STYLES = [
    {
        name: 'Classic Flat-Lay',
        prompt: (projName: string, mbSection: string) =>
            `Professional architectural interior design material board presentation on a clean white background. An asymmetrical collage composition featuring overlapping geometric material swatches — primarily vertical rectangles and squares — arranged in a structured flat lay. Include one organic, rounded paint-blob swatch and a separate circular flooring/rug material swatch, but keep both fully visible. Reserve a blank lower-right foreground display bay on the plain background for furniture; this bay is NOT a material swatch. ${MB_NO_TEXT_RULES} Seamlessly integrate only two photorealistic 3D interior elements inside the blank display bay: one sculptural lounge chair and one styled potted plant/tree or botanical accent. Do not add beds, tables, lamps, stools, ottomans, mirrors, bags, vases, extra chairs, or extra decor. Keep every material sample completely readable and unobstructed; furniture must not overlap any stone, wood, fabric, metal, glass, paint, tile, or circular rug swatch. Leave clear negative space between furniture and all swatches. Soft, diffused studio lighting with no harsh shadows, hyper-realistic textures, clean editorial lines, elegant layout, 8K resolution, photorealistic.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
    },
    {
        name: 'Dark Moody',
        prompt: (projName: string, mbSection: string) =>
            `Professional top-down flat-lay photograph of a luxurious interior material sample board on a dark charcoal slate stone surface. Material samples arranged in an overlapping organic composition. Include: polished stone slab cuts, dark stained timber veneer samples, brushed brass and black matte metal hardware, richly textured woven fabric swatches in deep tones, tinted glass pieces, and satin lacquer chips. A dried botanical stem and a small metallic sphere placed as styling props. ${MB_NO_TEXT_RULES} Moody studio lighting with dramatic side light, rich shadows, editorial luxury interiors magazine style. Deep, warm atmosphere, 8K resolution, shot from directly above. Real physical samples only — no digital overlays, no colour wheels, no collages.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
    },
    {
        name: 'Industrial Refined',
        prompt: (projName: string, mbSection: string) =>
            `Professional top-down flat-lay photograph of an Industrial Refined interior material sample board. Physical material samples arranged in a structured grid composition on a raw polished concrete surface. Include: honed concrete and basalt slab samples, blackened oak and smoked walnut wood veneer, brushed gunmetal and aged blackened steel hardware, heavyweight wool and leather fabric swatches in charcoal, rust, and oxblood tones, smoked and reeded glass pieces, and matte powder-coat colour chips. Styling accents include a small machined brass cog, an unfinished copper pipe section, and a single dark dried botanical stem. ${MB_NO_TEXT_RULES} Crisp directional studio lighting with controlled shadows, masculine editorial luxury style. Refined, architectural, urban-loft atmosphere, 8K resolution, overhead camera. Only real physical material samples — no digital elements, no abstract circles, no Pinterest-style collage.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
    },
    {
        name: 'Minimalist Nordic',
        prompt: (projName: string, mbSection: string) =>
            `Professional top-down flat-lay photograph of a Scandinavian minimalist interior material sample board. Material samples arranged with generous negative space on a pure white matte surface. Include: pale grey stone slab cuts, light ash and birch wood veneer samples, matte black steel and brushed aluminium hardware, undyed raw linen and bouclé fabric swatches, clear and frosted glass samples, and chalk-finish paint colour chips in muted pastels. A single eucalyptus stem as minimal decoration. ${MB_NO_TEXT_RULES} Clean, bright, diffused studio lighting with almost no shadows, ultra-minimal composition. Crisp Nordic aesthetic, 8K resolution, directly overhead. Real physical material swatches only — no graphics, no digital palettes.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
    },
    {
        name: 'Terrazzo Eclectic',
        prompt: (projName: string, mbSection: string) =>
            `Professional top-down flat-lay photograph of an eclectic interior material sample board. Material samples arranged in a dynamic layered composition on a white terrazzo surface with subtle coloured chips. Include: veined marble and quartzite slab cuts, rich walnut and teak wood veneer samples, antique brass and rose gold metal hardware pieces, velvet and bouclé fabric swatches in jewel tones, coloured art glass samples, and high-gloss lacquer chips. Styling accents include a small dried flower arrangement, a round stone pebble, and a ceramic tile sample. ${MB_NO_TEXT_RULES} Warm directional studio lighting, artistic composition with overlapping materials at varied angles, luxury residential design magazine style. Rich, curated, eclectic warmth, 8K resolution, overhead shot. Physical material samples only — no digital effects, no abstract shapes.\n\nMaterials to include as unlabeled physical swatches only:\n${mbSection}`
    }
];

// Two-pass flow (Pass 1): the Classic Flat-Lay empty board. Pass 2 composites
// the uploaded/reference chair and plant into that board's reserved display bay.
export const buildEmptyBoardStyles = (): { name: string, prompt: (projName: string, mbSection: string) => string, extra: string }[] => {
    const noFurnitureRules = `IMPORTANT: ${MB_NO_TEXT_RULES} Keep all material swatches completely visible and unobstructed. Reserve a clearly blank lower-right foreground display bay on the plain background; this bay is NOT a material swatch and is the only place where furniture will be added later. Keep the major stone, wood, fabric, metal, glass, paint, tile, and circular flooring/rug swatches outside that blank bay, mostly in the upper, left, and center areas. Leave the blank display bay EMPTY - do NOT add any chair, sofa, bed, bench, stool, table, lamp, sconce, plant, vase, sculpture, standing decor, or any other 3D furniture/decor object. Generate ONLY the flat material samples, separate visible circular rug/flooring swatch, paint/finish swatches, blank display bay, and clean background.`;
    const themes = [
        {
            name: 'Classic Flat-Lay',
            extra: 'Clean white architectural editorial style with an asymmetric structured collage and soft diffused lighting.',
            prompt: (projName: string, mbSection: string) =>
                `Professional architectural interior design material board presentation on a clean white background. An asymmetrical collage composition featuring overlapping geometric material swatches - primarily vertical rectangles and squares - arranged in a structured flat lay. Include one organic, rounded paint-blob swatch and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nSoft, diffused studio lighting with no harsh shadows, hyper-realistic textures, clean editorial lines, elegant layout, 8K resolution, photorealistic.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
        },
        {
            name: 'Dark Moody',
            extra: 'Dark charcoal slate surface, luxurious moody lighting, rich shadows, and warm metallic accents.',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of a luxurious interior material sample board on a dark charcoal slate stone surface. Material samples arranged in an overlapping organic composition, with polished stone slab cuts, dark stained timber veneer samples, brushed brass and black matte metal samples, richly textured woven fabric swatches in deep tones, tinted glass pieces, satin lacquer chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nMoody studio lighting with dramatic side light, rich shadows, editorial luxury interiors magazine style, 8K resolution, shot from directly above. Real physical samples only - no digital overlays, no colour wheels, no collages.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
        },
        {
            name: 'Industrial Refined',
            extra: 'Raw polished concrete base, structured grid composition, dark metals, smoked timber, and crisp directional light.',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of an Industrial Refined interior material sample board on a raw polished concrete surface. Physical material samples arranged in a structured grid composition, with honed concrete and basalt slab samples, blackened oak and smoked walnut wood veneer, brushed gunmetal and aged blackened steel samples, heavyweight wool and leather fabric swatches, smoked and reeded glass pieces, matte powder-coat colour chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nCrisp directional studio lighting with controlled shadows, refined urban-loft atmosphere, 8K resolution, overhead camera. Real physical samples only - no digital elements, no abstract circles, no Pinterest-style collage.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
        },
        {
            name: 'Minimalist Nordic',
            extra: 'Pure white matte surface, generous negative space, pale materials, and bright diffused studio lighting.',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of a Scandinavian minimalist interior material sample board on a pure white matte surface. Material samples arranged with generous negative space, including pale grey stone slab cuts, light ash and birch wood veneer samples, matte black steel and brushed aluminium samples, undyed raw linen and boucle fabric swatches, clear and frosted glass samples, chalk-finish paint colour chips in muted pastels, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nClean, bright, diffused studio lighting with almost no shadows, crisp Nordic aesthetic, 8K resolution, directly overhead. Real physical material swatches only - no graphics, no digital palettes.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
        },
        {
            name: 'Terrazzo Eclectic',
            extra: 'White terrazzo surface, dynamic layered composition, rich woods, jewel-tone fabrics, and warm editorial light.',
            prompt: (projName: string, mbSection: string) =>
                `Professional top-down flat-lay photograph of an eclectic interior material sample board on a white terrazzo surface with subtle coloured chips. Material samples arranged in a dynamic layered composition, with veined marble and quartzite slab cuts, rich walnut and teak wood veneer samples, antique brass and rose gold metal samples, velvet and boucle fabric swatches in jewel tones, coloured art glass samples, high-gloss lacquer chips, and one separate circular flooring/rug material swatch that remains fully visible.\n\n${noFurnitureRules}\n\nWarm directional studio lighting, artistic composition with overlapping materials at varied angles, luxury residential magazine style, 8K resolution, overhead shot. Physical material samples only - no digital effects, no abstract graphics.\n\nMaterials to show as unlabeled physical swatches only:\n${mbSection}`,
        },
    ];
    return themes;
};

// Two-pass flow (Pass 2): prompt to composite the actual furniture out of the
// user's reference image onto the empty board from Pass 1. Kept focused on the
// CHAIR as the primary object since it's the most identifiable piece — and inject
// Gemini's specific furniture analysis so the model has detailed descriptors to anchor on.
export const buildCompositePrompt = (analysis: string, _projName: string, _variationExtra: string) =>
    `Combine these two images.

IMAGE 1 = an empty flat-lay material board with material swatches, a separate visible circular rug/flooring swatch, a blank lower-right foreground display bay, clean background, and NO text or labels.
IMAGE 2 = the SOURCE for only TWO possible foreground objects: one primary chair/seating piece and one primary plant/tree/botanical accent. These are the only objects to copy — not inspiration, not a vibe.

═══ CHAIR IS THE HIGHEST PRIORITY ═══
There is a CHAIR in IMAGE 2. You must reproduce THAT chair exactly — its full silhouette from top to bottom (any hood / wing / back curve), its proportions, its upholstery material and texture, its colour, its base, its legs (or absence of legs). Do NOT output a generic curvy boucle lounge chair. Do NOT output a fan-shaped chair. Match the chair from IMAGE 2 specifically. Look at it.

═══ PLANT / TREE IS THE ONLY SECONDARY OBJECT ═══
If IMAGE 2 contains a plant, tree, or botanical accent, reproduce only the most prominent one. Match its leaf shape, density, scale, pot/planter if visible, colour, and pose. If no plant/tree is visible, do not invent one.

═══ OBJECT INVENTORY (from IMAGE 2) — use these descriptions together with the image itself ═══
${analysis}

═══ TASK ═══
Take IMAGE 1. Place only the primary chair/seating piece and the single primary plant/tree from IMAGE 2 inside IMAGE 1's blank lower-right foreground display bay. Do NOT place them on the circular rug/flooring swatch or on top of any material sample. Keep them compact and leave all material swatches fully visible.

Output rules:
- Output no more than TWO foreground objects total: one chair/seating piece and one plant/tree.
- Copy those selected objects from IMAGE 2 by silhouette + material + colour + proportions. No generic substitutes.
- Do NOT copy or add beds, tables, lamps, sconces, stools, ottomans, benches, mirrors, bags, vases, sculptures, accessories, extra chairs, or extra decor.
- ${MB_NO_TEXT_RULES}
- If IMAGE 1 contains any accidental text, title card, legend, specification heading, collection heading, material list, number, or code, erase it and replace it with the same clean background surface.
- Keep IMAGE 1's material swatches, paint blob, circular rug/flooring swatch, blank display bay, and clean background intact.
- Scale the chair and plant/tree smaller if needed so material swatches remain readable.
- Zero overlap with material samples: do not cover any stone, wood, fabric, metal, glass, paint, tile, or circular rug/flooring swatch.
- If the chair/tree would overlap a material swatch, shrink them and move them farther into the blank display bay.
- Leave visible negative space between the chair/tree and every material sample.
- Background stays clean and neutral — no walls, no room scene, no carpeted floor.
- Soft diffused light, subtle contact shadows only.`;

// ---------------------------------------------------------------------------
// Board generation loop (port of Prompt Gen's generateMaterialBoardImage,
// decoupled from React state — progress is reported through callbacks)
// ---------------------------------------------------------------------------

export interface GenerateBoardsOptions {
    projectName: string;
    /** "## Material Board" inventory markdown (from deriveInventoryFromImage or hand-edited) */
    inventory: string;
    targetModel: MBTargetModel;
    /** Optional furniture reference (chair + plant) for the two-pass nano-banana composite */
    referenceImage?: string | null;
    referenceAnalysis?: string | null;
    onProgress?: (styleIndex: number, totalStyles: number) => void;
    onBoard?: (boards: MBBoardEntry[]) => void;
}

export interface GenerateBoardsResult {
    boards: MBBoardEntry[];
    /** Set when every style failed — the first error encountered */
    error: string | null;
}

export async function generateMaterialBoards(opts: GenerateBoardsOptions): Promise<GenerateBoardsResult> {
    // Mirror Prompt Gen: strip an embedded "Material Board Image Prompt" subsection
    // if the inventory carries one (e.g. hand-pasted), else use the text as-is.
    const mbSection = (extractMaterialInventory(opts.inventory) || opts.inventory).trim();
    if (!mbSection) {
        return { boards: [], error: 'No material inventory provided.' };
    }

    const referenceComposite = !!(opts.referenceImage && opts.targetModel === 'nano-banana');
    const emptyStyles = referenceComposite ? buildEmptyBoardStyles() : null;
    const stylesToUse: {
        name: string;
        prompt: (projName: string, mbSection: string) => string;
        extra?: string;
        compositeReference?: boolean;
    }[] = referenceComposite
        ? [
            {
                name: 'Classic Flat-Lay',
                prompt: emptyStyles![0].prompt,
                extra: emptyStyles![0].extra,
                compositeReference: true,
            },
            ...MATERIAL_BOARD_STYLES
                .filter(s => s.name !== 'Classic Flat-Lay')
                .map(s => ({ name: s.name, prompt: s.prompt })),
        ]
        : MATERIAL_BOARD_STYLES.map(s => ({ name: s.name, prompt: s.prompt }));

    const allImages: MBBoardEntry[] = [];
    let errorOccurred: string | null = null;
    let activeReferenceAnalysis = opts.referenceAnalysis ?? null;

    if (referenceComposite && opts.referenceImage && !activeReferenceAnalysis) {
        try {
            activeReferenceAnalysis = await analyzeMaterialBoardReference(opts.referenceImage);
        } catch (err: any) {
            console.warn('[Material Board] Reference analysis failed, relying on the image only:', err?.message);
            activeReferenceAnalysis = null;
        }
    }

    const push = (entry: MBBoardEntry) => {
        allImages.push(entry);
        opts.onBoard?.([...allImages]);
    };

    for (let i = 0; i < stylesToUse.length; i++) {
        const style = stylesToUse[i];
        const mbPrompt = style.prompt(opts.projectName, mbSection);
        opts.onProgress?.(i + 1, stylesToUse.length);

        try {
            // In reference mode, only Classic Flat-Lay is an empty board that Pass 2
            // fills with the uploaded chair/plant. Other themes remain final boards.
            const pass1Model = referenceComposite ? 'imagen-4' : opts.targetModel;
            const res = await fetch('/api/imagen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: mbPrompt,
                    targetModel: pass1Model,
                    singleImage: true,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                console.warn(`[MB Style ${style.name}] Pass 1 failed:`, data.error);
                push({ src: null, styleName: style.name, status: 'failed', warning: data.detail || data.error || 'Pass 1 board generation failed.' });
                continue;
            }

            const pass1Images = data.images || (data.image ? [data.image] : []);
            if (pass1Images.length === 0) {
                push({ src: null, styleName: style.name, status: 'failed', warning: 'Pass 1 returned no board image.' });
                continue;
            }

            // Non-composite themes: pass 1 result IS the final image.
            if (!style.compositeReference) {
                push({ src: pass1Images[0], styleName: style.name, status: 'complete' });
                continue;
            }

            // PASS 2 (two-pass mode): composite the reference image's furniture
            // onto the empty board produced by pass 1.
            const emptyBoardDataUrl = pass1Images[0];
            const compositePrompt = buildCompositePrompt(
                activeReferenceAnalysis || '(no text analysis available - rely on IMAGE 2 visually.)',
                opts.projectName,
                style.extra || '',
            );
            const res2 = await fetch('/api/imagen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: compositePrompt,
                    targetModel: 'nano-banana',
                    singleImage: true,
                    imageData: [emptyBoardDataUrl, opts.referenceImage!], // [IMAGE 1, IMAGE 2]
                }),
            });
            const data2 = await res2.json();

            if (!res2.ok) {
                console.warn(`[MB Style ${style.name}] Pass 2 failed, falling back to pass-1 result:`, data2.error);
                push({
                    src: pass1Images[0],
                    styleName: style.name,
                    status: 'empty-fallback',
                    warning: `Furniture composite failed: ${data2.detail || data2.error || 'Nano Banana returned no edited image.'}`,
                });
                continue;
            }

            const pass2Images = data2.images || (data2.image ? [data2.image] : []);
            if (pass2Images.length > 0) {
                push({ src: pass2Images[0], styleName: style.name, status: 'complete' });
            } else {
                push({
                    src: pass1Images[0],
                    styleName: style.name,
                    status: 'empty-fallback',
                    warning: 'Furniture composite returned no edited image; showing the empty board.',
                });
            }
        } catch (err: any) {
            console.warn(`[MB Style ${style.name}] Error:`, err?.message);
            if (!errorOccurred) errorOccurred = err?.message || 'Board generation failed.';
            push({ src: null, styleName: style.name, status: 'failed', warning: err?.message || 'Board generation failed.' });
        }
    }

    const totalFailure = allImages.every(e => e.src === null) && errorOccurred;
    return { boards: allImages, error: totalFailure ? errorOccurred : null };
}
