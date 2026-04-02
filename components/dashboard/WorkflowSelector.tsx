"use client";

import React, { useState } from 'react';
import { InputType, OutputType } from '../../types';
import {
    Box,
    Building,
    Image,
    Pencil,
    Camera,
    Film,
    ArrowRight,
    Check,
    Sparkles,
    Layers,
    Image as ImageIcon,
    Wand,
    Loader2
} from 'lucide-react';
import { determinePipelineRoute } from '@/services/geminiService';

interface WorkflowSelectorProps {
    onComplete: (inputType: InputType, outputType: OutputType) => void;
    onBack?: () => void;
}

interface SelectionCard {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
}

// Increased icon sizes for spacious feel
const IconSize = "w-24 h-24";
const SmallIconSize = "w-16 h-16";

const INPUT_OPTIONS: SelectionCard[] = [
    {
        id: '3dmax',
        title: '3DS Max',
        description: 'I have a .max file ready for processing',
        icon: <Box className={IconSize} />
    },
    {
        id: 'magic',
        title: 'AI Assist',
        description: 'Describe what you need, and I will route you.',
        icon: <Wand className={IconSize} />
    },
    {
        id: 'revit',
        title: 'Revit',
        description: 'I have a .rvt architectural model',
        icon: <Building className={IconSize} />
    },
    {
        id: 'image',
        title: 'Image Reference',
        description: 'I have sketches or reference images',
        icon: <Image className={IconSize} />
    }
];

const getOutputOptions = (inputType: InputType): SelectionCard[] => {
    if (inputType === '3dmax') {
        return [
            {
                id: 'concept',
                title: 'Concept / Mood',
                description: 'Mood images or initial sketches',
                icon: <Pencil className={IconSize} />
            },
            {
                id: 'production',
                title: 'Production',
                description: 'White Model → Render → Animation',
                icon: <Layers className={IconSize} />
            }
        ];
    }

    if (inputType === 'image') {
        return [
            {
                id: 'mod_image',
                title: 'Mod Image',
                description: 'Modified image or mood generation',
                icon: <Image className={IconSize} />
            },
            {
                id: 'sketch',
                title: 'Sketch',
                description: 'Concept sketches or line work',
                icon: <Pencil className={IconSize} />
            },
            {
                id: 'existing',
                title: 'Existing Image',
                description: 'Use as direct reference source',
                icon: <ImageIcon className={IconSize} />
            }
        ];
    }

    return [
        {
            id: 'sketch',
            title: 'Sketch',
            description: 'Concept visual',
            icon: <Pencil className={SmallIconSize} />
        },
        {
            id: '3d_model',
            title: '3D Model',
            description: 'Full 3D scene',
            icon: <Layers className={SmallIconSize} />
        },
        {
            id: 'rendering',
            title: 'Rendering',
            description: 'Stills',
            icon: <Camera className={SmallIconSize} />
        },
        {
            id: 'animation',
            title: 'Animation',
            description: 'Video',
            icon: <Film className={SmallIconSize} />
        }
    ];
};

