FROM node:22-bookworm

RUN apt-get update && apt-get install -y python3 python3-pip build-essential ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN pip3 install --break-system-packages -r requirements.txt

WORKDIR /app/dashboard
RUN npm install --build-from-source=better-sqlite3
RUN npm run build

WORKDIR /app

# migrate.py MUST run before anything else touches the database. Without it, every
# migration added after whatever schema state /app/data's volume started from silently
# never applies here — the local launcher (Start-SocialScheduler-*.{bat,command}) always
# ran it as its own step, but this container's start command never did, which is exactly
# how a real deploy ended up missing the meta_apps table (migration 0032) and, almost
# certainly, every account_metrics/media_metrics column added since whenever this volume
# was first created — the same silent-failure shape "no such table" produces in both the
# dashboard's crashed pages and the worker's metrics sync (which catches the error per
# channel and just leaves that channel's numbers at zero, with no visible crash at all).
# `&&`, not `&`: a failed migration must stop the container from starting with a broken
# schema, not start it anyway and fail every query for a reason nothing here would show.
CMD ["sh", "-c", "python3 migrate.py && (cd /app/dashboard && npm run start & python3 -m worker.run & wait)"]