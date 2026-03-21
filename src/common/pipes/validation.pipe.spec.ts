import { ConfigService } from '@nestjs/config';
import { globalValidationPipe } from './validation.pipe';
import { ValidationPipe } from '@nestjs/common';

describe('globalValidationPipe', () => {
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as any;
  });

  it('should return a ValidationPipe instance', () => {
    const pipe = globalValidationPipe(configService);
    expect(pipe).toBeInstanceOf(ValidationPipe);
  });

  it('should set stopAtFirstError to true in production', () => {
    jest.spyOn(configService, 'get').mockReturnValue('production');
    const pipe = globalValidationPipe(configService);
    // Accessing private property for testing purposes
    expect((pipe as any).validatorOptions.stopAtFirstError).toBe(true);
  });

  it('should set stopAtFirstError to false in development', () => {
    jest.spyOn(configService, 'get').mockReturnValue('development');
    const pipe = globalValidationPipe(configService);
    expect((pipe as any).validatorOptions.stopAtFirstError).toBe(false);
  });

  it('should have whitelist and transform enabled', () => {
    const pipe = globalValidationPipe(configService);
    expect((pipe as any).validatorOptions.whitelist).toBe(true);
    expect((pipe as any).validatorOptions.forbidNonWhitelisted).toBe(true);
  });
});
