import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;
  });

  describe('canActivate', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as any;
    });

    it('should return true if IS_PUBLIC_KEY returns true', () => {
      const realGuard = new JwtAuthGuard(reflector);
      // Spy on super.canActivate to prevent actual passport auth
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(realGuard)), 'canActivate').mockReturnValue(true);
      
      reflector.getAllAndOverride.mockReturnValue(true);
      expect(realGuard.canActivate(context)).toBe(true);
    });

    it('should call super.canActivate if not public', () => {
      const realGuard = new JwtAuthGuard(reflector);
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(realGuard)), 'canActivate').mockReturnValue('super_result');
      
      reflector.getAllAndOverride.mockReturnValue(false);
      expect(realGuard.canActivate(context)).toBe('super_result');
    });
  });
});
