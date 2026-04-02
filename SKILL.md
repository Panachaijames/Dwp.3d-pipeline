---
name: dwp-visualization
description: >
  dwp.visualization is the 3D team's visualization workflow manager.
  Use when the user needs to submit a 3D rendering request, track
  visualization jobs through design phases (Briefing → Concept →
  Pre-Schematic → Schematic), generate AI-assisted concept images
  or videos, analyse design styles from reference imagery, decode
  white-model materials, browse or upload 3D assets via Autodesk
  ACC, manage prompt libraries, generate standardised file names,
  or view the outsource renderer directory. Trigger phrases include
  "submit a render request", "generate a concept image", "what
  phase is this project in", "analyse this design style", "upload
  a 3D model to the library", "create a prompt for Midjourney",
  and "name this rendering file".
---

# dwp.visualization

**dwp.visualization** (internally `dwp.intelligence-3d-pipeline`) is the centralised workflow and AI toolkit for the dwp 3D Visualization team. It guides projects through four design phases — Briefing & Site Analysis, Concept, Pre-Schematic, and Schematic — providing AI-powered generation, quality gates, asset management, and outsource coordination in a single interface.

## What It Does

- **Visualization Workflow** — Manages projects through phased gates (BSA → CON → SCH → DD) with reviewer sign-off at each transition.
- **3D Request Portal** — Structured form for submitting rendering work requests with project details, area scopes, deadlines, and Google Drive file linking.
- **Prompt Generator** — AI-powered prompt engineering workspace that refines prompts for Midjourney, Krea, D5 Render, and other external tools, with style presets and render mode selection.
- **dwp.render Workspace** — In-app AI rendering powered by Gemini (Imagen for concept images, text consultation for narratives, and Veo for video previews).
- **3D Model Library** — Browse, upload, and preview 3D assets via Autodesk Platform Services (APS) / ACC integration with an embedded APS Viewer.
- **StyleLens** — Analyse reference images or text descriptions to extract style summaries, colour palettes, material suggestions, and design character.
- **WhiteModelDecoder** — Upload a white-model 3D render, identify architectural elements, assign material prompts, and generate photorealistic material projections.
- **File Naming Generator** — Standardised file naming following dwp conventions.
- **Prompt Library & Log** — Save, browse, and track all prompts and outputs per project.
- **Phase Gates** — Quality checkpoints between phases with defined review criteria and designated reviewers.
- **Outsource Renderer Directory** — Contact directory for external 3D visualisers and Revit support contractors.
- **Submission Portal** — File upload portal with Google Drive integration for linking project assets.

## Architecture & Conventions

### App Structure
Single-page SPA architecture with two routes:
- `/` — Auth gate → `VizWorkflowApp` (leader/member), `OutsourcePortal` (outsource role), or "Access Pending" (no role)
- `/book3d` — Standalone 3D viewer (embedded view)

All other routes are API endpoints under `app/api/`.

### Component Organisation
```
components/
├── core/           Providers (GoogleOAuth + Auth)
├── auth/           LoginPage (email + Google OAuth)
├── features/
│   ├── VizWorkflow/   Main tabbed workspace (14 tab components)
│   ├── PdfLibrary/    PDF document management
│   ├── StyleLens/     Image/text style analysis
│   ├── WhiteModelDecoder/  BIM material projection
│   ├── DriveUploader.tsx   Google Drive upload
│   └── ResourceViewer.tsx  Resource browser
├── portals/        Outsource, Submission, Library, Settings, Request
├── dashboard/      Overview dashboard + tools grid + workflow progress
├── viewers/        APSViewer, ModelViewer, Gallery, FileBrowser
└── ui/             shadcn-style primitives (Button, Tabs, Skeleton, Spinner)
```

### Styling
- **CSS custom properties** defined in `vizworkflow.css` (`.viz-light` / `.viz-dark` token sets)
- **Tailwind CSS** loaded via CDN `<script>` tag in `app/layout.tsx` (not PostCSS — `@apply` does not work)
- VizWorkflow components use CSS vars (`var(--bg)`, `var(--tx)`, `var(--or)`, etc.)
- Portal/auth components use Tailwind utility classes with `dark:` prefix

