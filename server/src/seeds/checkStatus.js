require('dotenv').config({ path: './.env' });
const { MongoClient } = require('mongodb');

async function check() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const user = await db.collection('users').findOne({ email: 'testunit001@abc.com' });
  console.log('User testunit001:', user ? user._id : 'not found');
  
  if (user) {
    const unit = await db.collection('field_units').findOne({ agentId: user._id });
    console.log('Unit:', unit);
    
    const team = await db.collection('teams').findOne({ members: user._id });
    console.log('Team:', team ? team.name : 'No team');
  }

  const zoneDTeam = await db.collection('teams').findOne({ zone: 'D' });
  console.log('Zone D Team members:', zoneDTeam ? zoneDTeam.members : 'No team');

  await client.close();
}

check().catch(console.error);
