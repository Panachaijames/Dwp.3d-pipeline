// VizWorkflow constants

export const PHASES = [
    { key: "BSA", label: "Briefing & Site Analysis", subtitle: "Research", color: "#D4A017" },
    { key: "CON", label: "Concept", subtitle: "Ideation", color: "#E8731A" },
    { key: "SCH", label: "Pre Schematic", subtitle: "Development", color: "#C96A1A" },
    { key: "DD", label: "Schematic", subtitle: "Refinement", color: "#A85A18" },
] as const;

export type PhaseKey = typeof PHASES[number]["key"];

export interface VizTool {
    id: string;
    name: string;
    phase: PhaseKey[];
    abbr: string;
    icon: string;
    desc: string;
    url?: string;
    internal?: boolean;
    future?: boolean;
    order: number;
}

export const TOOLS: VizTool[] = [
    { id: "promptgen", name: "Prompt Generator", phase: ["BSA", "CON", "SCH", "DD"], abbr: "PG", icon: "◇", desc: "AI-powered prompt engineering for visualization tools", internal: true, order: 0 },
    { id: "dwprender", name: "dwp.render", phase: ["CON", "SCH", "DD"], abbr: "DR", icon: "◈", desc: "In-app AI visualization — Gemini API", internal: true, order: 1 },
    { id: "dwppitch", name: "dwp.design pitching", url: "https://dwp-design-hub-747963782073.asia-southeast1.run.app/pitching", phase: ["CON"], abbr: "DP", icon: "◈", desc: "Full pitch deck with visuals — AI-generated presentations", order: 2 },
    { id: "revit", name: "Revit", url: "https://www.autodesk.com/products/revit/", phase: ["BSA", "CON", "SCH", "DD"], abbr: "RV", icon: "▣", desc: "BIM modelling — primary design and documentation tool", order: 3 },
    { id: "midjourney", name: "Midjourney", url: "https://www.midjourney.com/", phase: ["CON"], abbr: "MJ", icon: "◆", desc: "Image generation from text prompts", order: 4 },
    { id: "nanobanana", name: "Nano-Banana", phase: ["CON"], abbr: "NB", icon: "🍌", desc: "Fast experimental image generation", order: 4 },
    { id: "mattoboard", name: "Mattoboard", url: "https://mattoboard.com/", phase: ["SCH"], abbr: "MT", icon: "▦", desc: "AI-curated material boards", order: 4 },
    { id: "d5render", name: "D5 Render", url: "https://www.d5render.com/", phase: ["DD"], abbr: "D5", icon: "◑", desc: "Democratised rendering for every designer", order: 4 },
    { id: "3dsmax", name: "3DS Max", url: "https://www.autodesk.com/products/3ds-max/", phase: ["DD"], abbr: "3D", icon: "▧", desc: "Specialist 3D visualization and rendering", order: 5 },
    { id: "meshy", name: "Meshy.ai", url: "https://www.meshy.ai/", phase: ["DD"], abbr: "MS", icon: "△", desc: "BIM-ready 3D asset generation", order: 6 },
    { id: "stablediff", name: "Stable Diffusion", url: "https://stability.ai/", phase: ["CON", "SCH"], abbr: "SD", icon: "◔", desc: "Open-source image generation", order: 7 },
    { id: "forma", name: "Autodesk Forma", url: "https://www.autodesk.com/products/forma/", phase: ["BSA", "CON"], abbr: "AF", icon: "◧", desc: "Data-driven spatial site analysis", future: true, order: 10 },
    { id: "krea", name: "Krea.ai", url: "https://www.krea.ai/", phase: ["SCH", "DD"], abbr: "KR", icon: "◎", desc: "Real-time sketch-to-render with ControlNet", future: true, order: 11 },
    { id: "promeai", name: "PromeAI", url: "https://www.promeai.pro/", phase: ["SCH"], abbr: "PM", icon: "◉", desc: "Geometry-locked architectural rendering", future: true, order: 12 },
    { id: "veras", name: "Veras", url: "https://www.evolvelab.io/veras", phase: ["DD"], abbr: "VR", icon: "◪", desc: "Render directly on Revit geometry", future: true, order: 13 },
    { id: "magnific", name: "Magnific", url: "https://magnific.ai/", phase: ["DD"], abbr: "MG", icon: "◐", desc: "AI upscaling to 4K–8K", future: true, order: 14 },
];

