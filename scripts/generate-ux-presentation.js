const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pptx.author = "DWP 3D Pipeline";
pptx.title = "DWP 3D Pipeline — UX Optimization Report";

// ── Brand palette ──
const C = {
  bg:      "0F0F0E",  dark:    "171715",  card:    "1F1F1D",
  bdr:     "2C2C29",  tx:      "E8E5DF",  tx2:     "A09D96",
  tx3:     "6D6A63",  or:      "E8731A",  or2:     "F5A623",
  gn:      "4ADE80",  rd:      "F87171",  white:   "FFFFFF",
  ltBg:    "F5F4F1",  ltCard:  "FFFFFF",  ltBdr:   "DDD9D4",
  ltTx:    "1A1918",  ltTx2:   "5C5A55",  blue:    "3B82F6",
  purple:  "8B5CF6",
};

// ── Helpers ──
function addTitle(slide, title, subtitle) {
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: C.bg } });
  slide.addText(title, { x: 0.6, y: 0.3, w: 12, h: 0.5, fontSize: 11, fontFace: "Arial", color: C.or, bold: true, letterSpacing: 3 });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.6, y: 0.7, w: 12, h: 0.35, fontSize: 9, fontFace: "Arial", color: C.tx3 });
  }
  // orange accent line
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0.6, y: 1.05, w: 1.2, h: 0.04, fill: { color: C.or } });
}

function addBullets(slide, items, x, y, w, fontSize = 10) {
  const text = items.map(item => {
    if (typeof item === "string") return { text: item, options: { bullet: { code: "25CF" }, color: C.tx2, fontSize, fontFace: "Arial", breakType: "n", paraSpaceAfter: 6 } };
    return { text: item.text, options: { bullet: item.bullet !== false ? { code: "25CF" } : undefined, color: item.color || C.tx2, fontSize: item.fontSize || fontSize, fontFace: "Arial", bold: item.bold, breakType: "n", paraSpaceAfter: item.paraSpaceAfter || 6 } };
  });
  slide.addText(text, { x, y, w, h: items.length * 0.32, valign: "top" });
}

function addLabel(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h: h || 0.3,
    fontSize: opts.fontSize || 9,
    fontFace: "Arial",
    color: opts.color || C.tx,
    bold: opts.bold || false,
    valign: "middle",
    ...opts,
  });
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: opts.fill || C.card },
    line: { color: opts.line || C.bdr, width: 0.5 },
    rectRadius: 0.08,
  });
}

