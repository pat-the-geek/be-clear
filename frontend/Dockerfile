FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Serveur de production (Nginx) ───────────────
FROM nginx:1.30.0-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/public/* /usr/share/nginx/html/

# Assurer les permissions correctes sur les fichiers statiques
RUN chmod -R 755 /usr/share/nginx/html && chmod -R 644 /usr/share/nginx/html/*

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]


# ─── Développement ───────────────────────────────
# Pour le dev, utiliser : docker compose up --build
# avec la target "builder" ou surcharger la CMD :
#   command: npm run dev -- --host 0.0.0.0 --port 3000
