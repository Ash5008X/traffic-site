require('dotenv').config({ path: './.env' });
const { MongoClient, ObjectId } = require('mongodb');

async function fix() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const admin = await db.collection('users').findOne({ email: 'testadmin001@abc.com' });
  const adminId = admin._id;

  // 1. Ensure testunit001 has a field_units record
  const u1 = await db.collection('users').findOne({ email: 'testunit001@abc.com' });
  if (u1) {
    const existingUnit = await db.collection('field_units').findOne({ agentId: u1._id });
    if (!existingUnit) {
      await db.collection('field_units').insertOne({
        unitId: 'UNIT-992-AX', // Match the screenshot
        agentId: u1._id,
        status: 'available',
        currentIncident: null,
        location: admin.location || { lat: 31.264905, lng: 75.700219 },
        shiftStart: new Date(),
        missionsToday: 0
      });
      console.log('Created field_unit record for testunit001');
    }
  }

  // 2. Move testunit001 to Zone D team
  const zoneDTeam = await db.collection('teams').findOne({ zone: 'D', adminId });
  if (zoneDTeam && u1) {
    // Remove from other teams
    await db.collection('teams').updateMany({}, { $pull: { members: u1._id } });
    // Add to Zone D
    await db.collection('teams').updateOne({ _id: zoneDTeam._id }, { $addToSet: { members: u1._id } });
    console.log('Moved testunit001 to Zone D Team');
  }

  // 3. Check for the incident in Zone D
  const incident = await db.collection('incidents').findOne({ zone: 'D', status: 'dispatched' });
  if (incident) {
    console.log('Found dispatched Zone D incident:', incident._id);
    // Ensure all members of Zone D team have this incident set as current
    const team = await db.collection('teams').findOne({ _id: zoneDTeam._id });
    if (team) {
      await db.collection('field_units').updateMany(
        { agentId: { $in: team.members } },
        { $set: { currentIncident: incident._id, status: 'en_route' } }
      );
      console.log('Synchronized currentIncident for all Zone D members');
    }
  }

  await client.close();
}

fix().catch(console.error);
