const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'alerts';

function generateAlertId() {
  return `ALT-${Date.now().toString(36).toUpperCase()}`;
}

const alertModel = {
  async create(data) {
    const db = getDB();
    const doc = {
      alertId: generateAlertId(),
      type: data.type || 'system',
      message: data.message,
      zone: data.zone || '',
      radius: data.radius || 5,
      severity: data.severity || 'medium',
      broadcastBy: new ObjectId(data.broadcastBy),
      // Optional: target a specific user (for incident chat notifications)
      targetUser: data.targetUser ? new ObjectId(data.targetUser) : null,
      incidentId: data.incidentId ? new ObjectId(data.incidentId) : null,
      usersReached: data.usersReached || 0,
      active: true,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      createdAt: new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findActive() {
    const db = getDB();
    return db.collection(COLLECTION).find({ active: true }).sort({ createdAt: -1 }).toArray();
  },

  async findHistory() {
    const db = getDB();
    return db.collection(COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
  },

  async findByUser(userId) {
    const db = getDB();
    return db.collection(COLLECTION)
      .find({ 
        $or: [
          { targetUser: new ObjectId(userId) },
          { targetUser: null }
        ]
      })
      .sort({ createdAt: -1 })
      .toArray();
  },

  async cancel(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { active: false } },
      { returnDocument: 'after' }
    );
  },

  async update(id, data) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: 'after' }
    );
  }
};

module.exports = alertModel;
