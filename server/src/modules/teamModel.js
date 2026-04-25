const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');

const COLLECTION = 'teams';

const teamModel = {
  async create(data) {
    const db = getDB();
    const doc = {
      name: data.name,
      zone: data.zone,
      adminId: new ObjectId(data.adminId),
      members: data.members || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findById(id) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  },

  async findByAdminId(adminId) {
    const db = getDB();
    return db.collection(COLLECTION).find({ adminId: new ObjectId(adminId) }).toArray();
  },

  async findByZone(zone) {
    const db = getDB();
    return db.collection(COLLECTION).findOne({ zone });
  },

  async addMember(teamId, userId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(teamId) },
      { $addToSet: { members: new ObjectId(userId) }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  },

  async removeMember(teamId, userId) {
    const db = getDB();
    return db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(teamId) },
      { $pull: { members: new ObjectId(userId) }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
  },

  async findAll() {
    const db = getDB();
    return db.collection(COLLECTION).find({}).toArray();
  }
};

module.exports = teamModel;
