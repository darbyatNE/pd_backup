import { verifyToken } from '../services/cognito.js';
import { query } from '../services/db.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = await verifyToken(token);
    req.user = { id: decoded.sub, email: decoded.email };
    req.userToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (allowedRoles) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const { rows } = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const userData = rows[0];
    if (!userData) return res.status(403).json({ error: 'User not found' });
    if (!allowedRoles.includes(userData.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    req.userRole = userData.role;
    next();
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Authorization failed' });
  }
};
