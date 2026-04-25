const fieldUnitModel = require('../modules/fieldUnitModel');
const incidentModel = require('../modules/incidentModel');

const fieldUnitController = {
  async getById(req, res) {
    try {
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) {
        // Try by agent ID
        unit = await fieldUnitModel.findByAgentId(req.params.id);
      }
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });
      res.json(unit);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) unit = await fieldUnitModel.findByAgentId(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });

      const updated = await fieldUnitModel.updateStatus(unit._id.toString(), status);
      if (req.app.get('io')) {
        req.app.get('io').emit('unit:statusChanged', { unitId: unit.unitId, status });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async markArrived(req, res) {
    try {
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) unit = await fieldUnitModel.findByAgentId(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });
      if (!unit.currentIncident) return res.status(400).json({ error: 'No current incident' });

      const updated = await fieldUnitModel.markArrived(unit._id.toString(), unit.currentIncident.toString());
      await incidentModel.updateStatus(unit.currentIncident.toString(), 'on_site');

      if (req.app.get('io')) {
        req.app.get('io').emit('unit:statusChanged', { unitId: unit.unitId, status: 'on_site' });
        const incident = await incidentModel.findById(unit.currentIncident.toString());
        req.app.get('io').emit('incident:updated', incident);
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateLocation(req, res) {
    try {
      const { lat, lng } = req.body;
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) unit = await fieldUnitModel.findByAgentId(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });

      const updated = await fieldUnitModel.updateLocation(unit._id.toString(), lat, lng);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getAssigned(req, res) {
    try {
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) unit = await fieldUnitModel.findByAgentId(req.params.id);
      if (!unit || !unit.currentIncident) return res.json(null);

      const incident = await incidentModel.findById(unit.currentIncident.toString());
      res.json(incident);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getUpdates(req, res) {
    try {
      let unit = await fieldUnitModel.findById(req.params.id);
      if (!unit) unit = await fieldUnitModel.findByAgentId(req.params.id);
      if (!unit) return res.json([]);

      const updates = await fieldUnitModel.getUpdates(unit._id.toString());
      res.json(updates);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getProfileStats(req, res) {
    try {
      const { getDB } = require('../config/db');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const agentId = new ObjectId(req.user.id);
      
      const unit = await db.collection('field_units').findOne({ agentId });
      if (!unit) return res.status(404).json({ error: 'Field unit record not found' });

      const team = await db.collection('teams').findOne({ members: agentId });
      
      const clearedIncidents = await db.collection('incidents').countDocuments({ 
        assignedUnit: unit._id,
        status: 'resolved'
      });

      const weeklyStats = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const count = await db.collection('incidents').countDocuments({
          assignedUnit: unit._id,
          createdAt: { $gte: date, $lt: nextDate }
        });
        weeklyStats.push({ day: days[date.getDay()], count });
      }

      res.json({
        unitId: unit.unitId,
        clearedCount: clearedIncidents,
        teamName: team ? team.name : 'N/A',
        zone: team ? team.zone : 'N/A',
        weeklyStats
      });
    } catch (err) {
      console.error('Profile stats error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getDashboardStats(req, res) {
    try {
      const { getDB } = require('../config/db');
      const { ObjectId } = require('mongodb');
      const { haversineKm, filterAndAnnotate } = require('../utils/zoneUtils');
      const db = getDB();
      const agentId = new ObjectId(req.user.id);

      const unit = await db.collection('field_units').findOne({ agentId });
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });

      const team = await db.collection('teams').findOne({ members: agentId });

      // Get current mission
      let currentMission = null;
      if (unit.currentIncident) {
        currentMission = await db.collection('incidents').findOne({ _id: unit.currentIncident });
      } else if (team) {
        // Find the most recent active assignment for the team
        currentMission = await db.collection('incidents').findOne({ 
          assignedTeamId: team._id,
          status: { $nin: ['resolved', 'dismissed'] }
        }, { sort: { createdAt: -1 } });
      }

      if (currentMission && currentMission.reportedBy) {
        const reporterId = new ObjectId(currentMission.reportedBy);
        // Search across all collections for the reporter
        let reporter = await db.collection('users').findOne({ _id: reporterId }, { projection: { location: 1, email: 1, name: 1 } });
        if (!reporter) {
          reporter = await db.collection('members').findOne({ _id: reporterId }, { projection: { location: 1, email: 1, name: 1 } });
        }
        if (!reporter) {
          reporter = await db.collection('relief_centers').findOne({ _id: reporterId }, { projection: { location: 1, email: 1, name: 1 } });
        }
        
        if (reporter) {
          currentMission.reporter = reporter;
        }
      }

      // Stats today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const resolvedToday = await db.collection('incidents').find({
        assignedTeamId: team ? team._id : null,
        status: 'resolved',
        resolvedAt: { $gte: todayStart }
      }).toArray();

      let totalDistance = 0;
      let totalResponseTimeMs = 0;

      for (const inc of resolvedToday) {
        // Response time
        if (inc.assignedAt && inc.resolvedAt) {
          totalResponseTimeMs += (new Date(inc.resolvedAt) - new Date(inc.assignedAt));
        }

        // Distance: 2 * dist(reliefCenter, incident)
        if (inc.reliefCenterId && inc.location) {
          // Look in relief_centers collection first
          let center = await db.collection('relief_centers').findOne({ _id: inc.reliefCenterId });
          if (!center) {
            center = await db.collection('users').findOne({ _id: inc.reliefCenterId });
          }
          if (center && center.location) {
            const dist = haversineKm(center.location.lat, center.location.lng, inc.location.lat, inc.location.lng);
            totalDistance += (dist * 2);
          }
        }
      }

      const avgResponseTimeMin = resolvedToday.length > 0 
        ? Math.round(totalResponseTimeMs / resolvedToday.length / 60000) 
        : 0;

      // Nearby Heatmap (centered on relief admin location)
      const adminUser = team ? await db.collection('relief_centers').findOne({ _id: team.adminId }) : null;
      const centerLat = adminUser && adminUser.location ? adminUser.location.lat : (unit.location ? unit.location.lat : 0);
      const centerLng = adminUser && adminUser.location ? adminUser.location.lng : (unit.location ? unit.location.lng : 0);

      const RADIUS_KM = 15;
      const allActive = await db.collection('incidents').find({ 
        status: { $nin: ['resolved', 'dismissed'] } 
      }).toArray();

      const nearby = filterAndAnnotate(allActive, centerLat, centerLng, RADIUS_KM);
      
      const zoneBreakdown = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
      for (const inc of nearby) {
        if (inc.zone && zoneBreakdown[inc.zone] !== undefined) {
          zoneBreakdown[inc.zone]++;
        }
      }

      const assignedToday = await db.collection('incidents').countDocuments({
        assignedTeamId: team ? team._id : null,
        createdAt: { $gte: todayStart }
      });

      res.json({
        currentMission,
        statsToday: {
          assigned: assignedToday,
          completed: resolvedToday.length,
          avgResponseTime: avgResponseTimeMin,
          distance: parseFloat(totalDistance.toFixed(1))
        },
        heatmap: {
          centerLat,
          centerLng,
          zoneBreakdown
        },
        nearbyIncidents: nearby
      });

    } catch (err) {
      console.error('Dashboard stats error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async markArrivedMe(req, res) {
    try {
      const { getDB } = require('../config/db');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const agentId = new ObjectId(req.user.id);
      
      const unit = await db.collection('field_units').findOne({ agentId });
      if (!unit) return res.status(404).json({ error: 'Field unit not found' });

      const incidentId = req.body.incidentId || unit.currentIncident;
      if (!incidentId) return res.status(400).json({ error: 'No current incident' });

      // Update unit status
      await db.collection('field_units').updateOne(
        { _id: unit._id },
        { $set: { status: 'on_site' } }
      );

      // Update incident status
      await db.collection('incidents').updateOne(
        { _id: new ObjectId(incidentId) },
        { $set: { status: 'on_site' } }
      );

      // Add timeline action
      await db.collection('incidents').updateOne(
        { _id: new ObjectId(incidentId) },
        {
          $push: {
            actions: {
              type: 'status_change',
              status: 'on_site',
              timestamp: new Date(),
              performedBy: req.user.id,
              details: 'Field unit arrived on site'
            }
          }
        }
      );

      // Notify Relief Admin
      const incident = await db.collection('incidents').findOne({ _id: new ObjectId(incidentId) });
      if (incident && incident.reliefCenterId) {
        const alertModel = require('../modules/alertModel');
        const alert = await alertModel.create({
          type: 'field_report',
          message: `[Field Unit] Team has reached the designated site (ID: ${incident.incidentId})`,
          severity: 'info',
          broadcastBy: req.user.id,
          targetUser: incident.reliefCenterId.toString(),
          incidentId: incident._id.toString()
        });
        if (req.app.get('io')) {
          req.app.get('io').to(`user:${incident.reliefCenterId}`).emit('alert:personal', alert);
        }
      }

      if (req.app.get('io')) {
        req.app.get('io').emit('unit:statusChanged', { unitId: unit.unitId, status: 'on_site' });
        const updatedIncident = await db.collection('incidents').findOne({ _id: new ObjectId(incidentId) });
        req.app.get('io').emit('incident:updated', updatedIncident);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getIncidentsPageData(req, res) {
    try {
      const { getDB } = require('../config/db');
      const { ObjectId } = require('mongodb');
      const db = getDB();
      const agentId = new ObjectId(req.user.id);

      const team = await db.collection('teams').findOne({ members: agentId });
      if (!team) return res.status(404).json({ error: 'Team not found' });

      // 1. Active Assignments (Assigned to this team, not resolved)
      const activeAssignments = await db.collection('incidents').find({
        assignedTeamId: team._id,
        status: { $ne: 'resolved' }
      }).toArray();

      // 2. Proximal Telemetry (Neighbors)
      const neighborsMap = {
        'A': ['B', 'F'],
        'B': ['A', 'C'],
        'C': ['B', 'D'],
        'D': ['C', 'E'],
        'E': ['D', 'F'],
        'F': ['E', 'A']
      };
      const neighbors = neighborsMap[team.zone] || [];
      const proximalReports = [];
      
      for (const nZone of neighbors) {
        const reports = await db.collection('incidents')
          .find({ zone: nZone, status: { $ne: 'resolved' } })
          .sort({ createdAt: -1 })
          .limit(2)
          .toArray();
        proximalReports.push(...reports);
      }

      // 3. History Log (Last 5 reports ever assigned to this team)
      const historyLog = await db.collection('incidents')
        .find({ assignedTeamId: team._id })
        .sort({ updatedAt: -1 })
        .limit(5)
        .toArray();

      // 4. Stats Today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const assignedCount = await db.collection('incidents').countDocuments({
        assignedTeamId: team._id,
        status: { $ne: 'resolved' }
      });
      const completedCount = await db.collection('incidents').countDocuments({
        assignedTeamId: team._id,
        status: 'resolved',
        resolvedAt: { $gte: todayStart }
      });

      // 5. Today's Alerts (All incidents today in this admin's region, for filtering)
      const todayAlerts = await db.collection('incidents')
        .find({ 
          reliefCenterId: team.adminId,
          createdAt: { $gte: todayStart }
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        activeAssignments,
        proximalTelemetry: proximalReports,
        historyLog,
        stats: {
          assigned: assignedCount,
          completedToday: completedCount
        },
        todayAlerts
      });
    } catch (err) {
      console.error('Incidents page data error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = fieldUnitController;
