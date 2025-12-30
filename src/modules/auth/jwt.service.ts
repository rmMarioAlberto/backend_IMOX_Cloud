import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

@Injectable()
export class JwtService {
  constructor(private readonly jwtService: NestJwtService) {}

  /**
   * Genera un Access Token (15 min)
   * Payload debe contener userId y role como mínimo
   */
  async generateAccessToken(payload: any): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
    });
  }

  /**
   * Genera un Refresh Token (7 días)
   */
  async generateRefreshToken(payload: any): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
    });
  }

  /**
   * Verifica la validez de un token y retorna su payload
   */
  async verifyToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Decodifica el token sin verificar la firma (solo para leer payload)
   */
  decode(token: string): any {
    return this.jwtService.decode(token);
  }
}
