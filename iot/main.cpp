#include "config.h"
#include "ui/ui.h"
#include <Arduino.h>
#include <LV_Helper.h> // Necesario si usas la versión de la librería que requiere helper
#include <LilyGo_AMOLED.h>
#include <PZEM004Tv30.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include "mqtt_client.h"
#include "esp_tls.h"

// Definición de pines para UART2 (PZEM) tomados de config.h
#define PZEM_SERIAL Serial2

PZEM004Tv30 pzem(PZEM_SERIAL, PZEM_RX_PIN, PZEM_TX_PIN);

// Variables Globales para compartir datos entre núcleos
// (En el futuro, usa Semáforos/Mutex para protegerlas si hay conflictos de
// escritura/lectura simultánea)
float v_voltage = 0.0;
float v_current = 0.0;
float v_power = 0.0;
float v_energy = 0.0;
float v_frequency = 0.0;
float v_pf = 0.0;

esp_mqtt_client_handle_t mqtt_client = NULL;
bool mqtt_connected = false;

TaskHandle_t SensorTask; // Handle para la tarea del sensor

LilyGo_Class amoled;

// --- Funciones MQTT ---
static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED:
            Serial.println("MQTT: Conectado al Broker (WSS)");
            mqtt_connected = true;
            break;
        case MQTT_EVENT_DISCONNECTED:
            Serial.println("MQTT: Desconectado");
            mqtt_connected = false;
            break;
        case MQTT_EVENT_ERROR:
            Serial.println("MQTT: Error detectado");
            break;
        default:
            break;
    }
}

void sendTelemetry(float v, float i, float p, float e, float f, float pf) {
  if (!mqtt_connected || mqtt_client == NULL) {
    return;
  }

  JsonDocument doc;
  
  doc["iot_id"] = MQTT_IOT_ID;
  doc["user_id"] = MQTT_USER_ID;

  // Bloque eléctricas
  JsonObject electricas = doc["electricas"].to<JsonObject>();
  electricas["voltaje_v"] = v;
  electricas["corriente_a"] = i;
  electricas["potencia_w"] = p;
  electricas["energia_kwh"] = e;
  electricas["frecuencia_hz"] = f;
  electricas["factor_potencia"] = pf;

  // Bloque diagnóstico
  JsonObject diagnostico = doc["diagnostico"].to<JsonObject>();
  diagnostico["ip"] = WiFi.localIP().toString();
  diagnostico["rssi_dbm"] = WiFi.RSSI();
  diagnostico["pzem_status"] = isnan(v) ? "ERROR" : "OK";
  diagnostico["uptime_s"] = millis() / 1000;

  // Opcional: timestamp si fuera necesario, el servidor lo pone si no
  // doc["timestamp"] = "2026-03-05T..."

  char buffer[512];
  serializeJson(doc, buffer);
  
  // Imprimir payload en Serial para depuración
  Serial.print("MQTT: Enviando Payload: ");
  Serial.println(buffer);
  
  int msg_id = esp_mqtt_client_publish(mqtt_client, MQTT_TOPIC_TELEMETRY, buffer, 0, 1, 0);
  if (msg_id != -1) {
    Serial.printf("MQTT: Telemetría enviada (ID: %d)\n", msg_id);
  } else {
    Serial.println("MQTT: Error al publicar");
  }
}

