// LOCKED FILE — provisioned by Enterprise Vibe Coding Platform. Do not edit.
export const platformConfig = {
  databaseUrl: process.env.DATABASE_URL!,
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
  },
};
