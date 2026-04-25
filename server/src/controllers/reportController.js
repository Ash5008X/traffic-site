const incidentModel = require('../modules/incidentModel');
const fieldUnitModel = require('../modules/fieldUnitModel');

const reportController = {
  async getReports(req, res) {
    try {
      const filter = {};
      if (req.query.from) filter.from = req.query.from;
      if (req.query.to) filter.to = req.query.to;
      if (req.query.severity) filter.severity = req.query.severity;
      if (req.query.status) filter.status = req.query.status;
      const incidents = await incidentModel.findAll(filter);
      res.json(incidents);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getTeamReport(req, res) {
    try {
      const units = await fieldUnitModel.findAll();
      const report = units.map(u => ({
        unitId: u.unitId,
        status: u.status,
        missionsToday: u.missionsToday,
        currentIncident: u.currentIncident
      }));
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getTimeline(req, res) {
    try {
      const incidents = await incidentModel.findAll({});
      // Group by hour for timeline
      const timeline = {};
      incidents.forEach(inc => {
        const hour = new Date(inc.createdAt).getHours();
        const key = `${hour}:00`;
        if (!timeline[key]) timeline[key] = { time: key, count: 0, critical: 0, high: 0, medium: 0, low: 0 };
        timeline[key].count++;
        if (inc.severity) timeline[key][inc.severity]++;
      });
      res.json(Object.values(timeline).sort((a, b) => parseInt(a.time) - parseInt(b.time)));
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async exportPdf(req, res) {
    try {
      const incidents = await incidentModel.findAll(req.query);
      // Generate simple text-based report
      let content = 'NEXUSTRAFFIC INCIDENT REPORT\n';
      content += `Generated: ${new Date().toISOString()}\n\n`;
      incidents.forEach(inc => {
        content += `${inc.incidentId} | ${inc.type} | ${inc.severity} | ${inc.status} | ${inc.createdAt}\n`;
        content += `  Location: ${inc.location?.address || 'N/A'}\n`;
        content += `  Description: ${inc.description || 'N/A'}\n\n`;
      });
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename=nexustraffic-report.txt');
      res.send(content);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async exportCsv(req, res) {
    try {
      const incidents = await incidentModel.findAll(req.query);
      let csv = 'Incident ID,Type,Severity,Status,Location,Description,Created At,Resolved At\n';
      incidents.forEach(inc => {
        csv += `"${inc.incidentId}","${inc.type}","${inc.severity}","${inc.status}","${inc.location?.address || ''}","${(inc.description || '').replace(/"/g, '""')}","${inc.createdAt}","${inc.resolvedAt || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=nexustraffic-report.csv');
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = reportController;
