'use server';

import { GoogleGenAI, Schema, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, ElementData, StyleAnalysisResult } from "../types";

// Helper to get AI instance safely on the server
// Adjusted to support optional Vertex AI mode
const getAI = (useVertex = false) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing in server environment");
    throw new Error("GEMINI_API_KEY is not set");
  }

  if (useVertex) {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dwpaivibecode',
      location: 'us-central1', // Veo and Imagen often require us-central1
      // apiKey is mutually exclusive with project/location in this SDK for Vertex
    });
  }

  return new GoogleGenAI({ apiKey });
};

// Text Generation (Reasoning for Lighting/Materials)
export const generateConsultation = async (
  prompt: string,
  systemInstruction: string = "You are a 3D Pipeline Expert."
): Promise<string> => {
  try {
    const ai = getAI();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: { role: 'user', parts: [{ text: prompt }] } as any,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] } as any,
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.text || response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini Text Gen Error:", error);
    return "Error: Failed to generate consultation. Please check API Key.";
  }
};

// Image Generation (Rendering Phase - 'Nano Frame' equivalent)
export const generateConceptImage = async (
  prompt: string,
  model: 'imagen' | 'nano-banana' = 'imagen',
  imageInput?: string // Base64 string for image-to-image
): Promise<string> => {
  try {
    // 1. Imagen Workflow (Vertex)
    if (model === 'imagen') {
      const ai = getAI(true); // Use Vertex AI for Imagen
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
        }
      });
      const b64Image = response.generatedImages?.[0]?.image?.imageBytes;
      if (b64Image) return `data:image/png;base64,${b64Image}`;
      return "Image generated but no data returned.";
    }

    // 2. Nano Banana Workflow (Gemini Ref)
    else {
      // Use Gemini 3 Pro (or requested preview model)
      const ai = getAI(false); // Likely via API Key or default project

      const parts: any[] = [{ text: prompt }];

      // If image input provided, add it to parts
      if (imageInput) {
        // Strip prefix if present, though usually handled by caller or we parse it
        const base64Data = imageInput.includes('base64,') ? imageInput.split('base64,')[1] : imageInput;


        let mimeType = 'image/png';
        if (imageInput.startsWith('data:')) {
          mimeType = imageInput.split(';')[0].split(':')[1];
        }

        parts.unshift({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview', // User requested model for Nano Banana

        contents: { role: 'user', parts: parts } as any,
        config: {
          responseMimeType: 'application/json', // If we want structured data? No, we want image.

        }
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
    }

  } catch (error) {
    console.error("Gemini Image Gen Error:", error);
    throw new Error(`Error generating image: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Video Generation (Animation Phase)
export const generateVideoPreview = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16' = '16:9',
  imageInput?: string // Base64 string for image-to-video
): Promise<string> => {
  // Top-level try-catch to ensure we NEVER throw, only return error strings
  try {
    // Video Generation with Fallback (Vertex -> AI Studio)
    let operation;
    let clientUsedForPolling: GoogleGenAI | null = null;

    try {
      console.log(`Attempting Video Gen via Vertex AI (${aspectRatio})...`);
      const client = getAI(true);

      const request: any = {
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
        request.image = {
          imageBytes: base64Data,
          mimeType: mimeType
        };
      }

      operation = await client.models.generateVideos(request);
      clientUsedForPolling = client;
    } catch (vertexError: any) {
      console.warn("Vertex AI Video Gen failed, falling back to API Key client...", vertexError);

      try {
        const client = getAI(false);

        const request: any = {
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
          request.image = {
            imageBytes: base64Data,
            mimeType: mimeType
          };
        }

        operation = await client.models.generateVideos(request);
        clientUsedForPolling = client;
      } catch (fallbackError: any) {
        console.error("Fallback Video Gen also failed:", fallbackError);
        return `Error: Both Vertex AI and API Key clients failed. Vertex: ${vertexError?.message || String(vertexError)}. Fallback: ${fallbackError?.message || String(fallbackError)}`;
      }
    }

    if (!clientUsedForPolling || !operation) {
      return "Error: No client was successfully initialized or operation failed to start.";
    }

    // Polling logic
    try {
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await clientUsedForPolling.operations.get({
          operation: operation
        });
        console.log('Video generation status:', operation);
      }
    } catch (pollError: any) {
      console.error("Polling Error:", pollError);
      return `Error: Polling failed. ${pollError?.message || String(pollError)}`;
    }

    if (operation.response?.generatedVideos?.[0]?.video?.uri) {
      const videoUri = operation.response.generatedVideos[0].video.uri;
      console.log("Video Generation Success:", videoUri);
      return videoUri;
    }

    return "Error: Video generated but no URI returned. Final Status: " + JSON.stringify(operation);
  } catch (outerError: any) {
    // This catches any unexpected errors that slip through
    console.error("Unexpected Video Gen Error:", outerError);
    return `Error: Unexpected failure - ${outerError?.message || String(outerError)}`;
  }
};

// -------------------------------------------------------------
// White Model Decoder & StyleLens Services (Legacy Removed)
// -------------------------------------------------------------

export const determinePipelineRoute = async (description: string): Promise<{ input: string, output: string, reasoning: string }> => {
  try {
    const prompt = `
      You are an expert 3D Pipeline Manager. A user is describing their 3D project needs.
      Your goal is to classify their request into the best "Input Type" and "Output Type" for our pipeline.

      **Available Input Types:**
      - '3dmax': The user has a .max file or 3ds Max scene.
      - 'revit': The user has a .rvt file or Revit model.
      - 'image': The user has a sketch, reference image, or just an idea/prompt.

      **Available Output Types:**
      - 'concept': They want mood boards, concept art, sketches, or style exploration.
      - 'production': They want a final render, animation, or high-fidelity model.

      **User Description:** "${description}"

      **Response Format:**
      Return strictly a JSON object with these keys:
      {
        "input": "one of the input types",
        "output": "one of the output types",
        "reasoning": "short explanation"
      }
    `;

    const ai = getAI();
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { role: 'user', parts: [{ text: prompt }] } as any
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || result.text || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        input: parsed.input,
        output: parsed.output,
        reasoning: parsed.reasoning
      };
    }

    throw new Error("Could not parse routing decision");

  } catch (error) {
    console.error("Pipeline Routing Error:", error);
    // Default fallback
    return { input: 'image', output: 'concept', reasoning: 'Fallback due to error' };
  }
};
// --- StyleLens Functions ---

const parseStyleResponse = (text: string): StyleAnalysisResult => {
  try {
    return JSON.parse(text) as StyleAnalysisResult;
  } catch (e) {
    console.error("Failed to parse Style JSON", e);
    throw new Error("Invalid response format from AI.");
  }
};

export const analyzeImageStyle = async (base64Data: string, mimeType: string): Promise<StyleAnalysisResult> => {
  const ai = getAI();

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      styleName: { type: Type.STRING },
      description: { type: Type.STRING },
      elements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            materialSuggestion: { type: Type.STRING }
          }
        }
      },
      colorPalette: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            color: { type: Type.STRING },
            usage: { type: Type.STRING }
          }
        }
      },
      character: {
        type: Type.OBJECT,
        properties: {
          adjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
          mood: { type: Type.STRING }
        }
      }
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Analyze the architectural style of this image. Provide a detailed breakdown of style, elements, colors, and overall character." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
      }
    });

    // Parse the response text to ensure it matches our schema
    const result = parseStyleResponse(response.text || "{}");

    // Validate that the result is a plain object to prevent serialization errors
    return JSON.parse(JSON.stringify(result));

  } catch (error: any) {
    console.error("Gemini Style Analysis Error:", error);
    // CRITICAL: Re-throw a simple string error to ensure Next.js can serialize it to the client.
    // Complex error objects from the SDK often fail serialization across the Server Action boundary.
    throw new Error(error instanceof Error ? error.message : "Analysis failed");
  }
};

export const generateStyleFromText = async (prompt: string): Promise<StyleAnalysisResult> => {
  // ...
  const ai = getAI();

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      styleName: { type: Type.STRING },
      description: { type: Type.STRING },
      elements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            materialSuggestion: { type: Type.STRING }
          }
        }
      },
      colorPalette: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            color: { type: Type.STRING },
            usage: { type: Type.STRING }
          }
        }
      },
      character: {
        type: Type.OBJECT,
        properties: {
          adjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
          mood: { type: Type.STRING }
        }
      }
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [{ text: `Generate a detailed architectural style definition based on this description: "${prompt}"` }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.5,
      }
    });

    if (!response.text) throw new Error("No response generated.");
    return parseStyleResponse(response.text);
  } catch (error) {
    console.error("Gemini Text-to-Style Error:", error);
    throw error;
  }
};

// --- WhiteModelDecoder Functions ---

const parseAnalysisResponse = (text: string): AnalysisResult => {
  try {
    const json = JSON.parse(text);
    return {
      ...json,
      elements: json.elements.map((e: any, idx: number) => ({
        ...e,
        id: `el-${idx}`,
        userPrompt: '' // Initialize empty for user input
      }))
    };
  } catch (e) {
    console.error("Failed to parse JSON response", e);
    throw new Error("Invalid response format from AI.");
  }
};

export const analyzeImage = async (base64Data: string, mimeType: string): Promise<AnalysisResult> => {
  const ai = getAI();

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, description: "The specific type of space shown (e.g., 'Luxury Hotel Lobby', 'Modern Kitchen', 'Office Corridors')." },
      summary: { type: Type.STRING, description: "A brief description of the spatial layout and composition." },
      elements: {
        type: Type.ARRAY,
        description: "List of distinct physical architectural or design elements found in the image.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the element (e.g., 'Main Flooring', 'Drop Ceiling', 'Accent Wall', 'Reception Desk')." },
            description: { type: Type.STRING, description: "Brief visual identification of where this element is or its shape (e.g., 'Curved wall on the left', 'Large circular ceiling feature')." },
          },
          required: ["name", "description"],
        },
      },
    },
    required: ["category", "summary", "elements"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          {
            text: `
                Analyze this image (architectural white model or interior view).
                1. Categorize the space precisely (e.g., Lobby, Restaurant, Bedroom).
                2. Deconstruct the image into separate, distinct physical elements that would need material definitions (e.g., Ceiling, Floor, Walls, Furniture, Lighting Fixtures).
                3. For each element, provide a clear name and a brief description of its location or shape in the image.
              `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
      },
    });

    if (!response.text) {
      throw new Error("No response generated.");
    }

    return parseAnalysisResponse(response.text);

  } catch (error: any) {
    console.error("Gemini White Model Analysis Error:", error);
    // Re-throw as simple Error to avoid serialization issues
    throw new Error(error.message || "Failed to analyze white model. Please try again.");
  }
};

export const generateArchitecturalRender = async (
  base64Input: string,
  mimeType: string,
  category: string,
  elements: ElementData[]
): Promise<string> => {
  const ai = getAI();

  const textPrompt = `
      ### MISSION: LITERAL MATERIAL PROJECTION
      Act as a high-precision architectural visualization engine. Your goal is to apply materials to a white architectural model with ZERO creative interpretation.
      
      ### CORE CONSTRAINT:
      STRICT GEOMETRIC PRESERVATION. You MUST maintain the EXACT structural shapes, perspective, and composition of the attached input image. Do not change lines, volumes, or furniture placement.
      
      ### SPACE DEFINITION:
      Type: ${category}
      
      ### MATERIAL APPLICATION (STRICT ADHERENCE):
      Apply ONLY the textures described and shown in the reference images. DO NOT add patterns, trim, decorations, or secondary details unless explicitly stated in the text below.
      ${elements.map(e => `- **${e.name}**: Apply material strictly as: ${e.userPrompt || 'Neutral matte white architectural clay'}.`).join('\n')}
      
      ### VISUAL SPECIFICATIONS:
      - Style: Clean, professional architectural render.
      - Lighting: Realistic neutral sunlight/ambient lighting. 
      - Detail: DO NOT add additional objects, plants, art, or moldings not present in the original white model.
      - Texture: Smooth, realistic PBR application of the requested materials only.
      
      NO HALLUCINATIONS. NO EXTRA FURNITURE. NO STRUCTURAL MODIFICATIONS.
    `;

  const parts: any[] = [
    { inlineData: { mimeType: mimeType, data: base64Input } },
    { text: textPrompt }
  ];

  // Add reference images as parts
  elements.forEach(el => {
    if (el.referenceImage) {
      const base64Data = el.referenceImage.split(',')[1];
      const mime = el.referenceImage.split(';')[0].split(':')[1];
      parts.push({
        inlineData: { mimeType: mime, data: base64Data }
      });
      parts.push({ text: `REFERENCE MATERIAL FOR ${el.name.toUpperCase()}` });
    }
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        imageConfig: {
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data;
        }
      }
    }

    throw new Error("The model failed to produce a valid image part.");

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export const generateHighResRender = async (
  base64Input: string,
  mimeType: string,
  category: string,
  elements: ElementData[],
  resolution: "2K" | "4K"
): Promise<string> => {
  const ai = getAI();

  const textPrompt = `
      ### MISSION: HIGH RESOLUTION ARCHITECTURAL MASTERPIECE
      Act as a high-precision architectural visualization engine. Your goal is to apply materials to the provided source image with absolute fidelity.
      
      ### SPACE DEFINITION:
      Type: ${category}
      
      ### MATERIAL APPLICATION:
      ${elements.map(e => `- **${e.name}**: ${e.userPrompt || 'Neutral architectural clay'}.`).join('\n')}
      
      ### VISUAL SPECIFICATIONS:
      - Quality: Ultra-HD ${resolution} resolution.
      - Style: Photorealistic architectural photography.
      - Fidelity: Match the composition and geometry of the input exactly.
    `;

  const parts: any[] = [
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Input.includes(',') ? base64Input.split(',')[1] : base64Input
      }
    },
    { text: textPrompt }
  ];

  elements.forEach(el => {
    if (el.referenceImage) {
      const base64Data = el.referenceImage.split(',')[1];
      const mime = el.referenceImage.split(';')[0].split(':')[1];
      parts.push({
        inlineData: {
          mimeType: mime,
          data: base64Data
        }
      });
      parts.push({ text: `REFERENCE MATERIAL FOR ${el.name.toUpperCase()}` });
    }
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data;
        }
      }
    }

    throw new Error("Failed to produce high-resolution image.");
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    throw error;
  }
};

export const generateAlternativeAngle = async (
  base64Reference: string,
  category: string,
  elements: ElementData[],
  customAngle: string
): Promise<string> => {
  const ai = getAI();

  const prompt = `
      ### MISSION: ARCHITECTURAL PERSPECTIVE SHIFT
      REFERENCE IMAGE ATTACHED. Act as a literal 3D camera. You are capturing a new vantage point of the EXACT same architectural scene provided in the reference.
      
      ### NEW CAMERA INSTRUCTION:
      Move the camera to the following position: "${customAngle}"
      
      ### STRICT GEOMETRIC & MATERIAL CONSTRAINTS:
      1. **SPATIAL LOCK**: The room architecture, furniture layout, and spatial volumes are IMMUTABLE. Do not add, remove, or modify any structure. 
      2. **MATERIAL REPLICATION**: You must use the EXACT same materials and textures from the reference image for every surface:
         ${elements.map(e => `- ${e.name}: ${e.userPrompt}`).join('\n')}
      3. **NO HALLUCINATIONS**: Do not add people, plants, decorative objects, or details not visible in the reference.
      4. **PHOTOREALISM**: Maintain the same professional architectural lighting and rendering quality.
      
      ### VIRTUAL CAMERA SETTINGS:
      - Target: ${category}
      - Focal Length: Match reference (approx 35mm).
      - Focus: Sharp throughout the entire depth of field.
      
      OUTPUT: A single 16K render of the SAME scene from the NEW angle "${customAngle}".
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Reference.split(',')[1] || base64Reference
            }
          },
          { text: prompt }
        ]
      },
      config: {
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data;
        }
      }
    }

    throw new Error("The rendering engine could not calculate this angle. Please try describing the camera move differently.");
  } catch (error) {
    console.error("Alternative Perspective Error:", error);
    throw error;
  }
};
