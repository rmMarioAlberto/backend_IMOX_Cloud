import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './exceptions.filter';
import { ConfigService } from '@nestjs/config';
import { HttpStatus, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let configService: ConfigService;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
  const mockGetRequest = jest.fn().mockReturnValue({
    url: '/test-url',
    method: 'GET',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'TestAgent' },
  });
  const mockHttpArgumentsHost = jest.fn().mockReturnValue({
    getResponse: mockGetResponse,
    getRequest: mockGetRequest,
  });

  const mockArgumentsHost = {
    switchToHttp: mockHttpArgumentsHost,
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn(),
  } as unknown as ArgumentsHost;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HttpException', () => {
    it('should handle HttpException correctly', () => {
      const exception = new BadRequestException('Bad Request Test');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad Request Test',
        }),
      );
    });
  });

  describe('PrismaClientKnownRequestError', () => {
    it('should handle P2002 (Duplicate entry)', () => {
      const exception = new PrismaClientKnownRequestError('Error', {
        code: 'P2002',
        clientVersion: '1.0',
      });
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          errorCode: 'P2002',
          message: 'Registro duplicado (violación de restricción única).',
        }),
      );
    });

    it('should handle P2025 (Not Found)', () => {
      const exception = new PrismaClientKnownRequestError('Error', {
        code: 'P2025',
        clientVersion: '1.0',
      });
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          errorCode: 'P2025',
        }),
      );
    });
  });

  describe('JWT Errors', () => {
    it('should handle TokenExpiredError', () => {
      const exception = new TokenExpiredError('jwt expired', new Date());
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'TOKEN_EXPIRED',
        }),
      );
    });

    it('should handle JsonWebTokenError', () => {
      const exception = new JsonWebTokenError('invalid signature');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'INVALID_TOKEN',
        }),
      );
    });
  });

  describe('Validation Error', () => {
    it('should handle class-validator ValidationError', () => {
      const exception = new Error('Validation Error');
      exception.name = 'ValidationError';
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'VALIDATION_ERROR',
          message: 'Error de validación de datos.',
        }),
      );
    });
  });

  describe('Generic Error', () => {
    it('should show real error in development', () => {
      jest.spyOn(configService, 'get').mockReturnValue('development');
      const exception = new Error('Real Error Message');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Real Error Message',
        }),
      );
    });

    it('should mask error in production', () => {
      jest.spyOn(configService, 'get').mockReturnValue('production');
      const exception = new Error('Secret Database Info');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error interno del servidor', // Masked message
        }),
      );
      // Ensure stack trace is not leaked
      expect(mockJson).not.toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.anything(),
        }),
      );
    });

    it('should handle whitelisted generic errors (e.g. TIMEOUT)', () => {
      const exception = new Error('ETIMEDOUT error occurred');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.REQUEST_TIMEOUT);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'TIMEOUT',
          message: 'Tiempo de espera agotado.',
        }),
      );
    });

    it('should handle ECONNREFUSED connection errors', () => {
      const exception = new Error('ECONNREFUSED connection closed');
      filter.catch(exception, mockArgumentsHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'SERVICE_UNAVAILABLE',
        }),
      );
    });
  });
});
