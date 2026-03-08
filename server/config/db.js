const mongoose = require('mongoose');

const DB_NAME = process.env.DB_NAME || 'placementAttendance';
const DEFAULT_MONGO_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || DEFAULT_MONGO_URI;

  await mongoose.connect(mongoURI);
  console.log(`MongoDB connected (${DB_NAME})`);
};

module.exports = connectDB;
