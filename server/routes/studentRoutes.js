const express = require('express');
const Student = require('../models/Student');

const router = express.Router();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.post('/register', async (req, res) => {
  try {
    const { rollNo, name, year, branch, section, phone, signature } = req.body;

    if (!rollNo || !name || !year || !branch || !section || !phone || !signature) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const normalizedRollNo = String(rollNo).trim().toUpperCase();
    const existingStudent = await Student.findOne({
      rollNo: { $regex: `^${escapeRegex(normalizedRollNo)}$`, $options: 'i' },
    });

    if (existingStudent) {
      return res.status(409).json({ message: 'Student with this roll number already exists' });
    }

    const student = await Student.create({
      rollNo: normalizedRollNo,
      name: String(name).trim(),
      year: Number(year),
      branch: String(branch).trim(),
      section: String(section).trim(),
      phone: String(phone).trim(),
      signature,
    });

    return res.status(201).json({
      message: 'Student registered successfully',
      student: {
        id: student._id,
        rollNo: student.rollNo,
        name: student.name,
        year: student.year,
        branch: student.branch,
        section: student.section,
        phone: student.phone,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to register student' });
  }
});

module.exports = router;
