const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const fieldUnitModel = require('../models/fieldUnitModel');

const authController = {
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      const validRoles = ['user', 'relief_admin', 'field_unit'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const existing = await userModel.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await userModel.create({
        name,
        email,
        password: hashedPassword,
        role,
        location: { lat: 19.076, lng: 72.8777 }
      });

      // Auto-create field unit record if role is field_unit
      if (role === 'field_unit') {
        await fieldUnitModel.create({
          agentId: user._id.toString(),
          unitId: `UNIT-SENTINEL-${Math.floor(Math.random() * 100)}`,
          location: { lat: 19.076, lng: 72.8777 }
        });
      }

      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async login(req, res) {
    try {
      const { email, password, role } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await userModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // If role is provided, verify it matches
      if (role && user.role !== role) {
        return res.status(403).json({ error: `Account is registered as ${user.role}, not ${role}` });
      }

      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async me(req, res) {
    try {
      const user = await userModel.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      console.error('Me error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updatePreferences(req, res) {
    try {
      const user = await userModel.updatePreferences(req.user.id, req.body);
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = authController;
