---
description: How the 3D Visualization Pipeline works - from work request inputs to final deliverables
---

# 3D Visualization Pipeline Workflow

This document describes the unified workflow for processing 3D visualization work requests, combining both the standard production pipeline and AI-enhanced workflows.

## Work Request Inputs

Every work request can include one or more of the following source types:

| Input Type | Description |
|------------|-------------|
| **3D Max** | 3DS Max project files (.max) |
| **Revit** | Revit architectural models (.rvt) |
| **Image** | Reference images, sketches, or concept art |

---

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WORK REQUEST                                      │
│                    ┌──────────┬──────────┬──────────┐                       │
│                    │  3D Max  │  Revit   │  Image   │                       │
│                    └────┬─────┴────┬─────┴────┬─────┘                       │
└─────────────────────────┼──────────┼──────────┼─────────────────────────────┘
                          │          │          │
                          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Mod Image (Modeling Preparation)                                   │
│  - Extract/prepare geometry from source files                                │
│  - Generate reference images from 3D models                                  │
│  - Clean up and optimize mesh data                                           │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Sketch                                                             │
│  - Create concept sketches and design iterations                             │
│  - Establish visual direction and composition                                │
│  - Client review checkpoint                                                  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: 3D Model                                                           │
│  - Build/refine 3D geometry                                                  │
│  - Apply materials and textures                                              │
│  - Set up lighting and camera angles                                         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Rendering                                                          │
│  - Generate high-quality still images                                        │
│  - Post-processing and enhancement                                           │
│  - AI upscaling with Magnific AI                                             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 5: Animation (Optional)                                               │
│  - Create walkthrough animations                                             │
│  - Generate AI-powered video sequences                                       │
│  - Final export and delivery                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 1: Mod Image (Modeling Preparation)
**Tools:** 3DS Max, Revit, Hyper 3D, Tripo 3D, Gemini Concept Gen

Takes input files and prepares them for the visualization pipeline:
- Extracts geometry from architectural files
- Generates reference images from 3D models
- AI tools can convert images to 3D models

### Stage 2: Sketch
**Tools:** Image references, AI concept generators

Creates visual direction before full production:
- Establishes composition and camera angles
- Defines lighting mood and atmosphere
- Quick iteration on design concepts

### Stage 3: 3D Model
**Tools:** 3DS Max, Material editors, KREA AI

Full 3D production work:
- Detailed modeling and refinement
- Material and texture application
- Scene assembly and optimization

### Stage 4: Rendering
**Tools:** V-Ray, 3DS Max, Magnific AI

Generates final still images:
- High-quality photorealistic renders
- AI enhancement and upscaling
- Post-processing adjustments

### Stage 5: Animation
**Tools:** 3DS Max, Luma Dream Machine, Runway Gen-3, Kling AI, Gemini Video Gen

Creates motion content:
- Camera walkthroughs
- AI-generated video sequences
- Final video export

---

## Output Types

| Output | Description |
|--------|-------------|
| **Mod Image** | Prepared geometry and reference images |
| **Sketch** | Concept sketches for approval |
| **3D Model** | Complete 3D scene files |
| **Rendering** | High-resolution still images |
| **Animation** | Video walkthroughs and sequences |
