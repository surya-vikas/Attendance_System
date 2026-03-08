const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Drive = require('../models/Drive');
const { verifyAdminToken } = require('../middleware/authMiddleware');

const router = express.Router();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasCoordinatorAccess = (drive, userId) =>
  drive.coordinators?.some((coordinatorId) => String(coordinatorId) === String(userId));
const getUserContext = (req) => ({
  role: String(req.user?.role || '').toUpperCase(),
  userId: req.user?.userId || req.admin?.adminId,
});

const buildAttendanceRows = async (driveId) => {
  const attendanceRows = await Attendance.find({ driveId }).sort({ timestamp: -1 }).lean();
  const rollNos = [...new Set(attendanceRows.map((item) => String(item.rollNo || '').trim()).filter(Boolean))];

  let students = [];
  if (rollNos.length > 0) {
    students = await Student.find({
      $or: rollNos.map((roll) => ({
        rollNo: { $regex: `^${escapeRegex(roll)}$`, $options: 'i' },
      })),
    })
      .select({ rollNo: 1, name: 1, year: 1, branch: 1, section: 1, phone: 1 })
      .lean();
  }

  const studentMap = new Map();
  students.forEach((student) => {
    studentMap.set(String(student.rollNo || '').trim().toLowerCase(), {
      name: student.name,
      year: student.year,
      branch: student.branch,
      section: student.section,
      phone: student.phone,
    });
  });

  return attendanceRows.map((row) => ({
    id: row._id,
    rollNo: row.rollNo,
    name: studentMap.get(String(row.rollNo || '').trim().toLowerCase())?.name || 'Unknown',
    year: studentMap.get(String(row.rollNo || '').trim().toLowerCase())?.year ?? '-',
    branch: studentMap.get(String(row.rollNo || '').trim().toLowerCase())?.branch || '-',
    section: studentMap.get(String(row.rollNo || '').trim().toLowerCase())?.section || '-',
    phone: studentMap.get(String(row.rollNo || '').trim().toLowerCase())?.phone || '-',
    scannedBy: row.scannedBy || null,
    timestamp: row.timestamp,
  }));
};

router.get('/drive/:driveId', verifyAdminToken, async (req, res) => {
  try {
    const { driveId } = req.params;
    const { role, userId } = getUserContext(req);

    if (!mongoose.Types.ObjectId.isValid(driveId)) {
      return res.status(400).json({ message: 'Invalid driveId' });
    }

    const drive = await Drive.findById(driveId).select({ coordinators: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    if (role === 'COORDINATOR' && (!userId || !hasCoordinatorAccess(drive, userId))) {
      return res.status(403).json({ message: 'Unauthorized for this drive' });
    }

    if (role !== 'COORDINATOR' && role !== 'TPO') {
      return res.status(403).json({ message: 'Access denied for this role' });
    }

    const attendance = await buildAttendanceRows(driveId);

    return res.status(200).json({ attendance });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch attendance' });
  }
});

router.get('/my-drive/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, userId } = getUserContext(req);

    if (role !== 'COORDINATOR') {
      return res.status(403).json({ message: 'Access denied. Coordinator role required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid driveId' });
    }

    const drive = await Drive.findById(id).select({ coordinators: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    if (!userId || !hasCoordinatorAccess(drive, userId)) {
      return res.status(403).json({ message: 'Unauthorized for this drive' });
    }

    const attendance = await buildAttendanceRows(id);
    return res.status(200).json({ attendance });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch attendance' });
  }
});

const markAttendance = async (req, res) => {
  try {
    const { rollNo, driveId } = req.body;

    if (!rollNo || !driveId) {
      return res.status(400).json({ message: 'rollNo and driveId are required' });
    }

    const normalizedRollNo = String(rollNo).trim().toUpperCase();
    if (!normalizedRollNo) {
      return res.status(400).json({ message: 'rollNo cannot be empty' });
    }

    if (!mongoose.Types.ObjectId.isValid(driveId)) {
      return res.status(400).json({ message: 'Invalid driveId' });
    }

    const { role, userId } = getUserContext(req);
    const drive = await Drive.findById(driveId).select({ coordinators: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    if (role === 'COORDINATOR' && (!userId || !hasCoordinatorAccess(drive, userId))) {
      return res.status(403).json({ message: 'Unauthorized for this drive' });
    }

    const student = await Student.findOne({
      rollNo: { $regex: `^${escapeRegex(normalizedRollNo)}$`, $options: 'i' },
    })
      .select({ rollNo: 1 })
      .lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const canonicalRollNo = String(student.rollNo || normalizedRollNo).trim().toUpperCase();

    const existingAttendance = await Attendance.findOne({
      driveId,
      rollNo: { $regex: `^${escapeRegex(canonicalRollNo)}$`, $options: 'i' },
    });

    if (existingAttendance) {
      return res.status(409).json({ message: 'Attendance already marked for this student and drive' });
    }

    const attendance = await Attendance.create({
      rollNo: canonicalRollNo,
      driveId,
      scannedBy: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
      timestamp: Date.now(),
    });

    return res.status(201).json({
      message: 'Attendance saved successfully',
      attendance,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Attendance already marked for this student and drive' });
    }

    return res.status(500).json({ message: 'Failed to save attendance' });
  }
};

router.post('/scan', verifyAdminToken, markAttendance);
router.post('/', verifyAdminToken, markAttendance);

router.delete('/:attendanceId', verifyAdminToken, async (req, res) => {
  try {
    const { attendanceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
      return res.status(400).json({ message: 'Invalid attendanceId' });
    }

    const deletedAttendance = await Attendance.findByIdAndDelete(attendanceId);
    if (!deletedAttendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    return res.status(200).json({ message: 'Attendance deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete attendance' });
  }
});

module.exports = router;
