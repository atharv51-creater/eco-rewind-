import 'dotenv/config';
import bcrypt from 'bcrypt';
import { initDb, getDb } from './db.js';

console.log('Seeding EcoRewind database...');

const db = initDb();

// Seed demo users if not present
const seedUsers = [
  {
    id: 'user-atharv-01',
    name: 'Atharv Ubale',
    phone: '9876543210',
    email: 'user@ecorewind.com',
    password: 'password123',
  },
  {
    id: 'user-admin-01',
    name: 'EcoRewind Administrator',
    phone: '9811122233',
    email: 'admin@ecorewind.com',
    password: 'password123',
  },
];

for (const user of seedUsers) {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(user.phone);
  if (!existing) {
    const passwordHash = bcrypt.hashSync(user.password, 10);
    db.prepare(
      'INSERT INTO users (id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, user.name, user.phone, user.email, passwordHash);
    console.log(`Seeded user: ${user.name} (${user.phone})`);
  } else {
    db.prepare('UPDATE users SET email = COALESCE(email, ?) WHERE phone = ?').run(
      user.email,
      user.phone
    );
    console.log(`User already exists: ${user.name} (${user.phone})`);
  }
}

// Ensure kiosk RVM-01 exists
const kiosk = db.prepare('SELECT id FROM kiosks WHERE id = ?').get('RVM-01');
if (!kiosk) {
  const kioskHash = bcrypt.hashSync(process.env.KIOSK_API_KEY || 'rvm-key-2024', 10);
  db.prepare('INSERT INTO kiosks (id, name, location, api_key_hash) VALUES (?, ?, ?, ?)').run(
    'RVM-01',
    'RVM Main Campus',
    'Main Entrance',
    kioskHash
  );
  console.log('Seeded kiosk: RVM-01');
} else {
  console.log('Kiosk RVM-01 already present');
}

console.log('Database seeding complete!');
