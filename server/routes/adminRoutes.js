const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = '7d';
const ROLES = {
  TPO: 'TPO',
  COORDINATOR: 'COORDINATOR',
};

const createToken = (user) =>
  jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedRole = role ? String(role).trim().toUpperCase() : ROLES.TPO;
    const normalizedName = String(name || '').trim();

    if (!normalizedName || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (!Object.values(ROLES).includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role. Use TPO or COORDINATOR' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: normalizedName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: normalizedRole,
    });

    const token = createToken(user);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      admin: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      admin: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to login user' });
  }
});

module.exports = router;
