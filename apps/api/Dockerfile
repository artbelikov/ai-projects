FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@ai-portfolio/api...
RUN pnpm --filter @ai-portfolio/api deploy --prod /out

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY --from=builder /out ./
COPY --from=builder /app/apps/api/dist ./dist
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/health || exit 1
USER node
CMD ["node", "dist/server.js"]
