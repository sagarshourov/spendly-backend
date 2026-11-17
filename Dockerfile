FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY api ./api
COPY scripts ./scripts
COPY public ./public
EXPOSE 8787
CMD ["npm", "start"]
