const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { URL } = require('url');
const { randomUUID, createHash } = require('crypto');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADMIN_DATA_FILE = path.join(DATA_DIR, 'admin-data.json');
const ADMIN_EMAIL = 'buangareth@gmail.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'AdminPass123!';
const SESSION_COOKIE_NAME = 'buan_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_TTL_MILLIS = SESSION_TTL_SECONDS * 1000;

const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(USERS_FILE, fs.constants.F_OK);
  } catch (error) {
    await fsp.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

async function ensureAdminDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(ADMIN_DATA_FILE, fs.constants.F_OK);
  } catch (error) {
    const initialData = {
      availability: {},
      sessions: [],
      updatedAt: null,
    };
    await fsp.writeFile(ADMIN_DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

async function readUserData() {
  await ensureDataFile();
  try {
    const raw = await fsp.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.users)) {
      return parsed.users;
    }
    return [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeUserData(users) {
  await ensureDataFile();
  await fsp.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

async function readAdminData() {
  await ensureAdminDataFile();
  try {
    const raw = await fsp.readFile(ADMIN_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { availability: {}, sessions: [], updatedAt: null };
    }
    const availability = parsed.availability && typeof parsed.availability === 'object'
      ? parsed.availability
      : {};
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return { availability, sessions, updatedAt };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { availability: {}, sessions: [], updatedAt: null };
    }
    throw error;
  }
}

async function writeAdminData(nextData) {
  await ensureAdminDataFile();
  const payload = {
    availability: nextData.availability || {},
    sessions: Array.isArray(nextData.sessions) ? nextData.sessions : [],
    updatedAt: nextData.updatedAt || new Date().toISOString(),
  };
  await fsp.writeFile(ADMIN_DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function createSession(userId) {
  const token = randomUUID();
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }
  return cookieHeader.split(';').reduce((acc, entry) => {
    const [rawName, ...rest] = entry.split('=');
    if (!rawName) return acc;
    const name = rawName.trim();
    if (!name) return acc;
    const value = rest.join('=').trim();
    acc[name] = value;
    return acc;
  }, {});
}

async function loadUserById(userId) {
  if (!userId) return null;
  const users = await readUserData();
  return users.find(user => user.id === userId) || null;
}

async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (Date.now() - session.createdAt > SESSION_TTL_MILLIS) {
    sessions.delete(token);
    return null;
  }

  const user = await loadUserById(session.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }

  return user;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function normalizeAvailability(input) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = {};
  Object.keys(source).forEach(dateKey => {
    if (!isIsoDate(dateKey)) return;
    const times = Array.isArray(source[dateKey]) ? source[dateKey] : [];
    const unique = Array.from(new Set(times.filter(isTimeValue)));
    if (!unique.length) return;
    normalized[dateKey] = unique.sort();
  });
  return normalized;
}

function normalizeSessions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      id: typeof entry.id === 'string' ? entry.id : randomUUID(),
      studentName: typeof entry.studentName === 'string' ? entry.studentName : 'Student',
      subject: typeof entry.subject === 'string' ? entry.subject : '',
      email: typeof entry.email === 'string' ? entry.email : '',
      phone: typeof entry.phone === 'string' ? entry.phone : '',
      date: isIsoDate(entry.date) ? entry.date : null,
      time: isTimeValue(entry.time) ? entry.time : null,
      status: typeof entry.status === 'string' ? entry.status : 'booked',
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
      canceledAt: typeof entry.canceledAt === 'string' ? entry.canceledAt : null,
    }))
    .filter(entry => entry.date && entry.time);
}