### State Management
- **VizWorkflowApp** — React `useState` as primary orchestrator for projects, logs, tabs, modals
- **Zustand** — `store/usePdfLibraryStore.ts` for PDF library state
- **AuthContext** — User session, tokens, Google OAuth, Supabase auth, SSO
- **ThemeContext** — Dark/light toggle, persisted in localStorage
- **localStorage** — `dwp_user`, `dwp_access_token`, `dwp_token_expiry`

### Database (Supabase)
Tables: `viz_projects`, `viz_logs`, `threed_user_roles`, `dwp_refresh_tokens`, `prompt_library`, `project_prompts`, `pdf_sections`, `pdf_documents`, `project_all`, `threed_projects`, `threed_outsource_assignments`, `project_requests`

### Key Patterns
- **Dynamic imports**: Use `next/dynamic` with `{ ssr: false }` for heavy client components (Three.js, APS Viewer)
- **Supabase writes**: Optimistic local state update first, then `upsert()` to Supabase
- **ID generation**: `Math.random().toString(36).substr(2, 9)` via `uid()` in `constants.ts`
- **Tab components**: Statically imported, conditionally rendered with `{tab === "key" && <Component />}`

## Common Development Tasks

### Adding a New VizWorkflow Tab
1. Create component in `components/features/VizWorkflow/NewTab.tsx`
2. Import it in `VizWorkflowApp.tsx`
3. Add entry to `NAV_ITEMS`, `LIB_ITEMS`, or `TOOL_ITEMS_BASE` array
4. Add conditional render in the tab content section: `{tab === "newtab" && <NewTab />}`

### Adding a New API Route
Create `app/api/<name>/route.ts` exporting `GET`/`POST` functions. Follow the pattern in `app/api/gemini/route.ts`.

### Adding a New Role
1. Update `UserRole` type in `contexts/AuthContext.tsx`
2. Add role check in `app/page.tsx` `MainLayout`
3. Update `threed_user_roles` Supabase table

### Adding a New Portal
1. Create component in `components/portals/NewPortal.tsx`
2. Add to nav items and tab rendering in `VizWorkflowApp.tsx`

## CSS Class Reference

| Class | Purpose |
|---|---|
| `vw-root` | Root flex container (100vh) |
| `vw-rail` / `.open` / `.closed` | Sidebar (220px open / 52px closed) |
| `vw-mn` | Main content area |
| `vw-bar` | Top bar |
| `vw-fg`, `vw-fgi`, `vw-fi`, `vw-fs`, `vw-ft` | Form group, item, input, select, textarea |
| `vw-cd`, `vw-tcard` | Card, tool card |
| `vw-btn`, `vw-btn-p`, `vw-btn-g`, `vw-btn-d`, `vw-btn-sm` | Button variants (primary/ghost/danger/small) |
| `vw-ov`, `vw-mdl` | Modal overlay + dialog |
| `vw-empty`, `.ei`, `.et`, `.es` | Empty state container + icon/title/subtitle |
| `vw-notice` | Toast notification (fixed, top-center, auto-dismiss 3s) |
| `vw-render-msg`, `.user`, `.ai` | AI conversation message with role variants |

## Gotchas

- **Tailwind CDN**: Loaded via `<script>` tag, not PostCSS. `@apply` does not work. Classes are runtime-only.
- **Dual dark class**: Both `.viz-dark` and `.dark` are toggled on `<html>`. ThemeContext toggles both.
- **Phase locking**: `isLocked` is hardcoded to `false` (line 101 of VizWorkflowApp.tsx). Phase locking is not enforced.
- **Force-dynamic**: `app/page.tsx` exports `force-dynamic` — the main page is never statically generated.
- **Two font families**: DM Sans (VizWorkflow via vizworkflow.css) and Inter (globals.css / Tailwind config). Both coexist.
- **Nav items**: Use `<div onClick>` instead of `<button>` — no keyboard navigation or ARIA attributes.

