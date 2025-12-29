# Estructura de Base de Datos Redis - IMOX Cloud

Redis funciona como una capa de almacenamiento en memoria para datos de acceso rápido y efímero. Aquí se definen las claves, tipos de datos y tiempos de vida (TTL) para los casos de uso del proyecto.

## 1. Convención de Claves (Naming Convention)

Para evitar colisiones, todas las claves seguirán el formato:
`imox:{modulo}:{funcionalidad}:{identificador}`

---

## 2. Definición de Estructuras

### A. Última Lectura IoT (Real-time Cache)

**Objetivo:** Entregar el estado actual del dispositivo a la App Móvil en tiempo real (<5ms) sin consultar la base de datos histórica (MongoDB).

- **Key:** `imox:iot:live:{iot_id}`
  - _Ejemplo:_ `imox:iot:live:1` (donde 1 es el ID del IoT en Postgres)
- **Tipo de Dato:** `String` (JSON serializado)
  - _Nota:_ Se prefiere String con JSON sobre Hash si la App siempre consume todo el objeto. Si la App pidiera "solo voltaje", Hash sería mejor, pero para un Dashboard usualmente necesitas todo.
- **Contenido (Value):**
  ```json
  {
    "lectura": {
      "electricas": { ... },
      "diagnostico": { ... }
    },
    "last_seen": "ISODate"
  }
  ```
- **TTL (Expiración):** 1 Hora.
  - _Razón:_ Si el dispositivo deja de enviar datos, la caché expira y la App sabe que está "Offline" o muestra "Sin datos recientes".

### B. Tokens de Sesión (Auth & Seguridad)

**Objetivo:** Manejar la persistencia de sesiones seguras y listas negras de tokens (si fuera necesario) o almacenamiento de Refresh Tokens.

- **Key:** `imox:auth:refresh:{user_id}:{device_id}`
- **Tipo de Dato:** `String`
- **Contenido (Value):** `ey...` (El token JWT de refresco encriptado)
- **TTL:** 7 días (Igual a la vigencia del Refresh Token).

### C. Recuperación de Contraseña

**Objetivo:** Validar solicitudes de cambio de contraseña temporalmente.

- **Key:** `imox:auth:reset_token:{token_generado}`
- **Tipo de Dato:** `String`
- **Contenido (Value):** `user_id` (El ID del usuario al que pertenece el token)
- **TTL:** 15 minutos.
  - _Razón:_ Seguridad estricta; el enlace del correo debe caducar rápido.

---

## 3. Resumen de Esquema

| Funcionalidad           | Patrón de Clave (Key Pattern)      | Tipo          | TTL | Descripción                                 |
| :---------------------- | :--------------------------------- | :------------ | :-- | :------------------------------------------ |
| **Monitoreo Real-time** | `imox:iot:live:{iot_id}`           | String (JSON) | 1h  | Instantánea del último "latido" del IoT.    |
| **Refresh Token**       | `imox:auth:refresh:{uid}:{dev_id}` | String        | 7d  | Permite mantener la sesión abierta.         |
| **Reset Password**      | `imox:auth:reset_token:{token}`    | String        | 15m | Validación de flujo de "Olvidé contraseña". |
