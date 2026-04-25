require('dotenv').config({ path: './.env' });
const { MongoClient, ObjectId } = require('mongodb');
const { haversineKm, classifyZone } = require('../utils/zoneUtils');

async function backfill() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const admin = await db.collection('users').findOne({ email: 'testadmin001@abc.com' });
  if (!admin || !admin.location) {
    console.error('Admin location not found');
    await client.close();
    return;
  }

  const incidents = await db.collection('incidents').find({ status: { $ne: 'resolved' } }).toArray();
  for (const inc of incidents) {
    if (inc.location && inc.location.lat) {
      const zone = classifyZone(admin.location.lat, admin.location.lng, inc.location.lat, inc.location.lng);
      await db.collection('incidents').updateOne(
        { _id: inc._id },
        { $set: { zone, reliefCenterId: admin._id } }
      );
      console.log(`Updated Incident ${inc._id} to Zone ${zone}`);
      
      // If it was already en_route, assign the team now
      if (inc.status === 'en_route') {
        const team = await db.collection('teams').findOne({ zone, adminId: admin._id });
        if (team) {
          await db.collection('incidents').updateOne(
            { _id: inc._id },
            { $set: { assignedTeamId: team._id, status: 'dispatched' } }
          );
          await db.collection('field_units').updateMany(
            { agentId: { $in: team.members } },
            { $set: { currentIncident: inc._id, status: 'en_route' } }
          );
          console.log(`Dispatched Team ${team.name} to Incident ${inc._id}`);
        }
      }
    }
  }

  await client.close();
  console.log('Backfill complete');
}

backfill().catch(console.error);
