export class DeadbandUtil {
  /**
   * Calcula la ventana de agregación de InfluxDB según el rango de tiempo.
   *
   * @param startD Fecha de inicio
   * @param stopD Fecha final
   * @returns Ventana de agregación (ej. '5m', '1h')
   */
  static calculateAggregationWindow(startD: Date, stopD: Date): string {
    const diffMs = stopD.getTime() - startD.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffDays > 7) return '6h';
    if (diffDays > 2) return '1h';
    if (diffHours > 12) return '15m';
    return '5m';
  }

  /**
   * Aplica un filtro de suavizado (deadband) a los datos combinados de telemetría.
   *
   * @param combined Datos combinados de InfluxDB
   * @param window Ventana de agregación utilizada
   * @returns Matriz de datos filtrada para el frontend
   */
  static applyDeadband(combined: any[], window: string): any[][] {
    const data: any[][] = [];
    let lastSavedPoint: any[] | null = null;

    for (let i = 0; i < combined.length; i++) {
      const r = combined[i];

      // Ignorar filas donde la agregación resultó nula o vacía
      if (r.voltaje_v === undefined && r.corriente_a === undefined) continue;

      const currentPoint = this.toDataPoint(r);
      const anomaly: string = r.anomaly_type || 'NONE';

      // Siempre incluir puntos de anomalías o extremos
      if (this.isEssentialPoint(anomaly, i, combined.length)) {
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
        continue;
      }

      const inclusion = this.evaluatePointInclusion(
        currentPoint,
        lastSavedPoint,
        window,
        combined[i - 1],
      );

      if (inclusion.shouldInclude) {
        if (inclusion.prevPoint) data.push(inclusion.prevPoint);
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
      }
    }

    return data;
  }

  /**
   * Determina si un punto es esencial (anomalía o extremo).
   *
   * @param anomaly Tipo de anomalía
   * @param index Índice actual
   * @param total Total de puntos
   */
  private static isEssentialPoint(
    anomaly: string,
    index: number,
    total: number,
  ): boolean {
    return anomaly !== 'NONE' || index === 0 || index === total - 1;
  }

  /**
   * Convierte una fila de telemetría al formato de punto de historial.
   *
   * @param r Fila de telemetría
   * @returns Punto formateado
   */
  private static toDataPoint(r: any): any[] {
    return [
      r._time,
      Number((r.voltaje_v ?? 0).toFixed(2)),
      Number((r.corriente_a ?? 0).toFixed(2)),
      Number((r.potencia_w ?? 0).toFixed(2)),
      Number((r.energia_kwh ?? 0).toFixed(2)),
      r.anomaly_type || 'NONE',
    ];
  }

  /**
   * Evalúa si un punto debe ser incluido basado en la ventana y fluctuaciones.
   *
   * @param current Punto actual
   * @param last Último punto guardado
   * @param window Ventana de agregación
   * @param prevRaw Punto anterior sin procesar
   */
  private static evaluatePointInclusion(
    current: any[],
    last: any[] | null,
    window: string,
    prevRaw: any,
  ): { shouldInclude: boolean; prevPoint?: any[] } {
    if (!last) return { shouldInclude: true };

    if (window === '5m' || window === '15m') {
      if (this.checkFluctuation(current, last)) {
        const prevPoint =
          prevRaw && last[0] !== prevRaw._time
            ? this.toDataPoint(prevRaw)
            : undefined;
        return { shouldInclude: true, prevPoint };
      }
      return { shouldInclude: false };
    }

    return { shouldInclude: last[0] !== current[0] };
  }

  /**
   * Analiza variaciones significativas entre puntos.
   */
  private static checkFluctuation(current: any[], last: any[]): boolean {
    const vDiff = Math.abs((current[1] as number) - (last[1] as number));
    const cDiff = Math.abs((current[2] as number) - (last[2] as number));
    const pDiff = Math.abs((current[3] as number) - (last[3] as number));
    const timeDiff =
      new Date(current[0] as string).getTime() -
      new Date(last[0] as string).getTime();

    const isFluctuation = vDiff > 0.5 || cDiff > 0.1 || pDiff > 5;
    const maxTimeExceeded = timeDiff > 1000 * 60 * 60; // 1 hora

    return isFluctuation || maxTimeExceeded;
  }
}