## AI Capabilities

| Feature | Model / Service | Description |
|---|---|---|
| Text Consultation | Gemini (via `@google/genai`) | Design narrative generation, brief-to-narrative synthesis, prompt refinement, render critique |
| Concept Image Generation | Gemini Imagen | Text-to-image and image-to-image concept generation |
| Video Preview Generation | Gemini Veo (`veo-2.0-generate-001`) | Text-to-video and image-to-video animation previews (16:9 / 9:16) |
| StyleLens — Image Analysis | Gemini 2.0 Flash | Extracts style name, summary, elements, colour palette, and character from reference images |
| StyleLens — Text Generation | Gemini 2.0 Flash | Generates full style profiles from text descriptions |
| WhiteModelDecoder — Analysis | Gemini 2.0 Flash | Identifies architectural elements in white-model renders |
| WhiteModelDecoder — Render | Gemini Imagen | Generates photorealistic material projections at standard, 2K, and 4K resolutions |
| WhiteModelDecoder — Angles | Gemini Imagen | Generates alternative camera-angle renders from reference materials |
| Pipeline Route Detection | Gemini 2.0 Flash | Analyses project descriptions to recommend input/output workflow routes |
| Claude Integration | Claude API (Anthropic) | Secondary AI consultation endpoint |

## Technical Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 15.1.6 |
| UI Library | React | 19.0.0 |
| Language | TypeScript | 5.8.2 |
| 3D Rendering | Three.js + @react-three/fiber + @react-three/drei | 0.182 / 9.5 / 10.7 |
| AI SDK | @google/genai | 1.40.0 |
| Database | Supabase (@supabase/supabase-js) | 2.95.3 |
| Authentication | Google OAuth (@react-oauth/google) | 0.13.4 |
| Animation | GSAP | 3.14.2 |
| Styling | Tailwind CSS (CDN) + Vanilla CSS | — |
| Icons | Lucide React | 0.563.0 |
| UI Components | Radix UI (Tabs) + shadcn/ui | — |
| Date Utilities | date-fns | 4.1.0 |
| Runtime | Node.js (Alpine) | 20 |

## File Format

Projects and logs are stored as in-memory state with Supabase persistence. Key data models:

- **VizProject** — `id`, `name`, `projectId`, `sector`, `studio`, `phase`, `gates` (pass/fail per gate), `created`
- **VizLog** — `id`, `projectId`, `phase`, `tool`, `prompt`, `referenceInputs`, `outputFile`, `status`, `designer`, `date`, `notes`, `inLibrary`
- **ProjectRequest** — Full work request with project info, requester details, area scopes, preferred tools, drive folder links, and workflow selections

## Export Formats

| Output | Format | Source Feature |
|---|---|---|
| Concept Images | PNG (base64) | dwp.render / Gemini Imagen |
| Video Previews | MP4 (base64) | Gemini Veo |
| Material Renders | PNG (base64, up to 4K) | WhiteModelDecoder |
| Style Analysis | JSON (structured) | StyleLens |
| 3D Models | Via APS (RVT, 3DS, OBJ, FBX, etc.) | 3D Model Library |
| File Uploads | Via Google Drive API | Submission Portal |

## Tools / Components

### Workspace Tabs
- **Workspace** — Project dashboard with phase tracking and progress overview
- **Prompt Generator** — Multi-mode AI prompt workspace (Brief→Narrative, Text→Image, Image→Image, Prompt Refinement, Material Analysis, Render Critique)
- **dwp.render** — In-app rendering with Gemini
- **3D Portal** — Request submission and job tracking portal
- **Models** — 3D asset library with APS/ACC file browser and multi-step upload flow
- **Phase Gates** — Quality gate review interface
- **Naming** — File naming convention generator
- **Prompt Library** — Saved prompts browser
- **Prompt Log** — Output history per project
- **Reference** — Reference image management
- **Book 3D** — Embedded Three.js 3D model viewer (also available at `/book3d` route)

