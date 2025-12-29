# Backend IMOX Cloud

Sistema backend para el proyecto IMOX Cloud - Monitoreo de consumo eléctrico en tiempo real.

## 🏗️ Arquitectura

El proyecto utiliza una arquitectura de microservicios orquestada con Docker Compose:

- **Nest.js**: API REST y lógica de negocio
- **MongoDB**: Base de datos para telemetría y datos de sensores
- **PostgreSQL**: Base de datos para autenticación y usuarios
- **Mosquitto MQTT**: Broker para comunicación con dispositivos IoT
- **GlitchTip**: Sistema de monitoreo de errores y logging

## 📋 Prerequisitos

- Docker >= 20.10
- Docker Compose >= 2.0
- Node.js >= 20 (solo para desarrollo local sin Docker)

## 🚀 Inicio Rápido

### 1. Configuración inicial

```bash
# Clonar el repositorio
cd backend_IMOX_Cloud

# Copiar archivo de configuración
cp .env.example .env

# Editar .env con tus valores (opcional para desarrollo)
nano .env
```

### 2. Levantar todos los servicios

```bash
# Dar permisos de ejecución a los scripts
chmod +x scripts/*.sh

# Iniciar todos los servicios en desarrollo
./scripts/start-dev.sh
```

### 3. Verificar que todo funciona

```bash
# Ver logs en tiempo real
./scripts/logs.sh

# Ver logs de un servicio específico
./scripts/logs.sh nestjs
./scripts/logs.sh mosquitto
```

## 🔗 URLs de Acceso

| Servicio           | URL                   | Descripción              |
| ------------------ | --------------------- | ------------------------ |
| **Backend API**    | http://localhost:3000 | API REST Nest.js         |
| **GlitchTip**      | http://localhost:8000 | Dashboard de errores     |
| **MongoDB**        | localhost:27017       | Base de datos telemetría |
| **PostgreSQL**     | localhost:5432        | Base de datos auth       |
| **MQTT TCP**       | localhost:1883        | Broker MQTT              |
| **MQTT WebSocket** | ws://localhost:9001   | MQTT vía WebSocket       |

## 📦 Servicios Individuales

### Comandos útiles

```bash
# Ver estado de todos los servicios
cd docker && docker-compose ps

# Reiniciar un servicio específico
cd docker && docker-compose restart nestjs

# Ver logs de un servicio
./scripts/logs.sh [servicio]

# Detener todos los servicios
./scripts/stop-all.sh

# Detener y eliminar volúmenes (⚠️ BORRA DATOS)
./scripts/stop-all.sh --remove-volumes
```

### Reconstruir imágenes

```bash
cd docker
docker-compose build
docker-compose up -d
```

## 🗂️ Estructura del Proyecto

```
backend_IMOX_Cloud/
├── docker/                          # Configuración Docker
│   ├── docker-compose.yml          # Orquestación de servicios
│   ├── nestjs/Dockerfile           # Build de Nest.js
│   └── mqtt/mosquitto.conf         # Config MQTT
├── src/                            # Código fuente
│   ├── modules/
│   │   ├── auth/                   # Autenticación (RF-B-01 a RF-B-04)
│   │   ├── devices/                # Dispositivos (RF-B-05, RF-B-06)
│   │   ├── telemetry/              # Telemetría (RF-B-07, RF-B-08)
│   │   └── mqtt/                   # MQTT (RF-B-09, RF-B-10)
│   └── main.ts
├── scripts/                        # Scripts de automatización
│   ├── start-dev.sh               # Iniciar todo
│   ├── stop-all.sh                # Detener todo
│   └── logs.sh                    # Ver logs
└── .env                           # Variables de entorno (git-ignored)
```

## 🔧 Configuración de GlitchTip

1. Acceder a http://localhost:8000
2. Crear cuenta de administrador
3. Crear un nuevo proyecto "IMOX Backend"
4. Copiar el DSN del proyecto
5. Agregar el DSN al archivo `.env`:
   ```bash
   GLITCHTIP_DSN=https://xxx@localhost:8000/1
   ```

## 🔐 Seguridad en Producción

Antes de desplegar en producción, asegúrate de:

1. ✅ Cambiar todas las contraseñas en `.env`
2. ✅ Generar un nuevo `JWT_SECRET` (mínimo 32 caracteres)
3. ✅ Generar `GLITCHTIP_SECRET_KEY`: `openssl rand -hex 50`
4. ✅ Configurar autenticación en Mosquitto (editar `mosquitto.conf`)
5. ✅ Habilitar HTTPS/TLS para todos los servicios
6. ✅ Configurar firewall y limitar puertos expuestos

## 🐛 Troubleshooting

### Puerto ya en uso

```bash
# Verificar qué está usando el puerto
lsof -i :3000

# Detener todos los contenedores
./scripts/stop-all.sh
```

### Problemas de permisos

```bash
# Dar permisos a scripts
chmod +x scripts/*.sh

# Dar permisos a volúmenes de MQTT
sudo chown -R 1883:1883 docker/volumes/mosquitto/
```

### Reset completo

```bash
# Detener y eliminar TODO (⚠️ BORRA DATOS)
./scripts/stop-all.sh --remove-volumes
./scripts/start-dev.sh
```
