const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'relief_centers';

const reliefCenterModel = {
  async create(data) {
    const db = getDB();
    const doc = {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role || 'relief_admin',
      location: data.location || null,
      units: data.units || [],
      unassignedMembers: data.unassignedMembers || [], // Pre-calculate proximity pool
      status: 'on_duty',
      createdAt: new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findByEmail(email) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ email });
  },

  async findById(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  },

  async findAll() {
    const db = getDB();
    return db.collection(COLLECTION).find({}).toArray();
  },

  async updateStatus(id, status) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status } },
      { returnDocument: 'after' }
    );
  },

  async addUnit(id, unitId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $addToSet: { units: new ObjectId(unitId) } },
      { returnDocument: 'after' }
    );
  },

  async updateLocation(id, location) {
    const db = getDB();
    return db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { location } }
    );
  }
};

module.exports = reliefCenterModel;
