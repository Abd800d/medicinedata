# النشر للإنتاج · Deployment

## 1) المتطلبات

- خادم Linux (Ubuntu 22.04/24.04 أو Debian) بذاكرة ≥ 1 GB
- Node.js ≥ 20 (يُنصَح بـ 22 LTS)
- Nginx (وكيل عكسي + HTTPS)
- `build-essential python3` لبناء `better-sqlite3` إن لم تتوفر حزمة جاهزة

## 2) تجهيز التطبيق

```bash
sudo mkdir -p /opt/mda /var/lib/mda/uploads
sudo useradd -r -s /usr/sbin/nologin mda
sudo chown -R mda:mda /opt/mda /var/lib/mda

git clone <repo-url> /opt/mda
cd /opt/mda
cp .env.example .env && nano .env       # JWT_SECRET، ADMIN_PASSWORD، OWNER_EMAIL، DATA_DIR

sudo -u mda npm ci
sudo -u mda npm run build
sudo -u mda npm run seed                # ينشئ /var/lib/mda/mda.db
```

في `.env` للإنتاج:

```ini
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DATA_DIR=/var/lib/mda
JWT_SECRET=<openssl rand -hex 48>
OWNER_EMAIL=owner@example.com
ADMIN_PASSWORD=<قوية>
```

> لا تستخدم `HOST=0.0.0.0` إذا كان Nginx على نفس الجهاز — حصر الاستماع على 127.0.0.1 أكثر أمانًا.

## 3) systemd

`/etc/systemd/system/mda.service`:

```ini
[Unit]
Description=MDA - MedicineData
After=network.target

[Service]
Type=simple
User=mda
Group=mda
WorkingDirectory=/opt/mda
Environment=NODE_ENV=production
EnvironmentFile=/opt/mda/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/mda

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mda
sudo systemctl status mda
curl -s http://127.0.0.1:4000/api/health
```

## 4) Nginx + HTTPS

`/etc/nginx/sites-available/mda`:

```nginx
server {
    listen 80;
    server_name mda.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mda.example.com;

    ssl_certificate     /etc/letsencrypt/live/mda.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mda.example.com/privkey.pem;

    client_max_body_size 30m;          # صور الوصفات والاستيراد

    location /uploads/ {
        alias /var/lib/mda/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mda /etc/nginx/sites-enabled/mda
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mda.example.com
```

الخادم يخدم `dist/` تلقائيًا عند وجوده، لذا لا حاجة لقاعدة Nginx منفصلة للـ SPA.

## 5) التحديث

```bash
cd /opt/mda
sudo -u mda git pull
sudo -u mda npm ci
sudo -u mda npm run build
sudo -u mda npm run seed          # idempotent: يضيف/يحدّث دون تكرار
sudo systemctl restart mda
```

استخدم `npm run seed:reset` فقط إذا أردت **تصفير الكتالوج** وإعادة بنائه من `server/data/*` (لا يمسّ المستخدمين).

## 6) النسخ الاحتياطي

قاعدة SQLite مع WAL — انسخ بأمان باستخدام أمر SQLite:

```bash
sudo mkdir -p /var/backups/mda
sqlite3 /var/lib/mda/mda.db ".backup '/var/backups/mda/mda-$(date +%F).db'"
tar czf /var/backups/mda/uploads-$(date +%F).tgz -C /var/lib/mda uploads
```

أو من لوحة الإدارة: **الإعدادات → تصدير نسخة JSON** (`.json` لكل الكتالوج؛ بدون كلمات المرور).
جدولة يومية عبر cron:

```cron
15 3 * * * sqlite3 /var/lib/mda/mda.db ".backup '/var/backups/mda/mda-$(date +\%F).db'" && find /var/backups/mda -name 'mda-*.db' -mtime +14 -delete
```

## 7) Docker (اختياري)

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=4000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "server/index.js"]
```

```bash
docker build -t mda .
docker run -d --name mda -p 4000:4000 -v mda-data:/data --env-file .env mda
docker exec mda node server/seed.js      # مرة واحدة
```

## 8) قائمة ما بعد النشر

- [ ] `/api/health` يرجّع `{ "ok": true }`
- [ ] تسجيل الدخول بحساب المالك وتغيير كلمة المرور
- [ ] `/admin` → الإعدادات: الاسم، البريد، الواتساب، إخلاء المسؤولية
- [ ] رفع شعار/صور منتجات حقيقية إن توفرت
- [ ] ضبط `GOOGLE_CLIENT_ID` إن أردت تسجيل الدخول بجوجل
- [ ] ضبط مفاتيح AI إن أردت قراءة الوصفات من الصور
- [ ] تفعيل نسخ احتياطي دوري + مراقبة (`/api/health`)
- [ ] تجربة التطبيق على جوال حقيقي (PWA install)
