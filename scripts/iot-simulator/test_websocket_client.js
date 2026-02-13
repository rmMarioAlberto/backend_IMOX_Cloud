const io = require('socket.io-client');

// --- CONFIGURACIÓN ---
const URL = 'https://dietpi.tail02564c.ts.net/telemetry'; // Nota: Socket.io client maneja el namespace en la URL
const IOT_ID = 3;

// TOKEN JWT (Pégalo aquí o usa uno de prueba si tienes auth desactivada o mockeada)
// IMPORTANTE: Reemplaza esto con un token válido generado por tu endpoint /auth/login
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjQsImVtYWlsIjoiYWxhbnBlcmV4MTEyQGdtYWlsLmNvbSIsInJvbGUiOjEsImRldmljZUlkIjoiYW5kcm9pZF91dWlkXzEyMzQ1MSIsImlhdCI6MTc3MTAwMTI4OSwiZXhwIjoxNzcxMDAyMTg5fQ.QZyARvpbHmBn9XbvWnmKVLbFPjZfKe11xrhpmykW5X4'; 

// Token check removed
console.log('Token configurado: ' + TOKEN.substring(0, 10) + '...');

console.log(`🔌 Conectando a ${URL}...`);

const socket = io(URL, {
  auth: {
    token: TOKEN 
  },
  // También probamos headers por si acaso (aunque auth suele ser preferido en v4)
  extraHeaders: {
    Authorization: `Bearer ${TOKEN}`
  }
});

socket.on('connect', () => {
  console.log(`✅ Conectado al servidor! (Socket ID: ${socket.id})`);
  
  console.log(`📡 Suscribiendo al dispositivo ${IOT_ID}...`);
  socket.emit('subscribeToDevice', { iotId: IOT_ID });
});

socket.on('connect_error', (err) => {
  console.error(`❌ Error de conexión: ${err.message}`);
});

socket.on('disconnect', (reason) => {
  console.log(`⚠️ Desconectado: ${reason}`);
});

socket.on('subscribed', (data) => {
  console.log(`👌 Suscripción exitosa: ${JSON.stringify(data)}`);
});

socket.on('exception', (data) => {
  console.error(`❌ EXCEPCIÓN DEL SERVIDOR:`, data);
});

socket.on('error', (err) => {
  console.error(`❌ ERROR DEL SERVIDOR:`, err);
});

socket.on('telemetry', (data) => {
  console.log('📊 DATOS RECIBIDOS:', JSON.stringify(data, null, 2));
});

console.log('⏳ Esperando eventos...');
