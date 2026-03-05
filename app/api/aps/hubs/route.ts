import { NextRequest, NextResponse } from 'next/server';
import { ApsService } from '@/services/apsService';

export async function GET(request: NextRequest) {
    try {
        const userToken = request.cookies.get('dwp-aps-token')?.value;
        const hubs = await ApsService.listHubs(userToken);

        const result = await Promise.all(
            hubs.map(async (hub) => {
                try {
                    const projects = await ApsService.listProjects(hub.id, userToken);
                    return {
                        id: hub.id,
                        name: hub.attributes.name,
                        type: hub.attributes.extension?.type,
                        projects: projects.map((p) => ({
                            id: p.id,
                            name: p.attributes.name,
                        })),
                    };
                } catch {
                    return {
                        id: hub.id,
                        name: hub.attributes.name,
                        type: hub.attributes.extension?.type,
                        projects: [],
                        error: 'Could not list projects',
                    };
                }
            })
        );

        return NextResponse.json({
            hubs: result,
            debug: {
                hasUserToken: !!userToken,
                tokenPrefix: userToken ? userToken.substring(0, 5) : 'none',
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to list hubs', needsLogin: true },
            { status: 500 }
        );
    }
}