function addTag(slide, text, x, y, color) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y, w: text.length * 0.08 + 0.3, h: 0.28, fill: { color: color + "20" }, line: { color: color + "40", width: 0.5 }, rectRadius: 0.14 });
  slide.addText(text, { x: x + 0.05, y, w: text.length * 0.08 + 0.2, h: 0.28, fontSize: 7, fontFace: "Arial", color, bold: true, align: "center", valign: "middle" });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: C.bg } });
  // orange gradient bar
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.06, fill: { color: C.or } });
  s.addText("dwp.visualization", { x: 0.8, y: 1.8, w: 8, h: 0.6, fontSize: 14, fontFace: "Arial", color: C.tx3, letterSpacing: 4 });
  s.addText("UX Optimization\nReport", { x: 0.8, y: 2.5, w: 10, h: 2, fontSize: 42, fontFace: "Arial", color: C.white, bold: true, lineSpacingMultiple: 1.1 });
  s.addText("Optimal Setup Recommendations — UX First Approach", { x: 0.8, y: 4.6, w: 8, h: 0.4, fontSize: 13, fontFace: "Arial", color: C.or });
  s.addText("March 2026  |  DWP 3D Visualization Team", { x: 0.8, y: 5.2, w: 6, h: 0.3, fontSize: 10, fontFace: "Arial", color: C.tx3 });
  // decorative element
  s.addShape(pptx.shapes.RECTANGLE, { x: 10.5, y: 2.0, w: 2, h: 3.5, fill: { color: C.or + "10" }, line: { color: C.or + "30", width: 0.5 }, rectRadius: 0.1 });
  s.addText("UX", { x: 10.5, y: 3.2, w: 2, h: 1, fontSize: 48, fontFace: "Arial", color: C.or + "30", align: "center", valign: "middle", bold: true });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 2 — EXECUTIVE SUMMARY
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "EXECUTIVE SUMMARY", "Top 5 UX priorities ranked by user impact");

  const priorities = [
    { num: "01", title: "Navigation & Information Architecture", desc: "Reduce cognitive load from 14+ flat tabs to a grouped two-tier hierarchy", impact: "HIGH", color: C.rd },
    { num: "02", title: "Loading & Perceived Performance", desc: "Add skeleton loaders, AI processing indicators, and optimistic UI updates", impact: "HIGH", color: C.rd },
    { num: "03", title: "Mobile & Responsive Layout", desc: "Add breakpoints for sidebar collapse, scrollable phase pills, stacked forms", impact: "MEDIUM", color: C.or },
    { num: "04", title: "Accessibility & Keyboard Navigation", desc: "Convert div-onClick nav to semantic buttons with ARIA, focus rings, skip links", impact: "MEDIUM", color: C.or },
    { num: "05", title: "AI Interaction Patterns", desc: "Streaming responses, retry buttons, token counts, copy-prompt actions", impact: "MEDIUM", color: C.or },
  ];

  priorities.forEach((p, i) => {
    const yy = 1.35 + i * 1.1;
    addCard(s, 0.6, yy, 10.5, 0.9);
    s.addText(p.num, { x: 0.8, y: yy + 0.15, w: 0.6, h: 0.6, fontSize: 24, fontFace: "Arial", color: C.or, bold: true, valign: "middle" });
    s.addText(p.title, { x: 1.5, y: yy + 0.1, w: 7, h: 0.35, fontSize: 13, fontFace: "Arial", color: C.tx, bold: true });
    s.addText(p.desc, { x: 1.5, y: yy + 0.45, w: 7, h: 0.35, fontSize: 9, fontFace: "Arial", color: C.tx2 });
    addTag(s, p.impact, 9.5, yy + 0.3, p.color);
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 3 — INFORMATION ARCHITECTURE (Current vs Ideal Mockup)
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "INFORMATION ARCHITECTURE", "Current flat navigation vs. proposed grouped hierarchy");

  // ── CURRENT (left) ──
  addLabel(s, "CURRENT", 0.6, 1.3, 2, 0.3, { fontSize: 8, color: C.rd, bold: true });
  addCard(s, 0.6, 1.6, 2.6, 5.2, { fill: C.dark });
  addLabel(s, "dwp.visualization", 0.8, 1.7, 2.2, 0.3, { fontSize: 8, color: C.or, bold: true });
  // flat list — all 14 items visible
  const flatItems = ["Workspace", "Prompt Gen", "Prompt Log", "Phase Gates", "Prompt Library", "PDF Library", "Image Library", "3D Models", "Naming", "Book a 3D", "3D Portal", "Reference", "Settings"];
  flatItems.forEach((item, i) => {
    const yy = 2.15 + i * 0.33;
    s.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: yy, w: 2.2, h: 0.28, fill: { color: i === 0 ? C.or + "20" : "00000000" }, rectRadius: 0.04 });
    addLabel(s, (i === 0 ? "◫ " : "  ") + item, 0.85, yy, 2, 0.28, { fontSize: 7.5, color: i === 0 ? C.or : C.tx2 });
  });
  // problem callout
  addCard(s, 0.6, 6.0, 2.6, 0.7, { fill: C.rd + "15", line: C.rd + "40" });
  addLabel(s, "14 flat items = high\ncognitive load, no grouping", 0.75, 6.05, 2.3, 0.6, { fontSize: 7, color: C.rd });

  // ── IDEAL (right) ──
  addLabel(s, "PROPOSED — OPTIMAL UX", 3.8, 1.3, 4, 0.3, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 3.8, 1.6, 3.2, 5.5, { fill: C.dark });
  addLabel(s, "dwp.visualization", 4.0, 1.7, 2.8, 0.3, { fontSize: 8, color: C.or, bold: true });

  // Projects section
  addLabel(s, "PROJECTS", 4.0, 2.1, 2, 0.22, { fontSize: 6.5, color: C.tx3, bold: true, letterSpacing: 2 });
  ["TEST", "Krungthai Banking"].forEach((p, i) => {
    s.addShape(pptx.shapes.OVAL, { x: 4.05, y: 2.38 + i * 0.28, w: 0.12, h: 0.12, fill: { color: C.gn } });
    addLabel(s, p, 4.25, 2.32 + i * 0.28, 2, 0.25, { fontSize: 7.5, color: C.tx2 });
  });

  // Primary nav
  addLabel(s, "PRIMARY", 4.0, 3.0, 2, 0.22, { fontSize: 6.5, color: C.tx3, bold: true, letterSpacing: 2 });
  s.addShape(pptx.shapes.RECTANGLE, { x: 3.95, y: 3.05, w: 2.9, h: 0.01, fill: { color: C.bdr } });
  ["◫  Workspace", "◇  Prompt Gen", "◎  Phase Gates"].forEach((item, i) => {
    const yy = 3.25 + i * 0.3;
    s.addShape(pptx.shapes.RECTANGLE, { x: 4.0, y: yy, w: 2.8, h: 0.26, fill: { color: i === 0 ? C.or + "20" : "00000000" }, rectRadius: 0.04 });
    addLabel(s, item, 4.05, yy, 2.5, 0.26, { fontSize: 7.5, color: i === 0 ? C.or : C.tx });
  });

  // Library (collapsible)
  addLabel(s, "LIBRARY  ▾", 4.0, 4.2, 2, 0.22, { fontSize: 6.5, color: C.tx3, bold: true, letterSpacing: 2 });
  s.addShape(pptx.shapes.RECTANGLE, { x: 3.95, y: 4.25, w: 2.9, h: 0.01, fill: { color: C.bdr } });
  ["▤  Prompt Log", "▦  Prompt Library", "◐  Image Library", "▤  PDF Library", "△  3D Models"].forEach((item, i) => {
    addLabel(s, item, 4.05, 4.42 + i * 0.27, 2.5, 0.24, { fontSize: 7, color: C.tx2 });
  });

  // Tools (collapsible)
  addLabel(s, "TOOLS  ▾", 4.0, 5.85, 2, 0.22, { fontSize: 6.5, color: C.tx3, bold: true, letterSpacing: 2 });
  s.addShape(pptx.shapes.RECTANGLE, { x: 3.95, y: 5.9, w: 2.9, h: 0.01, fill: { color: C.bdr } });
  ["⌗  Naming", "◫  Book a 3D", "◩  3D Portal"].forEach((item, i) => {
    addLabel(s, item, 4.05, 6.1 + i * 0.27, 2.5, 0.24, { fontSize: 7, color: C.tx2 });
  });

  // benefits callout
  addCard(s, 3.8, 6.85, 3.2, 0.25, { fill: C.gn + "15", line: C.gn + "40" });
  addLabel(s, "Grouped + collapsible = scannable", 3.95, 6.85, 3, 0.25, { fontSize: 7, color: C.gn });

  // ── Key changes panel ──
  addCard(s, 7.5, 1.6, 5.2, 5.5);
  addLabel(s, "KEY CHANGES", 7.7, 1.75, 4, 0.3, { fontSize: 10, color: C.or, bold: true });
  const changes = [
    { t: "Two-Tier Hierarchy", d: "Group Navigation / Library / Tools with collapsible headers and visual dividers. Only 3 primary items visible at all times." },
    { t: "Collapsible Sections", d: "Library and Tools sections collapse to headers. Users expand only what they need, reducing visual noise by ~60%." },
    { t: "Favourites / Pinned Tabs", d: "Power users can pin their most-used tabs (e.g. Prompt Gen + Image Library) to the top for one-click access." },
    { t: "Section Dividers", d: "Add subtle 1px lines and 8px uppercase section labels with proper spacing between groups." },
    { t: "Active State Indicators", d: "Add left-border accent (4px orange) on active tab + background tint for clear visual feedback." },
    { t: "Keyboard Navigation", d: "Arrow keys to move between items, Enter to select, Esc to collapse section." },
  ];
  changes.forEach((c, i) => {
    const yy = 2.2 + i * 0.82;
    addLabel(s, c.t, 7.7, yy, 4.8, 0.25, { fontSize: 9, color: C.tx, bold: true });
    addLabel(s, c.d, 7.7, yy + 0.25, 4.8, 0.45, { fontSize: 7.5, color: C.tx2 });
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 4 — NAVIGATION & TAB STATE (Ideal Mockup)
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "NAVIGATION & TAB STATE MANAGEMENT", "Preserve user context when switching between tabs");

  // ── Current Problem ──
  addLabel(s, "PROBLEM", 0.6, 1.35, 3, 0.25, { fontSize: 8, color: C.rd, bold: true });
  addCard(s, 0.6, 1.6, 5.8, 2.5, { fill: C.dark });

  // Tab strip mockup
  const tabs = ["Workspace", "Prompt Gen", "Prompt Log", "Image Lib"];
  tabs.forEach((t, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.8 + i * 1.35, y: 1.75, w: 1.25, h: 0.32, fill: { color: i === 2 ? C.or + "25" : C.card }, rectRadius: 0.05, line: { color: C.bdr, width: 0.5 } });
    addLabel(s, t, 0.8 + i * 1.35, 1.75, 1.25, 0.32, { fontSize: 7, color: i === 2 ? C.or : C.tx3, align: "center" });
  });

  // Content area showing unmounted component
  addCard(s, 0.8, 2.2, 5.4, 1.7, { fill: C.bg });
  addLabel(s, "Tab content UNMOUNTS on switch", 1.2, 2.5, 4, 0.3, { fontSize: 10, color: C.rd });
  addLabel(s, "Scroll position lost\nForm data lost\nFilter state lost\nSearch query lost", 1.2, 2.9, 3, 0.9, { fontSize: 8, color: C.tx3 });
  // X icons
  ["Scroll ✗", "Form ✗", "Filter ✗"].forEach((t, i) => {
    addTag(s, t, 4.2, 2.6 + i * 0.35, C.rd);
  });

  // ── Ideal Solution ──
  addLabel(s, "SOLUTION — OPTIMAL UX", 6.8, 1.35, 4, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 6.8, 1.6, 5.9, 2.5, { fill: C.dark });

  tabs.forEach((t, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 7.0 + i * 1.35, y: 1.75, w: 1.25, h: 0.32, fill: { color: i === 2 ? C.or + "25" : C.card }, rectRadius: 0.05, line: { color: C.bdr, width: 0.5 } });
    addLabel(s, t, 7.0 + i * 1.35, 1.75, 1.25, 0.32, { fontSize: 7, color: i === 2 ? C.or : C.tx3, align: "center" });
  });

  addCard(s, 7.0, 2.2, 5.5, 1.7, { fill: C.bg });
  addLabel(s, "Keep mounted, toggle display:none", 7.4, 2.5, 4.5, 0.3, { fontSize: 10, color: C.gn });
  addLabel(s, "Scroll position preserved\nForm data preserved\nFilter state preserved\nSearch query preserved", 7.4, 2.9, 3, 0.9, { fontSize: 8, color: C.tx2 });
  ["Scroll ✓", "Form ✓", "Filter ✓"].forEach((t, i) => {
    addTag(s, t, 10.5, 2.6 + i * 0.35, C.gn);
  });

  // ── Phase pills fix ──
  addLabel(s, "PHASE PILLS — TOUCH TARGET FIX", 0.6, 4.4, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 4.65, 12.1, 2.5);

  // Current tiny pills
  addLabel(s, "Current (9px / 3px padding)", 0.8, 4.8, 3, 0.25, { fontSize: 8, color: C.rd });
  ["BSA", "CON", "SCH", "DD"].forEach((p, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.9 + i * 0.6, y: 5.15, w: 0.5, h: 0.2, fill: { color: i === 0 ? C.or + "15" : C.card }, line: { color: C.bdr, width: 0.5 }, rectRadius: 0.1 });
    addLabel(s, p, 0.9 + i * 0.6, 5.15, 0.5, 0.2, { fontSize: 6, align: "center", color: i === 0 ? C.or : C.tx3 });
  });
  addLabel(s, "Too small to tap\non touch devices", 0.9, 5.5, 2, 0.4, { fontSize: 7, color: C.tx3 });

  // Ideal pills
  addLabel(s, "Ideal (44px min touch target)", 4.5, 4.8, 4, 0.25, { fontSize: 8, color: C.gn });
  const phaseColors = [C.or, C.blue, C.purple, C.gn];
  const phaseLabels = ["Briefing & Site Analysis", "Concept", "Pre-Schematic", "Schematic"];
  phaseLabels.forEach((p, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 4.6 + i * 2.05, y: 5.05, w: 1.9, h: 0.44, fill: { color: phaseColors[i] + "15" }, line: { color: phaseColors[i] + "40", width: 0.8 }, rectRadius: 0.22 });
    addLabel(s, p, 4.6 + i * 2.05, 5.05, 1.9, 0.44, { fontSize: 7.5, align: "center", color: phaseColors[i], bold: true });
  });
  addLabel(s, "44px height, full labels,\ncolour-coded by phase", 4.6, 5.6, 3, 0.4, { fontSize: 7, color: C.tx3 });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 5 — LOADING STATES (Ideal Mockup)
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "LOADING STATES & PERCEIVED PERFORMANCE", "Add skeleton screens and AI processing indicators");

  // ── Current: single branded splash ──
  addLabel(s, "CURRENT — BRANDED SPLASH ONLY", 0.6, 1.35, 5, 0.25, { fontSize: 8, color: C.rd, bold: true });
  addCard(s, 0.6, 1.6, 5.8, 2.8, { fill: "000000" });
  addLabel(s, "dwp.visualization", 1.5, 2.5, 4, 0.5, { fontSize: 16, color: C.or, align: "center", bold: true });
  addLabel(s, "No progress indicator\nNo skeleton content\nUser sees black screen for 2-5s", 1.5, 3.2, 4, 0.8, { fontSize: 8, color: C.tx3, align: "center" });

  // ── Ideal: skeleton loaders ──
  addLabel(s, "IDEAL — SKELETON + PROGRESSIVE LOADING", 6.8, 1.35, 5, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 6.8, 1.6, 5.9, 2.8, { fill: C.dark });

  // Skeleton sidebar
  addCard(s, 7.0, 1.75, 1.5, 2.5, { fill: C.bg });
  [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8].forEach(i => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 7.1, y: 1.9 + i, w: i < 0.3 ? 1 : 0.7 + Math.random() * 0.5, h: 0.15, fill: { color: C.card }, rectRadius: 0.04 });
  });

  // Skeleton content
  addCard(s, 8.6, 1.75, 3.9, 2.5, { fill: C.bg });
  // Skeleton cards grid
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 8.75 + c * 1.25, y: 1.9 + r * 1.2, w: 1.1, h: 1.0, fill: { color: C.card }, rectRadius: 0.06 });
      // shimmer lines
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 8.85 + c * 1.25, y: 2.0 + r * 1.2, w: 0.9, h: 0.5, fill: { color: C.bdr }, rectRadius: 0.04 });
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 8.85 + c * 1.25, y: 2.55 + r * 1.2, w: 0.6, h: 0.1, fill: { color: C.bdr }, rectRadius: 0.03 });
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 8.85 + c * 1.25, y: 2.7 + r * 1.2, w: 0.8, h: 0.08, fill: { color: C.bdr + "80" }, rectRadius: 0.03 });
    }
  }

  // ── AI processing indicator ──
  addLabel(s, "AI PROCESSING INDICATOR", 0.6, 4.65, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 4.9, 12.1, 2.2);

  // Chat-style AI response mockup
  addCard(s, 0.8, 5.05, 5.6, 1.9, { fill: C.dark });
  // User message
  addCard(s, 3.5, 5.2, 2.7, 0.4, { fill: C.or + "15", line: C.or + "30" });
  addLabel(s, "Generate a concept for hotel lobby...", 3.6, 5.2, 2.5, 0.4, { fontSize: 7, color: C.tx });
  // AI thinking indicator
  addCard(s, 0.95, 5.75, 3, 0.95, { fill: C.card, line: C.gn + "30" });
  addLabel(s, "dwp.render is generating...", 1.1, 5.85, 2.5, 0.25, { fontSize: 8, color: C.gn, bold: true });
  // Progress bar
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 1.1, y: 6.2, w: 2.7, h: 0.12, fill: { color: C.bg }, rectRadius: 0.06 });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 1.1, y: 6.2, w: 1.6, h: 0.12, fill: { color: C.gn }, rectRadius: 0.06 });
  addLabel(s, "Estimated: ~12s remaining", 1.1, 6.38, 2, 0.2, { fontSize: 6.5, color: C.tx3 });

  // Recommendations panel
  addCard(s, 6.8, 5.05, 5.7, 1.9, { fill: C.dark });
  addLabel(s, "Recommendations", 7.0, 5.15, 4, 0.25, { fontSize: 9, color: C.or, bold: true });
  addBullets(s, [
    "Use existing Skeleton.tsx component for project lists and grids",
    "Show sidebar + top bar immediately, only content area loads",
    "Add shimmer animation to skeleton blocks (CSS keyframe)",
    "AI calls: show progress bar with estimated time (avg per model)",
    "Optimistic UI: update local state before Supabase confirms",
    "Image gen: show blurred placeholder that sharpens on completion",
  ], 7.0, 5.45, 5.3, 7.5);
}

