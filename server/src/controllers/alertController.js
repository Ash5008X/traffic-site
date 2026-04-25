const alertModel = require('../modules/alertModel');
const incidentModel = require('../modules/incidentModel');
const userModel = require('../modules/userModel');

const alertController = {
  async create(req, res) {
    try {
      let usersReached = req.body.usersReached;
      if (usersReached === undefined || usersReached === null) {
        usersReached = await userModel.countUsers();
      }

      const alert = await alertModel.create({
        ...req.body,
        usersReached,
        broadcastBy: req.user.id
      });
      if (req.app.get('io')) {
        req.app.get('io').emit('alert:broadcast', alert);
      }
      res.status(201).json(alert);
    } catch (err) {
      console.error('Create alert error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getActive(req, res) {
    try {
      const alerts = await alertModel.findActive();
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getHistory(req, res) {
    try {
      const alerts = await alertModel.findHistory();
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Returns alerts targeted to the currently logged-in user
  async getMyAlerts(req, res) {
    try {
      const alerts = await alertModel.findByUser(req.user.id);
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  /**
   * Relief admin sends a message that appears as a notification in the
   * reporting user's alerts feed. Also stores the chat message on the incident.
   */
  async sendIncidentNotification(req, res) {
    try {
      const { incidentId, message, skipChat } = req.body;
      if (!incidentId || !message) {
        return res.status(400).json({ error: 'incidentId and message are required' });
      }

      const incident = await incidentModel.findById(incidentId);
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      const targetUserId = incident.reportedBy?.toString();

      // 1. Store chat message on the incident (optional)
      if (!skipChat) {
        await incidentModel.addChat(incidentId, {
          message,
          senderRole: 'relief_admin',
          senderId: req.user.id
        });
      }

      // 2. Create a targeted alert notification for the reporter
      const alert = await alertModel.create({
        type: 'relief_center_message',
        message: `[Relief Center] ${message}`,
        severity: 'medium',
        broadcastBy: req.user.id,
        targetUser: targetUserId,
        incidentId
      });

      // 3. Emit socket events
      if (req.app.get('io')) {
        req.app.get('io').to(`user:${targetUserId}`).emit('alert:personal', alert);
        
        if (!skipChat) {
          req.app.get('io').to(`incident:${incidentId}`).emit('chat:message', {
            incidentId,
            message,
            senderRole: 'relief_admin',
            timestamp: new Date()
          });
        }
      }

      res.status(201).json({ success: true, alert });
    } catch (err) {
      console.error('Send incident notification error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async cancel(req, res) {
    try {
      const alert = await alertModel.cancel(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });
      if (req.app.get('io')) {
        req.app.get('io').emit('alert:cancelled', alert);
      }
      res.json(alert);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async update(req, res) {
    try {
      const alert = await alertModel.update(req.params.id, req.body);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });
      res.json(alert);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = alertController;
