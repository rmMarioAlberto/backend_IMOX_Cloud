const bcrypt = require('bcrypt');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node tools/hash_mqtt_password.js <YOUR_PASSWORD>');
  process.exit(1);
}

const saltRounds = 10;
const hash = bcrypt.hashSync(password, saltRounds);

console.log(`\n--- Line for docker/mqtt/password_file ---`);
console.log(`backend_admin:${hash}`);
console.log(`------------------------------------------\n`);

//node tools/hash_mqtt_password.js "TU_NUEVA_CONTRASEÑA"