import "./loadEnv.js"; // must stay first: populates process.env before the reads below
import { S3Client, CreateBucketCommand, PutPublicAccessBlockCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
const region = process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || "us-east-1";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(scriptDir, "../.env");

if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
  console.error("Set both OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY, or use the AWS credential provider chain.");
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  console.error("Create the repository-root .env file before running this script.");
  process.exit(1);
}

const frontendOrigins = (process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (frontendOrigins.some((origin) => !/^https?:\/\/[^/]+$/i.test(origin))) {
  console.error("FRONTEND_URL must contain comma-separated origins without paths.");
  process.exit(1);
}

const client = new S3Client({
  region,
  ...(accessKeyId ? { credentials: { accessKeyId, secretAccessKey } } : {}),
});

const randomId = crypto.randomBytes(8).toString('hex');
const bucketName = `computesharing-storage-${randomId}`;

async function main() {
  try {
    console.log(`Creating bucket: ${bucketName} in ${region}...`);
    await client.send(new CreateBucketCommand({
      Bucket: bucketName,
      ...(region === "us-east-1"
        ? {}
        : { CreateBucketConfiguration: { LocationConstraint: region } }),
    }));
    
    console.log('Setting Public Access Block...');
    await client.send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    }));
    
    console.log('Setting CORS policy...');
    await client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
            AllowedOrigins: frontendOrigins,
            MaxAgeSeconds: 3000,
            ExposeHeaders: ["ETag"]
          }
        ]
      }
    }));
    
    console.log('Bucket created successfully!');
    
    // Read and update the .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (/^OBJECT_STORAGE_BUCKET=.*$/m.test(envContent)) {
      envContent = envContent.replace(/^OBJECT_STORAGE_BUCKET=.*$/m, `OBJECT_STORAGE_BUCKET=${bucketName}`);
    } else {
      envContent += `\nOBJECT_STORAGE_BUCKET=${bucketName}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log('.env updated successfully with bucket name.');

  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

main();
