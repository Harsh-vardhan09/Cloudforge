import "./loadEnv.js"; // must stay first: populates process.env before the reads below
import { S3Client, CreateBucketCommand, PutPublicAccessBlockCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
const region = process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || "ap-south-1";

if (!accessKeyId || !secretAccessKey) {
  console.error("Set OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY in .env before running this script.");
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey }
});

const randomId = crypto.randomBytes(4).toString('hex');
const bucketName = `hellosharing-storage-${randomId}`;

async function main() {
  try {
    console.log(`Creating bucket: ${bucketName} in ${region}...`);
    await client.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: { LocationConstraint: region }
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
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"]
          }
        ]
      }
    }));
    
    console.log('Bucket created successfully!');
    
    // Read and update the .env file
    const envPath = path.resolve('../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/OBJECT_STORAGE_BUCKET=.*/, `OBJECT_STORAGE_BUCKET=${bucketName}`);
    fs.writeFileSync(envPath, envContent);
    console.log('.env updated successfully with bucket name.');

  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

main();
