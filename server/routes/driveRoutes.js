const express = require('express');
const mongoose = require('mongoose');
const Drive = require('../models/Drive');
const User = require('../models/User');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { verifyAdminToken, verifyTpoRole } = require('../middleware/authMiddleware');

const router = express.Router();
const hasCoordinatorAccess = (drive, userId) =>
  drive.coordinators?.some((coordinatorId) => String(coordinatorId) === String(userId));
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

router.get('/', verifyAdminToken, async (req, res) => {
  try {
    const drives = await Drive.find().sort({ date: 1, createdAt: -1 });
    return res.status(200).json({ drives });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch drives' });
  }
});

router.get('/my-drives', verifyAdminToken, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    const userId = req.user?.userId || req.admin?.adminId;

    if (role === 'COORDINATOR') {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ message: 'Invalid user token' });
      }

      const drives = await Drive.find({ coordinators: userId }).sort({ date: 1, createdAt: -1 });
      return res.status(200).json({ drives });
    }

    if (role === 'TPO') {
      const drives = await Drive.find().sort({ date: 1, createdAt: -1 });
      return res.status(200).json({ drives });
    }

    return res.status(403).json({ message: 'Access denied for this role' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch drives' });
  }
});

router.get('/:id/attendance', verifyAdminToken, verifyTpoRole, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid drive id' });
    }

    const drive = await Drive.findById(id).select({ _id: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    const attendanceRows = await Attendance.find({ driveId: id })
      .sort({ timestamp: -1 })
      .select({ rollNo: 1, driveId: 1, scannedBy: 1, timestamp: 1 })
      .lean();

    const rollNos = [...new Set(attendanceRows.map((row) => String(row.rollNo || '').trim()).filter(Boolean))];

    let students = [];
    if (rollNos.length > 0) {
      students = await Student.find({
        $or: rollNos.map((roll) => ({
          rollNo: { $regex: `^${escapeRegex(roll)}$`, $options: 'i' },
        })),
      })
        .select({ rollNo: 1, name: 1, branch: 1 })
        .lean();
    }

    const studentMap = new Map(
      students.map((student) => [
        String(student.rollNo || '').trim().toUpperCase(),
        { name: student.name, branch: student.branch },
      ])
    );

    const attendance = attendanceRows.map((row) => {
      const normalizedRollNo = String(row.rollNo || '').trim().toUpperCase();
      const student = studentMap.get(normalizedRollNo);
      const scannedById = row.scannedBy ? String(row.scannedBy) : null;

      return {
        rollNo: row.rollNo,
        name: student?.name || 'Unknown',
        branch: student?.branch || '-',
        timestamp: row.timestamp,
        scannedBy: scannedById,
      };
    });

    return res.status(200).json({ attendance });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch drive attendance' });
  }
});

router.get('/:id/export', verifyAdminToken, verifyTpoRole, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid drive id' });
    }

    const drive = await Drive.findById(id).select({ _id: 1, driveName: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    const attendanceRows = await Attendance.find({ driveId: id })
      .sort({ timestamp: -1 })
      .select({ rollNo: 1, scannedBy: 1, timestamp: 1 })
      .lean();

    const rollNos = [...new Set(attendanceRows.map((row) => String(row.rollNo || '').trim()).filter(Boolean))];
    const scannedByIds = [
      ...new Set(
        attendanceRows
          .map((row) => (row.scannedBy ? String(row.scannedBy) : ''))
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      ),
    ];

    let students = [];
    if (rollNos.length > 0) {
      students = await Student.find({
        $or: rollNos.map((roll) => ({
          rollNo: { $regex: `^${escapeRegex(roll)}$`, $options: 'i' },
        })),
      })
        .select({ rollNo: 1, name: 1, branch: 1 })
        .lean();
    }

    let scanners = [];
    if (scannedByIds.length > 0) {
      scanners = await User.find({ _id: { $in: scannedByIds } })
        .select({ _id: 1, name: 1, email: 1 })
        .lean();
    }

    const studentMap = new Map(
      students.map((student) => [
        String(student.rollNo || '').trim().toUpperCase(),
        {
          name: student.name,
          branch: student.branch,
        },
      ])
    );

    const scannerMap = new Map(
      scanners.map((scanner) => [
        String(scanner._id),
        scanner.name ? `${scanner.name} (${scanner.email})` : scanner.email,
      ])
    );

    const header = ['Roll No', 'Name', 'Branch', 'Timestamp', 'Scanned By'];
    const rows = attendanceRows.map((row) => {
      const normalizedRollNo = String(row.rollNo || '').trim().toUpperCase();
      const student = studentMap.get(normalizedRollNo);
      const scannedById = row.scannedBy ? String(row.scannedBy) : '';
      const scannedByLabel = scannedById ? scannerMap.get(scannedById) || scannedById : '-';

      return [
        row.rollNo,
        student?.name || 'Unknown',
        student?.branch || '-',
        row.timestamp ? new Date(row.timestamp).toISOString() : '-',
        scannedByLabel,
      ];
    });

    const csvContent = [header, ...rows].map((line) => line.map((cell) => csvEscape(cell)).join(',')).join('\n');
    const safeDriveName = String(drive.driveName || 'drive')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeDriveName || 'drive'}-${id}-attendance.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to export attendance' });
  }
});

