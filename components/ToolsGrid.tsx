import React from 'react';
import { PipelinePhase } from '../types';
import { ExternalLink, Zap, Monitor, ArrowLeft } from 'lucide-react';
import { RenderIcon } from '../constants';
import { GeminiPanel } from './GeminiPanel';
import { StyleLens } from './StyleLens';
import { WhiteModelDecoder } from './WhiteModelDecoder';

interface ToolsGridProps {
  phase: PipelinePhase;
  activeInternalTool: string | null;
  onToolActivate: (toolName: string) => void;
  onBackToGrid: () => void;
}

export const ToolsGrid: React.FC<ToolsGridProps> = ({
  phase,
  activeInternalTool,
  onToolActivate,
  onBackToGrid
}) => {

  // Local App Launcher Modal State
  const [showLocalAppModal, setShowLocalAppModal] = React.useState<string | null>(null);

  if (showLocalAppModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl relative">
          <button
            onClick={() => setShowLocalAppModal(null)}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
          >
            <ExternalLink className="rotate-45" />
          </button>

          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
            <Monitor size={32} />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Launch {showLocalAppModal}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              This is a desktop application installed on your machine. Please open it directly from your Start Menu or Desktop.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowLocalAppModal(null)}
              className="w-full py-3 px-4 bg-zinc-900 dark:bg-white text-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-opacity"
            >
              Okay, I'll open it
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeInternalTool) {
    if (activeInternalTool === 'Gemini 3 Pro' || activeInternalTool === 'Gemini Concept Gen' || activeInternalTool === 'Hyper 3D' || activeInternalTool === 'Adobe Firefly' || activeInternalTool === 'Gemini Video Gen' || activeInternalTool === 'StyleLens' || activeInternalTool === 'WhiteModelDecoder') {
      return (
        <div className="animate-fade-in">
          <button
            onClick={onBackToGrid}
            className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Tools
          </button>

          {activeInternalTool === 'StyleLens' ? (
            <StyleLens onBack={onBackToGrid} />
          ) : activeInternalTool === 'WhiteModelDecoder' ? (
            <WhiteModelDecoder onBack={onBackToGrid} />
          ) : (
            <GeminiPanel
              toolName={activeInternalTool}
              phaseId={phase.id}
              onClose={onBackToGrid}
            />
          )}
        </div>
      );
    }
    // Handle other internal tools if any, or just show placeholder
    return (
      <div className="p-8 text-center border border-zinc-800 rounded-2xl bg-zinc-900/50">
        <h3 className="text-xl font-bold text-white mb-2">{activeInternalTool}</h3>
        <p className="text-zinc-500 mb-4">This tool interface is under development.</p>
        <button
          onClick={onBackToGrid}
          className="text-purple-400 hover:text-purple-300 font-medium"
        >
          Go Back
        </button>
      </div>
    )
  }

  const renderSection = (title: string, tools: any[]) => {
    if (!tools || tools.length === 0) return null;

    return (
      <div className="mb-10 last:mb-0">
        <h3 className="text-zinc-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          {title}
          <div className="h-px bg-zinc-800 dark:bg-zinc-800 flex-1"></div>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map((tool, index) => (
            <div
              key={index}
              onClick={() => {
                if (tool.url) {
                  window.open(tool.url, '_blank');
                } else if (tool.description === 'Local Application') {
                  setShowLocalAppModal(tool.name);
                } else {
                  onToolActivate(tool.name);
                }
              }}
              className={`
                            group relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
                            ${tool.isAi
                  ? 'bg-zinc-900/40 dark:bg-zinc-900/60 border-purple-900/30 hover:border-purple-500/50 hover:shadow-[0_0_25px_rgba(168,85,247,0.1)] hover:-translate-y-1'
                  : 'bg-white/5 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-lg hover:-translate-y-1'
                }
                        `}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {tool.iconType === 'custom-render' ? (
                    <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                      <RenderIcon />
                    </div>
                  ) : (
                    <div className={`p-2.5 rounded-xl ${tool.isAi
                      ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                      {tool.isAi ? <Zap size={22} /> : <Monitor size={22} />}
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-purple-600 dark:group-hover:text-white transition-colors text-lg">
                      {tool.name}
                    </h4>
                    {tool.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{tool.description}</p>
                    )}
                  </div>
                </div>

                {tool.url && <ExternalLink size={16} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />}
              </div>

              {tool.isFree && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-900/50">
                  FREE
                </span>
              )}

              {/* Hover Gradient Overlay */}
              <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100 
                            ${tool.isAi
                  ? 'bg-gradient-to-br from-purple-500/5 via-transparent to-transparent'
                  : 'bg-gradient-to-br from-zinc-500/5 via-transparent to-transparent'
                }
                        `} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{phase.title} Tools</h2>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl">{phase.description}</p>
      </div>

      {renderSection("Standard Tools", phase.standardTools)}
      {renderSection("AI & Accelerated Tools", phase.aiTools)}
    </div>
  );
};
