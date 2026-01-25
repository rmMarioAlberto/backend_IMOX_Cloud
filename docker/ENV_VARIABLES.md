# Variables de Entorno Requeridas - IMOX Cloud

Este documento lista **todas** las variables de entorno que debes configurar antes de desplegar el sistema.

---

## ⚠️ CRÍTICO - Variables Obligatorias

El sistema **NO iniciará** si estas variables no están configuradas correctamente.

### 🔐 Seguridad y Autenticación

| Variable             | Descripción                   | Ejemplo                | Generar con            |
| -------------------- | ----------------------------- | ---------------------- | ---------------------- |
| `JWT_SECRET`         | Secret para firmar tokens JWT | `a1b2c3...` (64 chars) | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens    | `d4e5f6...` (64 chars) | `openssl rand -hex 32` |

### 🗄️ MariaDB (Base de Datos)

| Variable              | Descripción                | Ejemplo          | Generar con               |
| --------------------- | -------------------------- | ---------------- | ------------------------- |
| `MYSQL_ROOT_PASSWORD` | Password del usuario root  | `SecureRoot123!` | `openssl rand -base64 24` |
| `MYSQL_DATABASE`      | Nombre de la base de datos | `imox_auth`      | -                         |
| `MYSQL_USER`          | Usuario de la aplicación   | `imox_user`      | -                         |
| `MYSQL_PASSWORD`      | Password del usuario       | `SecurePass456!` | `openssl rand -base64 24` |

### 📊 InfluxDB (Time Series)

| Variable            | Descripción               | Ejemplo                  | Generar con               |
| ------------------- | ------------------------- | ------------------------ | ------------------------- |
| `INFLUXDB_USER`     | Usuario admin de InfluxDB | `imox_admin`             | -                         |
| `INFLUXDB_PASSWORD` | Password admin            | `InfluxSecure789!`       | `openssl rand -base64 24` |
| `INFLUXDB_ORG`      | Organización              | `imox_org`               | -                         |
| `INFLUXDB_BUCKET`   | Bucket de datos           | `imox_bucket`            | -                         |
| `INFLUXDB_TOKEN`    | Token de autenticación    | `very-long-secret-token` | `openssl rand -base64 48` |

### 🔴 Redis (Cache/Sesiones)

| Variable         | Descripción       | Ejemplo           | Generar con               |
| ---------------- | ----------------- | ----------------- | ------------------------- |
| `REDIS_PASSWORD` | Password de Redis | `RedisSecure012!` | `openssl rand -base64 24` |

---

## 📋 Variables Opcionales (con valores por defecto)

### ⏱️ Telemetría

| Variable                        | Descripción                           | Default |
| ------------------------------- | ------------------------------------- | ------- |
| `TELEMETRY_OFFLINE_TIMEOUT_MIN` | Minutos sin datos para marcar offline | `10`    |

### 🔢 Puertos (Solo Desarrollo)

| Variable       | Descripción           | Default |
| -------------- | --------------------- | ------- |
| `NESTJS_PORT`  | Puerto de NestJS      | `3000`  |
| `MQTT_PORT`    | Puerto MQTT TCP       | `1883`  |
| `MQTT_WS_PORT` | Puerto MQTT WebSocket | `9001`  |

> [!IMPORTANT]
> **En producción NO se exponen puertos** (excepto `127.0.0.1:3000` para Cloudflare Tunnel).

### 🌍 Entorno

| Variable   | Descripción       | Valores                      | Default       |
| ---------- | ----------------- | ---------------------------- | ------------- |
| `NODE_ENV` | Modo de ejecución | `development` / `production` | `development` |

---

## 📝 Instrucciones de Configuración

### Desarrollo

1. **Copiar template:**

   ```bash
   cp .env.example .env
   ```

2. **Editar `.env`:**

   ```bash
   nano .env
   ```

3. **Configurar valores mínimos** (pueden usar defaults débiles para dev):
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `MYSQL_ROOT_PASSWORD`
   - `MYSQL_PASSWORD`
   - `REDIS_PASSWORD`
   - `INFLUXDB_PASSWORD`
   - `INFLUXDB_TOKEN`

### Producción

1. **Copiar template:**

   ```bash
   cp docker/.env.production.example docker/.env.production
   ```

