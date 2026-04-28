const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../modules/userModel');
const fieldUnitModel = require('../modules/fieldUnitModel');
const reliefCenterModel = require('../modules/reliefCenterModel');
const memberModel = require('../modules/memberModel');

/**
 * Searches all three collections for a user by email.
 * Priority: users → relief_centers → members
 * Returns { user, source } or null if not found.
 */
async function findUserAcrossCollections(email) {
  // 1. Check relief_centers collection
  const reliefAdmin = await reliefCenterModel.findByEmail(email);
  if (reliefAdmin) return { user: reliefAdmin, source: 'relief_centers' };

  // 2. Check users collection
  const user = await userModel.findByEmail(email);
  if (user) return { user, source: 'users' };

  // 3. Check members collection
  const member = await memberModel.findByEmail(email);
  if (member) return { user: member, source: 'members' };

  return null;
}

/**
 * Finds a user by ID across all three collections.
 * Uses the role from the JWT to pick the right collection first,
 * then falls back to searching all collections.
 */
async function findUserByIdAcrossCollections(id, role) {
  // Try the expected collection first based on role
  if (role === 'user') {
    const u = await userModel.findById(id);
    if (u) return u;
  } else if (role === 'relief_admin') {
    const u = await reliefCenterModel.findById(id);
    if (u) return u;
  } else if (role === 'field_unit') {
    const u = await memberModel.findById(id);
    if (u) return u;
  }

  // Fallback: search all collections
  const user = await userModel.findById(id);
  if (user) return user;

  const reliefAdmin = await reliefCenterModel.findById(id);
  if (reliefAdmin) return reliefAdmin;

  const member = await memberModel.findById(id);
  if (member) return member;

  return null;
}

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

      // Check ALL collections for duplicate email
      const existing = await findUserAcrossCollections(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      let user;

      // Import distance utility for proximity checks
      const { haversineKm } = require('../utils/zoneUtils');
      const { getDB } = require('../config/db');
      const db = getDB();

      // Save to the correct collection
      if (role === 'user') {
        user = await userModel.create({
          name,
          email,
          password: hashedPassword,
          role,
          location: { lat: 19.076, lng: 72.8777 }
        });
      } else if (role === 'relief_admin') {
        user = await reliefCenterModel.create({
          name,
          email,
          password: hashedPassword,
          role,
          location: null,
          unassignedMembers: [] // Initialize unassigned members list
        });
      } else if (role === 'field_unit') {
        const registrationLocation = req.body.location || { lat: 0, lng: 0 };
        
        user = await memberModel.create({
          name,
          email,
          password: hashedPassword,
          role,
          location: registrationLocation
        });

        // Auto-create field unit operational record
        await fieldUnitModel.create({
          agentId: user._id.toString(),
          unitId: `UNIT-SENTINEL-${Math.floor(Math.random() * 100)}`,
          location: registrationLocation
        });

        // --- Proximity Check: Automatic Regional Assignment ---
        // Find all relief admins and assign this member to those within 5km radius
        if (registrationLocation.lat !== 0) {
          const admins = await db.collection('relief_centers').find({ role: 'relief_admin' }).toArray();
          
          for (const admin of admins) {
            if (admin.location && admin.location.lat != null) {
              const dist = haversineKm(
                registrationLocation.lat, registrationLocation.lng,
                admin.location.lat, admin.location.lng
              );

              if (dist <= 5) {
                // Add to admin's localized unassigned pool
                await db.collection('relief_centers').updateOne(
                  { _id: admin._id },
                  { $addToSet: { unassignedMembers: user._id } }
                );
                console.log(`[Auto-Assign] Member ${user.name} added to Admin ${admin.name} (Dist: ${dist.toFixed(2)}km)`);
              }
            }
          }
        }
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

      // Search all 3 collections for the email
      const result = await findUserAcrossCollections(email);
      if (!result) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.user;

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
      const user = await findUserByIdAcrossCollections(req.user.id, req.user.role);
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
      const { role, id } = req.user;
      let user;
      if (role === 'user') {
        user = await userModel.updatePreferences(id, req.body);
      } else {
        // Fallback or specific implementation for other roles if needed
        // For now, let's just use userModel or return error if not supported
        user = await userModel.updatePreferences(id, req.body);
      }
      res.json(user);
    } catch (err) {
      console.error('Update preferences error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateLocation(req, res) {
    try {
      const { role, id } = req.user;
      const { location } = req.body;

      if (!location || location.lat === undefined || location.lng === undefined) {
        return res.status(400).json({ error: 'Valid location {lat, lng} is required' });
      }

      let result;
      if (role === 'user') {
        result = await userModel.updateLocation(id, location);
      } else if (role === 'relief_admin') {
        result = await reliefCenterModel.updateLocation(id, location);
      } else if (role === 'field_unit') {
        result = await memberModel.updateLocation(id, location);
        
        // Real-time broadcast for Field Unit movement
        // This allows the admin dashboard to move the unit's marker in real-time
        if (req.app.get('io')) {
          req.app.get('io').emit('field_unit:location_updated', {
            memberId: id,
            location
          });
        }
      }

      res.json({ success: true, role, location });
    } catch (err) {
      console.error('Update location error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getFieldUnits(req, res) {
    try {
      const { getDB } = require('../config/db');
      const db = getDB();
      
      // Fetch all members with the field_unit role from both collections
      const membersInMembers = await db.collection('members')
        .find({ role: 'field_unit' })
        .project({ name: 1, email: 1, location: 1, role: 1 })
        .toArray();

      const membersInUsers = await db.collection('users')
        .find({ role: 'field_unit' })
        .project({ name: 1, email: 1, location: 1, role: 1 })
        .toArray();
        
      res.json([...membersInMembers, ...membersInUsers]);
    } catch (err) {
      console.error('getFieldUnits error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getUserCount(req, res) {
    try {
      const count = await userModel.countUsers();
      res.json({ count });
    } catch (err) {
      console.error('getUserCount error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = authController;
