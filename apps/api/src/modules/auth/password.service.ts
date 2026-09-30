import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { invalidInput } from '@fakhri/shared';

/** argon2id parameters (DEC-08 / REQ-12). Interactive-login tuning. */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

/** A short deny list of the passwords attackers try first. */
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'iloveyou', 'admin123', 'welcome1', 'pakistan1', 'letmein1', 'abc12345',
]);

@Injectable()
export class PasswordService {
  /** A real argon2id hash of a random value, built once (see verifyOrDecoy). */
  private decoy?: string;

  async hash(plain: string): Promise<string> {
    assertPasswordPolicy(plain);
    return argon2.hash(plain, OPTIONS);
  }

  /**
   * Hash a machine-generated secret such as an OTP code. No password policy:
   * the value is generated, not chosen, so strength rules do not apply.
   */
  async hashSecret(value: string): Promise<string> {
    return argon2.hash(value, OPTIONS);
  }

  /** False for a wrong password and for a hash this build cannot read. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Verify when the account may not exist. With no stored hash it still runs a
   * full argon2 verification against a decoy, so an unknown email takes the same
   * time as a wrong password and cannot be probed for account existence.
   */
  async verifyOrDecoy(hash: string | null | undefined, plain: string): Promise<boolean> {
    if (hash) return this.verify(hash, plain);
    this.decoy ??= await argon2.hash(randomBytes(32).toString('hex'), OPTIONS);
    await this.verify(this.decoy, plain);
    return false;
  }
}

/** REQ-12: min 8 plus a strength floor. Pure, so it is unit tested directly. */
export function assertPasswordPolicy(plain: string): void {
  if (plain.length < MIN_LENGTH) throw invalidInput(`Password must be at least ${MIN_LENGTH} characters`);
  if (plain.length > MAX_LENGTH) throw invalidInput(`Password must be at most ${MAX_LENGTH} characters`);
  if (!/[A-Za-z]/.test(plain) || !/[0-9]/.test(plain)) {
    throw invalidInput('Password must contain at least one letter and one digit');
  }
  if (COMMON.has(plain.toLowerCase())) throw invalidInput('Password is too common');
}