function setSessionCookie(res, token) {
  const cookie = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
  res.setHeader('Set-Cookie', cookie);
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function ensureAdminSeed() {
  const users = await readUserData();
  const existing = users.find(user => user.email === ADMIN_EMAIL);
  const nowIso = new Date().toISOString();

  if (existing) {
    let requiresUpdate = false;
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      requiresUpdate = true;
    }
    if (!existing.passwordHash) {
      existing.passwordHash = hashPassword(ADMIN_DEFAULT_PASSWORD);
      requiresUpdate = true;
    }
    if (requiresUpdate) {
      existing.updatedAt = nowIso;
      await writeUserData(users);
    }
    return;
  }

  const adminUser = {
    id: randomUUID(),
    name: 'Administrator',
    email: ADMIN_EMAIL,
    yearLevel: 'n/a',
    role: 'admin',
    passwordHash: hashPassword(ADMIN_DEFAULT_PASSWORD),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  users.push(adminUser);
  await writeUserData(users);
}

async function requireAdminRequest(req, res) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { message: 'Authentication required.' });
      return null;
    }
    if (user.role !== 'admin') {
      sendJson(res, 403, { message: 'Administrator access required.' });
      return null;
    }
    return user;
  } catch (error) {
    console.error('Failed to resolve admin session', error);
    sendJson(res, 500, { message: 'Unable to verify your session right now.' });
    return null;
  }
}

async function handleAdminAvailability(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await readAdminData();
      const availability = normalizeAvailability(data.availability);
      return sendJson(res, 200, {
        availability,
        updatedAt: data.updatedAt || null,
      });
    } catch (error) {
      console.error('Failed to read admin availability', error);
      return sendJson(res, 500, { message: 'Unable to load availability data.' });
    }
  }

  if (req.method === 'PUT') {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { message: error.message || 'Invalid request body.' });
    }

    const normalized = normalizeAvailability(payload.availability);
    const nowIso = new Date().toISOString();

    try {
      const existing = await readAdminData();
      const nextData = {
        availability: normalized,
        sessions: normalizeSessions(existing.sessions),
        updatedAt: nowIso,
      };
      const saved = await writeAdminData(nextData);
      return sendJson(res, 200, {
        availability: saved.availability,
        updatedAt: saved.updatedAt,
      });
    } catch (error) {
      console.error('Failed to update admin availability', error);
      return sendJson(res, 500, { message: 'Unable to update availability data.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS');
  return sendJson(res, 405, { message: 'Method Not Allowed' });
}

async function handleAdminSessions(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/admin/sessions') {
    try {
      const data = await readAdminData();
      return sendJson(res, 200, { sessions: normalizeSessions(data.sessions) });
    } catch (error) {
      console.error('Failed to read admin sessions', error);
      return sendJson(res, 500, { message: 'Unable to load session data.' });
    }
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/admin/sessions/')) {
    const sessionId = decodeURIComponent(pathname.split('/').pop() || '');
    if (!sessionId) {
      return sendJson(res, 400, { message: 'Session identifier is required.' });
    }

    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { message: error.message || 'Invalid request body.' });
    }

    const nowIso = new Date().toISOString();

    try {
      const data = await readAdminData();
      const sessionsData = normalizeSessions(data.sessions);
      const target = sessionsData.find(entry => entry.id === sessionId);
      if (!target) {
        return sendJson(res, 404, { message: 'Session not found.' });
      }

      if (payload.status && typeof payload.status === 'string') {
        target.status = payload.status;
      }

      if (payload.action === 'cancel') {
        target.status = 'canceled';
        target.canceledAt = nowIso;
      }

      if (payload.date || payload.time) {
        const nextDate = payload.date && isIsoDate(payload.date) ? payload.date : target.date;
        const nextTime = payload.time && isTimeValue(payload.time) ? payload.time : target.time;
        const availability = normalizeAvailability(data.availability);
        const slots = availability[nextDate] || [];
        if (!slots.includes(nextTime)) {
          return sendJson(res, 400, { message: 'Selected slot is not available.' });
        }
        target.date = nextDate;
        target.time = nextTime;
      }

      target.updatedAt = nowIso;

      const saved = await writeAdminData({
        availability: normalizeAvailability(data.availability),
        sessions: sessionsData,
        updatedAt: nowIso,
      });

      return sendJson(res, 200, { session: sessionsData.find(entry => entry.id === sessionId), updatedAt: saved.updatedAt });
    } catch (error) {
      console.error('Failed to update admin session', error);
      return sendJson(res, 500, { message: 'Unable to update session.' });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, OPTIONS');
  return sendJson(res, 405, { message: 'Method Not Allowed' });
}

