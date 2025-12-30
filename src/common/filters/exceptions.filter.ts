import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Error interno del servidor';
    let errorCode: string | undefined = undefined;

    // 1. HTTP Exceptions (NestJS)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message;
    }

    // 2. Prisma Database Errors
    else if (exception instanceof PrismaClientKnownRequestError) {
      const prismaError = exception as PrismaClientKnownRequestError;
      errorCode = prismaError.code;

      switch (prismaError.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Registro duplicado (violación de restricción única).';
          break;

        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Violación de clave foránea.';
          break;

        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'El registro solicitado no existe.';
          break;

        case 'P2014':
          status = HttpStatus.BAD_REQUEST;
          message = 'Violación de relación requerida.';
          break;

        case 'P2000':
          status = HttpStatus.BAD_REQUEST;
          message = 'El valor proporcionado es demasiado largo para el campo.';
          break;

        case 'P2001':
          status = HttpStatus.NOT_FOUND;
          message = 'El registro buscado en la condición no existe.';
          break;

        case 'P2015':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro relacionado no encontrado.';
          break;

        case 'P2016':
          status = HttpStatus.BAD_REQUEST;
          message = 'Error de interpretación de consulta.';
          break;

        case 'P2021':
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'La tabla no existe en la base de datos.';
          break;

        case 'P2022':
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'La columna no existe en la base de datos.';
          break;

        default:
          status = HttpStatus.BAD_REQUEST;
          message = `Error de base de datos (${prismaError.code}).`;
          break;
      }
    }

    // 3. JWT Errors
    else if (exception instanceof TokenExpiredError) {
      status = HttpStatus.UNAUTHORIZED;
      message = 'Token expirado. Por favor, inicia sesión nuevamente.';
      errorCode = 'TOKEN_EXPIRED';
    } else if (exception instanceof JsonWebTokenError) {
      status = HttpStatus.UNAUTHORIZED;
      message = 'Token inválido.';
      errorCode = 'INVALID_TOKEN';
    }

    // 4. Validation Errors (class-validator)
    else if (
      exception instanceof Error &&
      exception.name === 'ValidationError'
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Error de validación de datos.';
      errorCode = 'VALIDATION_ERROR';
    }

    // 5. Generic Errors
    else if (exception instanceof Error) {
      message = exception.message;

      // Detectar errores comunes por mensaje
      if (exception.message.includes('ECONNREFUSED')) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Servicio no disponible. Intenta más tarde.';
        errorCode = 'SERVICE_UNAVAILABLE';
      } else if (exception.message.includes('ETIMEDOUT')) {
        status = HttpStatus.REQUEST_TIMEOUT;
        message = 'Tiempo de espera agotado.';
        errorCode = 'TIMEOUT';
      }
    }

    // Log del error
    const errorLog = {
      path: request.url,
      method: request.method,
      status,
      errorCode,
      message,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString(),
    };

    // Solo loggear stack trace en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      errorLog['stack'] = (exception as Error)?.stack;
    }

    this.logger.error(errorLog);

    // Respuesta al cliente
    const errorResponse: any = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // Solo incluir errorCode si existe
    if (errorCode) {
      errorResponse.errorCode = errorCode;
    }

    // Solo incluir stack trace en desarrollo
    if (process.env.NODE_ENV !== 'production' && (exception as Error)?.stack) {
      errorResponse.stack = (exception as Error).stack;
    }

    response.status(status).json(errorResponse);
  }
}
