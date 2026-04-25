require('dotenv').config({ path: './.env' });
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  console.log('Connected to MongoDB');
  const db = client.db();

  // 1. Find Admin
  const admin = await db.collection('users').findOne({ email: 'testadmin001@abc.com' });
  if (!admin) {
    console.error('Admin testadmin001@abc.com not found');
    await client.close();
    return;
  }
  const adminId = admin._id;

  // 2. Create 23 Users (002 to 024)
  const usersToCreate = [];
  for (let i = 2; i <= 24; i++) {
    const numStr = String(i).padStart(3, '0');
    const email = `testunit${numStr}@abc.com`;
    const password = `Testunit@${numStr}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    usersToCreate.push({
      name: `Field Unit ${numStr}`,
      email: email,
      password: hashedPassword,
      role: 'field_unit',
      reliefCenterId: adminId, // Register under testadmin001
      createdAt: new Date()
    });
  }

  // Insert Users
  for (const u of usersToCreate) {
    const existing = await db.collection('users').findOne({ email: u.email });
    if (!existing) {
      const res = await db.collection('users').insertOne(u);
      const userId = res.insertedId;
      
      // Also create a field_unit record for each
      await db.collection('field_units').insertOne({
        unitId: `UNIT-${u.email.split('@')[0].toUpperCase()}`,
        agentId: userId,
        status: 'available',
        currentIncident: null,
        location: admin.location || { lat: 31.264905, lng: 75.700219 },
        shiftStart: new Date(),
        missionsToday: 0
      });
      console.log(`Created ${u.email}`);
    } else {
      console.log(`${u.email} already exists`);
    }
  }

  // 3. Create Teams for Zones A-F
  const zones = ['A', 'B', 'C', 'D', 'E', 'F'];
  // Get all field unit users under this admin
  const allFieldUnits = await db.collection('users').find({ role: 'field_unit', reliefCenterId: adminId }).toArray();
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const teamName = `Alpha Squad - Zone ${zone}`;
    
    // Pick 4 members for each team
    const members = allFieldUnits.slice(i * 4, (i + 1) * 4).map(u => u._id);
    
    const existingTeam = await db.collection('teams').findOne({ zone, adminId });
    if (existingTeam) {
      await db.collection('teams').updateOne(
        { _id: existingTeam._id },
        { $set: { members, updatedAt: new Date(), name: teamName } }
      );
      console.log(`Updated Team for Zone ${zone}`);
    } else {
      await db.collection('teams').insertOne({
        name: teamName,
        zone: zone,
        adminId: adminId,
        members: members,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`Created Team for Zone ${zone}`);
    }
  }

  await client.close();
  console.log('Seeding complete');
}

seed().catch(console.error);
