/**
 * @file config.h
 * @brief Configuración global del sistema IMOX Cloud
 * @author Equipo de Desarrollo IMOX
 * @date 2024-12-11
 * @version 1.0.0
 * 
 * Este archivo contiene todas las constantes de configuración del sistema.
 * Migrado y adaptado para el proyecto SquareLine UI.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// INFORMACIÓN DEL DISPOSITIVO
// ============================================================================
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_MODEL "IMOX-B1"
#define MANUFACTURER "Yex Acoustics"

// ============================================================================
// CONFIGURACIÓN DE HARDWARE - PZEM-004T
// ============================================================================
// Pines definidos para T-Display S3 (conector Qwiic/Extra)
#define PZEM_RX_PIN 44         // ESP32 RX (conectado a PZEM TX)
#define PZEM_TX_PIN 43         // ESP32 TX (conectado a PZEM RX)
#define PZEM_BAUD   9600       // Baudrate fijo del PZEM-004T
#define PZEM_ADDRESS 0x01      // Dirección Modbus del PZEM

// Intervalos de lectura
#define PZEM_READ_INTERVAL_MS 2000  // Leer cada 2 segundos
#define PZEM_TIMEOUT_MS 1000        // Timeout de respuesta UART

// ============================================================================
// CONFIGURACIÓN DE FREERTOS - TASKS
// ============================================================================
// UI Task (Core 1 - dedicado a renderizado, ejecutado en loop())
#define UI_TASK_CORE 1

// PZEM Task (Core 0 - I/O sensor)
#define PZEM_TASK_NAME "PZEMTask"
#define PZEM_TASK_STACK_SIZE 4096
#define PZEM_TASK_PRIORITY 1  
#define PZEM_TASK_CORE 0

// ============================================================================
// CONFIGURACIÓN DE UI - LVGL
// ============================================================================
#define LVGL_TICK_PERIOD_MS 5       // Tick de LVGL cada 5ms

// ============================================================================
// CONFIGURACIÓN DE RED Y MQTT
// ============================================================================
#define WIFI_SSID             "ftco"
#define WIFI_PASSWORD         "jujujuuj"

#define MQTT_WSS_URI          "wss://dietpi.tail02564c.ts.net:443/mqtt"
#define MQTT_IOT_ID           3
#define MQTT_USER_ID          1
#define MQTT_DEVICE_SECRET    "b67a81fa475cacdc6a036c2e1395e8399b893764883a8c1b"

// ISRG Root X1 (Let's Encrypt) - Requerido para verificar el host de Tailscale en ESP-IDF 4.4
const char* LET_S_ENCRYPT_CA = 
"-----BEGIN CERTIFICATE-----\n"
"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\n"
"-----END CERTIFICATE-----\n";

// Tópicos MQTT
#define MQTT_TOPIC_TELEMETRY  "imox/devices/3/telemetry"

// Intervalo de envío de telemetría (1.5 segundos)
#define TELEMETRY_SEND_INTERVAL_MS 1500

// ============================================================================
// CONFIGURACIÓN DE DEBUGGING
// ============================================================================
#define SERIAL_BAUD_RATE 115200     // Baudrate del monitor serial

#endif // CONFIG_H