// ════════════════════════════════════════════════════════════════
// SLIDE 6 — MOBILE & RESPONSIVE (Ideal Mockup)
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "MOBILE & RESPONSIVE LAYOUT", "Add breakpoints for tablet and mobile views");

  // ── Desktop (current) ──
  addLabel(s, "DESKTOP (current)", 0.6, 1.35, 3, 0.25, { fontSize: 8, color: C.tx2, bold: true });
  addCard(s, 0.6, 1.6, 3.8, 3.5, { fill: C.dark });
  // Sidebar
  addCard(s, 0.7, 1.7, 0.8, 3.3, { fill: C.bg });
  addLabel(s, "Rail\n220px", 0.75, 2.5, 0.7, 0.5, { fontSize: 6, color: C.tx3, align: "center" });
  // Main content
  addCard(s, 1.6, 1.7, 2.7, 3.3, { fill: C.bg });
  addLabel(s, "Main Content Area", 2.0, 3.0, 2, 0.3, { fontSize: 7, color: C.tx3, align: "center" });
  // Top bar
  s.addShape(pptx.shapes.RECTANGLE, { x: 1.6, y: 1.7, w: 2.7, h: 0.25, fill: { color: C.card } });
  addLabel(s, "☰  Project Name    BSA  CON  SCH  DD", 1.65, 1.7, 2.6, 0.25, { fontSize: 5.5, color: C.tx2 });

  // ── Tablet (ideal) ──
  addLabel(s, "TABLET (proposed, < 1024px)", 4.8, 1.35, 3, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 4.8, 1.6, 3.2, 3.5, { fill: C.dark });
  // Collapsed sidebar
  addCard(s, 4.9, 1.7, 0.35, 3.3, { fill: C.bg });
  addLabel(s, "52", 4.92, 3.0, 0.3, 0.3, { fontSize: 5, color: C.tx3, align: "center" });
  // Main content wider
  addCard(s, 5.3, 1.7, 2.6, 3.3, { fill: C.bg });
  addLabel(s, "Auto-collapsed rail\nMore content space", 5.6, 3.0, 2, 0.5, { fontSize: 7, color: C.tx3, align: "center" });
  // Top bar with scrollable pills
  s.addShape(pptx.shapes.RECTANGLE, { x: 5.3, y: 1.7, w: 2.6, h: 0.25, fill: { color: C.card } });
  addLabel(s, "☰  Project   ← BSA CON SCH DD →", 5.35, 1.7, 2.5, 0.25, { fontSize: 5.5, color: C.tx2 });

  // ── Mobile (ideal) ──
  addLabel(s, "MOBILE (proposed, < 768px)", 8.4, 1.35, 3, 0.25, { fontSize: 8, color: C.gn, bold: true });
  // Phone frame
  addCard(s, 9.2, 1.6, 2.0, 3.5, { fill: C.dark });
  // Full-width content
  addCard(s, 9.3, 1.7, 1.8, 3.3, { fill: C.bg });
  // Bottom nav mockup
  s.addShape(pptx.shapes.RECTANGLE, { x: 9.3, y: 4.55, w: 1.8, h: 0.35, fill: { color: C.card } });
  ["◫", "◇", "▦", "◐", "•••"].forEach((ic, i) => {
    addLabel(s, ic, 9.35 + i * 0.35, 4.55, 0.3, 0.35, { fontSize: 8, color: i === 0 ? C.or : C.tx3, align: "center" });
  });
  // Top bar minimal
  s.addShape(pptx.shapes.RECTANGLE, { x: 9.3, y: 1.7, w: 1.8, h: 0.25, fill: { color: C.card } });
  addLabel(s, "☰  dwp.viz", 9.35, 1.7, 1.2, 0.25, { fontSize: 6, color: C.tx2 });
  // Content
  addLabel(s, "Full-width\ncontent\n\nBottom nav\nfor primary\ntabs", 9.5, 2.3, 1.5, 1.8, { fontSize: 7, color: C.tx3, align: "center" });

  // ── Implementation notes ──
  addLabel(s, "IMPLEMENTATION NOTES", 0.6, 5.35, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 5.6, 12.1, 1.6);
  addBullets(s, [
    "Add @media (max-width: 1024px) — auto-collapse sidebar to 52px icon-only rail",
    "Add @media (max-width: 768px) — hide sidebar, show bottom navigation bar with 5 primary icons",
    "Phase pills: horizontal scroll with fade edges on mobile (overflow-x: auto, mask-image gradient)",
    "Form layouts: stack 2-column grids to single column (already done in OutsourcePortal — reuse those patterns)",
    "3D viewer / render workspace: remove fixed 360px side panels, use full-width with toggle drawer",
  ], 0.8, 5.7, 11.5, 8);
}