// --- Tarea del Sensor (Core 0) ---
void sensorTaskCode(void *pvParameters) {
  Serial.print("SensorTask corriendo en el núcleo: ");
  Serial.println(xPortGetCoreID());

  uint8_t startup_skip_count = 0;
  const uint8_t MAX_STARTUP_SKIP =
      2; // Primeras 2 lecturas ignoradas, pues se generan picos falsos al
         // recien conectarse el sensor

  for (;;) {
    // Lee los datos del sensor (esto puede ser bloqueante o tardado, pero no
    // afecta la UI)
    float voltage = pzem.voltage();
    float current = pzem.current();
    float power = pzem.power();
    float energy = pzem.energy();
    float frequency = pzem.frequency();
    float pf = pzem.pf();

    if (!isnan(voltage)) {
      // 1. Filtro de inicialización: Ignorar las primeras 2 lecturas REALES (no
      // NAN) Estas son las que suelen traer picos tras la conexión física del
      // sensor.
      if (startup_skip_count < MAX_STARTUP_SKIP) {
        startup_skip_count++;
        Serial.printf(
            "PZEM: Ignorando lectura válida de estabilización %d/%d...\n",
            startup_skip_count, MAX_STARTUP_SKIP);
        vTaskDelay(pdMS_TO_TICKS(PZEM_READ_INTERVAL_MS));
        continue;
      }

      // 2. Filtro de rango (Outlier Filter): Ignorar picos imposibles
      // Basado en límites físicos razonables para evitar errores en
      // gráficas/históricos
      bool is_valid = true;
      if (voltage > 450.0 || voltage < 0.0)
        is_valid = false;
      if (current > 100.0 || current < 0.0)
        is_valid = false;
      if (power > 25000.0 || power < 0.0)
        is_valid = false;

      if (is_valid) {
        // Actualizamos variables globales
        v_voltage = voltage;
        v_current = current;
        v_power = power;
        v_energy = energy;
        v_frequency = frequency;
        v_pf = pf;

        Serial.println("===== MEDICIONES PZEM (Core 0) =====");
        Serial.printf("Voltaje: %.2f V\n", voltage);
        Serial.printf("Corriente: %.3f A\n", current);
        Serial.printf("Potencia: %.2f W\n", power);
        Serial.println("===================================");
      } else {
        Serial.println(">>> PZEM SPIKE DETECTED: Lectura ignorada por valores "
                       "fuera de rango <<<");
        Serial.printf("V: %.2f, I: %.2f, P: %.2f\n", voltage, current, power);
      }
    } else {
      v_voltage = NAN; // Indicar error para la pantalla de diagnóstico
      Serial.println("Error leyendo PZEM (NAN)");
    }

    // Espera definida en config.h antes de la siguiente lectura
    vTaskDelay(pdMS_TO_TICKS(PZEM_READ_INTERVAL_MS));

    // Envío de telemetría por MQTT
    static unsigned long lastMQTTSendTime = 0;
    if (millis() - lastMQTTSendTime > TELEMETRY_SEND_INTERVAL_MS) {
      if (startup_skip_count >= MAX_STARTUP_SKIP && !isnan(v_voltage)) {
        sendTelemetry(v_voltage, v_current, v_power, v_energy, v_frequency, v_pf);
      }
      lastMQTTSendTime = millis();
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(500);

  // 0. Conexión WiFi
  Serial.print("Conectando a WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  delay(2000); // Dar un momento extra para estabilizar red
  
  // Configuración MQTT Nativa (WSS) - Estructura compatible con ESP-IDF 4.4
  esp_mqtt_client_config_t mqtt_cfg = {};
  mqtt_cfg.host = "dietpi.tail02564c.ts.net";
  mqtt_cfg.port = 443;
  mqtt_cfg.transport = MQTT_TRANSPORT_OVER_WSS;
  mqtt_cfg.path = "/mqtt";
  mqtt_cfg.client_id = "IMOX-ESP32-3";
  mqtt_cfg.username = "3";
  mqtt_cfg.password = MQTT_DEVICE_SECRET;
  mqtt_cfg.cert_pem = LET_S_ENCRYPT_CA; // Usar el certificado raíz para validar el servidor
  mqtt_cfg.skip_cert_common_name_check = true; // Recomendado para túneles Tailscale/Funnel
  mqtt_cfg.task_stack = 12288; // Un poco más de stack por seguridad
  mqtt_cfg.buffer_size = 4096; 
  
  mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
  esp_mqtt_client_register_event(mqtt_client, (esp_mqtt_event_id_t)ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
  esp_mqtt_client_start(mqtt_client);
  Serial.println("MQTT: Cliente Iniciado");

  // 1. Inicia Hardware
  bool res = amoled.begin();
  if (!res) {
    Serial.println("Display error!");
    while (1)
      delay(1000);
  }

  // 2. Inicia LVGL
  beginLvglHelper(amoled);

  // 3. Inicia UI de SquareLine
  ui_init();

  Serial.println("System Ready - UI Running");

  // 4. Crear tarea para el Sensor en el Núcleo 0
  // xTaskCreatePinnedToCore params:
  // func, name, stack size, params, priority, handle, core_id
  xTaskCreatePinnedToCore(sensorTaskCode,       /* Función de la tarea */
                          PZEM_TASK_NAME,       /* Nombre de la tarea */
                          PZEM_TASK_STACK_SIZE, /* Tamaño del stack (bytes) */
                          NULL,                 /* Parámetros */
                          PZEM_TASK_PRIORITY,   /* Prioridad */
                          &SensorTask,          /* Handle de la tarea */
                          PZEM_TASK_CORE);      /* Núcleo pinned (0) */
}

void updateUI() {
  // Pre-validamos los valores para evitar picos o NAN en la UI
  float display_v = isnan(v_voltage) ? 0.0 : v_voltage;
  float display_i = isnan(v_current) ? 0.0 : v_current;
  float display_p = isnan(v_power) ? 0.0 : v_power;
  float display_e = isnan(v_energy) ? 0.0 : v_energy;
  float display_f = isnan(v_frequency) ? 0.0 : v_frequency;
  float display_pf = isnan(v_pf) ? 0.0 : v_pf;

  // ----------------------------------------------------
  // VISTA 1: VOLTAJE (ui_voltaje)
  // ----------------------------------------------------
  if (ui_voltajeVal) {
    int int_voltage = (int)display_v;
    lv_label_set_text_fmt(ui_voltajeVal, "%d", int_voltage);
    if (ui_voltajeDecimal) {
      lv_label_set_text(ui_voltajeDecimal,
                        ""); // No decimals as per client request
    }
  }
  if (ui_frecuencia) {
    lv_label_set_text_fmt(ui_frecuencia, "%.1f", display_f);
  }
  if (ui_potencia) {
    lv_label_set_text_fmt(ui_potencia, "%.1f", display_p);
  }

  // ----------------------------------------------------
  // VISTA 6: DIAGNÓSTICO (ui_diagnostic)
  // ----------------------------------------------------
  if (ui_elementVal3) { // Uptime
    uint32_t sec = millis() / 1000;
    uint32_t min = sec / 60;
    uint32_t hr = min / 60;
    lv_label_set_text_fmt(ui_elementVal3, "%02d:%02d:%02d", hr, min % 60,
                          sec % 60);
  }
  if (ui_elementVal5) { // MAC
    lv_label_set_text(ui_elementVal5, WiFi.macAddress().c_str());
  }
  if (ui_elementVal6) { // PZEM Status
    if (!isnan(v_voltage) && v_voltage > 0) {
      lv_label_set_text(ui_elementVal6, "CONECTADO");
    } else {
      lv_label_set_text(ui_elementVal6, "ERROR / DESCONECTADO");
    }
  }
  if (ui_elementVal8) { // Heap
    uint32_t freeHeap = ESP.getFreeHeap() / 1024;
    uint32_t totalHeap = ESP.getHeapSize() / 1024;
    lv_label_set_text_fmt(ui_elementVal8, "%u / %u KB", freeHeap, totalHeap);
  }

  // ----------------------------------------------------
  // VISTA 2: CORRIENTE (ui_corriente)
  // ----------------------------------------------------
  if (ui_corrienteVal) {
    int int_current = (int)display_i;
    lv_label_set_text_fmt(ui_corrienteVal, "%d.",
                          int_current); // Punto grande para corriente
    if (ui_corrienteDecimal) {
      int dec_current = (int)((display_i - int_current) * 100);
      if (dec_current < 0)
        dec_current = 0;
      lv_label_set_text_fmt(ui_corrienteDecimal, "%02d",
                            dec_current); // Sin punto aquí
    }
  }
  if (ui_pactivaVal) {
    lv_label_set_text_fmt(ui_pactivaVal, "%.1f", display_p);
  }
  if (ui_preactivaVal) {
    // Cálculo aproximado de Reactiva: Q = sqrt(S^2 - P^2)
    // S = V * I
    float apparent = display_v * display_i;
    float reactive = 0.0;
    if (apparent > display_p) {
      reactive = sqrt((apparent * apparent) - (display_p * display_p));
    }
    lv_label_set_text_fmt(ui_preactivaVal, "%.1f", reactive);
  }

  // ----------------------------------------------------
  // VISTA 3: DASHBOARD (ui_dashboard)
  // ----------------------------------------------------
  if (ui_VoltajeValD) {
    lv_label_set_text_fmt(ui_VoltajeValD, "%.0f", display_v);
  }
  if (ui_CorrienteValD) {
    lv_label_set_text_fmt(ui_CorrienteValD, "%.2f", display_i);
  }
  if (ui_pactivaValD) {
    lv_label_set_text_fmt(ui_pactivaValD, "%.0f", display_p);
  }
  if (ui_energiaValD) {
    // Energía en kWh
    lv_label_set_text_fmt(ui_energiaValD, "%.3f", display_e);
  }
  if (ui_frecuenciaValD) {
    lv_label_set_text_fmt(ui_frecuenciaValD, "%.1f", display_f);
  }
  if (ui_PotenciaValD) { // Factor de Potencia según análisis
    lv_label_set_text_fmt(ui_PotenciaValD, "%.2f", display_pf);
  }
}

void loop() {
  // El cliente nativo maneja su propia tarea y reconexión en segundo plano
  
  // 5. Manejador LVGL (Corre en el Núcleo 1, el default de loop())
  lv_task_handler();

  // Actualizar UI periódicamente (ej. cada 500ms)
  // No es necesario hacerlo en cada ciclo de loop
  static unsigned long lastUIUpdate = 0;
  if (millis() - lastUIUpdate > 500) {
    updateUI();
    lastUIUpdate = millis();
  }

  delay(LVGL_TICK_PERIOD_MS);
}

// ================================================================
// HARDWARE BRIDGE: Funciones llamadas desde UI (C-linkage)
// ================================================================
extern "C" {

void hw_set_brightness(uint8_t val) {
  amoled.setBrightness(val);
  Serial.printf("Brillo ajustado a: %d\n", val);
}

void hw_wifi_toggle(bool enable) {
  if (enable) {
    WiFi.reconnect();
    Serial.println("WiFi: Reconectando...");
  } else {
    WiFi.disconnect(true);
    Serial.println("WiFi: Desconectado");
  }
}

void hw_restart(void) {
  Serial.println("Reiniciando dispositivo...");
  delay(500); // Dar tiempo al serial
  ESP.restart();
}

void hw_turn_off_screen(void) {
  amoled.setBrightness(0);
  Serial.println("Pantalla apagada (Brillo 0)");
}

} // extern "C"
