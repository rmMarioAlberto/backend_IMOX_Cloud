import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Brevo from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiInstance: Brevo.TransactionalEmailsApi;

  constructor(private readonly configService: ConfigService) {
    this.apiInstance = new Brevo.TransactionalEmailsApi();
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (apiKey) {
      this.apiInstance.setApiKey(
        Brevo.TransactionalEmailsApiApiKeys.apiKey,
        apiKey,
      );
    }
  }

  async sendResetEmail(to: string, token: string) {
    if (!this.configService.get<string>('BREVO_API_KEY')) {
      this.logger.warn(
        'BREVO_API_KEY no definida. Simulando envío de correo...',
      );
      this.logger.log(`[EMAIL SIMULADO] Para: ${to}, Token: ${token}`);
      return;
    }

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = 'Recuperación de Contraseña - IMOX Cloud';
    sendSmtpEmail.sender = {
      name: 'IMOX Cloud',
      email:
        this.configService.get<string>('EMAIL_SENDER') || 'no-reply@imox.cloud',
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.htmlContent = `
      <h1>Recuperación de Contraseña</h1>
      <p>Has solicitado restablecer tu contraseña.</p>
      <p>Tu código de seguridad es:</p>
      <h2>${token}</h2>
      <p>Este código expira en 15 minutos.</p>
      <p>Si no solicitaste esto, ignora este correo.</p>
    `;

    try {
      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      this.logger.log(`Correo de recuperación enviado a ${to}`);
    } catch (error) {
      this.logger.error(
        `Error enviando correo a ${to}: ${error.body?.message || error.message}`,
      );
      throw error;
    }
  }
}
