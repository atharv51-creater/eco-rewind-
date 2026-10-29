import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from '../db.js';
import { JWT_SECRET, SESSION_TTL_DAYS, IS_PRODUCTION, ADMIN_PHONES } from '../config.js';

const SESSION_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function roleFor(phone) {
  return ADMIN_PHONES.includes(phone) ? 'admin' : 'user';
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    maxAge: SESSION_MS,
    sameSite: 'lax',
    path: '/',
  };
}

// Demo email to phone mapping for ease of testing & legacy UI compatibility
const DEMO_EMAIL_MAP = {
  'admin@ecorewind.com': '9811122233',
  'user@ecorewind.com': '9876543210',
};

export function registerUser(req, res) {
  const { name, phone, email, password } = req.body;

  const targetPhone = phone || (email && DEMO_EMAIL_MAP[String(email).toLowerCase()]);

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!targetPhone) {
    return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
  }

  // Validate 10-digit Indian phone number
  const cleanPhone = String(targetPhone).replace(/\D/g, '');
  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)' });
  }

  const cleanEmail =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    return res.status(409).json({ error: 'Phone number already registered' });
  }
  if (cleanEmail && DEMO_EMAIL_MAP[cleanEmail] && DEMO_EMAIL_MAP[cleanEmail] !== cleanPhone) {
    return res.status(409).json({ error: 'Email address is reserved' });
  }
  if (cleanEmail) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email address already registered' });
    }
  }

  const userId = 'user-' + crypto.randomBytes(8).toString('hex');
  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    db.prepare(
      'INSERT INTO users (id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, name.trim(), cleanPhone, cleanEmail, passwordHash);

    const role = roleFor(cleanPhone);
    const token = jwt.sign(
      { userId, phone: cleanPhone, name: name.trim(), role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('session', token, sessionCookieOptions());

    return res.json({
      success: true,
      userId,
      token,
      role,
      user: {
        id: userId,
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail || '',
        role,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}

export function loginUser(req, res) {
  const { phone, email, identifier, password } = req.body;

  const rawIdentifier = phone || email || identifier;

  if (!rawIdentifier) {
    return res.status(400).json({ error: 'Phone number or email is required' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const db = getDb();
  const identifierStr = String(rawIdentifier).trim();
  const looksLikeEmail = identifierStr.includes('@');
  const cleanPhone = identifierStr.replace(/\D/g, '');

  let user = null;
  if (!looksLikeEmail && cleanPhone.length === 10) {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  }
  if (!user && looksLikeEmail) {
    user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(identifierStr.toLowerCase());
  }
  if (!user) {
    const mappedPhone = DEMO_EMAIL_MAP[identifierStr.toLowerCase()];
    if (mappedPhone) {
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(mappedPhone);
    }
  }
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(identifierStr);
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }

  const role = roleFor(user.phone);
  const token = jwt.sign(
    { userId: user.id, phone: user.phone, name: user.name, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('session', token, sessionCookieOptions());

  return res.json({
    success: true,
    userId: user.id,
    token,
    role,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email || '',
      role,
    },
  });
}

export function logoutUser(req, res) {
  res.clearCookie('session', { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully' });
}
