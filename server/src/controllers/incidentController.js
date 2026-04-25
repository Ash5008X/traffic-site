const incidentModel = require('../modules/incidentModel');
const fieldUnitModel = require('../modules/fieldUnitModel');
const { filterAndAnnotate } = require('../utils/zoneUtils');
const userModel = require('../modules/userModel');
const reliefCenterModel = require('../modules/reliefCenterModel');

const incidentController = {
  async create(req, res) {
    try {
      const { haversineKm, classifyZone } = require('../utils/zoneUtils');
      
      // Extract incident details from request body
      // We prioritize the live location sent from the frontend
      const { type, severity, location, description, resources } = req.body;

      if (!location || location.lat == null || location.lng == null) {
        return res.status(400).json({ error: 'Live location (lat, lng) is required to submit a report.' });
      }

      const incidentData = {
        type,
        severity,
        location, // This is the live { lat, lng, address } from the frontend
        description,
        resources: resources || [],
        reportedBy: req.user.id
      };

      // Find nearest Relief Center based on the reported live location
      const centers = await reliefCenterModel.findAll();
      let nearest = null;
      let minDistance = Infinity;

      centers.forEach(center => {
        if (center.location) {
          const dist = haversineKm(center.location.lat, center.location.lng, location.lat, location.lng);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = center;
          }
        }
      });

      if (nearest) {
        incidentData.reliefCenterId = nearest._id;
        incidentData.zone = classifyZone(nearest.location.lat, nearest.location.lng, location.lat, location.lng);
      }

      // Save the incident with the captured live location
      const incident = await incidentModel.create(incidentData);
      
      // Broadcast the new incident via WebSocket for real-time tactical updates
      if (req.app.get('io')) {
        req.app.get('io').emit('incident:new', incident);
      }

      console.log(`[Incident] New report saved with LIVE location: ${location.lat}, ${location.lng}`);
      res.status(201).json(incident);
    } catch (err) {
      console.error('Create incident error:', err);
      res.status(500).json({ error: 'Server error while saving incident' });
    }
  },

  async getAll(req, res) {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.severity) filter.severity = req.query.severity;
      if (req.query.reportedBy === 'me') filter.reportedBy = req.user.id;
      if (req.query.reportedBy && req.query.reportedBy !== 'me') filter.reportedBy = req.query.reportedBy;
      const incidents = await incidentModel.findAll(filter);
      res.json(incidents);
    } catch (err) {
      console.error('Get incidents error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getById(req, res) {
    try {
      const incident = await incidentModel.findById(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      const db = require('../config/db').getDB();
      const teamModel = require('../modules/teamModel');
      
      let incident = await incidentModel.findById(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      // Handle EN ROUTE (Dispatch Team)
      if (status === 'en_route' || status === 'dispatched') {
        const { haversineKm, classifyZone } = require('../utils/zoneUtils');
        
        let zone = incident.zone;
        let reliefCenterId = incident.reliefCenterId;

        // If zone or relief center is missing, try to find nearest one now
        if (!zone || !reliefCenterId) {
          const centers = await reliefCenterModel.findAll();
          let nearest = null;
          let minDistance = Infinity;

          if (incident.location && incident.location.lat != null) {
            centers.forEach(center => {
              if (center.location) {
                const dist = haversineKm(center.location.lat, center.location.lng, incident.location.lat, incident.location.lng);
                if (dist < minDistance) {
                  minDistance = dist;
                  nearest = center;
                }
              }
            });
          }

          if (nearest) {
            reliefCenterId = nearest._id;
            zone = classifyZone(nearest.location.lat, nearest.location.lng, incident.location.lat, incident.location.lng);
            // Save it for later
            await db.collection('incidents').updateOne({ _id: incident._id }, { $set: { zone, reliefCenterId } });
          }
        }

        if (zone && reliefCenterId) {
          const team = await teamModel.findByZone(zone); 
          if (team) {
            await incidentModel.assignTeam(incident._id, team._id, zone, reliefCenterId);
            await fieldUnitModel.assignTeamToIncident(team.members, incident._id);
          }
        }
      }

      // If resolved, notify Admin and Reporter
      if (status === 'resolved') {
        const alertModel = require('../modules/alertModel');
        
        // 1. Notify Admin (if resolved by field unit)
        if (req.user.role !== 'relief_admin' && incident.reliefCenterId) {
          const adminAlert = await alertModel.create({
            type: 'all_clear',
            message: `[Field Unit] Incident has been resolved by field team (ID: ${incident.incidentId})`,
            severity: 'success',
            broadcastBy: req.user.id,
            targetUser: incident.reliefCenterId.toString(),
            incidentId: incident._id.toString()
          });
          if (req.app.get('io')) {
            req.app.get('io').to(`user:${incident.reliefCenterId}`).emit('alert:personal', adminAlert);
          }
        }

        // 2. Notify Reporter
        if (incident.reportedBy) {
          const userAlert = await alertModel.create({
            type: 'all_clear',
            message: `Your request has been resolved (ID: ${incident.incidentId})`,
            severity: 'success',
            broadcastBy: req.user.id,
            targetUser: incident.reportedBy.toString(),
            incidentId: incident._id.toString()
          });
          if (req.app.get('io')) {
            req.app.get('io').to(`user:${incident.reportedBy}`).emit('alert:personal', userAlert);
          }
        }

        // Clear team/unit assignments
        if (incident.assignedTeamId) {
          const team = await teamModel.findById(incident.assignedTeamId);
          if (team) {
            await fieldUnitModel.clearTeamIncident(team.members);
          }
        } else if (incident.assignedUnit) {
          await fieldUnitModel.clearIncident(incident.assignedUnit.toString());
        }
      }

      const updated = await incidentModel.updateStatus(req.params.id, status);

      if (req.app.get('io')) {
        req.app.get('io').emit('incident:updated', updated);
      }
      res.json(updated);
    } catch (err) {
      console.error('Update status error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async accept(req, res) {
    try {
      const { unitId } = req.body;
      const incident = await incidentModel.assignUnit(req.params.id, unitId, req.body.reliefCenterId);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      await fieldUnitModel.assignToIncident(unitId, req.params.id);

      if (req.app.get('io')) {
        req.app.get('io').emit('incident:updated', incident);
        req.app.get('io').emit('unit:statusChanged', { unitId, status: 'en_route' });
      }
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async dismiss(req, res) {
    try {
      const incident = await incidentModel.dismiss(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });
      if (req.app.get('io')) {
        req.app.get('io').emit('incident:updated', incident);
      }
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async addChat(req, res) {
    try {
      const { message, senderRole, senderId } = req.body;
      const incident = await incidentModel.addChat(req.params.id, {
        message,
        senderRole: senderRole || req.user.role,
        senderId: senderId || req.user.id
      });
      if (!incident) return res.status(404).json({ error: 'Incident not found' });
      if (req.app.get('io')) {
        req.app.get('io').to(`incident:${req.params.id}`).emit('chat:message', {
          incidentId: req.params.id,
          message,
          senderRole: senderRole || req.user.role,
          senderId: senderId || req.user.id,
          senderName: req.user.name,
          timestamp: new Date()
        });
      }
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async addAction(req, res) {
    try {
      const incident = await incidentModel.addAction(req.params.id, {
        ...req.body,
        performedBy: req.user.id
      });
      if (!incident) return res.status(404).json({ error: 'Incident not found' });
      if (req.app.get('io')) {
        req.app.get('io').emit('incident:updated', incident);
      }
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async backupRequest(req, res) {
    try {
      const incident = await incidentModel.findById(req.params.id);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      await incidentModel.addAction(req.params.id, {
        type: 'backup_request',
        performedBy: req.user.id,
        details: req.body.details || 'Backup requested'
      });

      // Notify Relief Admin
      if (incident.reliefCenterId) {
        const alertModel = require('../modules/alertModel');
        const alert = await alertModel.create({
          type: 'hazard',
          message: `[Field Unit] Backup required at the site (ID: ${incident.incidentId})`,
          severity: 'high',
          broadcastBy: req.user.id,
          targetUser: incident.reliefCenterId.toString(),
          incidentId: incident._id.toString()
        });
        if (req.app.get('io')) {
          req.app.get('io').to(`user:${incident.reliefCenterId}`).emit('alert:personal', alert);
        }
      }

      if (req.app.get('io')) {
        const updated = await incidentModel.findById(req.params.id);
        req.app.get('io').emit('incident:updated', updated);
      }
      res.json({ success: true, message: 'Backup request sent' });
    } catch (err) {
      console.error('Backup request error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async nearby(req, res) {
    try {
      const { lat, lng, radius } = req.query;
      const incidents = await incidentModel.findNearby(
        parseFloat(lat), parseFloat(lng), parseFloat(radius) || 10
      );
      res.json(incidents);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await incidentModel.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getHeatmap(req, res) {
    try {
      const data = await incidentModel.getHeatmap();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async requestAssignment(req, res) {
    try {
      const incident = await incidentModel.addAction(req.params.id, {
        type: 'assignment_request',
        performedBy: req.user.id,
        details: 'Field unit requested assignment'
      });
      if (req.app.get('io')) {
        req.app.get('io').emit('incident:updated', incident);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  /**
   * Dashboard stats scoped to a 5km radius around the admin's saved location.
   * Returns: activeCount, resolvedToday, avgResponseTimeMinutes, nearbyIncidents, zoneBreakdown
   */
  async dashboardStats(req, res) {
    try {
      let adminUser;
      if (req.user.role === 'relief_admin') {
        adminUser = await reliefCenterModel.findById(req.user.id);
      } else {
        adminUser = await userModel.findById(req.user.id);
      }

      if (!adminUser || !adminUser.location || adminUser.location.lat === undefined) {
        return res.status(400).json({ 
          error: 'Admin location not set', 
          needsLocation: true,
          centerLat: 0, 
          centerLng: 0 
        });
      }

      const centerLat = adminUser.location.lat;
      const centerLng = adminUser.location.lng;
      const RADIUS_KM = 15;

      // Fetch all non-dismissed incidents
      const allActive = await incidentModel.findAll({ });

      // Filter to 5km radius and annotate with zone
      const nearby = filterAndAnnotate(allActive, centerLat, centerLng, RADIUS_KM);

      const activeIncidents = nearby.filter(inc => !['resolved', 'dismissed'].includes(inc.status));

      // Resolved TODAY within 5km
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const resolvedToday = nearby.filter(inc =>
        inc.status === 'resolved' && inc.resolvedAt && new Date(inc.resolvedAt) >= todayStart
      );

      // Average response time (createdAt → resolvedAt) in minutes for resolved-today
      let avgResponseMinutes = null;
      if (resolvedToday.length > 0) {
        const totalMs = resolvedToday.reduce((sum, inc) => {
          return sum + (new Date(inc.resolvedAt) - new Date(inc.createdAt));
        }, 0);
        avgResponseMinutes = Math.round(totalMs / resolvedToday.length / 60000);
      }

      // Zone breakdown (A-F) for active nearby incidents
      const zoneBreakdown = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
      for (const inc of activeIncidents) {
        if (inc.zone && zoneBreakdown[inc.zone] !== undefined) {
          zoneBreakdown[inc.zone]++;
        }
      }

      const fieldUnits = await fieldUnitModel.findAll();

      res.json({
        centerLat,
        centerLng,
        radiusKm: RADIUS_KM,
        activeCount: activeIncidents.length,
        resolvedTodayCount: resolvedToday.length,
        avgResponseMinutes,
        activeIncidents,
        zoneBreakdown,
        fieldUnits
      });
    } catch (err) {
      console.error('Dashboard stats error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = incidentController;
