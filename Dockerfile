# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=6144

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Set environment variable for build time (mapped from Cloud Build)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL
ARG NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON
ARG NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA
ARG GEMINI_CLIENT_ID
ARG GEMINI_API_KEY
ARG CLAUDE_API_KEY
ARG APS_CLIENT_ID
ARG APS_CLIENT_SECRET
ARG APS_CALLBACK_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL=$NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL
ENV NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON=$NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON
ENV NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA=$NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA
ENV GEMINI_CLIENT_ID=$GEMINI_CLIENT_ID
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV CLAUDE_API_KEY=$CLAUDE_API_KEY
ENV APS_CLIENT_ID=$APS_CLIENT_ID
ENV APS_CLIENT_SECRET=$APS_CLIENT_SECRET
ENV APS_CALLBACK_URL=$APS_CALLBACK_URL

RUN npm run build

# Production Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
