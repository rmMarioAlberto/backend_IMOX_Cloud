import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

interface ErrorResponse {
  statusCode: number;
  message: string | object;
  errorCode?: string;
  path?: string;
  timestamp?: string;
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errorCode } = this.handleException(exception);

    // Logging
    this.logError(exception, request, status, message, errorCode);

    // Response construction
    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (errorCode) {
      errorResponse.errorCode = errorCode;
    }

    // Add stack trace in non-production environments
    if (this.isDev() && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }

  private handleException(exception: unknown): {
    status: number;
    message: string | object;
    errorCode?: string;
  } {
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }
    if (exception instanceof PrismaClientKnownRequestError) {
      return this.handlePrismaException(exception);
    }
    if (
      exception instanceof TokenExpiredError ||
      exception instanceof JsonWebTokenError
    ) {
      return this.handleJwtException(exception);
    }
    if (exception instanceof Error && exception.name === 'ValidationError') {
      return this.handleValidationException();
    }
    return this.handleGenericException(exception);
  }

  private handleHttpException(exception: HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const message = typeof res === 'string' ? res : (res as any).message;
    return { status, message };
  }

  private handlePrismaException(exception: PrismaClientKnownRequestError) {
    let status = HttpStatus.BAD_REQUEST;
    let message = `Error de base de datos (${exception.code}).`;
    const errorCode = exception.code;

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Registro duplicado (violación de restricción única).';
        break;
      case 'P2003':
        message = 'Violación de clave foránea.';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'El registro solicitado no existe.';
        break;
      case 'P2014':
        message = 'Violación de relación requerida.';
        break;
      case 'P2000':
        message = 'El valor proporcionado es demasiado largo para el campo.';
        break;
      case 'P2001':
      case 'P2015':
        status = HttpStatus.NOT_FOUND;
        message = 'Registro no encontrado o condición no cumplida.';
        break;
      case 'P2016':
        message = 'Error de interpretación de consulta.';
        break;
      case 'P2021':
      case 'P2022':
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Error de esquema de base de datos.';
        break;
    }

    return { status, message, errorCode };
  }

  private handleJwtException(exception: TokenExpiredError | JsonWebTokenError) {
    if (exception instanceof TokenExpiredError) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Token expirado. Por favor, inicia sesión nuevamente.',
        errorCode: 'TOKEN_EXPIRED',
      };
    }
    return {
      status: HttpStatus.UNAUTHORIZED,
      message: 'Token inválido.',
      errorCode: 'INVALID_TOKEN',
    };
  }

  private handleValidationException() {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Error de validación de datos.',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  private handleGenericException(exception: unknown) {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Error interno del servidor';
    let errorCode: string | undefined;

    if (exception instanceof Error) {
      // Allow specific system errors to be exposed with friendly messages
      if (exception.message.includes('ECONNREFUSED')) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Servicio no disponible. Intenta más tarde.';
        errorCode = 'SERVICE_UNAVAILABLE';
      } else if (exception.message.includes('ETIMEDOUT')) {
        status = HttpStatus.REQUEST_TIMEOUT;
        message = 'Tiempo de espera agotado.';
        errorCode = 'TIMEOUT';
      } else if (this.isDev()) {
        // In development, show the actual error message
        message = exception.message;
      }
    }

    return { status, message, errorCode };
  }

  private logError(
    exception: unknown,
    request: Request,
    status: number,
    message: string | object,
    errorCode?: string,
  ) {
    const errorLog: any = {
      path: request.url,
      method: request.method,
      status,
      errorCode,
      message,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString(),
    };

    if (this.isDev() && exception instanceof Error) {
      errorLog.stack = exception.stack;
    }

    this.logger.error(errorLog);
  }

  private isDev(): boolean {
    return this.configService.get('NODE_ENV') !== 'production';
  }
}
