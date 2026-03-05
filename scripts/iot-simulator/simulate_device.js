const mqtt = require('mqtt');

//const BROKER_URL = 'mqtt://localhost:1883'; // Desarrollo local
const BROKER_URL = 'wss://dietpi.tail02564c.ts.net:443/mqtt'; // Producción via Tailscale Funnel
const DEVICE_ID = 3; // Asegúrate de que este ID exista en tu DB MariaDB (tabla iot)
const DEVICE_SECRET = 'b67a81fa475cacdc6a036c2e1395e8399b893764883a8c1b'; // Reemplaza con el secret real del dispositivo
const TOPIC = `imox/devices/${DEVICE_ID}/telemetry`;
const INTERVAL_MS = 1500;

console.log(`📡 Conectando al simulador IoT al broker ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL, {
  clientId: `sim_device_${DEVICE_ID}`,
  username: String(DEVICE_ID), // El broker espera el ID como usuario
  password: DEVICE_SECRET,     // El secret como contraseña
  rejectUnauthorized: true,    // Valida el certificado SSL de Tailscale
});

client.on('connect', () => {
  console.log('✅ Conectado al MQTT Broker!');
  console.log(`🚀 Iniciando envío de datos a: ${TOPIC} cada ${INTERVAL_MS}ms`);

  setInterval(() => {
    const data = generateRandomReading();
    const payload = JSON.stringify(data);

    client.publish(TOPIC, payload, (err) => {
      if (err) {
        console.error('❌ Error enviando mensaje:', err);
      } else {
        console.log(`📤 Enviado: ${payload}`);
      }
    });
  }, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('❌ Error de conexión MQTT:', err);
});

function generateRandomReading() {
  // Genera valores que oscilan suavemente para que parezca real
  // Voltaje ~120V +/- 5V
  const voltaje = 120 + (Math.random() * 10 - 5);
  
  // Corriente ~5A +/- 2A
  const corriente = 5 + (Math.random() * 4 - 2);
  
  // Potencia = V * I (aprox)
  const potencia = voltaje * corriente;

  return {
    iot_id: DEVICE_ID,
    user_id: 1, // Simulado (en producción normalmente lo gestiona el backend)
    electricas: {
      voltaje_v: Number.parseFloat(voltaje.toFixed(2)),
      corriente_a: Number.parseFloat(corriente.toFixed(2)),
      potencia_w: Number.parseFloat(potencia.toFixed(2)),
      energia_kwh: Number.parseFloat((Math.random() * 100).toFixed(2)),
      frecuencia_hz: Number.parseFloat((60 + (Math.random() * 0.2 - 0.1)).toFixed(2)),
      factor_potencia: Number.parseFloat((0.9 + Math.random() * 0.1).toFixed(2)),
    },
    diagnostico: {
      ip: '192.168.1.50',
      rssi_dbm: -45,
      pzem_status: 'ok',
      uptime_s: Math.floor(process.uptime()),
    },
    timestamp: new Date().toISOString(),
  };
}
