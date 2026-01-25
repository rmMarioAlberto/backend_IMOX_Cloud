import { Injectable, Logger } from '@nestjs/common';
import { InfluxDbService } from '../influxdb.service';
import { Point } from '@influxdata/influxdb-client';
import { MqttTelemetryDto } from '../../mqtt/dto/mqtt.dto';

/**
 * Servicio especializado para operaciones de telemetría IoT en InfluxDB
 * Maneja escritura y consulta de datos de series temporales
 */
@Injectable()
export class TelemetryInfluxService {
  private readonly logger = new Logger(TelemetryInfluxService.name);

  constructor(private readonly influxDbService: InfluxDbService) {}

  /**
   * Escribir punto de telemetría en InfluxDB
   */
  async writeTelemetryPoint(
    iotId: number,
    data: MqttTelemetryDto,
  ): Promise<void> {
    try {
      const writeApi = this.influxDbService.getWriteApi();

      const point = new Point('telemetry')
        .tag('iot_id', iotId.toString())
        // Datos eléctricos
        .floatField('voltaje_v', data.electricas?.voltaje_v ?? 0)
        .floatField('corriente_a', data.electricas?.corriente_a ?? 0)
        .floatField('potencia_w', data.electricas?.potencia_w ?? 0)
        .floatField('energia_kwh', data.electricas?.energia_kwh ?? 0)
        .floatField('frecuencia_hz', data.electricas?.frecuencia_hz ?? 0)
        .floatField('factor_potencia', data.electricas?.factor_potencia ?? 0)
        // Datos de diagnóstico
        .floatField('rssi_dbm', data.diagnostico?.rssi_dbm ?? 0)
        .floatField('uptime_s', data.diagnostico?.uptime_s ?? 0)
        .timestamp(data.timestamp ? new Date(data.timestamp) : new Date());

      // Agregar tags adicionales si están presentes
      if (data.diagnostico?.ip) {
        point.tag('ip', data.diagnostico.ip);
      }
      if (data.diagnostico?.pzem_status) {
        point.tag('pzem_status', data.diagnostico.pzem_status);
      }
      if (data.anomaly_type) {
        point.tag('anomaly_type', data.anomaly_type);
      }

      writeApi.writePoint(point);

      // Flush inmediato para este caso (opcional, puedes configurar batch)
      await writeApi.flush();
    } catch (error) {
      this.logger.error(
        `Error escribiendo telemetría para iotId ${iotId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consultar telemetría en un rango de tiempo
   * @param iotId ID del dispositivo IoT
   * @param start Fecha de inicio (formato RFC3339 o duration como '-1h')
   * @param stop Fecha final (opcional, por defecto 'now()')
   */
  async queryTelemetryRange(
    iotId: number,
    start: string,
    stop: string = 'now()',
  ): Promise<any[]> {
    try {
      const queryApi = this.influxDbService.getQueryApi();
      const bucket = this.influxDbService.getBucket();

      const query = `
        from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop})
          |> filter(fn: (r) => r._measurement == "telemetry")
          |> filter(fn: (r) => r.iot_id == "${iotId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const results: any[] = [];
      return new Promise((resolve, reject) => {
        queryApi.queryRows(query, {
          next(row, tableMeta) {
            const o = tableMeta.toObject(row);
            results.push(o);
          },
          error(error) {
            reject(error);
          },
          complete() {
            resolve(results);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Error consultando telemetría para iotId ${iotId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consultar última lectura de telemetría desde InfluxDB
   */
  async queryLatestTelemetry(iotId: number): Promise<any> {
    try {
      const results = await this.queryTelemetryRange(iotId, '-1h');
      return results.at(-1) ?? null;
    } catch (error) {
      this.logger.error(
        `Error consultando última telemetría para iotId ${iotId}`,
        error,
      );
      return null;
    }
  }
}