### AI Tools (Internal)
- **Gemini Concept Gen** — Image generation via Imagen
- **Gemini Video Gen** — Video preview via Veo
- **StyleLens** — Style analysis from images or text
- **WhiteModelDecoder** — Material projection from white models
- **Prompt Generator** — AI-powered prompt engineering

### External Tools Referenced
Revit, 3DS Max, Midjourney, D5 Render, Krea.ai, Meshy.ai, Magnific AI, Stable Diffusion, Autodesk Forma, PromeAI, Veras, Luma Dream Machine, Runway Gen-3, Kling AI, Mattoboard, Hyper 3D, Tripo 3D

## Access

| Aspect | Detail |
|---|---|
| Audience | Internal dwp — 3D Visualization team |
| Authentication | Google OAuth (`@dwp.com` accounts) |
| General Access | All `@dwp.com` Google account holders |
| Admin Access | 3D Portal features may require admin privileges |
| External Access | Not client-facing |

## Scope & Boundaries

### Supported Design Phases
- **Briefing & Site Analysis (BSA)** — Research and brief synthesis
- **Concept (CON)** — Ideation and concept imagery
- **Pre-Schematic (SCH)** — Development and material exploration
- **Schematic (DD)** — Refinement and BIM-aligned rendering

### Core Capabilities
- Visualization workflow management and phase tracking
- AI-powered prompt generation and image/video rendering
- 3D asset library browsing and uploading (via Autodesk ACC)
- Style and material analysis from reference imagery
- Rendering request submission and job tracking
- File naming standardisation
- Outsource renderer coordination

### Not Intended For
- This app is focused on visualization workflow tools (log generation, prompt library, file naming, 3D request management). Functionality outside these areas is not supported.

## Ecosystem Position

```
Client briefs & reference images
         ↓
   dwp.visualization
   (workflow → prompt gen → AI render → asset library)
         ↓
   3D / BIM pipeline (Revit, 3DS Max)
         ↓
   dwp.design pitching (presentations)
         ↓
   dwp.Visualization intranet (company-wide access)
```

- **Upstream inputs**: Design briefs, client reference images
- **Downstream outputs**: Generated renders and concepts → 3D/BIM pipeline; assets feed into presentation tools
- **Connected apps**: `dwp.design pitching` (linked from tools), `dwp.Visualization` intranet

## Development & Deployment Workflow

1. **Prototype** in Google AI Studio
2. **Polish & refine** the prototype locally with Next.js
3. **Deploy** via Google Cloud Build → Cloud Run (Antigravity pathway)

### Build Pipeline
- Cloud Build triggers from repository
- Docker multi-stage build (Node 20 Alpine)
- Deployed to Cloud Run service `dwp-pipeline-v1` in `asia-southeast3`
- GCP project: `dwpaivibecode`
- Artifact Registry: `asia-southeast3-docker.pkg.dev/dwpaivibecode/pipeline-repo/pipeline-app`

## Environment Variables

