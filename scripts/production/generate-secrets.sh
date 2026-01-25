#!/bin/bash
# Script para generar todas las claves seguras de producción

echo "🔐 Generando claves seguras para producción..."
echo ""
echo "================================================"
echo "Copia y pega estos valores en tu .env.production"
echo "================================================"
echo ""

echo "# ===== JWT Secrets (256-bit) ====="
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo ""

echo "# ===== MariaDB ====="
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24)"
echo "MYSQL_USER=imox_production_user"
echo "MYSQL_PASSWORD=$(openssl rand -base64 24)"
echo "MYSQL_DATABASE=imox_auth"
echo ""

echo "# ===== Redis ====="
echo "REDIS_PASSWORD=$(openssl rand -base64 24)"
echo ""

echo "# ===== InfluxDB ====="
echo "INFLUXDB_USER=imox_admin"
echo "INFLUXDB_PASSWORD=$(openssl rand -base64 24)"
echo "INFLUXDB_ORG=imox_org"
echo "INFLUXDB_BUCKET=imox_bucket"
echo "INFLUXDB_TOKEN=$(openssl rand -base64 48)"
echo ""

echo "================================================"
echo "✅ Claves generadas exitosamente!"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Copia las claves de arriba"
echo "   2. Pégalas en docker/.env.production"
echo "   3. NO OLVIDES sincronizar las credenciales MySQL en docker/mqtt/mosquitto.prod.conf"
echo ""
