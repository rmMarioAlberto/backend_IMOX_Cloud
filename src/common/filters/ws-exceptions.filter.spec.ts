import { Test, TestingModule } from '@nestjs/testing';
import { WsExceptionsFilter } from './ws-exceptions.filter';
import { ConfigService } from '@nestjs/config';
import { ArgumentsHost, HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

describe('WsExceptionsFilter', () => {
  let filter: WsExceptionsFilter;
  let mockConfigService: any;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('development'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsExceptionsFilter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    filter = module.get<WsExceptionsFilter>(WsExceptionsFilter);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    let mockClient: any;
    let mockHost: ArgumentsHost;

    beforeEach(() => {
      mockClient = {
        id: 'test-client-id',
        emit: jest.fn(),
      };

      mockHost = {
        switchToWs: jest.fn().mockReturnValue({
          getClient: jest.fn().mockReturnValue(mockClient),
        }),
      } as any;
    });

    it('should handle WsException with object data', () => {
      const exception = new WsException({ error: 'WS details', code: 123 });
      filter.catch(exception, mockHost);

      expect(mockClient.emit).toHaveBeenCalledWith('exception', expect.objectContaining({
        errorCode: 'WS_ERROR',
        error: 'WS details',
        code: 123,
      }));
    });

    it('should handle WsException with string msg', () => {
      const exception = new WsException('Just a string error');
      filter.catch(exception, mockHost);

      expect(mockClient.emit).toHaveBeenCalledWith('exception', expect.objectContaining({
        message: 'Just a string error',
        errorCode: 'WS_ERROR',
      }));
    });

    it('should handle HttpException with object resp', () => {
      const exception = new HttpException({ detail: 'Http error' }, 400);
      filter.catch(exception, mockHost);

      expect(mockClient.emit).toHaveBeenCalledWith('exception', expect.objectContaining({
        statusCode: 400,
        detail: 'Http error',
      }));
    });

    it('should handle generic Error in development', () => {
      const exception = new Error('Generic error');
      filter.catch(exception, mockHost);

      expect(mockClient.emit).toHaveBeenCalledWith('exception', expect.objectContaining({
        message: 'Generic error',
        stack: expect.any(String),
      }));
    });

    it('should conceal generic Error stack in production', () => {
      mockConfigService.get.mockReturnValue('production');
      const exception = new Error('Production error');
      filter.catch(exception, mockHost);

      expect(mockClient.emit).toHaveBeenCalledWith('exception', expect.objectContaining({
        message: 'Production error',
      }));
      // ensure stack is undefined
      const payload = mockClient.emit.mock.calls[0][1];
      expect(payload.stack).toBeUndefined();
    });
  });
});
