import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
export const STORAGE_URL_EXPIRY_SECONDS = 15 * 60;

let client;

const getBucket = () => {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET is required for job file storage");
  }
  return bucket;
};

const getClient = () => {
  if (client) return client;

  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Both object storage access key and secret key must be configured");
  }

  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  client = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
  return client;
};

export const createInputUpload = async ({ key, contentType }) => {
  const Bucket = getBucket();
  return createPresignedPost(getClient(), {
    Bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_INPUT_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: STORAGE_URL_EXPIRY_SECONDS,
  });
};

export const createObjectDownloadUrl = async (key, filename) => {
  const Bucket = getBucket();
  const safeFilename = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)
    ? filename
    : "download";
  const command = new GetObjectCommand({
    Bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: STORAGE_URL_EXPIRY_SECONDS,
  });
};

export const createObjectUploadUrl = async ({ key, contentLength }) => {
  const Bucket = getBucket();
  const command = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: "application/zip",
    ContentLength: contentLength,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: STORAGE_URL_EXPIRY_SECONDS,
  });
};

export const getObjectMetadata = async (key) => {
  const response = await getClient().send(
    new HeadObjectCommand({ Bucket: getBucket(), Key: key })
  );
  return {
    contentLength: response.ContentLength,
    contentType: response.ContentType,
  };
};
