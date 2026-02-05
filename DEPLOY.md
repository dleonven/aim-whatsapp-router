# Despliegue en DigitalOcean

## Paso 1: Crear Droplet en DigitalOcean

1. Ve a [digitalocean.com](https://digitalocean.com) y crea una cuenta
2. Click "Create" → "Droplets"
3. Configuración recomendada:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic → Regular → $6/month (1GB RAM, 1 CPU)
   - **Region**: NYC o el más cercano a Chile (podría ser São Paulo si está disponible)
   - **Authentication**: SSH Key (recomendado) o Password
4. Click "Create Droplet"
5. Copia la IP del servidor (ej: `164.92.xxx.xxx`)

## Paso 2: Conectarse al servidor

```bash
ssh root@TU_IP_DEL_SERVIDOR
```

## Paso 3: Instalar dependencias

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar PM2 globalmente (mantiene la app corriendo 24/7)
npm install -g pm2

# Instalar build tools (necesario para better-sqlite3)
apt install -y build-essential python3
```

## Paso 4: Subir el código

Opción A: Desde GitHub
```bash
cd /opt
git clone https://github.com/TU_USUARIO/aim-whatsapp-router.git
cd aim-whatsapp-router
```

Opción B: Subir archivos con SCP (desde tu máquina local)
```bash
# Ejecutar desde tu máquina local, no el servidor
scp -r /Users/dleonven/Projects/aim-whatsapp-router root@TU_IP:/opt/
```

## Paso 5: Configurar la aplicación

```bash
cd /opt/aim-whatsapp-router

# Instalar dependencias
npm install

# Crear directorio persistente para la base de datos (evita perder agentes en cada deploy)
sudo mkdir -p /var/lib/aim-whatsapp-router
sudo chown "$(whoami)" /var/lib/aim-whatsapp-router

# Crear archivo .env
nano .env
```

Contenido del .env:
```env
WHATSAPP_PHONE_NUMBER_ID=971571259364819
WHATSAPP_WABA_ID=746826601254906
WHATSAPP_ACCESS_TOKEN=TU_ACCESS_TOKEN_AQUI
PORT=3000
# Base de datos persistente: sobrevive a git pull / re-clone / redeploy
DATABASE_PATH=/var/lib/aim-whatsapp-router/router.db
```

Guardar: `Ctrl+X`, luego `Y`, luego `Enter`

## Paso 5b: Cargar agentes (primera vez o después de DB nueva)

```bash
cd /opt/aim-whatsapp-router
node scripts/seed-agents.js
```

Esto agrega los agentes por defecto (Diego, Rosario). Si ya existían, no hace nada.

## Paso 6: Iniciar la aplicación con PM2

```bash
# Iniciar
pm2 start ecosystem.config.js --env production

# Verificar que esté corriendo
pm2 status

# Ver logs
pm2 logs aim-whatsapp-router

# Configurar inicio automático al reiniciar el servidor
pm2 startup
pm2 save
```

## Paso 7: Configurar Nginx (proxy reverso + HTTPS)

```bash
# Instalar Nginx
apt install -y nginx

# Instalar Certbot para HTTPS gratis
apt install -y certbot python3-certbot-nginx

# Crear configuración
nano /etc/nginx/sites-available/aim-router
```

Contenido:
```nginx
server {
    listen 80;
    server_name TU_DOMINIO_O_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activar configuración
ln -s /etc/nginx/sites-available/aim-router /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Si tienes dominio, agregar HTTPS:
certbot --nginx -d tu-dominio.com
```

## Paso 8: Probar

```bash
# Desde cualquier lugar
curl https://TU_DOMINIO_O_IP/health
```

Respuesta esperada:
```json
{"status":"ok","config":{"phoneNumberId":"✓ set",...}}
```

## Paso 9: Configurar webhook en GHL

URL del webhook: `https://TU_DOMINIO_O_IP/webhook/main-whatsapp`

---

## Comandos útiles

```bash
# Ver estado
pm2 status

# Ver logs en tiempo real
pm2 logs

# Reiniciar app
pm2 restart aim-whatsapp-router

# Detener app
pm2 stop aim-whatsapp-router

# Monitoreo
pm2 monit
```

## Por qué se perdían los agentes en cada deploy

La base de datos (`router.db`) estaba dentro del proyecto. Si en cada deploy haces **git pull** en otro directorio y reinicias desde ahí, o **re-clonas** el repo, o usas **App Platform** (contenedor nuevo), ese archivo no existe en la copia nueva y la app crea una base de datos vacía.

**Solución:** usar una ruta persistente fuera del código con `DATABASE_PATH` (ej. `/var/lib/aim-whatsapp-router/router.db`). Así los agentes y asignaciones sobreviven a redeploys. Tras el primer deploy con `DATABASE_PATH` configurado, ejecuta una vez `node scripts/seed-agents.js` para cargar los agentes.

## Monitoreo y Alertas (opcional)

Para recibir alertas si la app cae:
1. Ve a DigitalOcean → Monitoring → Create Alert
2. Configura alerta de CPU > 80% o Droplet offline
3. Agrega tu email para notificaciones