2. **Generar secrets seguros:**

   ```bash
   # JWT Secrets (256-bit)
   echo "JWT_SECRET=$(openssl rand -hex 32)"
   echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"

   # Passwords (192-bit)
   echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24)"
   echo "MYSQL_PASSWORD=$(openssl rand -base64 24)"
   echo "REDIS_PASSWORD=$(openssl rand -base64 24)"
   echo "INFLUXDB_PASSWORD=$(openssl rand -base64 24)"

   # InfluxDB Token (384-bit)
   echo "INFLUXDB_TOKEN=$(openssl rand -base64 48)"
   ```

3. **Editar `.env.production`** y reemplazar TODOS los valores `CHANGE_THIS_*`.

4. **Configurar Mosquitto (IMPORTANTE):**

   Mosquitto-go-auth NO soporta variables de entorno en su configuración, por lo que debes sincronizar manualmente las credenciales:

   ```bash
   # Editar mosquitto.prod.conf con las MISMAS credenciales de .env.production
   nano docker/mqtt/mosquitto.prod.conf

   # Buscar y reemplazar:
   auth_opt_mysql_user imox_user          → auth_opt_mysql_user TU_MYSQL_USER
   auth_opt_mysql_password imox_pass      → auth_opt_mysql_password TU_MYSQL_PASSWORD
   auth_opt_mysql_dbname imox_auth        → auth_opt_mysql_dbname TU_MYSQL_DATABASE
   ```

   > [!WARNING]
   > Las credenciales en `mosquitto.prod.conf` **DEBEN coincidir** con las de `.env.production`

5. **Verificar:**
   ```bash
   grep "CHANGE_THIS" docker/.env.production
   # No debe devolver resultados
   ```

---

## ✅ Validación

### Comprobar variables requeridas

```bash
# Desarrollo
cat .env | grep -E "JWT_SECRET|MYSQL_PASSWORD|REDIS_PASSWORD|INFLUXDB_TOKEN"

# Producción
cat docker/.env.production | grep -E "JWT_SECRET|MYSQL_PASSWORD|REDIS_PASSWORD|INFLUXDB_TOKEN"
```

### Verificar que no hay defaults inseguros

```bash
# Producción - NO debe retornar nada
grep -i "CHANGE_THIS\|admin123\|imox_pass" docker/.env.production
```

---

## 🚨 Seguridad - Checklist

- [ ] Todos los `CHANGE_THIS` reemplazados
- [ ] Passwords generados con `openssl rand`
- [ ] JWT secrets de al menos 256 bits
- [ ] InfluxDB token de al menos 384 bits
- [ ] Archivo `.env.production` con permisos `600`
- [ ] Archivo `.env.production` **NO** en control de versiones (Git)

```bash
# Configurar permisos correctos
chmod 600 docker/.env.production

# Verificar que está en .gitignore
grep ".env.production" .gitignore
```

---

## 📚 Referencias

### Mosquitto Go-Auth

Mosquitto utiliza estas variables de entorno automáticamente vía `${VARIABLE}` en `mosquitto.conf`:

- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

No es necesario configurarlas explícitamente, se toman del environment del contenedor.

### NestJS

Las variables se inyectan vía `ConfigService` en el código de NestJS.

---

## 🆘 Problemas Comunes

### "Mosquitto no puede conectar a MariaDB"

**Causa:** Variables `MYSQL_USER` o `MYSQL_PASSWORD` incorrectas.

**Solución:**

```bash
# Verificar que coincidan entre .env y mosquitto.conf
docker exec imox_mosquitto env | grep MYSQL
```

### "InfluxDB authentication failed"

**Causa:** `INFLUXDB_TOKEN` incorrecto.

**Solución:**

```bash
# Regenerar token y actualizar en .env
docker exec imox_influxdb influx auth list
```

### "NestJS no puede conectar a Redis"

**Causa:** `REDIS_PASSWORD` incorrecta.

**Solución:**

```bash
# Probar conexión manual
docker exec imox_redis redis-cli -a "$REDIS_PASSWORD" ping
```

---

## 🔗 Archivos Relacionados

- [`docker/.env.production.example`](file:///home/alberto/Documents/proyecto_IMOX_Cloud/backend_IMOX_Cloud/docker/.env.production.example) - Template de producción
- [`docker/docker-compose.prod.yml`](file:///home/alberto/Documents/proyecto_IMOX_Cloud/backend_IMOX_Cloud/docker/docker-compose.prod.yml) - Configuración Docker
- [`scripts/production/deploy-prod.sh`](file:///home/alberto/Documents/proyecto_IMOX_Cloud/backend_IMOX_Cloud/scripts/production/deploy-prod.sh) - Script de deployment
