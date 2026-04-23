require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');
const Channel  = require('./models/Channel');
const Message  = require('./models/Message');
const Task     = require('./models/Task');
const Decision = require('./models/Decision');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nexus';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clean slate
  await Promise.all([
    User.deleteMany({}), Channel.deleteMany({}),
    Message.deleteMany({}), Task.deleteMany({}), Decision.deleteMany({})
  ]);
  console.log('Cleared existing data');

  // ── Users ──────────────────────────────────────────────────
  const [alice, bob, carol, dave] = await User.insertMany([
    { name: 'Alice Chen',    email: 'alice@nexus.dev', password: 'password123', role: 'admin',  status: 'online'  },
    { name: 'Bob Martinez',  email: 'bob@nexus.dev',   password: 'password123', role: 'member', status: 'online'  },
    { name: 'Carol Smith',   email: 'carol@nexus.dev', password: 'password123', role: 'member', status: 'away'    },
    { name: 'Dave Wilson',   email: 'dave@nexus.dev',  password: 'password123', role: 'guest',  status: 'offline' },
  ]);
  // Hash passwords properly via save()
  for (const raw of [
    { _id: alice._id, password: 'password123' },
    { _id: bob._id,   password: 'password123' },
    { _id: carol._id, password: 'password123' },
    { _id: dave._id,  password: 'password123' },
  ]) {
    const u = await User.findById(raw._id);
    u.password = raw.password;
    await u.save();
  }
  console.log('Created 4 users');

  // ── Channels ───────────────────────────────────────────────
  const [general, engineering, product, design] = await Channel.insertMany([
    { name: 'general',     description: 'Company-wide announcements',   type: 'private', createdBy: alice._id, members: [alice._id, bob._id, carol._id, dave._id], admins: [alice._id] },
    { name: 'engineering', description: 'Engineering team discussions', type: 'private', createdBy: alice._id, members: [alice._id, bob._id, carol._id], admins: [alice._id] },
    { name: 'product',     description: 'Product decisions & roadmap',  type: 'private', createdBy: carol._id, members: [alice._id, bob._id, carol._id, dave._id], admins: [carol._id] },
    { name: 'design',      description: 'Design reviews & critiques',   type: 'private', createdBy: carol._id, members: [alice._id, carol._id], admins: [carol._id] },
  ]);
  console.log('Created 4 channels');

  // ── Messages ───────────────────────────────────────────────
  const msgs = await Message.insertMany([
    // general
    {
      channel: general._id, sender: alice._id,
      content: 'Welcome to Nexus! This is your new professional communication hub. Use intent-tagged messages to keep conversations clear and actionable.',
      intentType: 'announcement', priority: 'high',
      readBy: [alice._id, bob._id, carol._id]
    },
    {
      channel: general._id, sender: bob._id,
      content: 'Great to be here! The structured messaging approach looks really promising.',
      intentType: 'fyi', priority: 'normal',
      readBy: [bob._id, alice._id]
    },
    {
      channel: general._id, sender: alice._id,
      content: 'Q3 company-wide goal: ship the new authentication system before August 31st.',
      intentType: 'decision', priority: 'urgent',
      readBy: [alice._id, bob._id, carol._id],
      isResolved: false
    },
    // engineering
    {
      channel: engineering._id, sender: bob._id,
      content: 'Should we migrate from REST to GraphQL for the mobile API? There are performance arguments on both sides.',
      intentType: 'discussion', priority: 'normal',
      readBy: [bob._id, alice._id], replyCount: 2
    },
    {
      channel: engineering._id, sender: alice._id,
      content: 'We are adopting TypeScript across the entire backend codebase starting next sprint. All new files must be .ts.',
      intentType: 'decision', priority: 'high',
      readBy: [alice._id, bob._id, carol._id],
      isResolved: false
    },
    {
      channel: engineering._id, sender: carol._id,
      content: 'Review and merge the auth-refactor PR before Friday. Bob is the reviewer.',
      intentType: 'action', priority: 'high',
      readBy: [carol._id, bob._id]
    },
    // product
    {
      channel: product._id, sender: carol._id,
      content: 'The v2.0 roadmap has been finalised. Key items: intent messaging, decision log, AI summaries. Full doc in Notion.',
      intentType: 'announcement', priority: 'high',
      readBy: [carol._id, alice._id, dave._id]
    },
    {
      channel: product._id, sender: dave._id,
      content: 'Should onboarding be a wizard flow or a blank canvas with tooltips? Looking for input from the team.',
      intentType: 'discussion', priority: 'normal',
      readBy: [dave._id]
    },
    {
      channel: product._id, sender: carol._id,
      content: 'We will go with wizard-style onboarding for v1 to reduce drop-off. Can revisit in v2 based on analytics.',
      intentType: 'decision', priority: 'normal',
      isResolved: true, verdict: 'Wizard onboarding selected for v1. Re-evaluate post-launch.',
      readBy: [carol._id, alice._id, dave._id]
    },
  ]);
  console.log(`Created ${msgs.length} messages`);

  // ── Tasks ──────────────────────────────────────────────────
  await Task.insertMany([
    {
      title: 'Review and merge auth-refactor PR',
      description: 'Check for security issues, test coverage, and code quality.',
      assignee: bob._id, createdBy: carol._id, channel: engineering._id,
      status: 'todo', priority: 'high',
      dueDate: new Date(Date.now() + 2 * 86400000)
    },
    {
      title: 'Migrate user service to TypeScript',
      description: 'Convert models, routes, and middleware.',
      assignee: alice._id, createdBy: alice._id, channel: engineering._id,
      status: 'in_progress', priority: 'normal',
      dueDate: new Date(Date.now() + 7 * 86400000)
    },
    {
      title: 'Design onboarding wizard screens',
      description: 'Create Figma mockups for all 5 wizard steps.',
      assignee: carol._id, createdBy: carol._id, channel: product._id,
      status: 'todo', priority: 'normal',
      dueDate: new Date(Date.now() + 5 * 86400000)
    },
    {
      title: 'Write v2.0 release notes',
      description: 'Summary of all new features with screenshots.',
      assignee: dave._id, createdBy: carol._id, channel: product._id,
      status: 'todo', priority: 'low',
      dueDate: new Date(Date.now() + 14 * 86400000)
    },
    {
      title: 'Set up MongoDB Atlas production cluster',
      description: 'Configure backups, alerts, and IP whitelist.',
      assignee: alice._id, createdBy: alice._id, channel: engineering._id,
      status: 'done', priority: 'urgent',
      completedAt: new Date()
    },
  ]);
  console.log('Created 5 tasks');

  // ── Decisions ──────────────────────────────────────────────
  await Decision.insertMany([
    {
      title: 'Q3 target: ship new authentication system',
      body: 'The entire team commits to shipping the new JWT + OAuth2 authentication system before August 31st.',
      rationale: 'Current auth is a security liability and blocks mobile app launch.',
      owner: alice._id, channel: general._id, status: 'active',
      tags: ['security', 'Q3', 'auth'],
      acknowledgedBy: [alice._id, bob._id]
    },
    {
      title: 'Adopt TypeScript across backend',
      body: 'All new backend code must be written in TypeScript. Existing files to be migrated incrementally over Q3.',
      rationale: 'Type safety reduces runtime errors. Industry standard for scale.',
      owner: alice._id, channel: engineering._id, status: 'active',
      tags: ['typescript', 'engineering', 'standards'],
      acknowledgedBy: [alice._id, carol._id]
    },
    {
      title: 'Wizard-style onboarding for v1',
      body: 'The v1 onboarding experience will use a 5-step wizard rather than a blank canvas.',
      rationale: 'A/B test data from competitors shows wizard reduces drop-off by ~40% at signup.',
      owner: carol._id, channel: product._id, status: 'active',
      tags: ['onboarding', 'UX', 'v1'],
      acknowledgedBy: [carol._id, alice._id, dave._id]
    },
    {
      title: 'Use MongoDB for message storage',
      body: 'Messages will be stored in MongoDB, user/channel/task metadata in PostgreSQL (or a single Mongo collection for simplicity in MVP).',
      rationale: 'Flexible document schema suits evolving message types and attachments.',
      owner: alice._id, channel: engineering._id, status: 'active',
      tags: ['architecture', 'database'],
      acknowledgedBy: [alice._id, bob._id, carol._id]
    },
  ]);
  console.log('Created 4 decisions');

  console.log('\n✅ Seed complete!');
  console.log('──────────────────────────────────');
  console.log('Demo login credentials:');
  console.log('  alice@nexus.dev  /  password123  (admin)');
  console.log('  bob@nexus.dev    /  password123  (member)');
  console.log('  carol@nexus.dev  /  password123  (member)');
  console.log('  dave@nexus.dev   /  password123  (guest)');
  console.log('──────────────────────────────────');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
