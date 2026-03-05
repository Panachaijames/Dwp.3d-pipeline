import { ProjectRequest, TeamMember, PipelinePhase, PhaseId } from './types';
import { Box, Sun, Palette, Film, Clapperboard, Wand2 } from 'lucide-react';

export const RenderIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
    <Wand2 size={24} />
  </div>
);

export const PHASE_ICONS: Record<PhaseId, any> = {
  modeling: <Box />,
  lighting: <Sun />,
  material: <Palette />,
  rendering: <Film />,
  animation: <Clapperboard />
};

export const PIPELINE_DATA: PipelinePhase[] = [
  {
    id: 'modeling',
    title: 'Modeling',
    description: 'Create the 3D geometry and structural foundation.',
    standardTools: [
      { name: '3DS MAX', isAi: false, description: 'Local Application' },
      { name: 'REVIT', isAi: false, description: 'Local Application' },
    ],
    aiTools: [
      { name: 'Hyper 3D', url: 'https://www.hyper3d.ai/', isAi: true, isFree: true, description: 'Image to Model' },
      { name: 'Tripo 3D', url: 'https://www.tripo3d.ai/', isAi: true, isFree: true, description: 'Image to Model' },
      { name: 'Gemini Concept Gen', isAi: true, description: 'Internal Service' },
    ]
  },
  {
    id: 'lighting',
    title: 'Lighting',
    description: 'Establish mood, atmosphere, and visibility.',
    standardTools: [],
    aiTools: [
      { name: 'Personal App Bolt', isAi: true, description: 'Internal Tool' },
      { name: 'StyleLens', isAi: true, description: 'Style Analysis Tool' },
    ]
  },
  {
    id: 'material',
    title: 'Material',
    description: 'Apply textures, shaders, and surface properties.',
    standardTools: [],
    aiTools: [
      { name: 'KREA AI', url: 'https://www.krea.ai/', isAi: true },
      { name: 'WhiteModelDecoder', isAi: true, description: 'Material Projector' },
    ]
  },
  {
    id: 'rendering',
    title: 'Rendering',
    description: 'Generate photorealistic images from the 3D scene.',
    standardTools: [],
    aiTools: [
      { name: 'Magnific AI', url: 'https://magnific.ai/', isAi: true, description: 'Upscaling & Enhancing' },
    ]
  },
  {
    id: 'animation',
    title: 'Animation',
    description: 'Create motion and video sequences.',
    standardTools: [],
    aiTools: [
      { name: 'Luma Dream Machine', url: 'https://lumalabs.ai/dream-machine', isAi: true },
      { name: 'Runway Gen-3', url: 'https://runwayml.com/', isAi: true },
      { name: 'Kling AI', url: 'https://klingai.com/', isAi: true },
      { name: 'Gemini Video Gen', isAi: true, description: 'Internal Service' },
    ]
  }
];

