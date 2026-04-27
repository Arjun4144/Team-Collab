require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/team-collab';

async function migrateAvatars() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  try {
    // Access the raw collection to avoid Mongoose schema casting during the query
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    console.log('Finding users with legacy string avatars...');
    
    // Find users where avatar is a string (BSON type 2)
    const legacyUsers = await usersCollection.find({ avatar: { $type: 2 } }).toArray();
    
    if (legacyUsers.length === 0) {
      console.log('No users with legacy string avatars found. Database is clean!');
      return;
    }

    console.log(`Found ${legacyUsers.length} users requiring avatar migration.`);

    let updatedCount = 0;
    for (const user of legacyUsers) {
      const oldAvatar = user.avatar;
      
      const newAvatarObj = {
        url: (typeof oldAvatar === 'string' && oldAvatar.startsWith('http')) ? oldAvatar : '',
        public_id: ''
      };

      // Force overwrite the avatar field
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { avatar: newAvatarObj } }
      );
      
      updatedCount++;
    }

    console.log(`Migration complete. Successfully updated ${updatedCount} users.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

migrateAvatars();