export const GATES = [
    { id: 1, from: "Briefing & Site Analysis", to: "Concept", focus: ["Brief completeness and clarity", "Site data validity and coverage", "Stakeholder alignment on programme"], reviewer: "Design Lead" },
    { id: 2, from: "Concept", to: "Pre Schematic", focus: ["Narrative alignment with brief", "Structural plausibility of AI imagery", "Client-facing suitability"], reviewer: "Design Lead" },
    { id: 3, from: "Pre Schematic", to: "Schematic", focus: ["Geometric validity for BIM", "Material board feasibility", "Prompt-to-output traceability"], reviewer: "Design / Technical Lead" },
    { id: 4, from: "Schematic", to: "Presentation", focus: ["BIM-render alignment", "Brand consistency (dwp language)", "AI disclosure compliance"], reviewer: "Project Director" },
];

export const STATUSES = ["Advanced", "Revised", "Rejected"];
export const SECTORS = ["Hospitality", "Workplace", "Healthcare", "Residential", "Mixed-Use"];

export const RENDER_MODES = [
    { id: "brief-to-narrative", label: "Brief → Narrative", desc: "Synthesise a design brief into a visual narrative", phase: ["CON"] as PhaseKey[] },
    { id: "text-to-concept", label: "Text → Concept Image", desc: "Generate concept imagery from descriptive prompts", phase: ["CON"] as PhaseKey[] },
    { id: "image-to-image", label: "Image → Image", desc: "Transform sketches or mood images into refined visuals", phase: ["SCH", "DD"] as PhaseKey[] },
    { id: "prompt-refine", label: "Prompt Refinement", desc: "Optimise prompts for Midjourney, Krea, or other tools", phase: ["CON", "SCH", "DD"] as PhaseKey[] },
    { id: "material-suggest", label: "Material Analysis", desc: "Suggest materials and finishes from reference imagery", phase: ["SCH"] as PhaseKey[] },
    { id: "render-critique", label: "Render Critique", desc: "Review a render against the design brief and brand standards", phase: ["DD"] as PhaseKey[] },
];

export const STYLE_PRESETS = [
    "dwp Simple Elegance", "Warm Minimalism", "Tropical Modern", "Industrial Refined",
    "Biophilic", "Art Deco Revival", "Japandi", "Mediterranean Contemporary",
    "Desert Modernism", "Scandinavian Warmth", "Raw Concrete + Timber", "Coastal Luxury"
];

// -------- Types --------
export interface VizProject {
    id: string;
    name: string;
    projectId: string;
    sector: string;
    studio: string;
    phase: PhaseKey;
    gates: Record<number, { passed: boolean; date: string } | null>;
    created: string;
    catalogKey?: string;
    requestKey?: string;
}

export interface VizLog {
    id: string;
    projectId: string;
    phase: PhaseKey;
    tool: string;
    prompt: string;
    name?: string;
    referenceInputs: string;
    outputFile: string;
    status: string;
    designer: string;
    date: string;
    notes: string;
    publishTarget?: 'none' | 'global' | 'project';
}

// -------- Helpers --------
export const uid = () => Math.random().toString(36).substr(2, 9);
export const today = () => new Date().toISOString().split("T")[0];
export const phaseOf = (k: string) => PHASES.find(p => p.key === k);
export const phaseIdx = (k: string) => PHASES.findIndex(p => p.key === k);

export const freshProject = (): VizProject => ({
    id: uid(), name: "", projectId: "", sector: "Hospitality", studio: "",
    phase: "BSA", gates: { 1: null, 2: null, 3: null, 4: null }, created: today()
});

export const freshLog = (pid: string, toolName?: string): VizLog => ({
    id: uid(), projectId: pid, phase: "BSA", tool: toolName || "dwp.render",
    prompt: "", name: "", referenceInputs: "", outputFile: "", status: "Advanced",
    designer: "", date: today(), notes: "", publishTarget: 'none'
});

