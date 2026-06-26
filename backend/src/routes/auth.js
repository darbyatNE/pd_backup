import express from 'express';
import { signIn, signOut, signUp, adminConfirmSignUp, verifyToken, deleteUser } from '../services/cognito.js';
import { query } from '../services/db.js';

const router = express.Router();

// Rejects after `ms` milliseconds — wrap any hanging AWS call with this
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} did not respond in ${ms}ms`)), ms)
    ),
  ]);

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  console.log('[signup] handler entered — body:', JSON.stringify(req.body));
  try {
    const { email, password, role, company_name, contact_person, title } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password, and role are required' });
    }

    const validRoles = ['buyer', 'seller'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'role must be either "buyer" or "seller"' });
    }

    console.log('[signup] step 1: calling Cognito signUp...');
    const result = await withTimeout(signUp(email, password), 15000, 'Cognito SignUp');
    const userId = result.UserSub;
    console.log('[signup] step 1 done, userId:', userId);

    console.log('[signup] step 2: calling adminConfirmSignUp...');
    await withTimeout(adminConfirmSignUp(email), 15000, 'Cognito AdminConfirmSignUp');
    console.log('[signup] step 2 done');

    console.log('[signup] step 3: inserting into users table...');
    let userId_for_rollback = userId;
    try {
      await withTimeout(
        query(
          `INSERT INTO users (id, email, role, company_name, contact_person, title, onboarding_completed)
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [userId, email, role, company_name || null, contact_person || null, title || null]
        ),
        10000,
        'DB insert users'
      );
      userId_for_rollback = null; // DB succeeded — no rollback needed
    } catch (dbErr) {
      console.error('[signup] DB insert failed, rolling back Cognito user:', dbErr.message);
      // Best-effort: delete the Cognito user so the email can be retried
      try { await deleteUser(email); } catch (e) { console.error('[signup] Cognito rollback failed:', e.message); }
      throw new Error('Account storage failed — please try again. (' + dbErr.message + ')');
    }
    console.log('[signup] step 3 done');

    res.status(201).json({
      message: 'Account created successfully. You can now log in.',
      userId,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ error: error.message || 'Signup failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await withTimeout(signIn(email, password), 15000, 'Cognito InitiateAuth');
    const tokens = result.AuthenticationResult;

    if (!tokens) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    // Decode IdToken to get user sub without a full verify (signIn already authenticated)
    const [, payloadB64] = tokens.IdToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    const { rows } = await query(
      'SELECT id, email, role, company_name, contact_person, title, onboarding_completed FROM users WHERE id = $1',
      [payload.sub]
    );
    const userData = rows[0];

    if (!userData) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    res.json({
      user: userData,
      session: {
        access_token: tokens.IdToken,
        cognito_access_token: tokens.AccessToken,
        refresh_token: tokens.RefreshToken,
        expires_in: tokens.ExpiresIn,
        token_type: 'Bearer',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { cognito_access_token } = req.body;
    if (cognito_access_token) {
      await signOut(cognito_access_token);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/session
router.get('/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No session found' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = await verifyToken(token);

    const { rows } = await query(
      'SELECT id, email, role, company_name, contact_person, title, onboarding_completed FROM users WHERE id = $1',
      [decoded.sub]
    );
    const userData = rows[0];

    if (!userData) {
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    res.json({ user: userData });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(401).json({ error: 'Invalid session' });
  }
});

export default router;
