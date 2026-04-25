/**
 * Migration: Flat Channels → Workspace + Channels Hierarchy
 * 
 * For each existing channel (that has no workspaceId):
 *   1. Create a Workspace with the same name, creator, members, admins
 *   2. Create a "general" channel inside the workspace
 *   3. Move all messages from old channel → new general channel
 *   4. Move all tasks & decisions from old channel → new general channel
 *   5. Archive (soft-delete) the old channel
 * 
 * SAFETY: This migration is idempotent — channels already assigned to a
 * workspace are skipped. Re-running is safe.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Workspace = require('./models/Workspace');
const Channel   = require('./models/Channel');
const Message   = require('./models/Message');
const Task      = require('./models/Task');
const Decision  = require('./models/Decision');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nexus';

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Find all channels that haven't been migrated yet (no workspaceId)
  const oldChannels = await Channel.find({
    workspaceId: null,
    isArchived: false
  });

  if (oldChannels.length === 0) {
    console.log('✅ No channels to migrate. Already up to date.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${oldChannels.length} channel(s) to migrate.\n`);

  for (const oldChannel of oldChannels) {
    console.log(`── Migrating channel: "${oldChannel.name}" (${oldChannel._id}) ──`);

    // 1. Create Workspace
    const workspace = await Workspace.create({
      name: oldChannel.name,
      createdBy: oldChannel.createdBy,
      members: oldChannel.members,
      admins: oldChannel.admins || [oldChannel.createdBy]
    });
    console.log(`   ✓ Created workspace "${workspace.name}" (${workspace._id})`);

    // 2. Create "general" channel inside workspace
    const generalChannel = await Channel.create({
      name: 'general',
      description: oldChannel.description || '',
      type: oldChannel.type || 'private',
      createdBy: oldChannel.createdBy,
      members: oldChannel.members,
      admins: oldChannel.admins || [oldChannel.createdBy],
      workspaceId: workspace._id
    });
    console.log(`   ✓ Created #general channel (${generalChannel._id})`);

    // 3. Move all messages: old channel → new general channel
    const msgResult = await Message.updateMany(
      { channel: oldChannel._id },
      { $set: { channel: generalChannel._id } }
    );
    console.log(`   ✓ Moved ${msgResult.modifiedCount} message(s)`);

    // 4. Move tasks & decisions
    const taskResult = await Task.updateMany(
      { channel: oldChannel._id },
      { $set: { channel: generalChannel._id } }
    );
    console.log(`   ✓ Moved ${taskResult.modifiedCount} task(s)`);

    const decisionResult = await Decision.updateMany(
      { channel: oldChannel._id },
      { $set: { channel: generalChannel._id } }
    );
    console.log(`   ✓ Moved ${decisionResult.modifiedCount} decision(s)`);

    // 5. Archive the old channel
    oldChannel.isArchived = true;
    oldChannel.workspaceId = workspace._id; // Mark so we don't re-migrate
    await oldChannel.save();
    console.log(`   ✓ Archived old channel "${oldChannel.name}"\n`);
  }

  console.log('══════════════════════════════════');
  console.log('✅ Migration complete!');
  console.log(`   ${oldChannels.length} channel(s) migrated to workspace hierarchy.`);
  console.log('══════════════════════════════════');

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
