FROM python:3.13-slim

WORKDIR /app

# Dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code source
COPY . .

# Rendre l'entrypoint exécutable
RUN chmod +x entrypoint.sh

# Attente DB → migrations Alembic → uvicorn (seed via lifespan FastAPI)
ENTRYPOINT ["./entrypoint.sh"]
