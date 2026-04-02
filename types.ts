// Workflow Types
export type InputType = '3dmax' | 'revit' | 'image';
export type OutputType = 'mod_image' | 'sketch' | '3d_model' | 'rendering' | 'animation' | 'concept';

export type PhaseId = 'modeling' | 'lighting' | 'material' | 'rendering' | 'animation';

export interface Tool {
  name: string;
  url?: string;
  isAi: boolean;
  isFree?: boolean;
  description?: string;
  iconType?: 'standard' | 'ai' | 'custom-render';
}

export interface PipelinePhase {
  id: PhaseId;
  title: string;
  description: string;
  standardTools: Tool[];
  aiTools: Tool[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  image?: string; // base64
}

export interface ProjectArea {
  id: number;
  scope: string;
  designer: string;
  startDate: string;
  targetDate: string;
  description: string;
}

export interface ProjectRequest {
  id: string; // The generated Request ID (e.g. XX240420AB)

  // Project Info
  studioFullName: string;
  projectNumber: string;
  requestName: string; // Used to be title
  projectName: string;

  // Requester
  department: string;
  requester: string;

  // Details
  numberOfRenderings: number;
  description: string; // General description
  deadline: string;

  // Specifics
  sharedPresentationLink?: string;
  designReviewBooking?: string;
  providedFiles?: string[];
  driveFolderId?: string;
  driveFolderName?: string;
  resourceFolderId?: string;
  resourceFolderName?: string;

  // Workflow Selection
  inputType?: InputType;
  outputType?: OutputType;
  preferredTool?: '3ds Max' | 'Render for Revit' | 'AI Rendering';

  // Areas
  areas: ProjectArea[];

  // System Fields
  status: 'Submitted' | 'In Progress' | 'Completed';
  currentPhase: PhaseId | 'queued' | 'done';
  progress: number; // 0-100
  priority: 'Low' | 'Medium' | 'High';
  submittedBy: string;
  timestamp: string;
  
  // Schedule / Distribution
  assigned_to?: string;
}

export interface TeamMember {
  current_task: string;
  current_phase: PhaseId;
  id: string;
  name: string;
  role: string;
  currentTask: string;
  currentPhase: PhaseId;
  avatarUrl?: string;
  avatar_url?: string; // DB column match
  status: 'online' | 'busy' | 'offline';
  progress?: number;
}

// --- White Model Decoder Types ---

export enum AppState {
  INPUT = 'INPUT',
  LOADING = 'LOADING',
  EDITOR = 'EDITOR',
  GENERATING = 'GENERATING',
  ERROR = 'ERROR'
}

export interface ElementData {
  id: string;
  name: string;
  description: string;
  userPrompt: string;           // The material prompt
  referenceImage?: string;      // Base64
}

export interface AnalysisResult {
  category: string;
  summary: string;
  elements: ElementData[];
}

export interface Question {
  id: string;
  preText: string;
  postText: string;
  answer: string;
  hint?: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

// --- StyleLens Types ---

export interface StyleElement {
  name: string;
  description: string;
  materialSuggestion: string;
}

export interface ColorPaletteItem {
  color: string; // Hex code
  usage: string;
}

export interface CharacterDescription {
  adjectives: string[];
  mood: string;
}

export interface StyleAnalysisResult {
  styleSummary: string;
  styleName: string;
  description: string;
  elements: StyleElement[];
  colorPalette: ColorPaletteItem[];
  character: CharacterDescription;
}
