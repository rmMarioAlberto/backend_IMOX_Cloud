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
   * Consultar telemetría en un rango de tiempo, agrupada por una ventana de tiempo
   * @param iotId ID del dispositivo IoT
   * @param start Fecha de inicio
   * @param stop Fecha final
   * @param window Ventana de agregación (ej. '5m', '1h', '6h')
   */
  async queryAggregatedTelemetry(
    iotId: number,
    start: string,
    stop: string = 'now()',
    window: string = '1h',
  ): Promise<any[]> {
    try {
      const queryApi = this.influxDbService.getQueryApi();
      const bucket = this.influxDbService.getBucket();

      const query = `
        from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop})
          |> filter(fn: (r) => r._measurement == "telemetry")
          |> filter(fn: (r) => r.iot_id == "${iotId}")
          |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
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
        `Error consultando telemetría agrupada para iotId ${iotId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consultar únicamente las lecturas que tienen anomalías en un rango de tiempo
   * @param iotId ID del dispositivo IoT
   * @param start Fecha de inicio
   * @param stop Fecha final
   */
  async queryAnomaliesRange(
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
          |> filter(fn: (r) => exists r.anomaly_type and r.anomaly_type != "NONE")
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
        `Error consultando anomalías de telemetría para iotId ${iotId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consultar última lectura de telemetría desde InfluxDB.
   * Usa |> last() en el servidor para ser eficiente y no depender de un
   * rango fijo: funciona aunque el dispositivo lleve horas/días offline.
   */
  async queryLatestTelemetry(iotId: number): Promise<any> {
    try {
      const queryApi = this.influxDbService.getQueryApi();
      const bucket = this.influxDbService.getBucket();

      // |> last() filtra del lado de InfluxDB → devuelve solo 1 fila por campo
      const query = `
        from(bucket: "${bucket}")
          |> range(start: -30d)
          |> filter(fn: (r) => r._measurement == "telemetry")
          |> filter(fn: (r) => r.iot_id == "${iotId}")
          |> last()
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;

      const results: any[] = [];
      return new Promise((resolve, reject) => {
        queryApi.queryRows(query, {
          next(row, tableMeta) {
            results.push(tableMeta.toObject(row));
          },
          error(error) {
            reject(error);
          },
          complete() {
            resolve(results.at(-1) ?? null);
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Error consultando última telemetría para iotId ${iotId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Eliminar toda la telemetría de un dispositivo
   */
  async deleteTelemetryByIotId(iotId: number): Promise<void> {
    const start = '1970-01-01T00:00:00Z';
    const stop = new Date().toISOString();
    // InfluxDB delete predicate syntax
    const predicate = `_measurement="telemetry" AND iot_id="${iotId}"`;

    await this.influxDbService.deleteData(start, stop, predicate);
  }
}
