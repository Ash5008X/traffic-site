/**
 * Seed script: Creates 6 zone teams under testadmin001@abc.com
 * Run: node src/seeds/seedTeams.js
 */
require('dotenv').config();
const { connectDB, getDB } = require('../config/db');

async function seed() {
  await connectDB();
  const db = getDB();

  // Find the admin user
  const admin = await db.collection('users').findOne({ email: 'testadmin001@abc.com' });
  if (!admin) {
    console.error('Admin user testadmin001@abc.com not found!');
    process.exit(1);
  }

  console.log(`Found admin: ${admin.name} (${admin._id})`);

  const teams = [
    { name: 'Zone A Team', zone: 'A' },
    { name: 'Zone B Team', zone: 'B' },
    { name: 'Zone C Team', zone: 'C' },
    { name: 'Zone D Team', zone: 'D' },
    { name: 'Zone E Team', zone: 'E' },
    { name: 'Zone F Team', zone: 'F' }
  ];

  // Remove existing teams for this admin to avoid duplicates
  const deleted = await db.collection('teams').deleteMany({ adminId: admin._id });
  console.log(`Cleared ${deleted.deletedCount} existing teams for this admin.`);

  const docs = teams.map(t => ({
    name: t.name,
    zone: t.zone,
    adminId: admin._id,
    members: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  const result = await db.collection('teams').insertMany(docs);
  console.log(`Inserted ${result.insertedCount} teams:`);
  teams.forEach(t => console.log(`  ✓ ${t.name} (Zone ${t.zone})`));

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
