# Scripts - Guía de Uso

Scripts organizados para desarrollo, producción y simulación de dispositivos IoT.

---

## Estructura

```
scripts/
├── production/          # Scripts de producción (Raspberry Pi)
│   ├── deploy-prod.sh
│   └── configure-influx-retention.sh
├── development/         # Scripts de desarrollo
│   ├── start-dev.sh
│   ├── stop-all.sh
│   └── logs.sh
├── iot-simulator/       # Simuladores de dispositivos
│   ├── simulate_device.js
│   └── test_websocket_client.js
└── README.md            # Este archivo
```

---

## 🚀 Producción

Scripts para deployment y configuración en Raspberry Pi 3.

### deploy-prod.sh

Deploy completo en producción con Docker Compose optimizado.

```bash
# Ejecutar desde cualquier lugar
./scripts/production/deploy-prod.sh
```

**Requisitos:**

- Archivo `.env.production` configurado en `docker/`
- Docker y Docker Compose instalados

### configure-influx-retention.sh

Configurar retención de datos en InfluxDB a 60 días.

```bash
./scripts/production/configure-influx-retention.sh
```

**Nota:** Ejecutar después del primer deployment.

---

## 💻 Desarrollo

Scripts para facilitar el desarrollo local.

### start-dev.sh

Inicia el stack completo en modo desarrollo con hot-reload.

```bash
./scripts/development/start-dev.sh
```

### stop-all.sh

Detiene todos los contenedores Docker.

```bash
./scripts/development/stop-all.sh
```

### logs.sh

Muestra logs de todos los servicios.

```bash
./scripts/development/logs.sh

# Ver logs de un servicio específico
./scripts/development/logs.sh nestjs
```

---

## 🤖 Simuladores IoT

Scripts para simular dispositivos IoT y probar telemetría.

### simulate_device.js

Simula un dispositivo IoT enviando datos de telemetría vía MQTT.

```bash
cd scripts/iot-simulator
node simulate_device.js [iotId] [interval_ms]

# Ejemplos:
node simulate_device.js 1 1500          # IoT ID 1, cada 1.5s
node simulate_device.js 5 2000          # IoT ID 5, cada 2s
```

**Configuración:**

- Edita el script para ajustar broker MQTT y credenciales
- Por defecto usa `mqtt://localhost:1883`

### test_websocket_client.js

Cliente WebSocket para probar suscripciones de telemetría en tiempo real.

```bash
cd scripts/iot-simulator
node test_websocket_client.js [token] [iotId]

# Ejemplo:
node test_websocket_client.js "your-jwt-token" 1
```

**Uso:**

1. Obtén un JWT token del endpoint `/auth/login`
2. Ejecuta el script para suscribirte a un dispositivo
3. Verás las actualizaciones de telemetría en tiempo real

---

## Permisos de Ejecución

Los scripts ya tienen permisos de ejecución. Si necesitas restablecerlos:

```bash
chmod +x scripts/production/*.sh
chmod +x scripts/development/*.sh
```

---

## Variables de Entorno

### Producción

Los scripts de producción buscan `.env.production` en `docker/`.

### Desarrollo

Los scripts de desarrollo usan `.env` o variables por defecto del `docker-compose.yml`.

---

## Tips

### Ejecutar desde la raíz del proyecto

Todos los scripts están diseñados para ejecutarse desde cualquier ubicación:

```bash
# Desde raíz
./scripts/production/deploy-prod.sh

# Desde scripts/
cd scripts
./production/deploy-prod.sh
```

### Ver recursos en tiempo real

```bash
# Después del deployment
docker stats
```

### Logs en tiempo real

```bash
docker-compose -f docker/docker-compose.prod.yml logs -f
```
