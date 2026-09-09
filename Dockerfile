FROM node:20-bullseye

RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN pip3 install --break-system-packages -r requirements.txt

WORKDIR /app/dashboard
RUN npm install
RUN npm run build

WORKDIR /app
CMD ["sh", "-c", "cd /app/dashboard && npm run start & python3 -m worker.run & wait"]
