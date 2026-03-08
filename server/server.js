const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const driveRoutes = require('./routes/driveRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const tpoRoutes = require('./routes/tpoRoutes');
const coordinatorRoutes = require('./routes/coordinatorRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/tpo', tpoRoutes);
app.use('/coordinators', coordinatorRoutes);
app.use('/student', studentRoutes);
app.use('/drive', driveRoutes);
app.use('/attendance', attendanceRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Attendance API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
