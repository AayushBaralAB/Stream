#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('QC Live - Password Hash Generator');
console.log('=================================\n');

rl.question('Enter password to hash: ', async (password) => {
  if (!password) {
    console.error('\nError: Password cannot be empty');
    rl.close();
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    console.log('\nGenerated hash:');
    console.log(hash);
    console.log('\nAdd this to your .env.local file:');
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  } catch (error) {
    console.error('\nError generating hash:', error.message);
  }

  rl.close();
});