| Variable | Purpose | Scope |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API authentication | Build + Runtime |
| `GEMINI_CLIENT_ID` | Google OAuth Client ID | Build + Runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Build (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Build (public) |
| `APS_CLIENT_ID` | Autodesk Platform Services client ID | Runtime |
| `APS_CLIENT_SECRET` | Autodesk Platform Services client secret | Runtime |
| `APS_CALLBACK_URL` | APS OAuth callback URL | Runtime |
| `CLAUDE_API_KEY` | Anthropic Claude API key | Runtime |

## Build & Deploy

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Deploy via Cloud Build (from repository root)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_GEMINI_API_KEY=...,_GEMINI_CLIENT_ID=...,_NEXT_PUBLIC_SUPABASE_URL=...,_NEXT_PUBLIC_SUPABASE_ANON_KEY=...,_APS_CLIENT_ID=...,_APS_CLIENT_SECRET=...,_APS_CALLBACK_URL=...,_CLAUDE_API_KEY=...
```

## Key File Map

| Path | Description |
|---|---|
| `app/page.tsx` | Entry point — auth gate → VizWorkflowApp |
| `app/layout.tsx` | Root layout with Tailwind config and providers |
| `app/book3d/` | Standalone 3D viewer page |
| `app/api/gemini/` | Gemini API route |
| `app/api/claude/` | Claude API route |
| `app/api/video-gen/` | Video generation API route |
| `app/api/aps/` | Autodesk Platform Services API routes (9 endpoints) |
| `components/features/VizWorkflow/VizWorkflowApp.tsx` | Main workspace orchestrator |
| `components/features/VizWorkflow/PromptGenWorkspace.tsx` | AI prompt engineering workspace |
| `components/features/VizWorkflow/RenderWorkspace.tsx` | In-app dwp.render workspace |
| `components/features/VizWorkflow/ModelsTab.tsx` | 3D model library with APS upload |
| `components/features/VizWorkflow/Book3DTab.tsx` | Embedded Three.js 3D viewer |
| `components/features/VizWorkflow/WorkspaceTab.tsx` | Project dashboard |
| `components/features/VizWorkflow/constants.ts` | Phases, tools, gates, presets, types |
| `components/features/VizWorkflow/vizworkflow.css` | Theme tokens + all component CSS classes |
| `components/features/GeminiPanel.tsx` | AI chat/image/video panel |
| `components/features/PdfLibrary/` | PDF library components (PdfLibrary, PdfUploader, PdfSectionPicker, StorageGauge) |
| `components/features/StyleLens/` | Style analysis components (4 files) |
| `components/features/WhiteModelDecoder/` | Material projection components (2 files) |
| `components/features/DriveUploader.tsx` | Google Drive upload component |
| `components/features/ResourceViewer.tsx` | Resource browser component |
| `components/portals/OutsourcePortal.tsx` | Outsource renderer dashboard |
| `components/portals/SubmissionPortal/` | Submission workflow + DrivePicker |
| `components/portals/SettingsPortal.tsx` | User settings (leader-only) |
| `components/portals/LibraryPortal.tsx` | Digital archive / asset library |
| `components/portals/RequestPortal.tsx` | Work request submission form |
| `components/dashboard/Dashboard.tsx` | Pipeline overview dashboard |
| `components/viewers/APSViewer.tsx` | Autodesk APS 3D viewer embed |
| `components/viewers/ModelViewer.tsx` | Generic 3D model viewer |
| `components/ui/Skeleton.tsx` | Loading skeleton component |
| `components/ui/Spinner.tsx` | Loading spinner component |
| `services/geminiService.ts` | All Gemini AI functions |
| `services/apsService.ts` | Autodesk Platform Services integration |
| `services/googleDriveService.ts` | Google Drive file management |
| `services/supabaseClient.ts` | Supabase client initialisation |
| `services/emailService.ts` | Email notification service |
| `contexts/AuthContext.tsx` | Google OAuth + Supabase auth + SSO context |
| `contexts/ThemeContext.tsx` | Dark/light theme context |
| `store/usePdfLibraryStore.ts` | Zustand store for PDF library |
| `utils/sso.ts` | SSO URL builder + redirect helper |
| `app/api/auth/` | OAuth code exchange + token refresh routes |
| `app/api/drive/` | Google Drive routes (list, upload, create-project, assign-outsource) |
| `app/api/imagen/` | Imagen 4 image generation route |
| `app/api/gpt/` | GPT API route |
| `app/api/project-prompts/` | Project-specific prompts route |
| `app/api/prompt-library/` | Global prompt library route |
| `types.ts` | Shared TypeScript type definitions |
| `constants.tsx` | Pipeline phase data and tool definitions |
| `Dockerfile` | Multi-stage Docker build |
| `cloudbuild.yaml` | Cloud Build CI/CD configuration |
| `deploy.ps1` | PowerShell deployment helper script |
