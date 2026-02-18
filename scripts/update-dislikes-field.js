// update-dislikes-field.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const Question = require('../models/Question');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Question.updateMany(
    { dislikes: { $exists: false } },
    { $set: { dislikes: 0 } }
  );
  console.log('Updated documents:', result.modifiedCount);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