// ════════════════════════════════════════════════════════════════
// SLIDE 7 — ACCESSIBILITY
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "ACCESSIBILITY & KEYBOARD NAVIGATION", "Semantic HTML, ARIA attributes, and focus management");

  // Current vs Ideal code comparison
  addLabel(s, "CURRENT CODE", 0.6, 1.35, 3, 0.25, { fontSize: 8, color: C.rd, bold: true });
  addCard(s, 0.6, 1.6, 5.8, 2.0, { fill: C.dark });
  addLabel(s, '<div className="vw-ri"\n     onClick={() => setTab(n.k)}>\n  <span className="vw-ic">{n.ic}</span>\n  <span>{n.lb}</span>\n</div>', 0.8, 1.7, 5.4, 1.8, { fontSize: 8, fontFace: "Courier New", color: C.tx2 });
  addTag(s, "No role", 5.0, 1.75, C.rd);
  addTag(s, "No ARIA", 5.0, 2.1, C.rd);
  addTag(s, "No keyboard", 5.0, 2.45, C.rd);

  addLabel(s, "IDEAL CODE", 6.8, 1.35, 3, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 6.8, 1.6, 5.9, 2.0, { fill: C.dark });
  addLabel(s, '<button role="tab"\n        aria-selected={tab === n.k}\n        className="vw-ri"\n        onClick={() => setTab(n.k)}>\n  <span className="vw-ic">{n.ic}</span>\n  <span>{n.lb}</span>\n</button>', 7.0, 1.7, 5.5, 1.8, { fontSize: 8, fontFace: "Courier New", color: C.tx2 });
  addTag(s, "Semantic", 11.3, 1.75, C.gn);
  addTag(s, "ARIA", 11.3, 2.1, C.gn);
  addTag(s, "Keyboard", 11.3, 2.45, C.gn);

  // Checklist
  addLabel(s, "ACCESSIBILITY CHECKLIST", 0.6, 3.9, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 4.15, 12.1, 3.0);

  const checks = [
    ["Nav items → <button role='tab'>", "Replace all <div onClick> with semantic <button> elements with role='tab' and aria-selected"],
    ["Focus-visible rings", "Add :focus-visible { outline: 2px solid var(--or); outline-offset: 2px } to all interactive elements"],
    ["Skip-to-content link", "Add hidden link at top of page: 'Skip to main content' → focuses the vw-mn container"],
    ["Form label associations", "Add htmlFor/id pairs to all <label>/<input> in VizWorkflow forms (already done in LoginPage)"],
    ["Colour contrast", "Ensure all text meets WCAG 2.1 AA (4.5:1 for body, 3:1 for large text). Current --tx3 on --bg may fail."],
    ["Tab order", "Ensure logical tab order: sidebar nav → top bar → main content. Use tabIndex where needed."],
  ];

  checks.forEach((c, i) => {
    const yy = 4.35 + i * 0.45;
    addLabel(s, "☐  " + c[0], 0.8, yy, 4, 0.2, { fontSize: 8.5, color: C.tx, bold: true });
    addLabel(s, c[1], 4.8, yy, 7.5, 0.35, { fontSize: 7.5, color: C.tx2 });
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 8 — DARK / LIGHT THEME
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "DARK / LIGHT THEME OPTIMIZATION", "Respect OS preference, add System option, fix portal inconsistency");

  // ── Light mockup ──
  addLabel(s, "LIGHT MODE", 0.6, 1.35, 2, 0.25, { fontSize: 8, color: C.ltTx, bold: true });
  addCard(s, 0.6, 1.6, 3.8, 3.0, { fill: C.ltBg, line: C.ltBdr });
  addCard(s, 0.7, 1.7, 0.9, 2.8, { fill: C.ltCard, line: C.ltBdr });
  addLabel(s, "dwp.viz", 0.75, 1.75, 0.8, 0.2, { fontSize: 6, color: C.or, bold: true });
  ["Workspace", "Prompt Gen", "Phase Gates"].forEach((t, i) => {
    addLabel(s, t, 0.75, 2.05 + i * 0.25, 0.8, 0.2, { fontSize: 5.5, color: i === 0 ? C.or : C.ltTx2 });
  });
  addCard(s, 1.7, 1.7, 2.6, 2.8, { fill: C.ltCard, line: C.ltBdr });
  addLabel(s, "Content Area", 2.3, 3.0, 1.5, 0.3, { fontSize: 7, color: C.ltTx2, align: "center" });

  // ── Dark mockup ──
  addLabel(s, "DARK MODE", 4.8, 1.35, 2, 0.25, { fontSize: 8, color: C.tx, bold: true });
  addCard(s, 4.8, 1.6, 3.8, 3.0, { fill: C.bg });
  addCard(s, 4.9, 1.7, 0.9, 2.8, { fill: C.dark });
  addLabel(s, "dwp.viz", 4.95, 1.75, 0.8, 0.2, { fontSize: 6, color: C.or, bold: true });
  ["Workspace", "Prompt Gen", "Phase Gates"].forEach((t, i) => {
    addLabel(s, t, 4.95, 2.05 + i * 0.25, 0.8, 0.2, { fontSize: 5.5, color: i === 0 ? C.or : C.tx2 });
  });
  addCard(s, 5.9, 1.7, 2.6, 2.8, { fill: C.dark });
  addLabel(s, "Content Area", 6.5, 3.0, 1.5, 0.3, { fontSize: 7, color: C.tx2, align: "center" });

  // ── Theme toggle mockup (3-way) ──
  addLabel(s, "PROPOSED 3-WAY TOGGLE", 9.0, 1.35, 3, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 9.0, 1.6, 3.7, 1.2);
  // Toggle pill
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 9.6, y: 1.85, w: 2.6, h: 0.45, fill: { color: C.bg }, rectRadius: 0.22 });
  ["☀ Light", "⊙ System", "☾ Dark"].forEach((t, i) => {
    const isActive = i === 1;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 9.65 + i * 0.85, y: 1.88, w: 0.8, h: 0.38, fill: { color: isActive ? C.or : "00000000" }, rectRadius: 0.19 });
    addLabel(s, t, 9.65 + i * 0.85, 1.88, 0.8, 0.38, { fontSize: 6.5, align: "center", color: isActive ? C.white : C.tx3 });
  });
  addLabel(s, "Respect prefers-color-scheme\nwhen set to 'System'", 9.2, 2.4, 3, 0.35, { fontSize: 7, color: C.tx3 });

  // ── Issues to fix ──
  addLabel(s, "ISSUES TO FIX", 0.6, 4.85, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 5.1, 12.1, 2.1);

  const issues = [
    { issue: "OutsourcePortal always dark", fix: "Portal uses bg-zinc-950 hardcoded. Wrap in ThemeContext and use CSS vars.", priority: "HIGH" },
    { issue: "No System theme option", fix: "Add third toggle state that reads window.matchMedia('(prefers-color-scheme: dark)').", priority: "MEDIUM" },
    { issue: "Dual class toggle (.viz-dark + .dark)", fix: "Consolidate to single .viz-dark class. Remove redundant .dark toggle from ThemeContext.", priority: "LOW" },
    { issue: "Default hardcoded to 'light'", fix: "On first visit, read OS preference. Subsequent visits use localStorage.", priority: "LOW" },
  ];

  issues.forEach((item, i) => {
    const yy = 5.25 + i * 0.45;
    addLabel(s, item.issue, 0.8, yy, 3.5, 0.35, { fontSize: 8, color: C.tx, bold: true });
    addLabel(s, item.fix, 4.4, yy, 6.5, 0.35, { fontSize: 7.5, color: C.tx2 });
    addTag(s, item.priority, 11.2, yy + 0.05, item.priority === "HIGH" ? C.rd : item.priority === "MEDIUM" ? C.or : C.tx3);
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 9 — AI INTERACTION UX (Ideal Mockup)
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "AI INTERACTION UX PATTERNS", "Streaming, retry, token counts, and copy-prompt actions");

  // ── Ideal AI Chat Mockup ──
  addLabel(s, "IDEAL PROMPT GEN WORKSPACE", 0.6, 1.35, 5, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 0.6, 1.6, 7.5, 5.5, { fill: C.dark });

  // Left panel — settings
  addCard(s, 0.75, 1.75, 2.2, 5.2, { fill: C.bg });
  addLabel(s, "MODE", 0.85, 1.85, 1.5, 0.2, { fontSize: 6.5, color: C.tx3, bold: true });
  ["Brief → Narrative", "Text → Image", "Render Critique"].forEach((m, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 2.1 + i * 0.3, w: 2.0, h: 0.25, fill: { color: i === 1 ? C.or + "20" : C.card }, rectRadius: 0.04, line: { color: i === 1 ? C.or + "40" : C.bdr, width: 0.5 } });
    addLabel(s, m, 0.9, 2.1 + i * 0.3, 1.9, 0.25, { fontSize: 7, color: i === 1 ? C.or : C.tx2 });
  });
  addLabel(s, "TOKEN COUNT", 0.85, 3.1, 1.5, 0.2, { fontSize: 6.5, color: C.tx3, bold: true });
  addCard(s, 0.85, 3.35, 2.0, 0.3, { fill: C.card });
  addLabel(s, "1,247 / 4,096 tokens", 0.95, 3.35, 1.8, 0.3, { fontSize: 7, color: C.or });
  // Progress bar for tokens
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 3.7, w: 2.0, h: 0.08, fill: { color: C.bg }, rectRadius: 0.04 });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 3.7, w: 0.6, h: 0.08, fill: { color: C.or }, rectRadius: 0.04 });

  addLabel(s, "EST. TIME", 0.85, 3.95, 1.5, 0.2, { fontSize: 6.5, color: C.tx3, bold: true });
  addLabel(s, "~8-12 seconds", 0.85, 4.15, 1.5, 0.2, { fontSize: 8, color: C.tx });

  // Right panel — conversation
  addCard(s, 3.1, 1.75, 4.85, 5.2, { fill: C.bg });

  // User message
  addCard(s, 5.1, 1.9, 2.7, 0.6, { fill: C.or + "15", line: C.or + "30" });
  addLabel(s, "USER", 5.2, 1.92, 0.5, 0.15, { fontSize: 5, color: C.or, bold: true });
  addLabel(s, "Generate a luxury hotel lobby concept\nwith marble floors and warm lighting", 5.2, 2.1, 2.5, 0.35, { fontSize: 7, color: C.tx });

  // AI response with streaming indicator
  addCard(s, 3.25, 2.7, 4.0, 2.5, { fill: C.card, line: C.gn + "20" });
  addLabel(s, "AI  ·  Gemini 2.0", 3.35, 2.75, 1.5, 0.15, { fontSize: 5, color: C.gn, bold: true });
  addLabel(s, "A grand hotel lobby flooded with natural\nlight through double-height windows.\nPolished Calacatta marble floors reflect\nwarm brass pendant lights suspended\nfrom a coffered ceiling...", 3.35, 2.95, 3.8, 1.2, { fontSize: 7.5, color: C.tx });

  // Action buttons row
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3.35, y: 4.4, w: 0.9, h: 0.28, fill: { color: C.or + "15" }, rectRadius: 0.14 });
  addLabel(s, "📋 Copy", 3.35, 4.4, 0.9, 0.28, { fontSize: 7, color: C.or, align: "center" });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 4.35, y: 4.4, w: 1.1, h: 0.28, fill: { color: C.blue + "15" }, rectRadius: 0.14 });
  addLabel(s, "🔄 Regenerate", 4.35, 4.4, 1.1, 0.28, { fontSize: 7, color: C.blue, align: "center" });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 5.55, y: 4.4, w: 0.9, h: 0.28, fill: { color: C.purple + "15" }, rectRadius: 0.14 });
  addLabel(s, "💾 Save", 5.55, 4.4, 0.9, 0.28, { fontSize: 7, color: C.purple, align: "center" });

  // Input area
  addCard(s, 3.25, 5.4, 4.55, 0.5, { fill: C.card });
  addLabel(s, "Refine your prompt...", 3.4, 5.45, 3.5, 0.4, { fontSize: 8, color: C.tx3 });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 7.15, y: 5.48, w: 0.5, h: 0.32, fill: { color: C.or }, rectRadius: 0.16 });
  addLabel(s, "▶", 7.15, 5.48, 0.5, 0.32, { fontSize: 10, color: C.white, align: "center" });

  // ── Features to add ──
  addCard(s, 8.5, 1.6, 4.2, 5.5);
  addLabel(s, "FEATURES TO ADD", 8.7, 1.75, 3, 0.3, { fontSize: 10, color: C.or, bold: true });

  const features = [
    { t: "Streaming Text", d: "Show tokens as they arrive via SSE/fetch streaming instead of waiting for full response" },
    { t: "Copy Prompt Button", d: "One-click copy for generated prompts — most requested by team for Midjourney workflow" },
    { t: "Regenerate / Retry", d: "Re-run the same prompt without retyping. Essential for iterative design exploration" },
    { t: "Token Counter", d: "Show input token count vs model max. Prevents truncated outputs on long briefs" },
    { t: "Estimated Time", d: "Show average generation time per model. Reduces uncertainty during AI processing" },
    { t: "Save to Library", d: "Save prompt+output directly to Prompt Library from the conversation view" },
    { t: "Image Placeholders", d: "During Imagen generation, show blurred low-res placeholder that sharpens on completion" },
  ];
  features.forEach((f, i) => {
    const yy = 2.15 + i * 0.72;
    addLabel(s, f.t, 8.7, yy, 3.8, 0.22, { fontSize: 8.5, color: C.tx, bold: true });
    addLabel(s, f.d, 8.7, yy + 0.22, 3.8, 0.4, { fontSize: 7, color: C.tx2 });
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 10 — 3D VIEWER PERFORMANCE
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "3D VIEWER PERFORMANCE", "Lazy-load Three.js, WebGL detection, Suspense boundaries");

  addCard(s, 0.6, 1.35, 5.8, 2.5);
  addLabel(s, "CURRENT ISSUE", 0.8, 1.5, 3, 0.25, { fontSize: 8, color: C.rd, bold: true });
  addLabel(s, "Three.js bundle (~500KB gzipped) is imported at the top\nof VizWorkflowApp.tsx — loaded on EVERY page visit even\nif the user never opens the Book3D tab.", 0.8, 1.85, 5.4, 0.8, { fontSize: 9, color: C.tx2 });
  addLabel(s, "Impact: +1.2s initial load time for all users", 0.8, 2.7, 5, 0.3, { fontSize: 9, color: C.rd, bold: true });

  addCard(s, 6.8, 1.35, 5.9, 2.5);
  addLabel(s, "IDEAL SOLUTION", 7.0, 1.5, 3, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addLabel(s, "1. Lazy-load Three.js only when Book3D tab opens\n2. Add WebGL capability detection before rendering\n3. Wrap in <Suspense> with meaningful fallback UI\n4. Show memory warning for models > 50MB", 7.0, 1.85, 5.5, 1.0, { fontSize: 9, color: C.tx2 });
  addLabel(s, "Code: next/dynamic(() => import('./Book3DTab'),\n       { ssr: false, loading: () => <BookSkeleton /> })", 7.0, 3.0, 5.5, 0.6, { fontSize: 8, fontFace: "Courier New", color: C.gn });

  // WebGL detection mockup
  addLabel(s, "WEBGL DETECTION FALLBACK", 0.6, 4.1, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 4.35, 5.8, 2.8, { fill: C.dark });
  addCard(s, 1.5, 4.8, 3.8, 1.8, { fill: C.card });
  addLabel(s, "⚠", 3.0, 5.0, 1, 0.5, { fontSize: 28, align: "center", color: C.or });
  addLabel(s, "3D Viewer Unavailable", 2.0, 5.5, 2.8, 0.3, { fontSize: 10, color: C.tx, bold: true, align: "center" });
  addLabel(s, "Your browser does not support WebGL.\nUse Chrome or Edge for 3D model viewing.", 1.7, 5.85, 3.4, 0.5, { fontSize: 7.5, color: C.tx2, align: "center" });

  // Suspense loading mockup
  addLabel(s, "SUSPENSE LOADING FALLBACK", 6.8, 4.1, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 6.8, 4.35, 5.9, 2.8, { fill: C.dark });
  // Skeleton 3D viewer
  addCard(s, 7.6, 4.7, 4.3, 2.0, { fill: C.bg });
  // Shimmer cube placeholder
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 9.0, y: 5.1, w: 1.5, h: 1.0, fill: { color: C.card }, rectRadius: 0.06 });
  addLabel(s, "Loading 3D Viewer...", 8.5, 5.3, 2.5, 0.3, { fontSize: 9, color: C.tx3, align: "center" });
  // Spinner indicator
  s.addShape(pptx.shapes.OVAL, { x: 9.55, y: 5.65, w: 0.35, h: 0.35, line: { color: C.or, width: 1.5 } });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 11 — FORM & UPLOAD UX
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "FORM & UPLOAD UX", "Progress indicators, auto-save, and improved file linking");

  // ── Ideal Book 3D form mockup ──
  addLabel(s, "IDEAL BOOK 3D REQUEST FORM", 0.6, 1.35, 5, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 0.6, 1.6, 7.5, 5.5, { fill: C.dark });

  // Step progress indicator
  addCard(s, 0.75, 1.75, 7.2, 0.45, { fill: C.bg });
  const steps = ["Project Info", "Areas & Scope", "Timeline", "Tools", "Files & Links", "Review"];
  steps.forEach((st, i) => {
    const xPos = 0.9 + i * 1.18;
    const isActive = i === 0;
    const isDone = false;
    s.addShape(pptx.shapes.OVAL, { x: xPos, y: 1.83, w: 0.22, h: 0.22, fill: { color: isActive ? C.or : C.card }, line: { color: isActive ? C.or : C.bdr, width: 0.5 } });
    addLabel(s, (i + 1).toString(), xPos, 1.83, 0.22, 0.22, { fontSize: 6, color: isActive ? C.white : C.tx3, align: "center" });
    addLabel(s, st, xPos - 0.2, 2.08, 0.7, 0.15, { fontSize: 5, color: isActive ? C.or : C.tx3, align: "center" });
  });
  // Connecting lines
  for (let i = 0; i < 5; i++) {
    s.addShape(pptx.shapes.RECTANGLE, { x: 1.15 + i * 1.18, y: 1.935, w: 0.95, h: 0.02, fill: { color: C.bdr } });
  }

  // Form content area
  addCard(s, 0.75, 2.35, 7.2, 3.8, { fill: C.bg });
  addLabel(s, "Step 1 — Project Information", 0.9, 2.45, 4, 0.3, { fontSize: 10, color: C.tx, bold: true });

  // Form fields
  addLabel(s, "Project Name *", 0.9, 2.8, 2, 0.2, { fontSize: 7, color: C.tx2 });
  addCard(s, 0.9, 3.0, 3.3, 0.35, { fill: C.card });
  addLabel(s, "Krungthai Banking Hall", 1.0, 3.0, 3, 0.35, { fontSize: 8, color: C.tx });

  addLabel(s, "Sector *", 4.5, 2.8, 2, 0.2, { fontSize: 7, color: C.tx2 });
  addCard(s, 4.5, 3.0, 3.3, 0.35, { fill: C.card });
  addLabel(s, "Hospitality  ▾", 4.6, 3.0, 3, 0.35, { fontSize: 8, color: C.tx });

  addLabel(s, "Description", 0.9, 3.5, 2, 0.2, { fontSize: 7, color: C.tx2 });
  addCard(s, 0.9, 3.7, 6.9, 0.8, { fill: C.card });
  addLabel(s, "Modern banking hall with high ceilings and\nnatural stone finishes...", 1.0, 3.75, 6.5, 0.5, { fontSize: 7.5, color: C.tx });
  addLabel(s, "127 / 500 characters", 6.5, 4.25, 1.3, 0.2, { fontSize: 6, color: C.tx3, align: "right" });

  // Auto-save indicator
  addCard(s, 5.5, 2.45, 2.3, 0.28, { fill: C.gn + "15", line: C.gn + "30" });
  addLabel(s, "✓ Auto-saved draft", 5.6, 2.45, 2.1, 0.28, { fontSize: 7, color: C.gn });

  // Next/back buttons
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 5.8, y: 5.8, w: 1, h: 0.35, fill: { color: C.card }, rectRadius: 0.06, line: { color: C.bdr, width: 0.5 } });
  addLabel(s, "← Back", 5.8, 5.8, 1, 0.35, { fontSize: 8, color: C.tx2, align: "center" });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 6.9, y: 5.8, w: 1, h: 0.35, fill: { color: C.or }, rectRadius: 0.06 });
  addLabel(s, "Next →", 6.9, 5.8, 1, 0.35, { fontSize: 8, color: C.white, align: "center" });

  // ── Improvements panel ──
  addCard(s, 8.5, 1.6, 4.2, 5.5);
  addLabel(s, "IMPROVEMENTS", 8.7, 1.75, 3, 0.3, { fontSize: 10, color: C.or, bold: true });

  const improvements = [
    { t: "Step Progress Bar", d: "Visual indicator showing 'Step 1 of 6' with clickable steps to jump between sections" },
    { t: "Auto-Save Drafts", d: "Save form state to localStorage every 30s. Restore on page reload with 'Resume draft?' prompt" },
    { t: "Character Count", d: "Show live character count on description fields with max limit indicator" },
    { t: "Tag-Based URL Input", d: "Replace comma-separated file links with tag input — each URL becomes a removable chip with validation" },
    { t: "Drag-and-Drop Areas", d: "Allow reordering of area scopes via drag handles instead of fixed order" },
    { t: "Drive Picker Loading", d: "Show folder tree skeleton during Google Drive API fetch instead of blank modal" },
    { t: "Inline Validation", d: "Show field-level errors immediately on blur, not only on form submit" },
  ];
  improvements.forEach((f, i) => {
    const yy = 2.15 + i * 0.72;
    addLabel(s, f.t, 8.7, yy, 3.8, 0.22, { fontSize: 8.5, color: C.tx, bold: true });
    addLabel(s, f.d, 8.7, yy + 0.22, 3.8, 0.4, { fontSize: 7, color: C.tx2 });
  });
}