async function handleSignUp(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { message: error.message || 'Invalid request body.' });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const email = emailRaw.toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password : '';
  const yearLevel = typeof payload.yearLevel === 'string' ? payload.yearLevel.trim() : '';

  if (!name) {
    return sendJson(res, 400, { message: 'Please provide your full name.' });
  }
  if (!email || !validateEmail(email)) {
    return sendJson(res, 400, { message: 'Enter a valid email address.' });
  }
  if (!password || password.length < 8) {
    return sendJson(res, 400, { message: 'Your password must be at least 8 characters long.' });
  }
  if (!yearLevel) {
    return sendJson(res, 400, { message: 'Select your current year level.' });
  }

  try {
    const users = await readUserData();
    if (users.some(user => user.email === email)) {
      return sendJson(res, 409, { message: 'An account with that email already exists.' });
    }

    const nowIso = new Date().toISOString();
    const role = email === ADMIN_EMAIL ? 'admin' : 'student';
    const newUser = {
      id: randomUUID(),
      name,
      email,
      yearLevel,
      role,
      passwordHash: hashPassword(password),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    users.push(newUser);
    await writeUserData(users);

    const sessionToken = createSession(newUser.id);
    setSessionCookie(res, sessionToken);

    return sendJson(res, 201, {
      message: 'Account created successfully.',
      sessionToken,
      token: sessionToken,
      role,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    console.error('Sign-up error', error);
    return sendJson(res, 500, { message: 'Unable to create your account right now. Please try again later.' });
  }
}

async function handleSignIn(req, res) {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { message: error.message || 'Invalid request body.' });
  }

  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const email = emailRaw.toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!email || !validateEmail(email)) {
    return sendJson(res, 400, { message: 'Enter a valid email address.' });
  }
  if (!password || password.length < 8) {
    return sendJson(res, 400, { message: 'Your password must be at least 8 characters long.' });
  }

  try {
    const users = await readUserData();
    const user = users.find(entry => entry.email === email);
    if (!user) {
      return sendJson(res, 401, { message: 'Invalid email or password.' });
    }

    const hashed = hashPassword(password);
    if (user.passwordHash !== hashed) {
      return sendJson(res, 401, { message: 'Invalid email or password.' });
    }

    const sessionToken = createSession(user.id);
    setSessionCookie(res, sessionToken);

    return sendJson(res, 200, {
      message: 'Signed in successfully.',
      sessionToken,
      token: sessionToken,
      role: user.role,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Sign-in error', error);
    return sendJson(res, 500, { message: 'Unable to sign you in right now. Please try again later.' });
  }
}

async function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT_DIR, pathname);
  try {
    const stats = await fsp.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (error) {
    if (pathname === '/' || pathname === '') {
      filePath = path.join(ROOT_DIR, 'index.html');
    }
  }

  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const urlInstance = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlInstance.pathname;

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    return handleSignUp(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/auth/signin') {
    return handleSignIn(req, res);
  }

  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (pathname.startsWith('/api/admin/')) {
    const adminUser = await requireAdminRequest(req, res);
    if (!adminUser) {
      return;
    }

    if (pathname === '/api/admin/availability') {
      return handleAdminAvailability(req, res);
    }

    return handleAdminSessions(req, res, pathname);
  }

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { message: 'Not Found' });
  }

  return serveStatic(req, res, pathname);
});

const PORT = process.env.PORT || 3000;

ensureAdminSeed()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log(`Seeded admin account email: ${ADMIN_EMAIL}`);
    });
  })
  .catch(error => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
