const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  rollNo: {
    type: String,
    required: true,
    trim: true,
  },
  driveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Drive',
    required: true,
  },
  scannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

attendanceSchema.index({ rollNo: 1, driveId: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
