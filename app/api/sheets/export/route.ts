import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { SCHEDULE_COLUMNS, categoryLabel, specInstructionsFor, buildScheduleFormatRequests } from './dwpSchedule';

export const maxDuration = 60;

interface Annotation {
    id: string;
    code: string;
    x: number;
    y: number;
    note?: string;
}

interface AggregatedItem {
    code: string;
    description: string;
    quantity: number;
}

const escapeCsv = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Group annotations by code → one schedule row each, joining distinct notes and counting qty.
const aggregateByCode = (annotations: Annotation[]): AggregatedItem[] => {
    const groups = new Map<string, { code: string; descriptions: string[]; count: number }>();
    for (const a of annotations) {
        const key = (a.code ?? '').trim() || '(unlabeled)';
        if (!groups.has(key)) groups.set(key, { code: key, descriptions: [], count: 0 });
        const g = groups.get(key)!;
        g.count++;
        const note = (a.note ?? '').trim();
        if (note && !g.descriptions.includes(note)) g.descriptions.push(note);
    }
    return Array.from(groups.values()).map(g => ({
        code: g.code,
        description: g.descriptions.join(' / ') || g.code,
        quantity: g.count,
    }));
};

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        const { annotations, projectName } = (await req.json()) as {
            annotations: Annotation[];
            projectName: string;
        };

        if (!Array.isArray(annotations) || annotations.length === 0) {
            return NextResponse.json({ error: 'No tags to export' }, { status: 400 });
        }

        const safeName = (projectName || 'Project').slice(0, 80);
        const aggregated = aggregateByCode(annotations);

        // MM/DD/YYYY to match the schedule's version header.
        const versionDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

        // Header block (Version No. + date in column B), then the 28-column schedule header.
        const csvLines: string[] = [
            '',
            `,${escapeCsv('Version No.')}`,
            `,${escapeCsv(versionDate)}`,
            '',
            SCHEDULE_COLUMNS.map(escapeCsv).join(','),
        ];

        // One row per unique code. Only Category, Item, Description, qty and the standard
        // Special Instructions boilerplate are filled. Link, Estimated Price, Layer/Area and
        // all spec fields stay blank for the designer to complete.
        aggregated.forEach((item) => {
            const row: (string | number)[] = [
                '',                              // Layer
                '',                              // Area
                item.quantity,                   // Area Count (tag count for this code)
                categoryLabel(item.code),        // Category
                item.code,                       // Item
                '',                              // Supplier
                item.description,                // Description
                '',                              // Images
                '',                              // Docs
                '',                              // Product Name
                '',                              // Model #
                '',                              // Dimension
                '',                              // Finish/Color
                '',                              // Notes
                '',                              // Composition
                '',                              // Backing
                '',                              // Width
                '',                              // Thickness
                '',                              // Pile Height
                '',                              // Abrasion
                '',                              // Material
                '',                              // Fire resistance
                '',                              // Manufacturer / Contact book
                specInstructionsFor(item.code),  // Special Instructions
                '',                              // Link (filled in by the designer)
                '',                              // Location of use
                '',                              // Estimated Price (filled in by the designer)
                '',                              // Quality
            ];
            csvLines.push(row.map(escapeCsv).join(','));
        });

        const csv = csvLines.join('\n');

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const sheetsApi = google.sheets({ version: 'v4', auth: oauth2Client });

        const stream = new Readable();
        stream.push(csv);
        stream.push(null);

        const dateStr = new Date().toISOString().split('T')[0];
        const response = await drive.files.create({
            requestBody: {
                name: `${safeName} — Material Schedule (${dateStr})`,
                mimeType: 'application/vnd.google-apps.spreadsheet',
            },
            media: {
                mimeType: 'text/csv',
                body: stream,
            },
            fields: 'id, webViewLink',
        });

        const spreadsheetId = response.data.id;

        // Style the imported CSV into the bordered DWP schedule table. Best-effort:
        // if the Sheets API is disabled/unavailable the export still returns the sheet.
        let formatted = false;
        if (spreadsheetId) {
            try {
                const meta = await sheetsApi.spreadsheets.get({
                    spreadsheetId,
                    fields: 'sheets(properties(sheetId))',
                });
                const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
                const requests = buildScheduleFormatRequests({ sheetId, dataRowCount: aggregated.length });
                await sheetsApi.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests: requests as any[] },
                });
                formatted = true;
            } catch (fmtErr: any) {
                console.warn('[Sheets export] formatting skipped:', fmtErr?.message || fmtErr);
            }
        }

        return NextResponse.json({
            url: response.data.webViewLink,
            fileId: spreadsheetId,
            uniqueCodes: aggregated.length,
            formatted,
        });
    } catch (error: any) {
        console.error('Sheets export error:', error);
        const status = error.code || error.status || 500;
        const isAuthError =
            status === 401 ||
            (error.message && String(error.message).toLowerCase().includes('authentication credentials'));
        return NextResponse.json(
            { error: error.message || 'Error exporting to Google Sheets' },
            { status: isAuthError ? 401 : status }
        );
    }
}
