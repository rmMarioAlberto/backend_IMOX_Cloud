#!/bin/bash
set -e

# Script de inicialización para crear usuario y base de datos de GlitchTip
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER glitchtip WITH PASSWORD 'glitchtip';
    CREATE DATABASE glitchtip;
    GRANT ALL PRIVILEGES ON DATABASE glitchtip TO glitchtip;
    
    -- PostgreSQL 15+ requiere permisos adicionales en el schema public
    \c glitchtip
    GRANT ALL ON SCHEMA public TO glitchtip;
EOSQL
