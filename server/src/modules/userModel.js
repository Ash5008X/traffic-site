const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'users';

const userModel = {
  async create(userData) {
    const db = getDB();
    const doc = {
      ...userData,
      preferences: { notifications: true, smsUpdates: false },
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

  async updatePreferences(id, preferences) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { preferences } },
      { returnDocument: 'after' }
    );
  },

  async updateLocation(id, location) {
    const db = getDB();
    return db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { location } }
    );
  },

  async updateProfile(id, data) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: 'after' }
    );
  },

  async countUsers() {
    const db = getDB();
    return db.collection(COLLECTION).countDocuments({ role: 'user' });
  }
};

module.exports = userModel;
