# Backend IMO X Cloud

Este es el backend para la plataforma IoT IMO X Cloud, construido con NestJS.

## Requisitos

- Node.js v18+
- Docker & Docker Compose
- MySQL
- MongoDB
- Redis
- MQTT Broker (Mosquitto)

## Configuración y Variables de Entorno

Copia el archivo de ejemplo para crear tu configuración local:

```bash
cp .env.example .env
```

### Variables Importantes

| Variable                        | Descripción                  | Valor por Defecto                      |
| :------------------------------ | :--------------------------- | :------------------------------------- |
| `NESTJS_PORT`                   | Puerto de la aplicación      | `3000`                                 |
| `DATABASE_URL_MONGO`            | Conexión MongoDB             | `mongodb://localhost:27017/imox_mongo` |
| `MYSQL_URL`                     | Conexión MySQL               | `mysql://...`                          |
| `REDIS_URL`                     | Conexión Redis               | `redis://...`                          |
| `MQTT_BROKER_URL`               | URL del Broker MQTT          | `mqtt://localhost:1883`                |
| `TELEMETRY_SPIKE_THRESHOLD`     | Umbral % para detectar picos | `0.15` (15%)                           |
| `TELEMETRY_VOLTAGE_MAX`         | Voltaje Máximo Absoluto      | `140`                                  |
| `TELEMETRY_VOLTAGE_MIN`         | Voltaje Mínimo Absoluto      | `90`                                   |
| `TELEMETRY_OFFLINE_TIMEOUT_MIN` | Minutos para marcar offline  | `10`                                   |

### Generar Contraseña Segura para MQTT

Para producción, debes generar una contraseña hasheada para el archivo `password_file` de Mosquitto:

1. **Generar Hash**:

   ```bash
   node tools/hash_mqtt_password.js "TU_CONTRASEÑA_SEGURA"
   ```

2. **Copiar Resultado**:
   El script imprimirá una línea como `backend_admin:$2b$10$...`.

3. **Guardar en Archivo**:
   Copia esa línea en `mosquitto/config/password_file` (crea el archivo si no existe dentro de la carpeta raíz o docker config).

4. **Actualizar .env**:
   Asegúrate de que `MQTT_PASSWORD` en tu `.env` coincida con la contraseña original (sin hashear).

## Docker (Recomendado para Desarrollo)

Para iniciar toda la infraestructura (Bases de datos, Redis, MQTT, GlitchTip) sin instalar nada localmente:

1. **Generar Archivos de Configuración**:
   Asegúrate de tener los archivos `acl_file`, `password_file` y `mosquitto.conf` en la carpeta `mosquitto/config`.

2. **Iniciar Contenedores**:

   ```bash
   docker-compose up -d
   ```

3. **Verificar Logs**:

   ```bash
   docker-compose logs -f
   ```

4. **Detener Contenedores**:
   ```bash
   docker-compose down
   ```

## Ejecución Local

1. **Instalar Dependencias**:

   ```bash
   npm install
   ```

2. **Generar Clientes Prisma**:

   ```bash
   npx prisma generate --schema src/database/prisma/schemaMongo.prisma
   npx prisma generate --schema src/database/prisma/schemaMysql.prisma
   ```

3. **Iniciar en Desarrollo**:

   ```bash
   npm run start:dev
   ```

4. **Iniciar en Producción**:
   ```bash
   npm run build
   npm run start:prod
   ```

## Funcionalidades Principales

- **API REST**: Autenticación, Gestión de Dispositivos.
- **WebSocket Gateway**: Telemetría en tiempo real (`/telemetry`).
- **MQTT**: Ingesta de datos de sensores.
- **Spike Detection**: Detección de anomalías de voltaje.
- **Health Check**: Monitoreo de estado online/offline de dispositivos.