export const PORTAL_JOBS = [
    { id: "D001", project: "Bumrungrad Tower", location: "Bangkok", company: "In-house", render: "Ground floor atrium — main entrance", type: "Still image — interior", designer: "Natthapong K.", status: "In progress", priority: "Standard", due: "01 Mar 2026", assets: ["BIM_atrium_v05.rvt", "Material_board_v03.pdf", "Ref_entrance.zip"], uploaded: null as string | null },
    { id: "D002", project: "Bumrungrad Tower", location: "Bangkok", company: "In-house", render: "Patient ward — typical room", type: "Still image — interior", designer: "Natthapong K.", status: "Pending", priority: "Urgent", due: "22 Feb 2026", assets: ["BIM_ward_v02.rvt", "FF&E_ward.xlsx"], uploaded: null as string | null },
    { id: "D003", project: "One Bangkok Residences", location: "Bangkok", company: "In-house", render: "Arrival lobby — porte cochère", type: "Still image — exterior", designer: "Siriporn T.", status: "In progress", priority: "Standard", due: "28 Feb 2026", assets: ["BIM_lobby_v03.rvt", "Landscape_plan.dwg", "Mood_arrival.pdf"], uploaded: null as string | null },
    { id: "D004", project: "One Bangkok Residences", location: "Bangkok", company: "In-house", render: "Sky lounge — 360° panorama", type: "360° panorama", designer: "Siriporn T.", status: "Complete", priority: "Standard", due: "15 Feb 2026", assets: ["BIM_skylounge_v04.rvt", "Material_board.pdf"], uploaded: "Sky_lounge_360_v02.jpg" },
    { id: "D005", project: "Alphaland Makati Tower", location: "Manila", company: "In-house", render: "Pool villa — twilight exterior", type: "Still image — exterior", designer: "Arun M.", status: "Pending", priority: "Presentation", due: "18 Feb 2026", assets: ["BIM_villa_v01.rvt", "Ref_twilight.zip", "Landscape_v02.dwg"], uploaded: null as string | null },
    { id: "J001", project: "Bumrungrad Tower", location: "Bangkok", company: "Adel Enriquez", render: "Lobby reception — hero shot", type: "Still image — interior", designer: "Natthapong K.", status: "In progress", priority: "Standard", due: "28 Feb 2026", assets: ["BIM_lobby_v03.rvt", "Material_board_v02.pdf", "Ref_images.zip"], uploaded: null as string | null },
    { id: "J002", project: "Bumrungrad Tower", location: "Bangkok", company: "Kiril", render: "Rooftop pool — dusk exterior", type: "Still image — exterior", designer: "Natthapong K.", status: "Pending", priority: "Standard", due: "05 Mar 2026", assets: ["BIM_rooftop_v02.rvt", "Mood_board.pdf"], uploaded: null as string | null },
    { id: "J003", project: "One Bangkok Residences", location: "Bangkok", company: "Nadeem", render: "Penthouse living — panoramic view", type: "Still image — interior", designer: "Siriporn T.", status: "Review", priority: "Standard", due: "20 Feb 2026", assets: ["BIM_penthouse_v04.rvt", "FF&E_schedule.xlsx", "Ref_lighting.zip"], uploaded: "PH_living_4K_v01.png" },
    { id: "J004", project: "Vinhomes Grand Park", location: "HCM City", company: "Stam Architecture (Marko)", render: "Clubhouse lounge — evening interior", type: "Still image — interior", designer: "Linh N.", status: "Pending", priority: "Standard", due: "10 Mar 2026", assets: ["BIM_clubhouse_v02.rvt", "Mood_sunset.pdf"], uploaded: null as string | null },
    { id: "J005", project: "Al Maha Resort", location: "Dubai", company: "Adel Enriquez", render: "Desert suite — interior", type: "Still image — interior", designer: "Khalid R.", status: "In progress", priority: "Urgent", due: "25 Feb 2026", assets: ["BIM_suite_v03.rvt", "Material_board_v01.pdf", "FF&E_desert.xlsx"], uploaded: null as string | null },
];

export const OUTSOURCE_RENDERERS = [
    // 3D Visualizers
    { name: "Adel Enriquez", email: "architect_acen07@yahoo.com", loc: "Dubai", spec: "3D visualization & rendering", category: "3D Visualizer", rate: "$$" },
    { name: "Kiril", email: "trishkin.vis@gmail.com", loc: "Russia", spec: "3D visualization & rendering", category: "3D Visualizer", rate: "$$" },
    { name: "Nadeem", email: "nadeemcgartist@gmail.com", loc: "Dubai", spec: "3D visualization & CG art", category: "3D Visualizer", rate: "$$" },
    // Revit Support
    { name: "Stam Architecture (Marko)", email: "marko.stanisic@stamarchitecture.com", loc: "Serbia", spec: "Revit / BIM support", category: "Revit Support", rate: "$$" },
    { name: "Stefan Popescu", email: "popescus.stefan@gmail.com", loc: "Dubai / Philippines", spec: "Revit / BIM support", category: "Revit Support", rate: "$$" },
    { name: "Ryan Javines", email: "ryanjavines@gmail.com", loc: "Philippines", spec: "Revit / BIM support (by hour/task)", category: "Revit Support", rate: "$" },
    { name: "Nicole Iris", email: "nicoleiris95@gmail.com", loc: "Philippines", spec: "Revit / BIM support (by hour/task)", category: "Revit Support", rate: "$" },
    { name: "Levi Monares", email: "ar.levimonares@gmail.com", loc: "Philippines", spec: "Revit / BIM support (by hour/task)", category: "Revit Support", rate: "$" },
];
