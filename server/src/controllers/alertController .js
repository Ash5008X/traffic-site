const alertModel = require('../models/alertModel');

const alertController = {
  async create(req, res) {
    try {
      const alert = await alertModel.create({
        ...req.body,
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