export const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({ onComplete }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedInput, setSelectedInput] = useState<InputType | 'magic' | null>(null);
    const [selectedOutput, setSelectedOutput] = useState<string | null>(null);

    // Magic Route State
    const [magicPrompt, setMagicPrompt] = useState('');
    const [isRouting, setIsRouting] = useState(false);

    const handleMagicRoute = async () => {
        if (!magicPrompt.trim()) return;
        setIsRouting(true);
        try {
            const decision = await determinePipelineRoute(magicPrompt);

            // Auto-select based on AI decision
            if (['3dmax', 'revit', 'image'].includes(decision.input)) {
                // Determine step 2 output
                let mappedOutput = decision.output;
                // Map generic API output to specific component IDs if needed
                if (decision.input === '3dmax' && decision.output === 'concept') mappedOutput = 'concept';
                if (decision.input === '3dmax' && decision.output === 'production') mappedOutput = 'production';
                if (decision.input === 'image' && decision.output === 'concept') mappedOutput = 'mod_image';
                if (decision.input === 'image' && decision.output === 'production') mappedOutput = 'sketch'; // Approximated

                setSelectedInput(decision.input as InputType);
                setSelectedOutput(mappedOutput);
                setStep(2);
            }
        } catch (e) {
            console.error("Magic Route Failed", e);
        } finally {
            setIsRouting(false);
        }
    };

    const handleInputSelect = (id: string) => {
        if (id === 'magic') {
            setSelectedInput('magic');
            // Do not advance step yet
        } else if (id === '3dmax') {
            setSelectedInput(id as InputType);
            window.location.href = 'dwp-max://open'; // Launch 3ds Max
            setTimeout(() => setStep(2), 1500); // Wait a bit before advancing
        } else if (id === 'revit') {
            setSelectedInput(id as InputType);
            window.location.href = 'dwp-revit://open'; // Launch Revit
            setTimeout(() => setStep(2), 1500);
        } else {
            setSelectedInput(id as InputType);
            setTimeout(() => setStep(2), 400);
        }
    };

    const handleOutputSelect = (id: string) => {
        setSelectedOutput(id);
    };

    const handleContinue = () => {
        if (selectedInput && selectedOutput && selectedInput !== 'magic') {
            let finalOutput: OutputType;
            if (selectedOutput === 'concept') finalOutput = 'sketch';
            else if (selectedOutput === 'production') finalOutput = '3d_model';
            else if (selectedOutput === 'existing') finalOutput = 'mod_image';
            else finalOutput = selectedOutput as OutputType;

            onComplete(selectedInput, finalOutput);
        }
    };

    const getOutputLabel = (inputType: InputType): string => {
        switch (inputType) {
            case '3dmax': return 'Choose your workflow path';
            case 'image': return 'How should we process this image?';
            default: return 'Choose your desired deliverable';
        }
    };

    // Helper to get current options safely
    const currentOutputOptions = (selectedInput && selectedInput !== 'magic')
        ? getOutputOptions(selectedInput as InputType)
        : [];

    return (
        <div className="w-full max-w-[1800px] mx-auto animate-fade-in p-8 pt-24 text-center min-h-screen">
            {/* Header */}
            <div className="mb-16">
                <div className="inline-flex items-center gap-3 px-6 py-2 bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-full text-purple-700 dark:text-purple-300 text-base mb-8 animate-slide-in-bottom">
                    <Sparkles className="w-5 h-5" />
                    <span className="font-medium tracking-wide">PHASE {step} OF 2</span>
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-zinc-900 dark:text-white mb-6 animate-slide-in-bottom delay-100 tracking-tight">
                    {step === 1 ? 'What are you starting with?' : (selectedInput && selectedInput !== 'magic' ? getOutputLabel(selectedInput) : '...')}
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-2xl animate-slide-in-bottom delay-150 max-w-2xl mx-auto">
                    {step === 1
                        ? 'Select the type of file, model, or reference you have available.'
                        : 'Select the desired production output or workflow track.'
                    }
                </p>
            </div>

            {/* Step 1: Input Selection - SPACIOUS GRID */}
            {step === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-16 px-4">
                    {INPUT_OPTIONS.map((option, index) => (
                        <button
                            key={option.id}
                            onClick={() => handleInputSelect(option.id)}
                            className={`
                        group relative h-96 rounded-[2rem] border-2 transition-all duration-500
                        flex flex-col items-center justify-center
                        animate-scale-in
                        ${selectedInput === option.id
                                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 shadow-2xl shadow-purple-500/20 scale-105'
                                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 hover:shadow-xl hover:-translate-y-2'
                                }
                      `}
                            style={{ animationDelay: `${index * 100}ms` }}
                        >
                            {/* Selection indicator */}
                            {selectedInput === option.id && (
                                <div className="absolute top-6 right-6 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center animate-scale-in shadow-lg">
                                    <Check className="w-6 h-6 text-white" />
                                </div>
                            )}

                            {/* Icon */}
                            <div className={`
                        mb-10 w-40 h-40 rounded-[2rem] flex items-center justify-center transition-all duration-500
                        ${selectedInput === option.id
                                    ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-xl'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 group-hover:text-purple-500 group-hover:bg-purple-50/50 dark:group-hover:bg-purple-900/30'
                                }
                      `}>
                                {option.icon}
                            </div>

                            {/* Content */}
                            <h3 className={`text-3xl font-bold mb-4 transition-colors ${selectedInput === option.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white'
                                }`}>
                                {option.title}
                            </h3>
                            <p className="text-zinc-500 dark:text-zinc-400 text-lg px-8 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">{option.description}</p>
                        </button>
                    ))}
                </div>
            )}

            {/* AI Assist Overlay */}
            {selectedInput === 'magic' && step === 1 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-2xl bg-zinc-900 border border-purple-500/30 rounded-3xl p-8 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedInput(null)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white"
                        >
                            ✕
                        </button>

                        <div className="flex items-center gap-4 mb-6 text-purple-300">
                            <Wand className="w-8 h-8" />
                            <h3 className="text-2xl font-bold">Magic Pipeline Routing</h3>
                        </div>



                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            {[
                                {
                                    title: "Visualize Model",
                                    desc: "I have a 3D model (Max/Revit). Make it look real.",
                                    icon: <Camera className="w-8 h-8 text-purple-400" />,
                                    i: '3dmax', o: 'production'
                                },
                                {
                                    title: "Explore Concepts",
                                    desc: "I have an idea or sketch. Show me options.",
                                    icon: <Pencil className="w-8 h-8 text-blue-400" />,
                                    i: 'image', o: 'concept'
                                },
                                {
                                    title: "Create Animation",
                                    desc: "I need a walkthrough video from my scene.",
                                    icon: <Film className="w-8 h-8 text-pink-400" />,
                                    i: '3dmax', o: 'animation'
                                },
                                {
                                    title: "Refine Render",
                                    desc: "I have an existing render. Improve/Edit it.",
                                    icon: <Sparkles className="w-8 h-8 text-amber-400" />,
                                    i: 'image', o: 'mod_image'
                                },
                            ].map((preset, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onComplete(preset.i as InputType, preset.o as OutputType)}
                                    className="flex items-start gap-4 p-6 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-purple-500/50 rounded-2xl transition-all group text-left hover:scale-[1.02] hover:shadow-xl"
                                >
                                    <div className="p-3 bg-zinc-900 rounded-xl group-hover:bg-zinc-950 transition-colors">
                                        {preset.icon}
                                    </div>
                                    <div>
                                        <div className="font-bold text-xl text-zinc-200 group-hover:text-white mb-1">{preset.title}</div>
                                        <div className="text-sm text-zinc-400 group-hover:text-zinc-300 leading-snug">{preset.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="text-center">
                            <button
                                onClick={() => setIsRouting(!isRouting)}
                                className="text-xs font-medium text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest"
                            >
                                {isRouting ? "Hide Advanced Search" : "Use Custom Description Instead"}
                            </button>
                        </div>

                        {isRouting && (
                            <div className="mt-6 animate-in fade-in slide-in-from-bottom-4">
                                <textarea
                                    className="w-full h-24 bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-base resize-none"
                                    placeholder="Describe your specific needs..."
                                    value={magicPrompt}
                                    onChange={(e) => setMagicPrompt(e.target.value)}
                                />
                                <div className="flex justify-end mt-4">
                                    <button
                                        onClick={handleMagicRoute}
                                        disabled={!magicPrompt.trim()}
                                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm"
                                    >
                                        Analyze & Route
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* Step 2: Output Selection - SPACIOUS GRID */}
            {step === 2 && (
                <>
                    {/* Selected input indicator */}
                    <div className="flex items-center justify-center gap-6 mb-16 animate-slide-in-bottom">
                        <div className="flex items-center gap-4 px-8 py-4 bg-white border border-slate-200 rounded-2xl shadow-lg">
                            {/* Small icon version required or scale down */}
                            <div className="scale-75 origin-center transform -ml-2 text-purple-600">
                                {INPUT_OPTIONS.find(o => o.id === selectedInput)?.icon}
                            </div>
                            <span className="text-slate-800 text-xl font-bold">
                                {INPUT_OPTIONS.find(o => o.id === selectedInput)?.title}
                            </span>
                        </div>
                        <ArrowRight className="w-8 h-8 text-slate-400" />
                        <div className={`px-8 py-4 rounded-2xl border transition-all text-xl font-medium ${selectedOutput
                            ? 'bg-purple-50 border-purple-500 text-purple-700'
                            : 'bg-slate-50 border-dashed border-slate-300 text-slate-400 italic'
                            }`}>
                            {selectedOutput
                                ? currentOutputOptions.find(o => o.id === selectedOutput)?.title
                                : 'Select output...'
                            }
                        </div>
                    </div>

                    <div className={`grid grid-cols-1 ${currentOutputOptions.length === 2 ? 'md:grid-cols-2 max-w-5xl mx-auto' : 'md:grid-cols-3 md:max-w-7xl mx-auto'} gap-10 mb-16 px-4`}>
                        {currentOutputOptions.map((option, index) => (
                            <button
                                key={option.id}
                                onClick={() => handleOutputSelect(option.id)}
                                className={`
                          group relative h-[22rem] rounded-3xl border-2 transition-all duration-500 flex flex-col items-center justify-center p-8
                          animate-scale-in
                          ${selectedOutput === option.id
                                        ? 'bg-purple-50 border-purple-500 shadow-xl shadow-purple-500/10 scale-105'
                                        : 'bg-white border-slate-200 hover:border-purple-300 hover:bg-slate-50/50 hover:shadow-xl hover:-translate-y-2'
                                    }
                        `}
                                style={{ animationDelay: `${index * 75}ms` }}
                            >
                                {selectedOutput === option.id && (
                                    <div className="absolute top-5 right-5 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center animate-scale-in shadow-lg">
                                        <Check className="w-5 h-5 text-white" />
                                    </div>
                                )}

                                <div className={`
                          mb-6 w-28 h-28 rounded-3xl flex items-center justify-center transition-all duration-500
                          ${selectedOutput === option.id
                                        ? 'bg-white text-purple-600 shadow-md'
                                        : 'bg-slate-100 text-slate-400 group-hover:text-purple-500 group-hover:bg-purple-50/50'
                                    }
                        `}>
                                    {option.icon}
                                </div>

                                <h3 className={`text-2xl font-bold mb-3 transition-colors ${selectedOutput === option.id ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'
                                    }`}>
                                    {option.title}
                                </h3>
                                <p className="text-slate-500 text-base">{option.description}</p>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-center gap-8 pt-8 animate-slide-in-bottom delay-300">
                        <button
                            onClick={() => {
                                setStep(1);
                                setSelectedOutput(null);
                            }}
                            className="text-zinc-400 hover:text-white transition-colors px-8 py-3 rounded-xl border border-transparent hover:bg-zinc-800 hover:border-zinc-700 text-lg"
                        >
                            ← Back
                        </button>

                        <button
                            onClick={handleContinue}
                            disabled={!selectedOutput}
                            className={`
                        flex items-center gap-4 px-12 py-4 rounded-xl font-bold text-lg transition-all duration-300
                        ${selectedOutput
                                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl hover:shadow-2xl hover:scale-105 animate-pulse-scale'
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                }
                      `}
                        >
                            OPEN WORKFLOW
                            <ArrowRight className="w-6 h-6" />
                        </button>
                    </div>
                </>
            )}

            {/* Visual Pipeline (Bottom) */}
            <div className="mt-auto pt-16 border-t border-zinc-800/50 w-full max-w-5xl mx-auto">
                <div className="text-center text-sm font-semibold tracking-widest text-zinc-600 mb-6 uppercase">Active Workflow Pipeline</div>
                <div className="flex items-center justify-center gap-4 text-base flex-wrap">
                    <div className={`px-5 py-2.5 rounded-xl border bg-purple-900/30 text-purple-200 border-purple-500/30 shadow-md`}>
                        {selectedInput === 'magic' ? 'AI Routing' : (INPUT_OPTIONS.find(o => o.id === selectedInput)?.title || 'Input Source')}
                    </div>

                    <div className="w-8 h-0.5 bg-gradient-to-r from-purple-500/50 to-zinc-700" />

                    {selectedOutput ? (
                        <div className="px-5 py-2.5 rounded-xl border bg-purple-900/30 text-purple-200 border-purple-500/30 shadow-md animate-fade-in">
                            {currentOutputOptions.find(o => o.id === selectedOutput)?.title}
                        </div>
                    ) : (
                        <div className="px-5 py-2.5 rounded-xl border border-dashed border-zinc-700 text-zinc-600 bg-zinc-900/30">
                            Select Output...
                        </div>
                    )}

                    {selectedOutput === 'production' && (
                        <>
                            <div className="w-8 h-0.5 bg-zinc-800" />
                            <div className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500">3D White Model</div>
                            <div className="w-8 h-0.5 bg-zinc-800" />
                            <div className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500">Rendering</div>
                            <div className="w-8 h-0.5 bg-zinc-800" />
                            <div className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500">Animation</div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
