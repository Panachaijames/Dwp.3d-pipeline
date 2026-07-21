// Project list assembly shared by the VizWorkflow shell and the Boards studio.
// Merges `project_requests` rows with `viz_projects` rows into one project list.
// IMPORTANT: the ids produced here key per-project persistence (localStorage /
// IndexedDB) across apps — keep the merge logic identical for every consumer.

import { VizProject, today } from './constants';
import { inferPhaseKey, readText, slugify } from './projectCatalog';

const EMPTY_GATES: VizProject['gates'] = { 1: null, 2: null, 3: null, 4: null };

const normalizeGates = (gates: unknown): VizProject['gates'] => {
    if (!gates || typeof gates !== 'object') return { ...EMPTY_GATES };

    const source = gates as Partial<VizProject['gates']>;
    return {
        1: source[1] ?? null,
        2: source[2] ?? null,
        3: source[3] ?? null,
        4: source[4] ?? null,
    };
};

const normalizeVizProjectRow = (row: any): VizProject => ({
    id: readText(row?.id) || `viz:${slugify(readText(row?.project_id, row?.name) || today())}`,
    name: readText(row?.name),
    projectId: readText(row?.project_id),
    sector: readText(row?.sector) || 'Hospitality',
    studio: readText(row?.studio),
    phase: inferPhaseKey(row?.phase),
    gates: normalizeGates(row?.gates),
    created: readText(row?.created, row?.created_at) || today(),
});

const normalizeRequestedProjectRow = (row: any): VizProject | null => {
    const projectId = readText(row?.project_number);
    const name = readText(row?.project_name);
    const studio = readText(row?.studio_full_name);

    if (!projectId && !name && !studio) return null;

    const requestKey = slugify(`${projectId}|${name}|${studio}`) || slugify(readText(row?.id) || today());
    const requestRowId = readText(row?.id);

    return {
        id: `request:${requestKey}`,
        name,
        projectId,
        sector: 'Hospitality',
        studio,
        phase: inferPhaseKey(row?.current_phase),
        gates: { ...EMPTY_GATES },
        created: readText(row?.created_at, row?.timestamp) || today(),
        requestKey,
        requestRowId,
    };
};

const matchesRequestedProject = (requestedProject: VizProject, vizProject: VizProject) => {
    if (requestedProject.requestKey && vizProject.requestKey && requestedProject.requestKey === vizProject.requestKey) {
        return true;
    }

    const requestedProjectId = slugify(requestedProject.projectId);
    const vizProjectId = slugify(vizProject.projectId);
    if (requestedProjectId && vizProjectId && requestedProjectId === vizProjectId) {
        return true;
    }

    const requestedName = slugify(requestedProject.name);
    const vizName = slugify(vizProject.name);
    if (!requestedName || !vizName || requestedName !== vizName) {
        return false;
    }

    const requestedStudio = slugify(requestedProject.studio);
    const vizStudio = slugify(vizProject.studio);
    return !requestedStudio || !vizStudio || requestedStudio === vizStudio;
};

const sortProjects = (projects: VizProject[]) =>
    [...projects].sort((left, right) => {
        const leftCreated = left.created || "";
        const rightCreated = right.created || "";
        if (leftCreated !== rightCreated) {
            return rightCreated.localeCompare(leftCreated);
        }
        const leftLabel = `${left.projectId} ${left.name}`.trim().toLowerCase();
        const rightLabel = `${right.projectId} ${right.name}`.trim().toLowerCase();
        return leftLabel.localeCompare(rightLabel);
    });

export const mergeProjects = (requestRows: any[] | null | undefined, vizRows: any[] | null | undefined) => {
    const requestProjects = new Map<string, VizProject>();
    for (const row of requestRows || []) {
        const project = normalizeRequestedProjectRow(row);
        if (project && !requestProjects.has(project.requestKey || project.id)) {
            requestProjects.set(project.requestKey || project.id, project);
        }
    }

    const requestedProjects = sortProjects(Array.from(requestProjects.values()));
    const vizProjects = (vizRows || []).map(row => normalizeVizProjectRow(row));
    const mergedProjects: VizProject[] = [];
    const consumedVizIds = new Set<string>();

    for (const requestedProject of requestedProjects) {
        const matchingVizProject = vizProjects.find(vizProject => !consumedVizIds.has(vizProject.id) && matchesRequestedProject(requestedProject, vizProject));

        if (!matchingVizProject) {
            mergedProjects.push(requestedProject);
            continue;
        }

        consumedVizIds.add(matchingVizProject.id);
        mergedProjects.push({
            ...requestedProject,
            ...matchingVizProject,
            id: matchingVizProject.id,
            name: matchingVizProject.name || requestedProject.name,
            projectId: matchingVizProject.projectId || requestedProject.projectId,
            studio: matchingVizProject.studio || requestedProject.studio,
            sector: matchingVizProject.sector || requestedProject.sector,
            phase: matchingVizProject.phase || requestedProject.phase,
            gates: normalizeGates(matchingVizProject.gates),
            created: matchingVizProject.created || requestedProject.created,
            requestKey: requestedProject.requestKey,
            requestRowId: requestedProject.requestRowId,
        });
    }

    // Include user-created viz_projects that don't match any request row
    for (const vizProject of vizProjects) {
        if (!consumedVizIds.has(vizProject.id)) {
            mergedProjects.push(vizProject);
        }
    }

    return sortProjects(mergedProjects);
};
