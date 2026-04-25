const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'field_units';

const fieldUnitModel = {
  async create(data) {
    const db = getDB();
    const doc = {
      unitId: data.unitId || `UNIT-${Date.now().toString(36).toUpperCase()}`,
      agentId: new ObjectId(data.agentId),
      status: 'available',
      currentIncident: null,
      location: data.location || { lat: 0, lng: 0 },
      shiftStart: new Date(),
      missionsToday: 0
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findById(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  },

  async findByAgentId(agentId) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ agentId: new ObjectId(agentId) });
  },

  async updateStatus(id, status) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status } },
      { returnDocument: 'after' }
    );
  },

  async updateLocation(id, lat, lng) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { 'location.lat': lat, 'location.lng': lng } },
      { returnDocument: 'after' }
    );
  },

  async markArrived(id, incidentId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status: 'on_site', currentIncident: new ObjectId(incidentId) } },
      { returnDocument: 'after' }
    );
  },

  async assignToIncident(id, incidentId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'en_route',
          currentIncident: new ObjectId(incidentId)
        },
        $inc: { missionsToday: 1 }
      },
      { returnDocument: 'after' }
    );
  },

  async clearIncident(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status: 'available', currentIncident: null } },
      { returnDocument: 'after' }
    );
  },

  async findAll() {
    const db = getDB();
    return db.collection(COLLECTION).find({}).toArray();
  },

  async getUpdates(id) {
    const db = getDB();
    const unit = await this.findById(id);
    if (!unit || !unit.currentIncident) return [];
    const incident = await getDB().collection('incidents').findOne({ _id: unit.currentIncident });
    return incident ? incident.actions : [];
  }
};

module.exports = fieldUnitModel;
