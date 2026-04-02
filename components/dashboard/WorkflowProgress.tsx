import React from 'react';
import { PHASE_ICONS, PIPELINE_DATA } from '../../constants';
import { PhaseId, InputType, OutputType } from '../../types';
import { CheckCircle2, Circle, ArrowDown } from 'lucide-react';

interface WorkflowProgressProps {
    currentPhase: PhaseId;
    input: InputType;
    output: OutputType;
}

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({ currentPhase, input, output }) => {
    // Define the flow based on input/output
    // This is a simplified logic, can be expanded
    const getSteps = () => {
        const steps: PhaseId[] = ['modeling', 'lighting', 'material', 'rendering'];
        if (output === 'animation') steps.push('animation');
        return steps;
    };

    const steps = getSteps();
    const currentStepIndex = steps.indexOf(currentPhase);

    return (
        <div className="w-64 bg-zinc-50 dark:bg-zinc-900/50 border-l border-zinc-200 dark:border-zinc-800 p-6 hidden xl:block h-full overflow-y-auto">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6">Workflow Progress</h3>

            <div className="relative">
                {/* Connecting Line */}
                <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-zinc-200 dark:bg-zinc-800" />

                <div className="space-y-8 relative">
                    {/* START */}
                    <div className="flex gap-4 relative">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 border-2 border-green-500 flex items-center justify-center shrink-0 z-10">
                            <span className="text-green-600 dark:text-green-400 text-xs font-bold">IN</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-zinc-500 uppercase">Input</p>
                            <p className="font-semibold text-zinc-900 dark:text-white capitalize">{input}</p>
                        </div>
                    </div>

                    {/* PHASES */}
                    {steps.map((stepId, index) => {
                        const phase = PIPELINE_DATA.find(p => p.id === stepId);
                        const isCompleted = index < currentStepIndex;
                        const isCurrent = index === currentStepIndex;
                        const isPending = index > currentStepIndex;

                        if (!phase) return null;

                        return (
                            <div key={stepId} className="flex gap-4 relative">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors duration-300
                                    ${isCompleted ? 'bg-purple-600 border-2 border-purple-600' : ''}
                                    ${isCurrent ? 'bg-white dark:bg-zinc-950 border-2 border-purple-500 shadow-[0_0_0_4px_rgba(168,85,247,0.2)]' : ''}
                                    ${isPending ? 'bg-white dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-700' : ''}
                                `}>
                                    {isCompleted ? (
                                        <CheckCircle2 size={16} className="text-white" />
                                    ) : isCurrent ? (
                                        <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
                                    ) : (
                                        <Circle size={12} className="text-zinc-300 dark:text-zinc-600" />
                                    )}
                                </div>
                                <div className={`${isPending ? 'opacity-50 blur-[0.5px] grayscale' : ''} transition-all duration-300`}>
                                    <p className={`text-xs font-bold uppercase mb-0.5 ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-500'}`}>
                                        Step {index + 1}
                                    </p>
                                    <h4 className={`font-semibold ${isCurrent ? 'text-zinc-900 dark:text-white text-lg' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                        {phase.title}
                                    </h4>
                                    {isCurrent && (
                                        <p className="text-xs text-zinc-500 mt-1 max-w-[150px]">
                                            {phase.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* END */}
                    <div className="flex gap-4 relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 
                            ${currentStepIndex >= steps.length ? 'bg-purple-600 border-purple-600' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700'}
                        `}>
                            <span className={`text-xs font-bold ${currentStepIndex >= steps.length ? 'text-white' : 'text-zinc-300'}`}>OUT</span>
                        </div>
                        <div className={currentStepIndex < steps.length ? 'opacity-50' : ''}>
                            <p className="text-xs font-bold text-zinc-500 uppercase">Deliverable</p>
                            <p className="font-semibold text-zinc-900 dark:text-white capitalize">{output.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
