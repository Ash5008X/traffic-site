const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const alertRoutes = require('./routes/alertRoutes');
const reportRoutes = require('./routes/reportRoutes');
const fieldUnitRoutes = require('./routes/fieldUnitRoutes');
const teamRoutes = require('./routes/teamRoutes');
const memberRoutes = require('./routes/memberRoutes');
const reliefCenterModel = require('./modules/reliefCenterModel');
const auth = require('./middleware/auth');

const app = express();
const clientPath = path.join(__dirname, '..', '..', 'client');

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/field-units', fieldUnitRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/members', memberRoutes);

// Relief center routes
app.get('/api/relief-centers', auth, async (req, res) => {
  try {
    const centers = await reliefCenterModel.findAll();
    res.json(centers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/relief-centers/:id/status', auth, async (req, res) => {
  try {
    const center = await reliefCenterModel.updateStatus(req.params.id, req.body.status);
    if (!center) return res.status(404).json({ error: 'Relief center not found' });
    res.json(center);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User preferences
app.patch('/api/users/preferences', auth, async (req, res) => {
  try {
    const userModel = require('./modules/userModel');
    const user = await userModel.updatePreferences(req.user.id, req.body);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user default location (used for admin's relief center location)
app.patch('/api/users/location', auth, async (req, res) => {
  try {
    const userModel = require('./modules/userModel');
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    await userModel.updateLocation(req.user.id, { lat: parseFloat(lat), lng: parseFloat(lng) });
    res.json({ success: true, location: { lat: parseFloat(lat), lng: parseFloat(lng) } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// FEATURE: Real-time user location update endpoint
app.patch('/api/users/update-location', auth, async (req, res) => {
  try {
    const userModel = require('./modules/userModel');
    const { location } = req.body;
    if (!location || location.lat == null || location.lng == null) {
      return res.status(400).json({ error: 'Location object with lat and lng required' });
    }
    await userModel.updateLocation(req.user.id, location);
    res.json({ success: true, location });
  } catch (err) {
    console.error('Update location error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

module.exports=app;
