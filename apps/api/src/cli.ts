import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { DeviceService } from './auth/device.service';

/**
 * Admin CLI for first-run setup, password reset and device approval.
 *
 *   node dist/cli.js setup          # create the admin user (prompt or auto-generate)
 *   node dist/cli.js reset           # generate a new admin password
 *   node dist/cli.js approve <code>  # validate a pending device with its 6-char code
 *
 * Runs against the same SQLite DB as the API (via the app context), so it must
 * be executed on the host where the API data lives.
 */
async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'setup' && command !== 'reset' && command !== 'approve') {
    console.error('Usage: node dist/cli.js <setup|reset|approve>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const auth = app.get(AuthService);
  try {
    if (command === 'setup') {
      const status = await auth.getStatus();
      if (status.configured) {
        console.log('Admin user already configured. Use "reset" to change the password.');
        return;
      }
      const rl = readline.createInterface({ input: stdin, output: stdout });
      const username = (await rl.question('Admin username (default "admin"): ')).trim();
      const answer = await rl.question(
        'Enter an admin password (leave empty to auto-generate one): ',
      );
      rl.close();
      const password = answer.trim() || undefined;
      const res = await auth.setup(username || undefined, password);
      if (res.generated && res.password) {
        console.log('\nGenerated admin password: ' + res.password);
        console.log('Save it now — it is shown only once.');
      } else {
        console.log('\nAdmin user created.');
      }
    } else if (command === 'reset') {
      const res = await auth.reset();
      console.log('\nNew admin password: ' + res.password);
      console.log('Save it now — it is shown only once.');
    } else {
      // approve <code>
      const devices = app.get(DeviceService);
      let code = process.argv[3];
      if (!code) {
        const rl = readline.createInterface({ input: stdin, output: stdout });
        code = (await rl.question('Enter the 6-char device code: ')).trim();
        rl.close();
      }
      const result = await devices.approve(code);
      if (result.ok) {
        console.log('\nDevice validated. You can now log in from that device.');
      } else {
        console.error('\nApproval failed: ' + result.message);
        process.exitCode = 1;
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
