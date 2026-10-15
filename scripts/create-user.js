#!/usr/bin/env node
/**
 * Creates (or resets the password of) an admin user.
 *
 *   node scripts/create-user.js <username>
 *   node scripts/create-user.js <username> --reset      # change an existing password
 *
 * Reads MONGODB_URI from .env. The password is typed at a hidden prompt and
 * hashed with bcrypt (cost 10, same as the original registration code) - it is
 * never printed, logged or passed on the command line.
 *
 * Registration stays closed on the site; this script is the only way in.
 */
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../server/models/User');

const [username, flag] = process.argv.slice(2);
const reset = flag === '--reset';

if (!username || username.startsWith('-')) {
  console.error('Usage: node scripts/create-user.js <username> [--reset]');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set (create .env first).');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => {
      if (rl.stdoutMuted && s !== question) return;
      write.call(rl, s);
    };
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error('Run this in an interactive terminal so the password can be typed privately.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const existing = await User.findOne({ username });
    if (existing && !reset) {
      console.error(`User "${username}" already exists. Use --reset to change the password.`);
      process.exitCode = 1;
      return;
    }
    if (!existing && reset) {
      console.error(`User "${username}" does not exist.`);
      process.exitCode = 1;
      return;
    }
    const password = await askHidden(`Password for ${username} (min 10 characters): `);
    const again = await askHidden('Repeat password: ');
    if (password !== again) {
      console.error('Passwords do not match.');
      process.exitCode = 1;
      return;
    }
    if (password.length < 10) {
      console.error('Password must be at least 10 characters.');
      process.exitCode = 1;
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    if (existing) {
      existing.password = hash;
      await existing.save();
      console.log(`Password updated for "${username}".`);
    } else {
      await User.create({ username, password: hash });
      console.log(`User "${username}" created. They can sign in at /admin.`);
    }
  } finally {
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
