const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { URL } = require('url');
const { randomUUID, createHash } = require('crypto');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADMIN_EMAIL = 'buangareth@gmail.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'AdminPass123!';
const SESSION_COOKIE_NAME = 'buan_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function createSession(userId) {
  const token = randomUUID();
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
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
