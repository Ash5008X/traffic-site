require('dotenv').config({ path: './.env' });
const { MongoClient } = require('mongodb');

async function checkIncidents() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const incidents = await db.collection('incidents').find({ status: { $ne: 'resolved' } }).toArray();
  console.log('Active Incidents:', incidents.map(i => ({ id: i._id, status: i.status, zone: i.zone, assignedTeam: i.assignedTeamId })));

  await client.close();
}

checkIncidents().catch(console.error);
