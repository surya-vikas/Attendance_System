const express = require('express');
const User = require('../models/User');
const { verifyAdminToken, verifyTpoRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', verifyAdminToken, verifyTpoRole, async (req, res) => {
  try {
    const coordinators = await User.find({ role: 'COORDINATOR' })
      .select({ _id: 1, name: 1, email: 1, role: 1 })
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({ coordinators });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch coordinators' });
  }
});

module.exports = router;
