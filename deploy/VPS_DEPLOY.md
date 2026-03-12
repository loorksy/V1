# Videos AI - Native VPS Deployment (systemd + Nginx)

## 1) Server prerequisites

- Ubuntu/Debian VPS
- Domain pointed to VPS IP (optional at first)
- Installed packages:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm nginx ffmpeg
```

## 2) Project layout on VPS

Recommended path:

```bash
/opt/videosai
```

Clone/copy project there, then:

```bash
cd /opt/videosai
npm install
npm run build
```

Backend virtual environment:

```bash
cd /opt/videosai/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 3) Backend environment

Create `/opt/videosai/backend/.env`:

```env
FAL_KEY=your_fal_key
MONGO_URL=your_mongo_url_or_local
DB_NAME=storyweaver

# Persistent media directory (outside release code)
MEDIA_ROOT=/var/lib/videosai/media
```

Create media root:

```bash
sudo mkdir -p /var/lib/videosai/media
sudo chown -R www-data:www-data /var/lib/videosai/media
```

## 4) systemd services

Copy unit files:

```bash
sudo cp /opt/videosai/deploy/systemd/videosai-backend.service /etc/systemd/system/
sudo cp /opt/videosai/deploy/systemd/videosai-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable videosai-backend videosai-frontend
sudo systemctl restart videosai-backend videosai-frontend
```

Health checks:

```bash
sudo systemctl status videosai-backend --no-pager
sudo systemctl status videosai-frontend --no-pager
curl -sS http://127.0.0.1:8001/api/health
```

## 5) Nginx reverse proxy

Copy config:

```bash
sudo cp /opt/videosai/deploy/nginx/videosai.conf /etc/nginx/sites-available/videosai.conf
sudo ln -sf /etc/nginx/sites-available/videosai.conf /etc/nginx/sites-enabled/videosai.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 6) TLS (optional but recommended)

Use certbot after DNS is ready:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## 7) Operations quick commands

```bash
# restart services
sudo systemctl restart videosai-backend videosai-frontend nginx

# logs
journalctl -u videosai-backend -f
journalctl -u videosai-frontend -f

# check media persistence
ls -lah /var/lib/videosai/media
```

