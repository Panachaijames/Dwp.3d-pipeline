import type { PhaseKey } from './constants';

const PROJECT_NUMBER_KEYS = [
    'project_no',
    'project_number',
    'project_id',
    'job_no',
    'job_number',
    'job_id',
    'number',
    'code'
];

const PROJECT_NAME_KEYS = [
    'project_name',
    'name',
    'project',
    'title',
    'project_title'
];

const STUDIO_KEYS = [
    'studio_full_name',
    'studio',
    'office',
    'location',
    'region'
];

const MANAGER_KEYS = [
    'manager',
    'project_manager',
    'manager_name',
    'director',
    'lead'
];

const PHASE_KEYS = [
    'current_phase',
    'phase',
    'project_phase',
    'stage',
    'status'
];

const SECTOR_KEYS = [
    'sector',
    'project_sector',
    'typology',
    'category',
    'market',
    'type'
];

const CREATED_KEYS = [
    'created',
    'created_at',
    'date_created',
    'inserted_at'
];

const PROJECT_NUMBER_PATTERNS = [
    /project.*(number|no|id|code)/i,
    /job.*(number|no|id|code)/i,
    /^(number|code)$/i
];

const PROJECT_NAME_PATTERNS = [
    /project.*(name|title)/i,
    /^(name|title)$/i
];

const STUDIO_PATTERNS = [
    /(studio|office|location|region)/i
];

const MANAGER_PATTERNS = [
    /(manager|director|lead|owner)/i
];

const PHASE_PATTERNS = [
    /(phase|stage|status)/i
];

const SECTOR_PATTERNS = [
    /(sector|typology|category|market|type)/i
];

const CREATED_PATTERNS = [
    /(created|inserted|date)/i
];

export interface CatalogProject {
    catalogKey: string;
    label: string;
    projectName: string;
    projectNumber: string;
    studioFullName: string;
    subtitle: string;
    manager: string;
    currentPhase: string;
    sector: string;
    created: string;
}

export const readText = (...values: unknown[]) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
};

export const slugify = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export const readField = (
    row: Record<string, unknown> | null | undefined,
    candidateKeys: string[],
    patterns: RegExp[] = []
) => {
    if (!row) return '';

    for (const key of candidateKeys) {
        const text = readText(row[key]);
        if (text) return text;
    }

    for (const [key, value] of Object.entries(row)) {
        if (patterns.some(pattern => pattern.test(key))) {
            const text = readText(value);
            if (text) return text;
        }
    }

    return '';
};

export const inferPhaseKey = (value: unknown): PhaseKey => {
    const text = readText(value).toLowerCase();

    if (!text) return 'BSA';
    if (text.includes('pre schematic') || text.includes('pre-schematic') || text.includes('preschematic')) return 'SCH';
    if (text.includes('design development')) return 'DD';
    if (text.includes('schematic')) return 'DD';
    if (text.includes('concept')) return 'CON';
    if (text.includes('brief') || text.includes('site') || text === 'bsa') return 'BSA';

    return 'BSA';
};

export const normalizeCatalogProject = (row: Record<string, unknown> | null | undefined): CatalogProject | null => {
    const projectNumber = readField(row, PROJECT_NUMBER_KEYS, PROJECT_NUMBER_PATTERNS);
    const projectName = readField(row, PROJECT_NAME_KEYS, PROJECT_NAME_PATTERNS);
    const studioFullName = readField(row, STUDIO_KEYS, STUDIO_PATTERNS);
    const manager = readField(row, MANAGER_KEYS, MANAGER_PATTERNS);
    const currentPhase = readField(row, PHASE_KEYS, PHASE_PATTERNS);
    const sector = readField(row, SECTOR_KEYS, SECTOR_PATTERNS);
    const created = readField(row, CREATED_KEYS, CREATED_PATTERNS);

    if (!projectNumber && !projectName && !studioFullName) {
        return null;
    }

    const label = projectNumber && projectName
        ? `${projectNumber} - ${projectName}`
        : projectName || projectNumber || 'Unnamed project';
    const rawId = projectNumber || readField(row, ['id', 'uuid'], [/id$/i]) || label;

    return {
        catalogKey: slugify(rawId) || 'catalog-project',
        label,
        projectName,
        projectNumber,
        studioFullName,
        subtitle: [studioFullName, manager, currentPhase].filter(Boolean).join(' - '),
        manager,
        currentPhase,
        sector,
        created
    };
};
