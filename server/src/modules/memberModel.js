const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'members';

const memberModel = {
  async create(memberData) {
    const db = getDB();
    const doc = {
      ...memberData,
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
  }
};

module.exports = memberModel;
