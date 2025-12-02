const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

//  PATHS
const authRoutes = require('./backend/routes/auth');
const userRoutes = require('./backend/routes/users');
const rideRoutes = require('./backend/routes/rides');
const notificationRoutes = require('./backend/routes/notifications');
const connectDB = require('./backend/config/db');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './frontend')));

// Prevent duplicate requests
app.use((req, res, next) => {
  if (req.url === '/favicon.ico') {
    return res.status(204).end();
  }
  next();
});

// ✅ Add this line — serve uploaded photos
// ✅ Serve uploaded photos correctly
app.use('/uploads', express.static(path.join(__dirname, 'backend/uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/signup.html'));
});

app.get('/dashboard-user', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/dashboard-user.html'));
});

app.get('/dashboard-admin', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/dashboard-admin.html'));
});

if (require.main === module) {
const PORT = process.env.PORT || 5008;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
})};