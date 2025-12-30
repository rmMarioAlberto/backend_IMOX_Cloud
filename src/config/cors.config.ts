import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Configuración CORS para el proyecto IMOX Cloud
 * Soporta: Web Apps, Apps Móviles, Dispositivos IoT
 */
export const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    const corsOrigins = process.env.CORS_ORIGINS;

    // Permitir todos los orígenes si está configurado
    if (corsOrigins === '*') {
      return callback(null, true);
    }

    // Permitir peticiones sin origin (React Native, IoT devices, MQTT, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Lista específica de orígenes permitidos
    const allowedOrigins = corsOrigins
      ? corsOrigins.split(',').map((o) => o.trim())
      : [];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Rechazar origen no permitido
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Session-Id',
    'X-Nonce',
  ],
  maxAge: 86400, // 24 horas
};
