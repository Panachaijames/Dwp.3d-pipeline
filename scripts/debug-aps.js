const fs = require('fs');
const path = require('path');
const https = require('https');

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) process.env[key.trim()] = val.trim();
    });
}

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing APS_CLIENT_ID or APS_CLIENT_SECRET in .env.local');
    process.exit(1);
}

console.log(`🔑 Using Client ID: ${CLIENT_ID}`);

// Helper for requests
function request(method, path, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'developer.api.autodesk.com',
            path,
            method,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}

// Helper to get token
function getToken() {
    return new Promise((resolve, reject) => {
        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'data:read'
        }).toString();

        const req = https.request({
            hostname: 'developer.api.autodesk.com',
            path: '/authentication/v2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.write(body);
        req.end();
    });
}

async function run() {
    try {
        console.log('🔄 Authenticating...');
        const auth = await getToken();
        if (!auth.access_token) {
            console.error('❌ Auth failed:', auth);
            return;
        }
        console.log('✅ Authenticated.');

        console.log('🔄 Listing Hubs...');
        const hubsParams = await request('GET', '/project/v1/hubs', auth.access_token);

        if (!hubsParams.data || hubsParams.data.length === 0) {
            console.log('⚠️  No Hubs found. Make sure to add the Client ID to ACC Admin -> Custom Integrations.');
            return;
        }

        for (const hub of hubsParams.data) {
            console.log(`\n🏢 Hub: ${hub.attributes.name} (ID: ${hub.id})`);

            const projects = await request('GET', `/project/v1/hubs/${hub.id}/projects`, auth.access_token);
            if (projects.data) {
                projects.data.forEach(p => {
                    console.log(`   └─ 📁 Project: ${p.attributes.name} (ID: ${p.id})`);
                });
            } else {
                console.log('   └─ (No projects or error fetching projects)');
            }
        }

    } catch (err) {
        console.error('❌ Error:', err);
    }
}

run();
