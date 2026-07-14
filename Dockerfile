FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/static
RUN mkdir -p /app/data

COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN apt-get update && apt-get install -y nginx && apt-get clean

EXPOSE 8081
CMD ["sh", "-c", "nginx -g 'daemon off;' & uvicorn app.main:app --host 127.0.0.1 --port 8000"]
