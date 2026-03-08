const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token is required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.admin = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const verifyTpoRole = (req, res, next) => {
  const role = String(req.user?.role || '').toUpperCase();

  if (role !== 'TPO') {
    return res.status(403).json({ message: 'Access denied. TPO role required' });
  }

  return next();
};

module.exports = {
  verifyAdminToken,
  verifyTpoRole,
};