// ════════════════════════════════════════════════════════════════
// SLIDE 12 — ERROR HANDLING
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "ERROR HANDLING & FEEDBACK PATTERNS", "Replace alert() with toast system, add error boundaries");

  // ── Current: alert() ──
  addLabel(s, "CURRENT — BROWSER ALERT", 0.6, 1.35, 4, 0.25, { fontSize: 8, color: C.rd, bold: true });
  addCard(s, 0.6, 1.6, 5.8, 2.0, { fill: C.dark });
  // Fake browser alert mockup
  addCard(s, 1.5, 1.9, 3.8, 1.3, { fill: C.ltBg, line: "999999" });
  addLabel(s, "localhost:3000 says", 1.7, 2.0, 3, 0.2, { fontSize: 7, color: "333333" });
  addLabel(s, "Failed to save settings", 1.7, 2.3, 3, 0.25, { fontSize: 9, color: "000000", bold: true });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3.8, y: 2.7, w: 1.0, h: 0.32, fill: { color: "3B82F6" }, rectRadius: 0.04 });
  addLabel(s, "OK", 3.8, 2.7, 1.0, 0.32, { fontSize: 9, color: C.white, align: "center" });
  addLabel(s, "Blocks UI, no retry option,\nno actionable information", 1.0, 3.2, 3, 0.35, { fontSize: 7, color: C.rd });

  // ── Ideal: Toast system ──
  addLabel(s, "IDEAL — TOAST NOTIFICATION SYSTEM", 6.8, 1.35, 5, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addCard(s, 6.8, 1.6, 5.9, 2.0, { fill: C.dark });

  // Success toast
  addCard(s, 7.0, 1.75, 4.0, 0.45, { fill: C.gn + "15", line: C.gn + "30" });
  s.addShape(pptx.shapes.RECTANGLE, { x: 7.0, y: 1.75, w: 0.06, h: 0.45, fill: { color: C.gn } });
  addLabel(s, "✓  Project saved successfully", 7.15, 1.75, 3, 0.45, { fontSize: 8, color: C.gn });
  addLabel(s, "×", 10.6, 1.75, 0.3, 0.45, { fontSize: 10, color: C.tx3, align: "center" });

  // Error toast with retry
  addCard(s, 7.0, 2.35, 4.0, 0.55, { fill: C.rd + "10", line: C.rd + "30" });
  s.addShape(pptx.shapes.RECTANGLE, { x: 7.0, y: 2.35, w: 0.06, h: 0.55, fill: { color: C.rd } });
  addLabel(s, "✗  Failed to save settings", 7.15, 2.37, 2.5, 0.25, { fontSize: 8, color: C.rd });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 9.5, y: 2.48, w: 0.8, h: 0.26, fill: { color: C.rd + "20" }, rectRadius: 0.13 });
  addLabel(s, "Retry", 9.5, 2.48, 0.8, 0.26, { fontSize: 7, color: C.rd, align: "center" });
  addLabel(s, "Network error — check connection", 7.15, 2.63, 3, 0.2, { fontSize: 6.5, color: C.tx3 });

  // Warning toast
  addCard(s, 7.0, 3.05, 4.0, 0.45, { fill: C.or + "10", line: C.or + "30" });
  s.addShape(pptx.shapes.RECTANGLE, { x: 7.0, y: 3.05, w: 0.06, h: 0.45, fill: { color: C.or } });
  addLabel(s, "⚠  Session expires in 5 minutes", 7.15, 3.05, 3, 0.45, { fontSize: 8, color: C.or });

  // Error boundary mockup
  addLabel(s, "ERROR BOUNDARY PER TAB", 0.6, 3.85, 5, 0.25, { fontSize: 8, color: C.or, bold: true });
  addCard(s, 0.6, 4.1, 12.1, 3.1);

  // Tab error boundary mockup
  addCard(s, 0.8, 4.3, 5.5, 2.7, { fill: C.dark });
  // Sidebar (working)
  addCard(s, 0.9, 4.4, 1.2, 2.5, { fill: C.bg });
  addLabel(s, "Workspace\nPrompt Gen\nImage Lib ✗\nModels", 0.95, 4.5, 1.1, 1.5, { fontSize: 7, color: C.tx2 });
  // Main content (error boundary)
  addCard(s, 2.2, 4.4, 3.9, 2.5, { fill: C.rd + "08" });
  addLabel(s, "⚠", 3.5, 4.7, 1, 0.5, { fontSize: 28, color: C.rd, align: "center" });
  addLabel(s, "Image Library encountered an error", 2.8, 5.2, 2.5, 0.3, { fontSize: 9, color: C.tx, bold: true, align: "center" });
  addLabel(s, "The rest of the app continues working.\nOnly this tab is affected.", 2.6, 5.5, 3, 0.4, { fontSize: 7.5, color: C.tx2, align: "center" });
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3.3, y: 6.0, w: 1.5, h: 0.35, fill: { color: C.or }, rectRadius: 0.06 });
  addLabel(s, "Reload Tab", 3.3, 6.0, 1.5, 0.35, { fontSize: 8, color: C.white, align: "center" });

  // Implementation checklist
  addLabel(s, "Implementation", 6.8, 4.3, 3, 0.25, { fontSize: 9, color: C.or, bold: true });
  addBullets(s, [
    "Replace all 6 alert() calls in SettingsPortal and Book3DTab with toast notifications",
    "Add <ErrorBoundary> wrapper around each tab's content — catches render crashes",
    "Toast queue: stack multiple toasts with auto-dismiss (3s success, 8s error)",
    "Error toasts include 'Retry' button that re-runs the failed operation",
    "Toast component already exists as vw-notice class — extend it with variants",
    "Add global error handler for unhandled promise rejections → show toast",
  ], 6.8, 4.6, 5.8, 8);
}

