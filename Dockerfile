FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
