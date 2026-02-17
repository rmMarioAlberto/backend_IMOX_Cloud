# Backend IMOX Cloud

Backend para la plataforma IoT IMOX Cloud, construido con NestJS.

## Requisitos

- **Node.js**: v20+ (recomendado instalar vía `nvm`)
- **Docker** & **Docker Compose**
- **Hardware (Prod)**: Probado en Raspberry Pi 3/4 (ARM64)

## Configuración Inicial

### 1. Variables de Entorno

Copia el archivo de ejemplo y ajusta tus secretos:

```bash
cp .env.example .env
```

Asegúrate de configurar las credenciales de base de datos y MQTT.

### 2. Autenticación MQTT (Mosquitto)

El broker MQTT requiere autenticación obligatoria. Debes generar las credenciales antes de iniciar.

1. **Generar Hash de Contraseña**:
   Usa la herramienta incluida para hashear tu contraseña:

   ```bash
   node tools/hash_mqtt_password.js "TU_CONTRASEÑA_SEGURA"
   ```

2. **Configurar Archivos**:
   Copia la línea de salida (ej. `backend_admin:$2b$10$...`) y pégala en:
   - `docker/mqtt/password_file`

   Asegúrate de que el usuario (`backend_admin`) coincida en `docker/mqtt/acl_file`.

3. **Actualizar .env**:
   Pon la contraseña **plana** (sin hash) en la variable `MQTT_PASSWORD` de tu `.env` para que el backend pueda conectarse.

---

## 💻 Desarrollo

Para levantar todo el entorno (incluyendo NestJS con hot-reload) dentro de Docker:

```bash
./scripts/start-dev.sh
```

- **Backend**: http://localhost:3000
- **Base de Datos**: Puerto 3306
- **MQTT**: Puerto 1883 / 9001 (WS)
- **InfluxDB**: http://localhost:8086

Para detener todo y limpiar volúmenes (reset de fábrica):

```bash
# Detener
./scripts/start-dev.sh down

# Detener y borrar datos
# Detener y borrar datos
docker compose -f docker/docker-compose.yml down -v
```

### 🔍 Ver Logs y Troubleshooting

Para ver los logs en tiempo real de todos los servicios:

```bash
docker compose -f docker/docker-compose.yml logs -f
```

Ver logs de un servicio específico (ej. MQTT para depurar conexión):

```bash
docker compose -f docker/docker-compose.yml logs -f mosquitto
```

### Inicializar Base de Datos (Schema)

Si la base de datos es nueva o está vacía, debes enviar el esquema de Prisma para crear las tablas:

```bash
npm run db:push
```

> **Nota**: El cliente de Prisma se genera automáticamente al construir, gracias al script `build` en `package.json`.

---

## 🏭 Producción (Raspberry Pi)

En entornos limitados (como RPi), ejecutamos solo la infraestructura en Docker y el backend en el host "bare metal" para mejor rendimiento.

### 1. Iniciar Infraestructura

Levanta MariaDB, Redis, InfluxDB y Mosquitto (sin NestJS container):

```bash
./scripts/start-prod.sh
```

### 2. Iniciar Backend (Host)

```bash
# Instalar dependencias y construir
npm ci
npm run build

# Iniciar en modo producción
npm run start:prod
```

### 3. Configurar Retención de InfluxDB (Post-Deployment)

Por defecto, InfluxDB guarda datos infinitamente. Para limitar a 60 días (recomendado para SD cards):

1. Obtén el ID de tu bucket (`imox_bucket`):

   ```bash
   docker exec imox_influxdb influx bucket list --org "imox_org"
   ```

2. Aplica la retención (cambia `<BUCKET_ID>` por el ID real):
   ```bash
   docker exec imox_influxdb influx bucket update --id <BUCKET_ID> --retention 1440h
   ```

## Estructura de Scripts

- `scripts/start-dev.sh`: Inicia entorno completo (Docker).
- `scripts/start-prod.sh`: Inicia solo infraestructura (Docker).
- `tools/hash_mqtt_password.js`: Generador de hashes para Mosquitto.

---

## 🤖 Automatización de Despliegues (CI/CD)

Para actualizar automáticamente la Raspberry Pi cada vez que haces `git push` a `main`:

### 1. Configurar GitHub Runner en la RPi

1. Ve a tu repositorio en GitHub: **Settings -> Actions -> Runners -> New self-hosted runner**.
2. Selecciona **Linux** y **ARM64**.
3. Ejecuta los comandos en tu RPi (dentro de una carpeta dedicada, ej: `~/actions-runner`).
4. Configura el runner (deja los defaults con Enter).
5. Instala el servicio systemd para que el runner no se apague:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

### 2. Flujo Automático

El archivo `.github/workflows/deploy.yml` ya incluye la configuración. Al hacer push, tu RPi ejecutará automáticamente:

1. `git pull`
2. `npm ci` (instalar dependencias)
3. `npx prisma generate`
4. `npm run build`
5. `pm2 reload imox-backend` (reinicia sin downtime)

### 3. Opción Manual

Si prefieres no usar GitHub Actions, puedes usar el script incluido:

```bash
./scripts/deploy.sh
```
