# L'immagine di Ciak per il NAS (vedi nas/LEGGIMI.md): l'app costruita e il
# server che la serve, esegue le funzioni di api/ e fa da porta a Supabase.
# La costruisce GitHub a ogni modifica su main (.github/workflows/immagine.yml).
# Dentro non c'è nessuna chiave: arrivano dall'ambiente del container.

FROM node:22-alpine AS costruzione
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VERSIONE_APP=
ENV VERSIONE_APP=$VERSIONE_APP
RUN npm run build && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORTA=3000
COPY --from=costruzione /app/dist ./dist
COPY --from=costruzione /app/dist-server ./dist-server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO /dev/null http://127.0.0.1:3000/versione.json || exit 1
CMD ["node", "dist-server/avvia.mjs"]
