const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { verifyAdminToken, verifyTpoRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/create-coordinator', verifyAdminToken, verifyTpoRole, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const coordinator = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'COORDINATOR',
    });

    return res.status(201).json({
      message: 'Coordinator created successfully',
      coordinator: {
        id: coordinator._id,
        name: coordinator.name,
        email: coordinator.email,
        role: coordinator.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create coordinator' });
  }
});

module.exports = router;
