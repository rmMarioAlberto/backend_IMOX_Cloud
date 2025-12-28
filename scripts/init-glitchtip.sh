# Script para inicializar GlitchTip (crear BD y ejecutar migraciones)
# Uso: ./scripts/init-glitchtip.sh
set -e

echo "Inicializando GlitchTip..."

# Esperar a que PostgreSQL esté listo
echo "Esperando a que PostgreSQL esté disponible..."
sleep 5

# Crear base de datos glitchtip si no existe
echo "Creando base de datos 'glitchtip'..."
docker exec imox_glitchtip_postgres psql -U postgres -c "CREATE DATABASE glitchtip;" 2>/dev/null || echo "Base de datos 'glitchtip' ya existe"

# Ejecutar migraciones
echo "Ejecutando migraciones de Django..."
docker run --rm \
  --network docker_imox_network \
  -e DATABASE_URL="postgresql://postgres:postgres@imox_glitchtip_postgres:5432/glitchtip" \
  -e REDIS_URL="redis://imox_glitchtip_redis:6379/0" \
  -e SECRET_KEY="647517bc50393b855beed2579999715e3ccbf1ee98e03a25479b83edcfc331fd768ac9f663cea3781e86df571b93767978a2" \
  glitchtip/glitchtip \
  ./bin/run-migrate.sh

# Reiniciar servicios de GlitchTip
echo "Reiniciando servicios de GlitchTip..."
docker restart imox_glitchtip_web imox_glitchtip_worker

echo ""
echo "GlitchTip inicializado correctamente!"
echo "Accede a: http://localhost:8000"
echo ""
echo "Próximos pasos:"
echo "   1. Crea tu cuenta de administrador"
echo "   2. Crea un proyecto 'IMOX Backend'"
echo "   3. Copia el DSN del proyecto"
echo "   4. Agrégalo a .env como GLITCHTIP_DSN=..."