// ════════════════════════════════════════════════════════════════
// SLIDE 13 — PRIORITY MATRIX
// ════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  addTitle(s, "PRIORITY MATRIX", "Impact vs. effort for all UX recommendations");

  // Grid background
  addCard(s, 0.6, 1.4, 8.5, 5.5);

  // Axes
  s.addShape(pptx.shapes.RECTANGLE, { x: 1.5, y: 1.6, w: 0.02, h: 5.1, fill: { color: C.bdr } });
  s.addShape(pptx.shapes.RECTANGLE, { x: 1.5, y: 6.7, w: 7.4, h: 0.02, fill: { color: C.bdr } });
  addLabel(s, "← LOW EFFORT                                            HIGH EFFORT →", 1.5, 6.8, 7.4, 0.25, { fontSize: 7, color: C.tx3, align: "center" });
  addLabel(s, "HIGH\nIMPACT", 0.7, 1.8, 0.7, 1, { fontSize: 7, color: C.tx3, align: "center" });
  addLabel(s, "LOW\nIMPACT", 0.7, 5.5, 0.7, 0.8, { fontSize: 7, color: C.tx3, align: "center" });

  // Quadrant labels
  addLabel(s, "QUICK WINS", 2.5, 1.6, 2, 0.25, { fontSize: 8, color: C.gn, bold: true });
  addLabel(s, "STRATEGIC", 6.5, 1.6, 2, 0.25, { fontSize: 8, color: C.or, bold: true });
  addLabel(s, "NICE TO HAVE", 2.5, 5.3, 2, 0.25, { fontSize: 8, color: C.tx3, bold: true });
  addLabel(s, "CONSIDER LATER", 6.5, 5.3, 2, 0.25, { fontSize: 8, color: C.tx3, bold: true });

  // Quadrant divider lines (dashed feel via multiple small rects)
  s.addShape(pptx.shapes.RECTANGLE, { x: 5.2, y: 1.6, w: 0.01, h: 5.1, fill: { color: C.bdr + "60" } });
  s.addShape(pptx.shapes.RECTANGLE, { x: 1.5, y: 4.15, w: 7.4, h: 0.01, fill: { color: C.bdr + "60" } });

  // Items positioned in quadrants
  const items = [
    // Quick wins (high impact, low effort)
    { t: "Replace alert() → toast", x: 2.0, y: 2.0, c: C.gn },
    { t: "Add skeleton loaders", x: 2.0, y: 2.5, c: C.gn },
    { t: "Copy prompt button", x: 2.0, y: 3.0, c: C.gn },
    { t: "Focus-visible rings", x: 3.5, y: 2.0, c: C.gn },
    { t: "Phase pill sizing", x: 3.5, y: 2.5, c: C.gn },
    { t: "System theme option", x: 3.5, y: 3.0, c: C.gn },
    // Strategic (high impact, high effort)
    { t: "Two-tier navigation", x: 5.8, y: 2.0, c: C.or },
    { t: "Tab state preservation", x: 5.8, y: 2.5, c: C.or },
    { t: "Streaming AI responses", x: 5.8, y: 3.0, c: C.or },
    { t: "Mobile responsive", x: 7.2, y: 2.0, c: C.or },
    { t: "Error boundaries", x: 7.2, y: 2.5, c: C.or },
    // Nice to have (low impact, low effort)
    { t: "Char count on fields", x: 2.0, y: 4.4, c: C.tx3 },
    { t: "Consolidate dark class", x: 2.0, y: 4.8, c: C.tx3 },
    // Consider later (low impact, high effort)
    { t: "Lazy-load Three.js", x: 5.8, y: 4.4, c: C.tx3 },
    { t: "Drag-and-drop areas", x: 5.8, y: 4.8, c: C.tx3 },
    { t: "Form auto-save", x: 7.0, y: 4.4, c: C.tx3 },
  ];

  items.forEach(item => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: item.x, y: item.y, w: 1.6, h: 0.35, fill: { color: item.c + "15" }, line: { color: item.c + "30", width: 0.5 }, rectRadius: 0.06 });
    addLabel(s, item.t, item.x + 0.05, item.y, 1.5, 0.35, { fontSize: 6.5, color: item.c });
  });

  // ── Summary panel ──
  addCard(s, 9.5, 1.4, 3.2, 5.5);
  addLabel(s, "SUMMARY", 9.7, 1.55, 2.5, 0.3, { fontSize: 10, color: C.or, bold: true });

  addLabel(s, "Quick Wins (Do First)", 9.7, 2.0, 2.8, 0.25, { fontSize: 9, color: C.gn, bold: true });
  addLabel(s, "6 items — can be completed in\n1-2 sprints with minimal risk.\nImmediate UX improvement.", 9.7, 2.3, 2.8, 0.7, { fontSize: 7.5, color: C.tx2 });

  addLabel(s, "Strategic (Plan & Execute)", 9.7, 3.2, 2.8, 0.25, { fontSize: 9, color: C.or, bold: true });
  addLabel(s, "5 items — require architecture\nchanges. High impact but need\ncareful implementation.", 9.7, 3.5, 2.8, 0.7, { fontSize: 7.5, color: C.tx2 });

  addLabel(s, "Nice to Have", 9.7, 4.4, 2.8, 0.25, { fontSize: 9, color: C.tx3, bold: true });
  addLabel(s, "2 items — low effort, polish.\nDo when capacity allows.", 9.7, 4.7, 2.8, 0.5, { fontSize: 7.5, color: C.tx2 });

  addLabel(s, "Consider Later", 9.7, 5.4, 2.8, 0.25, { fontSize: 9, color: C.tx3, bold: true });
  addLabel(s, "3 items — useful but not\nurgent. Schedule for Q3.", 9.7, 5.7, 2.8, 0.5, { fontSize: 7.5, color: C.tx2 });
}

// ════════════════════════════════════════════════════════════════
// Generate .pptx
// ════════════════════════════════════════════════════════════════
const outPath = "./docs/DWP_3DPipeline_UX_Optimization.pptx";
pptx.writeFile({ fileName: outPath }).then(() => {
  console.log(`Presentation saved to ${outPath}`);
}).catch(err => {
  console.error("Failed to generate presentation:", err);
});
