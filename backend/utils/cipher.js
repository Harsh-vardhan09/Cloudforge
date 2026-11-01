import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_BYTES = 32;
const IV_LENGTH = 16;

const MIN_SECRET_BYTES = 16;
let _derivedKey = null;

/**
 * Resolve the AES key at call time, not at module scope.
 *
 * A module-scope read runs before the entrypoint has loaded the .env file, so it
 * would always miss the configured value. There is deliberately no fallback key:
 * a default compiled into the source protects nothing once the source is shared.
 *
 * ENCRYPTION_KEY is treated as a passphrase and hashed to exactly the 32 bytes
 * AES-256 needs, so it does not have to be 32 characters long. It should still be
 * a high-entropy random secret, since the hash is fast by design.
 */
const getKey = () => {
  if (_derivedKey) return _derivedKey;

  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY must be set to encrypt or decrypt stored API keys');
  }
  if (Buffer.from(secret, 'utf8').length < MIN_SECRET_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be at least ${MIN_SECRET_BYTES} bytes of high-entropy secret`
    );
  }

  _derivedKey = crypto.createHash('sha256').update(secret, 'utf8').digest();
  if (_derivedKey.length !== KEY_BYTES) {
    throw new Error(`Derived key must be ${KEY_BYTES} bytes`);
  }
  return _derivedKey;
};

export const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

export const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};
