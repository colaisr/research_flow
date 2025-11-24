# Domain Setup for Production - researchflow.ru

This guide covers setting up the domain `researchflow.ru` to work with your production server at `84.54.30.222`.

## Current Status

✅ **DNS Configuration**: Already configured correctly
- `@.researchflow.ru` → `84.54.30.222` (A record)
- `www.researchflow.ru` → `84.54.30.222` (A record)

❌ **Missing**: Reverse proxy (Nginx) to route traffic from port 80/443 to your application

## Prerequisites

- Server IP: `84.54.30.222`
- Domain: `researchflow.ru`
- Backend running on port `8000`
- Frontend running on port `3000`
- SSH access to the production server

## Step-by-Step Setup

### 1. Verify Services Are Running

First, SSH into your production server and verify the services are running:

```bash
# SSH into your server
ssh root@84.54.30.222

# Check if backend is running
sudo systemctl status research-flow-backend

# Check if frontend is running
sudo systemctl status research-flow-frontend

# If not running, start them:
sudo systemctl start research-flow-backend
sudo systemctl start research-flow-frontend
sudo systemctl enable research-flow-backend
sudo systemctl enable research-flow-frontend

# Test locally on the server
curl http://localhost:8000/health
curl http://localhost:3000
```

### 2. Install Nginx

```bash
# Update package list
sudo apt update

# Install Nginx
sudo apt install -y nginx

# Check Nginx version
nginx -v

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 3. Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Enable firewall (if not already enabled)
sudo ufw enable

# Check firewall status
sudo ufw status
```

### 4. Create Nginx Configuration

Create the Nginx configuration file for your domain:

```bash
sudo nano /etc/nginx/sites-available/researchflow.ru
```

Add the following configuration:

```nginx
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name researchflow.ru www.researchflow.ru;

    # Allow Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name researchflow.ru www.researchflow.ru;

    # SSL certificates (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/researchflow.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/researchflow.ru/privkey.pem;

    # SSL configuration (best practices)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (optional, for monitoring)
    location /health {
        proxy_pass http://localhost:8000/health;
        access_log off;
    }
}
```

### 5. Enable the Site

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/researchflow.ru /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### 6. Install SSL Certificate with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate (this will automatically configure Nginx)
sudo certbot --nginx -d researchflow.ru -d www.researchflow.ru

# Follow the prompts:
# - Enter your email address
# - Agree to terms of service
# - Choose whether to redirect HTTP to HTTPS (recommended: Yes)
```

Certbot will automatically:
- Obtain the SSL certificate
- Update your Nginx configuration
- Set up automatic renewal

### 7. Verify SSL Certificate Auto-Renewal

```bash
# Test renewal process
sudo certbot renew --dry-run

# Check if renewal timer is active
sudo systemctl status certbot.timer
```

### 8. Update Frontend Configuration

Update the frontend to use the public API URL:

```bash
cd /srv/research-flow/frontend

# Create or update .env.production
echo "NEXT_PUBLIC_API_BASE_URL=https://researchflow.ru/api" > .env.production

# Rebuild frontend with new configuration
npm run build

# Restart frontend service
sudo systemctl restart research-flow-frontend
```

### 9. Verify Everything Works

```bash
# Test HTTP redirect (should redirect to HTTPS)
curl -I http://researchflow.ru

# Test HTTPS
curl -I https://researchflow.ru

# Test backend API
curl https://researchflow.ru/api/health

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 10. Test in Browser

1. Open `https://researchflow.ru` in your browser
2. Verify SSL certificate is valid (green lock icon)
3. Test login functionality
4. Test API calls from the frontend

## Troubleshooting

### Connection Refused

If you still get "connection refused":

```bash
# Check if Nginx is running
sudo systemctl status nginx

# Check if services are running
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend

# Check firewall
sudo ufw status

# Check if ports are listening
sudo netstat -tlnp | grep -E ':(80|443|3000|8000)'
# OR
sudo ss -tlnp | grep -E ':(80|443|3000|8000)'
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually if needed
sudo certbot renew

# Check certificate expiration
sudo certbot certificates | grep Expiry
```

### Nginx Configuration Errors

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Reload Nginx after fixing
sudo systemctl reload nginx
```

### Backend/Frontend Not Responding

```bash
# Check service logs
sudo journalctl -u research-flow-backend -n 50
sudo journalctl -u research-flow-frontend -n 50

# Test services directly
curl http://localhost:8000/health
curl http://localhost:3000

# Restart services
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend
```

## Quick Reference Commands

```bash
# Restart all services
sudo systemctl restart research-flow-backend
sudo systemctl restart research-flow-frontend
sudo systemctl restart nginx

# View logs
sudo journalctl -u research-flow-backend -f
sudo journalctl -u research-flow-frontend -f
sudo tail -f /var/log/nginx/error.log

# Check status
sudo systemctl status research-flow-backend
sudo systemctl status research-flow-frontend
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# Reload Nginx (after config changes)
sudo systemctl reload nginx
```

## Security Checklist

- [x] SSL certificate installed and auto-renewal configured
- [x] Firewall configured (ports 80, 443, 22)
- [x] Nginx security headers configured
- [x] Services running as non-root user
- [x] Strong passwords for database and session secret
- [ ] Regular backups configured
- [ ] Monitoring/alerting set up

## Next Steps

1. ✅ Set up domain (this guide)
2. Set up monitoring (e.g., UptimeRobot, Pingdom)
3. Configure automated backups
4. Set up log rotation
5. Review security settings
6. Test disaster recovery procedure

---

**Your site should now be accessible at:**
- `https://researchflow.ru`
- `https://www.researchflow.ru`

Both URLs will work and redirect HTTP to HTTPS automatically.

