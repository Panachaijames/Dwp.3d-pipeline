import { NextRequest, NextResponse } from 'next/server';

const APPS_SCRIPT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzy3kaw62RmwS8XPs90aFS8g7on48ayQWYgYQnuqoaJ7RTOgOyYr8Krr-aN4yHkRpQQ/exec';

export async function POST(req: NextRequest) {
    try {
        const { projectName, requestName, startDate, deadline, description, projectNumber } = await req.json();

        if (!projectName || !deadline) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const payload = {
            summary: `[3D Request] ${projectNumber ? projectNumber + ' - ' : ''}${projectName} - ${requestName || 'New Workflow'}`,
            description: description || 'Generated from DWP 3D Pipeline',
            startDate: startDate || Date.now(),
            deadline: deadline
        };

        const response = await fetch(APPS_SCRIPT_WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error: any) {
        console.error('Apps Script Webhook integration error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