router.get('/:driveId/access', verifyAdminToken, async (req, res) => {
  try {
    const { driveId } = req.params;
    const role = String(req.user?.role || '').toUpperCase();
    const userId = req.user?.userId || req.admin?.adminId;

    if (!mongoose.Types.ObjectId.isValid(driveId)) {
      return res.status(400).json({ message: 'Invalid driveId' });
    }

    const drive = await Drive.findById(driveId).select({ _id: 1, driveName: 1, date: 1, coordinators: 1 }).lean();
    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    if (role === 'TPO') {
      return res.status(200).json({ authorized: true, drive });
    }

    if (role === 'COORDINATOR') {
      if (!userId || !hasCoordinatorAccess(drive, userId)) {
        return res.status(403).json({ message: 'Unauthorized for this drive' });
      }

      return res.status(200).json({ authorized: true, drive });
    }

    return res.status(403).json({ message: 'Access denied for this role' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to verify drive access' });
  }
});

router.patch('/:id/coordinators', verifyAdminToken, verifyTpoRole, async (req, res) => {
  try {
    const { id } = req.params;
    const { coordinators } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid drive id' });
    }

    const coordinatorIds = Array.isArray(coordinators)
      ? [...new Set(coordinators.map((coordinatorId) => String(coordinatorId).trim()).filter(Boolean))]
      : [];

    const invalidCoordinatorId = coordinatorIds.find(
      (coordinatorId) => !mongoose.Types.ObjectId.isValid(coordinatorId)
    );
    if (invalidCoordinatorId) {
      return res.status(400).json({ message: `Invalid coordinator id: ${invalidCoordinatorId}` });
    }

    let validatedCoordinatorIds = [];
    if (coordinatorIds.length > 0) {
      const coordinatorUsers = await User.find({
        _id: { $in: coordinatorIds },
        role: 'COORDINATOR',
      })
        .select({ _id: 1 })
        .lean();

      validatedCoordinatorIds = coordinatorUsers.map((user) => user._id);
      if (validatedCoordinatorIds.length !== coordinatorIds.length) {
        return res
          .status(400)
          .json({ message: 'One or more coordinator IDs are invalid or not COORDINATOR users' });
      }
    }

    const drive = await Drive.findByIdAndUpdate(
      id,
      { coordinators: validatedCoordinatorIds },
      { new: true }
    ).lean();

    if (!drive) {
      return res.status(404).json({ message: 'Drive not found' });
    }

    return res.status(200).json({
      message: 'Drive coordinators updated successfully',
      drive,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update drive coordinators' });
  }
});

const createDrive = async (req, res) => {
  try {
    const { driveName, date, coordinators } = req.body;
    const normalizedDriveName = String(driveName || '').trim();
    const coordinatorIds = Array.isArray(coordinators)
      ? [...new Set(coordinators.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    if (!normalizedDriveName || !date) {
      return res.status(400).json({ message: 'Drive name and date are required' });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const invalidCoordinatorId = coordinatorIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidCoordinatorId) {
      return res.status(400).json({ message: `Invalid coordinator id: ${invalidCoordinatorId}` });
    }

    let validatedCoordinatorIds = [];
    if (coordinatorIds.length > 0) {
      const coordinatorUsers = await User.find({
        _id: { $in: coordinatorIds },
        role: 'COORDINATOR',
      })
        .select({ _id: 1 })
        .lean();

      validatedCoordinatorIds = coordinatorUsers.map((user) => user._id);
      if (validatedCoordinatorIds.length !== coordinatorIds.length) {
        return res
          .status(400)
          .json({ message: 'One or more coordinator IDs are invalid or not COORDINATOR users' });
      }
    }

    const drive = await Drive.create({
      driveName: normalizedDriveName,
      date: parsedDate,
      coordinators: validatedCoordinatorIds,
      createdBy: req.user?.userId || req.admin?.adminId || undefined,
    });

    return res.status(201).json({
      message: 'Drive created successfully',
      drive,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create drive' });
  }
};

router.post('/create', verifyAdminToken, createDrive);
router.post('/', verifyAdminToken, createDrive);

module.exports = router;
