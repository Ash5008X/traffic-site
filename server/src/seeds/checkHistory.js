require('dotenv').config({ path: './.env' });
const { MongoClient, ObjectId } = require('mongodb');

async function checkHistory() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const team = await db.collection('teams').findOne({ zone: 'D' });
  console.log('Team D ID:', team._id);
  
  const history = await db.collection('incidents').find({ 
    assignedTeamId: team._id, 
    status: 'resolved' 
  }).toArray();
  
  console.log('Resolved Incidents for Team D:', history.length);
  
  const anyAssigned = await db.collection('incidents').find({ 
    assignedTeamId: team._id 
  }).toArray();
  console.log('Total Incidents ever assigned to Team D:', anyAssigned.length);

  await client.close();
}

checkHistory().catch(console.error);
