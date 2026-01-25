import { Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WsExceptionsFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();

    let errorResponse: any = {
      status: 'error',
      message: 'Internal Server Error',
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof WsException) {
      errorResponse.message = exception.message;
      errorResponse.errorCode = 'WS_ERROR';
      const errorData = exception.getError();
      if (typeof errorData === 'object') {
        errorResponse = { ...errorResponse, ...errorData };
      }
    } else if (exception instanceof HttpException) {
      errorResponse.message = exception.message;
      errorResponse.statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object') {
        errorResponse = { ...errorResponse, ...res };
      }
    } else if (exception instanceof Error) {
      errorResponse.message = exception.message;
      errorResponse.stack =
        this.configService.get('NODE_ENV') === 'production'
          ? undefined
          : exception.stack;
    }

    this.logger.error(
      `WS Error [Client: ${client.id}]: ${errorResponse.message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Emit standard exception event
    client.emit('exception', errorResponse);
  }
}
