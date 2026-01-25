#!/bin/bash
# Script para configurar retención de InfluxDB a 60 días (2 meses)

set -e

echo "🕐 Configurando retención de InfluxDB a 60 días..."

# Verificar que InfluxDB esté corriendo
if ! docker ps | grep -q imox_influxdb; then
    echo "❌ Error: InfluxDB no está corriendo"
    echo "   Ejecuta primero: docker-compose -f docker-compose.prod.yml up -d influxdb"
    exit 1
fi

# Esperar a que InfluxDB esté listo
echo "⏳ Esperando a que InfluxDB esté completamente iniciado..."
sleep 10

# Configurar retención del bucket
echo "📊 Actualizando bucket con retención de 60 días..."

docker exec imox_influxdb influx bucket update \
    --name "${INFLUXDB_BUCKET:-imox_bucket}" \
    --retention 1440h \
    --org "${INFLUXDB_ORG:-imox_org}"

# Verificar configuración
echo ""
echo "✅ Configuración aplicada. Verificando..."
docker exec imox_influxdb influx bucket list --org "${INFLUXDB_ORG:-imox_org}"

echo ""
echo "📝 Retención configurada a 60 días (1440 horas)"
echo "   Los datos más antiguos de 60 días serán eliminados automáticamente."
echo ""
echo "💾 Espacio estimado (con cron job cada 5 min):"
echo "   - 288 puntos/día por dispositivo"
echo "   - ~2.6MB por dispositivo cada 2 meses"
echo "   - 10 dispositivos: ~26MB | 50 dispositivos: ~130MB"
echo ""
echo "✅ Tu SD card no tiene problema con este volumen de datos"
echo ""
