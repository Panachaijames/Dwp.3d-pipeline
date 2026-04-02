"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TOOLS, VizProject, VizLog, PhaseKey, freshLog as makeFreshLog } from './constants';
import { useAuth } from '../../../contexts/AuthContext';
import { PdfSectionPicker } from '../PdfLibrary/PdfSectionPicker';
import { usePdfLibraryStore, PdfContextSelection } from '@/store/usePdfLibraryStore';

const LLM_PROVIDERS = [
    { id: "gemini", label: "Gemini 3.1 Pro", active: true },
    { id: "claude", label: "Claude Opus", active: true },
    { id: "gpt", label: "GPT-5.4", active: true },
];

interface Props { proj: VizProject; logs: VizLog[]; saveL: (l: VizLog) => void; freshLog: (pid: string, toolName?: string) => VizLog; }
interface PGResult {
    id: string;
    mode: string;
    input: string;
    tools: string;
    content: string;
    llm: string;
    feedback?: "good" | "retry" | null;
    retryHint?: string;
    retrying?: boolean;
}

export default function PromptGenWorkspace({ proj, logs, saveL, freshLog: makeFresh }: Props) {
    const { user } = useAuth();
    const [mode, setMode] = useState<"brief" | "image" | "custom">("brief");
    const [briefInput, setBriefInput] = useState("");
    const [imageFile, setImageFile] = useState<string | null>(null);
    const [imageData, setImageData] = useState<string | null>(null);
    const [customCtx, setCustomCtx] = useState("");
    const [targetTools, setTargetTools] = useState<string[]>(["Midjourney"]);
    const [llmProvider, setLlmProvider] = useState("gemini");
    const [results, setResults] = useState<PGResult[]>([]);
    const [loading, setLoading] = useState(false);
    // Per-result retry hint state (keyed by result id)
    const [retryHints, setRetryHints] = useState<Record<string, string>>({});
    // Feedback flash states
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
    const [fullScreenResult, setFullScreenResult] = useState<string | null>(null);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
    // Direct Image Generation State
    const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
    const [showImageOptions, setShowImageOptions] = useState<Record<string, boolean>>({});
    const [generatedImages, setGeneratedImages] = useState<Record<string, string[]>>({});
    const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
    // PDF Library Context state
    const [pdfContext, setPdfContext] = useState<PdfContextSelection[]>([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    // PDF extraction state
    const [pdfName, setPdfName] = useState<string | null>(null);
    const [pdfExtracting, setPdfExtracting] = useState(false);

    // Snippet Modals
    const [snippetModal, setSnippetModal] = useState<{ isOpen: boolean, text: string, name: string, type: "global" | "project", mode: string, tools: string, llm: string }>({ isOpen: false, text: "", name: "", type: "global", mode: "", tools: "", llm: "" });
    const [pickerModal, setPickerModal] = useState<{ isOpen: boolean, target: "brief" | "custom", activeTab: "top10" | "project" | "global" }>({ isOpen: false, target: "custom", activeTab: "top10" });
    const [pickerEntries, setPickerEntries] = useState<any[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);

    const outputRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const pdfRef = useRef<HTMLInputElement>(null);

    // Initialize the PDF store so sections are available even if the user hasn't visited the PDF Library tab yet
    useEffect(() => {
        if (proj.id) {
            usePdfLibraryStore.getState().init(proj.id);
        }
    }, [proj.id]);

    const toggleTool = (t: string) => setTargetTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const externalTools = TOOLS.filter(t => !t.internal && !t.future);

    const handlePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setPdfName(f.name);
        setPdfExtracting(true);
        setBriefInput('');
        try {
            // Dynamically import pdfjs to avoid SSR issues
            const pdfjsLib = await import('pdfjs-dist');
            // Point to the worker bundled with pdfjs-dist
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
            const arrayBuffer = await f.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pages: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => ('str' in item ? item.str : ''))
                    .join(' ')
                    .replace(/ {2,}/g, ' ')
                    .trim();
                if (pageText) pages.push(`--- Page ${i} ---\n${pageText}`);
            }
            const fullText = pages.join('\n\n');
            setBriefInput(fullText || '[No readable text found in PDF]');
        } catch (err) {
            setBriefInput('[Error reading PDF — please paste the brief manually]');
            setPdfName(null);
        }
        setPdfExtracting(false);
        // Reset input so same file can be re-uploaded
        if (pdfRef.current) pdfRef.current.value = '';
    };

    const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        setImageFile(f.name);
        const reader = new FileReader();
        reader.onload = ev => setImageData(ev.target?.result as string);
        reader.readAsDataURL(f);
    };

    const callLLM = async (endpoint: string, prompt: string, systemPrompt: string, pdfStoragePaths?: { name: string, path: string }[]) => {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, systemPrompt, pdfStoragePaths }),
        });

        if (!res.ok) {
            let errorMsg = `Error ${res.status}: ${res.statusText}`;
            try {
                const text = await res.text();
                try {
                    const data = JSON.parse(text);
                    if (data.error) errorMsg = data.error;
                } catch {
                    // Not valid JSON, probably an HTML error page (e.g. from Cloud Run)
                    if (res.status === 504) {
                        errorMsg = "Gateway Timeout (504): The request took too long. Try fewer PDFs or a shorter prompt.";
                    } else if (text) {
                        // Include a clean snippet of the text response if possible
                        errorMsg += ` - ${text.substring(0, 100).replace(/<[^>]*>?/gm, '').trim()}`;
                    }
                }
            } catch (e) {
                // Ignore text reading errors
            }
            throw new Error(errorMsg);
        }

        const data = await res.json();
        return data.response || data.text || (data.error ? `Error: ${data.error}` : "No response received.");
    };

    const generate = async () => {
        if (loading) return;
        const inputText = mode === "brief" ? briefInput : mode === "image" ? `[Image: ${imageFile}]` : customCtx;
        if (!inputText.trim() && mode !== "image") return;
        setLoading(true);
        const endpoint = llmProvider === "claude" ? "/api/claude" : llmProvider === "gpt" ? "/api/gpt" : "/api/gemini";

        const pdfContextString = pdfContext.map(s => `***${s.sectionName}***\n${s.text}`).join('\n\n');
        const systemBase = `You are a prompt engineering expert for architectural visualization at dwp | design worldwide partnership. Generate optimised prompts for these tools: ${targetTools.join(", ")}. Project: ${proj.name} (${proj.sector}, ${proj.phase}). Format each tool's prompt clearly with headers.`;

        const system = pdfContextString
            ? `${systemBase}\n\nSystem Instructions:\n- You must CAREFULLY read and cross-reference ALL of the provided reference documents.\n- Perform a comprehensive analysis based on the design brief.\n- Create tailored prompts based on the spaces, materials, and constraints described.\n- VERY IMPORTANT: You MUST explicitly include the actual material names, finishes, and brands found in the reference documents in your final generated prompts.\n- Include the actual section name in the generated output to specify the space.\n- Rely heavily on the provided context for materials, lighting, and layout details.`
            : systemBase;

        const contextBlock = pdfContextString ? `\n\n### attached Reference Documentation\n${pdfContextString}\n\n` : "";

        const userMsg = mode === "brief"
            ? `Design Brief:\n${briefInput}${contextBlock}\nGenerate optimised prompts for: ${targetTools.join(", ")}`
            : mode === "image"
                ? `Analyse this reference image and generate prompts for: ${targetTools.join(", ")}.\nContext: ${customCtx || "Analyse architecture, materials, lighting, and atmosphere."}${contextBlock}`
                : `Context: ${customCtx}${contextBlock}\nGenerate prompts for: ${targetTools.join(", ")}`;

        const pdfStoragePaths: { name: string, path: string }[] = [];
        pdfContext.forEach(ctx => {
            if (ctx.pdfs) {
                ctx.pdfs.forEach(p => {
                    if (p.storagePath && !pdfStoragePaths.find(x => x.path === p.storagePath)) {
                        pdfStoragePaths.push({ name: p.name, path: p.storagePath });
                    }
                });
            }
        });

        try {
            const content = await callLLM(endpoint, userMsg, system, pdfStoragePaths);
            const id = Math.random().toString(36).substr(2, 9);
            setResults(prev => [{ id, mode, input: inputText.slice(0, 60), tools: targetTools.join(", "), content, llm: llmProvider, feedback: null }, ...prev]);
        } catch (error: any) {
            const errorMsg = error.message || "Error connecting to API.";
            setResults(prev => [{ id: Math.random().toString(36).substr(2, 9), mode, input: inputText.slice(0, 60), tools: targetTools.join(", "), content: errorMsg, llm: llmProvider, feedback: null }, ...prev]);
        }
        setLoading(false);
        setTimeout(() => outputRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
    };

    const handleFeedback = (id: string, feedback: "good" | "retry") => {
        setResults(prev => prev.map(r => r.id === id ? { ...r, feedback } : r));
    };

    const handleRetry = async (r: PGResult) => {
        const hint = retryHints[r.id] || "";
        const endpoint = r.llm === "claude" ? "/api/claude" : r.llm === "gpt" ? "/api/gpt" : "/api/gemini";

        const pdfContextString = pdfContext.map(s => `***${s.sectionName}***\n${s.text}`).join('\n\n');
        const systemBase = `You are a prompt engineering expert for architectural visualization at dwp | design worldwide partnership. Generate optimised prompts for these tools: ${r.tools}. Project: ${proj.name} (${proj.sector}, ${proj.phase}). Format each tool's prompt clearly with headers.`;

        const system = pdfContextString
            ? `${systemBase}\n\nSystem Instructions:\n- You must CAREFULLY read and cross-reference ALL of the provided reference documents.\n- Perform a comprehensive analysis based on the design brief.\n- Create tailored prompts based on the spaces, materials, and constraints described.\n- VERY IMPORTANT: You MUST explicitly include the actual material names, finishes, and brands found in the reference documents in your final generated prompts.\n- Include the actual section name in the generated output to specify the space.\n- Rely heavily on the provided context for materials, lighting, and layout details.`
            : systemBase;

        const hintNote = hint.trim()
            ? `The user's specific improvement request: "${hint.trim()}".`
            : "No specific hint provided — use your best judgment to self-improve.";
        const retryPrompt = `The previous generated prompt output was not satisfactory. Please rewrite it to be more specific, better structured, more contextually accurate for architectural visualization, and more optimised for direct use in AI image/render tools.\n\n${hintNote}\n\nPrevious output:\n${r.content}\n\nNow produce an improved version for: ${r.tools}`;

        const pdfStoragePaths: { name: string, path: string }[] = [];
        pdfContext.forEach(ctx => {
            if (ctx.pdfs) {
                ctx.pdfs.forEach(p => {
                    if (p.storagePath && !pdfStoragePaths.find(x => x.path === p.storagePath)) {
                        pdfStoragePaths.push({ name: p.name, path: p.storagePath });
                    }
                });
            }
        });

        // Mark as retrying
        setResults(prev => prev.map(x => x.id === r.id ? { ...x, retrying: true, feedback: null } : x));
        try {
            const content = await callLLM(endpoint, retryPrompt, system, pdfStoragePaths);
            setResults(prev => prev.map(x => x.id === r.id ? { ...x, content, retrying: false, feedback: null, retryHint: hint } : x));
        } catch (error: any) {
            const errorMsg = error.message || "Error during retry.";
            setResults(prev => prev.map(x => x.id === r.id ? { ...x, content: errorMsg, retrying: false } : x));
        }
        // Clear the hint input for this card
        setRetryHints(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    };

    const generateImage = async (r: PGResult, targetModel: 'imagen-4' | 'nano-banana') => {
        setImageLoading(prev => ({ ...prev, [r.id]: true }));
        setImageErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; });
        setShowImageOptions(prev => ({ ...prev, [r.id]: false }));

        try {
            const res = await fetch("/api/imagen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: r.content, targetModel }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to generate image.");
            }

            setGeneratedImages(prev => ({ ...prev, [r.id]: data.images || [data.image] }));
        } catch (err: any) {
            setImageErrors(prev => ({ ...prev, [r.id]: err.message }));
        } finally {
            setImageLoading(prev => ({ ...prev, [r.id]: false }));
        }
    };

    const handleExport = (base64Url: string, index: number) => {
        const a = document.createElement("a");
        a.href = base64Url;
        a.download = `PromptGen-Concept-${index + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleSaveSnippetStart = (r: PGResult) => {
        const selection = window.getSelection()?.toString().trim();
        const textToSave = selection || r.content;
        setSnippetModal({
            isOpen: true,
            text: textToSave,
            name: "",
            type: "project",
            mode: r.mode,
            tools: r.tools,
            llm: r.llm
        });
    };

    const submitSnippet = async () => {
        if (!snippetModal.name.trim()) return alert("Please enter a name for this prompt/snippet.");

        const isProject = snippetModal.type === "project";
        const endpoint = isProject ? '/api/project-prompts' : '/api/prompt-library';

        const payload = {
            name: snippetModal.name,
            prompt: snippetModal.text,
            is_snippet: true,
            tool: snippetModal.tools,
            phase: proj.phase,
            mode: snippetModal.mode,
            llm: snippetModal.llm,
            project_name: proj.name || proj.projectId || 'Untitled',
            saved_by: user?.name || user?.email || 'Unknown',
            ...(isProject && { project_id: proj.id })
        };

        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            setSnippetModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error("Error saving snippet", error);
            alert("Failed to save snippet.");
        }
    };

    const openPicker = (target: "brief" | "custom") => {
        setPickerModal({ isOpen: true, target, activeTab: "top10" });
    };

    const loadPickerEntries = useCallback(async () => {
        setPickerLoading(true);
        try {
            let endpoint = '';
            if (pickerModal.activeTab === 'top10') endpoint = '/api/prompt-library/top';
            else if (pickerModal.activeTab === 'global') endpoint = '/api/prompt-library';
            else endpoint = `/api/project-prompts?projectId=${proj.id}`;

            const res = await fetch(endpoint);
            const data = await res.json();
            setPickerEntries(data.entries || []);
        } catch {
            setPickerEntries([]);
        }
        setPickerLoading(false);
    }, [pickerModal.activeTab, proj.id]);

    useEffect(() => {
        if (pickerModal.isOpen) {
            loadPickerEntries();
        }
    }, [pickerModal.isOpen, pickerModal.activeTab, loadPickerEntries]);

    const selectPickerEntry = (promptText: string) => {
        if (pickerModal.target === "brief") {
            setBriefInput(prev => prev + (prev.trim() ? '\n\n' : '') + promptText);
        } else {
            setCustomCtx(prev => prev + (prev.trim() ? '\n\n' : '') + promptText);
        }
        setPickerModal(prev => ({ ...prev, isOpen: false }));
    };

    const logResult = (r: PGResult) => {
        // Save to local prompt log
        const log = makeFresh(proj.id, "Prompt Generator");
        log.prompt = r.content; log.phase = proj.phase;
        log.notes = `Mode: ${r.mode} | Tools: ${r.tools} | LLM: ${r.llm}`;
        log.publishTarget = 'none'; // Default to not published
        saveL(log);

        setSavedIds(prev => new Set(prev).add(r.id));
        setTimeout(() => setSavedIds(prev => { const n = new Set(prev); n.delete(r.id); return n; }), 1800);
    };
    const copyText = (t: string, id: string) => {
        navigator.clipboard.writeText(t);
        setCopiedIds(prev => new Set(prev).add(id));
        setTimeout(() => setCopiedIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 1800);
    };

    return (
        <div className="vw-pg-ws">
            <div className="vw-pg-left">
                <div className="vw-pg-left-hd">
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--or)", fontWeight: 600 }}>Prompt Generator</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>AI Prompt Engineering</div>
                    <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 2 }}>{proj.name} · {proj.phase}</div>
                </div>
                <div className="vw-pg-left-body">
                    {/* Mode select */}
                    {([["brief", "◇", "From Brief", "Paste a design brief. AI generates optimised prompts for each platform.", "brief"] as const,
                    ["image", "◐", "From Image", "Upload a reference. AI analyses architecture, materials, atmosphere.", "image"] as const,
                    ["custom", "◫", "Custom", "General-purpose prompt generation from any context.", "custom"] as const]).map(([id, ic, lb, d]) => (
                        <div key={id} className={`vw-pg-mode ${mode === id ? "on" : ""}`} onClick={() => setMode(id)}>
                            <div className="pm-icon">{ic}</div><div className="pm-l">{lb}</div><div className="pm-d">{d}</div>
                        </div>
                    ))}
                    {/* Input */}
                    {mode === "brief" && (
                        <>
                            {/* PDF Upload row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                                <input
                                    type="file"
                                    ref={pdfRef}
                                    accept="application/pdf"
                                    style={{ display: 'none' }}
                                    onChange={handlePdf}
                                />
                                <button
                                    className="vw-btn vw-btn-g vw-btn-sm"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}
                                    onClick={() => pdfRef.current?.click()}
                                    disabled={pdfExtracting}
                                >
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M2 10.5h8M6 1.5v7M3.5 6l2.5 2.5L8.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {pdfExtracting ? 'Extracting…' : 'Upload PDF Brief'}
                                </button>
                                {pdfName && !pdfExtracting && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L4 7.5L8 3" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        <span style={{ fontSize: 9, color: 'var(--tx3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName}</span>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--tx3)', padding: 0 }} onClick={() => { setPdfName(null); setBriefInput(''); }}>×</button>
                                    </div>
                                )}
                                {pdfExtracting && <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Reading pages…</span>}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button onClick={() => openPicker("brief")} className="vw-btn vw-btn-g vw-btn-sm" style={{ fontSize: 9 }}>
                                    + Insert Prompts / Snippets
                                </button>
                            </div>
                            <textarea
                                className="vw-ft"
                                value={briefInput}
                                onChange={e => setBriefInput(e.target.value)}
                                placeholder={pdfName ? 'Extracted text will appear here — you can edit it before generating…' : 'Paste design brief here, or upload a PDF above…'}
                                style={{ marginTop: 8, fontFamily: 'var(--m)', fontSize: 10, minHeight: 120, width: '100%', boxSizing: 'border-box' }}
                            />
                        </>
                    )}
                    {mode === "image" && <>
                        <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handleImage} />
                        {!imageData ? <div className="vw-pg-dropzone" onClick={() => fileRef.current?.click()} style={{ marginTop: 12 }}><div className="dz-icon">◐</div><div className="dz-t">Upload Reference Image</div><div className="dz-s">PNG, JPG — click or drag</div></div> :
                            <div className="vw-pg-preview"><img src={imageData} alt="ref" /><button className="vw-pg-preview-remove" onClick={() => { setImageFile(null); setImageData(null); }}>×</button></div>}
                        <textarea className="vw-ft" value={customCtx} onChange={e => setCustomCtx(e.target.value)} placeholder="Additional context for image analysis…" style={{ marginTop: 8, fontSize: 10, minHeight: 48, width: '100%', boxSizing: 'border-box' }} />
                    </>}
                    {mode === "custom" && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                <button onClick={() => openPicker("custom")} className="vw-btn vw-btn-g vw-btn-sm" style={{ fontSize: 9 }}>
                                    + Insert Prompts / Snippets
                                </button>
                            </div>
                            <textarea className="vw-ft" value={customCtx} onChange={e => setCustomCtx(e.target.value)} placeholder="Enter context…" style={{ marginTop: 8, fontSize: 10, minHeight: 100, width: '100%', boxSizing: 'border-box' }} />
                        </>
                    )}

                    {/* Reference Docs Button */}
                    <div style={{ marginTop: 16 }}>
                        <button
                            className="vw-btn vw-btn-g"
                            style={{ width: "100%", justifyContent: "center", display: "flex", gap: 6 }}
                            onClick={() => setIsPickerOpen(true)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                            Attach Reference Docs {pdfContext.length > 0 && `(${pdfContext.length})`}
                        </button>
                        {pdfContext.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {pdfContext.map((ctx, idx) => (
                                    <div key={idx} style={{ background: "var(--card)", border: "1px solid var(--bdr)", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "var(--tx2)", display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.sectionName}</span>
                                        <button
                                            onClick={() => setPdfContext(prev => prev.filter((_, i) => i !== idx))}
                                            style={{ background: "none", border: "none", color: "var(--tx3)", cursor: "pointer", padding: 0 }}
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* LLM + tools */}
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, margin: "14px 0 6px" }}>LLM Provider</div>
                    <div style={{ display: "flex", gap: 4 }}>{LLM_PROVIDERS.map(p => <button key={p.id} className={`vw-style-chip ${llmProvider === p.id ? "on" : ""}`} onClick={() => p.active && setLlmProvider(p.id)} style={{ opacity: p.active ? 1 : .3 }}>{p.label}</button>)}</div>
                    <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--tx3)", fontWeight: 500, margin: "14px 0 6px" }}>Target Tools</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{externalTools.map(t => <button key={t.id} className={`vw-style-chip ${targetTools.includes(t.name) ? "on" : ""}`} onClick={() => toggleTool(t.name)}>{t.abbr} {t.name}</button>)}</div>
                    <button className="vw-btn vw-btn-p" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} onClick={generate} disabled={loading}>
                        {loading ? "Generating…" : "Generate Prompts"}
                    </button>
                </div>
            </div>
            <div className="vw-pg-right">
                <div className="vw-pg-output" ref={outputRef}>
                    {results.length === 0 && !loading && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--tx3)", textAlign: "center" }}>
                            <div style={{ fontSize: 40, opacity: .12 }}>◇</div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tx2)" }}>Prompt Gen</div>
                            <div style={{ fontSize: 11, maxWidth: 380, lineHeight: 1.6 }}>{mode === "brief" ? "Paste a design brief and select target tools." : mode === "image" ? "Upload a reference image for AI analysis." : "Enter context for general prompt generation."}</div>
                        </div>
                    )}
                    {results.map(r => (
                        <div key={r.id} className="vw-pg-result">
                            <div className="vw-pg-result-hd">
                                <div>
                                    <span className="vw-pg-result-label">{r.mode === "brief" ? "From Brief" : r.mode === "image" ? "From Image" : "Custom"}</span>
                                    <span style={{ fontSize: 9, color: "var(--tx3)", marginLeft: 8 }}>{r.input}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 8, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: 1 }}>{r.llm === "claude" ? "Claude Opus" : r.llm === "gemini" ? "Gemini 3.1 Pro" : r.llm === "gpt" ? "GPT-5.4" : r.llm}</span>
                                    <span className="vw-pg-result-tool">{r.tools}</span>
                                </div>
                            </div>
                            {r.retrying ? (
                                <div style={{ fontSize: 11, color: "var(--tx3)", padding: "12px 0", opacity: .6 }}>Refining prompt…</div>
                            ) : (
                                <div className="vw-pg-result-body">{r.content}</div>
                            )}
                            <div className="vw-pg-result-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    className={`vw-btn vw-btn-sm ${copiedIds.has(r.id) ? "vw-btn-ok" : "vw-btn-g"}`}
                                    onClick={() => copyText(r.content, r.id)}
                                    style={{ transition: "all 0.2s" }}
                                >
                                    {copiedIds.has(r.id) ? "✓ Copied" : "Copy all"}
                                </button>
                                <button
                                    className={`vw-btn vw-btn-sm ${savedIds.has(r.id) ? "vw-btn-ok" : "vw-btn-g"}`}
                                    onClick={() => logResult(r)}
                                    style={{ transition: "all 0.2s" }}
                                >
                                    {savedIds.has(r.id) ? "✓ Saved" : "Save to log"}
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => handleSaveSnippetStart(r)}
                                >
                                    Save Snippet…
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => handleRetry(r)}
                                    title="Regenerate this prompt"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                    Retry
                                </button>
                                <button
                                    className="vw-btn vw-btn-sm vw-btn-g"
                                    onClick={() => setFullScreenResult(r.id)}
                                    title="View Fullscreen"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
                                    Fullscreen
                                </button>
                                {!showImageOptions[r.id] && !imageLoading[r.id] ? (
                                    <button
                                        className="vw-btn vw-btn-sm vw-btn-p"
                                        onClick={() => setShowImageOptions(prev => ({ ...prev, [r.id]: true }))}
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        Generate Image
                                    </button>
                                ) : showImageOptions[r.id] && !imageLoading[r.id] ? (
                                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                        <button
                                            className="vw-btn vw-btn-sm vw-btn-p"
                                            onClick={() => generateImage(r, 'imagen-4')}
                                        >
                                            Generate with Imagen 4
                                        </button>
                                        <button
                                            className="vw-btn vw-btn-sm"
                                            style={{ background: '#eab308', color: '#000', borderColor: '#eab308', fontWeight: 600 }}
                                            onClick={() => generateImage(r, 'nano-banana')}
                                        >
                                            Generate with Nano Banana 2
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="vw-btn vw-btn-sm vw-btn-p"
                                        disabled
                                        style={{ opacity: 0.6, marginLeft: 'auto' }}
                                    >
                                        Generating Images…
                                    </button>
                                )}
                            </div>

                            {/* Generated Image Output */}
                            {imageErrors[r.id] && (
                                <div style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>
                                    {imageErrors[r.id]}
                                </div>
                            )}
                            {generatedImages[r.id] && generatedImages[r.id].length > 0 && (
                                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {generatedImages[r.id].map((imgSrc, imgIndex) => (
                                        <div key={imgIndex} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
                                            <img
                                                src={imgSrc}
                                                alt={`Concept ${imgIndex + 1}`}
                                                style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }}
                                                onClick={() => setFullScreenImage(imgSrc)}
                                            />
                                            <button
                                                onClick={() => handleExport(imgSrc, imgIndex)}
                                                className="vw-btn vw-btn-p vw-btn-sm"
                                                style={{ position: 'absolute', bottom: 8, right: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderColor: 'rgba(255,255,255,0.1)' }}
                                                title="Download Image"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Satisfaction feedback row */}
                            {!r.retrying && (
                                <div style={{ borderTop: "1px solid var(--bdr)", marginTop: 10, paddingTop: 10 }}>
                                    {r.feedback === "good" ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4ade80" }}>
                                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7L5 10L11 3" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            Marked as helpful
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontSize: 10, color: "var(--tx3)" }}>Was this helpful?</span>
                                                <button
                                                    onClick={() => handleFeedback(r.id, "good")}
                                                    title="Yes, looks good"
                                                    style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 13, color: "var(--tx2)", transition: "all 0.15s" }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ade80"; e.currentTarget.style.color = "#4ade80"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bdr)"; e.currentTarget.style.color = "var(--tx2)"; }}
                                                >👍</button>
                                                <button
                                                    onClick={() => handleFeedback(r.id, "retry")}
                                                    title="Needs improvement"
                                                    style={{ background: "none", border: "1px solid var(--bdr)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 13, color: "var(--tx2)", transition: "all 0.15s" }}
                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#f87171"; e.currentTarget.style.color = "#f87171"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bdr)"; e.currentTarget.style.color = "var(--tx2)"; }}
                                                >👎</button>
                                            </div>

                                            {/* Retry panel — shown when 👎 clicked */}
                                            {r.feedback === "retry" && (
                                                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                                    <textarea
                                                        className="vw-ft"
                                                        value={retryHints[r.id] || ""}
                                                        onChange={e => setRetryHints(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                        placeholder="What should be improved? (optional — leave blank to auto-refine)"
                                                        style={{ fontSize: 10, minHeight: 52, resize: "vertical" }}
                                                    />
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <button
                                                            className="vw-btn vw-btn-p vw-btn-sm"
                                                            onClick={() => handleRetry(r)}
                                                            style={{ display: "flex", alignItems: "center", gap: 5 }}
                                                        >
                                                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M9.5 2A5 5 0 1 0 10 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 1V4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                            Retry
                                                        </button>
                                                        <span style={{ fontSize: 9, color: "var(--tx3)" }}>
                                                            {retryHints[r.id]?.trim() ? "Retry with your hint" : "AI will self-improve"}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && <div className="vw-pg-result" style={{ opacity: .5 }}><div className="vw-pg-result-hd"><span className="vw-pg-result-label">Generating…</span></div><div style={{ fontSize: 11, color: "var(--tx3)", padding: "12px 0" }}>Analysing input via {LLM_PROVIDERS.find(p => p.id === llmProvider)?.label}…</div></div>}
                </div>
            </div>

            <PdfSectionPicker
                isOpen={isPickerOpen}
                projectId={proj.id}
                onClose={() => setIsPickerOpen(false)}
                onConfirm={(selections) => setPdfContext(selections)}
            />

            {fullScreenResult && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Full Screen Prompt</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => copyText(results.find(r => r.id === fullScreenResult)?.content || "", fullScreenResult)}
                                className={`vw-btn vw-btn-sm ${copiedIds.has(fullScreenResult) ? "vw-btn-ok" : "vw-btn-g"}`}
                            >
                                {copiedIds.has(fullScreenResult) ? "✓ Copied" : "Copy all"}
                            </button>
                            <button onClick={() => setFullScreenResult(null)} className="vw-btn vw-btn-g vw-btn-sm">
                                Close
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '24px', whiteSpace: 'pre-wrap', fontFamily: 'var(--m)', fontSize: 13, lineHeight: '1.6', color: 'var(--tx1)', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                        {results.find(r => r.id === fullScreenResult)?.content}
                    </div>
                </div>
            )}

            {fullScreenImage && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={() => setFullScreenImage(null)}
                >
                    <button
                        onClick={() => setFullScreenImage(null)}
                        style={{ position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 40, height: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <img
                        src={fullScreenImage}
                        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                        alt="Fullscreen Concept"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
            {snippetModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setSnippetModal(prev => ({ ...prev, isOpen: false }))}>
                    <div style={{ background: 'var(--bg)', width: 600, maxWidth: '90vw', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>Save Prompt Snippet</div>
                        <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Edit the text below to save only the part you want to reuse.</div>
                        <textarea
                            className="vw-ft"
                            style={{ height: 150, fontFamily: 'var(--m)', fontSize: 11 }}
                            value={snippetModal.text}
                            onChange={e => setSnippetModal(prev => ({ ...prev, text: e.target.value }))}
                        />
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 500 }}>Name</div>
                                <input
                                    className="vw-ft"
                                    style={{ height: 32, fontSize: 12 }}
                                    placeholder="e.g. Modern Living Room Base"
                                    value={snippetModal.name}
                                    onChange={e => setSnippetModal(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 500 }}>Save to Location</div>
                                <select
                                    className="vw-ft"
                                    style={{ height: 32, fontSize: 12 }}
                                    value={snippetModal.type}
                                    onChange={e => setSnippetModal(prev => ({ ...prev, type: e.target.value as "global" | "project" }))}
                                >
                                    <option value="project">Project Prompts ({proj.name})</option>
                                    <option value="global">Global Prompt Library</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className="vw-btn vw-btn-g" onClick={() => setSnippetModal(prev => ({ ...prev, isOpen: false }))}>Cancel</button>
                            <button className="vw-btn vw-btn-p" onClick={submitSnippet}>Save Snippet</button>
                        </div>
                    </div>
                </div>
            )}

            {pickerModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setPickerModal(prev => ({ ...prev, isOpen: false }))}>
                    <div style={{ background: 'var(--bg)', width: 800, maxWidth: '90vw', height: '80vh', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 600 }}>Insert Prompt Snippet</div>
                            <button onClick={() => setPickerModal(prev => ({ ...prev, isOpen: false }))} className="vw-btn vw-btn-g vw-btn-sm">Close</button>
                        </div>
                        <div style={{ display: 'flex', gap: 16, padding: '16px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--card)' }}>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'top10' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'top10' }))}
                            >Top 10 Global Prompts</button>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'project' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'project' }))}
                            >Project Prompts</button>
                            <button
                                className={`vw-style-chip ${pickerModal.activeTab === 'global' ? 'on' : ''}`}
                                onClick={() => setPickerModal(prev => ({ ...prev, activeTab: 'global' }))}
                            >All Global Library</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {pickerLoading ? (
                                <div style={{ color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading prompts...</div>
                            ) : pickerEntries.length === 0 ? (
                                <div style={{ color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: 40 }}>No prompts found in this category.</div>
                            ) : (
                                pickerEntries.map(entry => (
                                    <div key={entry.id} style={{ border: '1px solid var(--bdr)', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {entry.name || 'Unnamed Prompt'}
                                                {entry.is_snippet && <span style={{ fontSize: 9, background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '2px 6px', borderRadius: 4 }}>Snippet</span>}
                                            </div>
                                            <button className="vw-btn vw-btn-p vw-btn-sm" onClick={() => selectPickerEntry(entry.prompt)}>Insert</button>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--tx3)', display: 'flex', gap: 12 }}>
                                            <span>Uses: {entry.usage_count}</span>
                                            <span>Saved by: {entry.saved_by}</span>
                                            {entry.tool && <span>Tools: {entry.tool}</span>}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--tx2)', fontFamily: 'var(--m)', background: 'var(--bg)', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                            {entry.prompt}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
