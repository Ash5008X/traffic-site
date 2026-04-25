const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'incidents';

function generateIncidentId() {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `ACC-${num}`;
}

const incidentModel = {
  async create(data) {
    const db = getDB();
    const doc = {
      incidentId: generateIncidentId(),
      type: data.type,
      severity: data.severity,
      location: data.location || { lat: 0, lng: 0, address: '' },
      description: data.description || '',
      status: 'pending',
      reportedBy: new ObjectId(data.reportedBy),
      assignedUnit: null,
      reliefCenter: null,
      resources: data.resources || [],
      actions: [],
      chat: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findAll(filter = {}) {
    const db = getDB();
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.severity) query.severity = filter.severity;
    if (filter.reportedBy) query.reportedBy = new ObjectId(filter.reportedBy);
    if (filter.assignedUnit) query.assignedUnit = new ObjectId(filter.assignedUnit);
    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = new Date(filter.from);
      if (filter.to) query.createdAt.$lte = new Date(filter.to);
    }
    return db.collection(COLLECTION).find(query).sort({ createdAt: -1 }).toArray();
  },

  async findById(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  },

  async findByIncidentId(incidentId) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ incidentId });
  },

  async updateStatus(id, status, extras = {}) {
    const db = getDB();
    const update = { $set: { status, updatedAt: new Date(), ...extras } };
    if (status === 'resolved') update.$set.resolvedAt = new Date();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      update,
      { returnDocument: 'after' }
    );
  },

  async assignTeam(id, teamId, zone, reliefCenterId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          assignedTeamId: new ObjectId(teamId),
          zone: zone,
          reliefCenter: reliefCenterId ? new ObjectId(reliefCenterId) : null,
          status: 'dispatched',
          assignedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
  },

  async clearAssignment(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { assignedUnit: null, assignedTeamId: null, status: 'pending', updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  },

  async addChat(id, message) {
    const db = getDB();
    const chatEntry = {
      ...message,
      timestamp: new Date()
    };
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $push: { chat: chatEntry }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  },

  async addAction(id, action) {
    const db = getDB();
    const actionEntry = {
      ...action,
      timestamp: new Date()
    };
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $push: { actions: actionEntry }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  },

  async findNearby(lat, lng, radiusKm = 10) {
    const db = getDB();
    const allIncidents = await db.collection(COLLECTION)
      .find({ status: { $nin: ['resolved', 'dismissed'] } })
      .toArray();
    return allIncidents.filter(inc => {
      if (!inc.location || !inc.location.lat) return false;
      const dist = haversine(lat, lng, inc.location.lat, inc.location.lng);
      return dist <= radiusKm;
    });
  },

  async getStats() {
    const db = getDB();
    const total = await db.collection(COLLECTION).countDocuments();
    const active = await db.collection(COLLECTION).countDocuments({ status: { $nin: ['resolved', 'dismissed'] } });
    const critical = await db.collection(COLLECTION).countDocuments({ severity: 'critical', status: { $nin: ['resolved', 'dismissed'] } });
    const resolved = await db.collection(COLLECTION).countDocuments({ status: 'resolved' });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = await db.collection(COLLECTION).countDocuments({ createdAt: { $gte: todayStart } });
    return { total, active, critical, resolved, today };
  },

  async getHeatmap() {
    const db = getDB();
    const incidents = await db.collection(COLLECTION)
      .find({ status: { $nin: ['resolved', 'dismissed'] } })
      .project({ location: 1, severity: 1, type: 1 })
      .toArray();
    // Generate grid-based heatmap data
    const grid = {};
    incidents.forEach(inc => {
      if (!inc.location) return;
      const key = `${Math.round(inc.location.lat * 10) / 10},${Math.round(inc.location.lng * 10) / 10}`;
      if (!grid[key]) grid[key] = { lat: inc.location.lat, lng: inc.location.lng, count: 0, severity: 'low' };
      grid[key].count++;
      const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
      if (severityRank[inc.severity] > severityRank[grid[key].severity]) {
        grid[key].severity = inc.severity;
      }
    });
    return Object.values(grid);
  },

  async dismiss(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status: 'dismissed', updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  }
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = incidentModel;
