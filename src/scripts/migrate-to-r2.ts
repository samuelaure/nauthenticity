import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { optimizeImage, optimizeVideo } from '../utils/media';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const r2Client = config.env.R2_ENDPOINT
  ? new S3Client({
      endpoint: config.env.R2_ENDPOINT,
      region: 'auto',
      credentials: {
        accessKeyId: config.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: config.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

async function migrate() {
  if (!r2Client || !config.env.R2_BUCKET_NAME) {
    logger.error('R2 not configured. Cannot migrate.');
    process.exit(1);
  }

  const storageRoot = path.resolve(config.paths.storage);
  if (!fs.existsSync(storageRoot)) {
    logger.info('Storage directory does not exist. Nothing to migrate.');
    return;
  }

  const usernames = fs
    .readdirSync(storageRoot)
    .filter((f) => fs.lstatSync(path.join(storageRoot, f)).isDirectory());

  for (const contextUsername of usernames) {
    logger.info(`Migrating context: ${contextUsername}`);

    // 1. Migrate Posts
    const postsDir = path.join(storageRoot, contextUsername, 'posts');
    if (fs.existsSync(postsDir)) {
      const files = fs.readdirSync(postsDir);
      for (const file of files) {
        const mediaId = path.parse(file).name;
        const ext = path.parse(file).ext.toLowerCase();
        const type = ext === '.mp4' ? 'video' : 'image';
        const localPath = path.join(postsDir, file);
        const storageKey = `content/${contextUsername}/posts/${mediaId}${ext}`;

        try {
          logger.info(`Optimizing and uploading post media: ${file}`);
          const optimizedPath = path.join(config.paths.temp, `${mediaId}_mig_opt${ext}`);
          if (type === 'video') {
            await optimizeVideo(localPath, optimizedPath);
          } else {
            await optimizeImage(localPath, optimizedPath);
          }

          await r2Client.send(
            new PutObjectCommand({
              Bucket: config.env.R2_BUCKET_NAME,
              Key: storageKey,
              Body: fs.createReadStream(optimizedPath),
              ContentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
            }),
          );

          const publicUrl = `${config.env.R2_PUBLIC_URL}/${storageKey}`;

          // Update DB
          await prisma.media.update({
            where: { id: mediaId },
            data: { storageUrl: publicUrl },
          });

          // Cleanup
          fs.unlinkSync(optimizedPath);
          fs.unlinkSync(localPath);
          logger.info(`Successfully migrated and deleted: ${file}`);
        } catch (err) {
          logger.error(`Failed to migrate post ${file}: ${err}`);
        }
      }
    }

    // 2. Migrate Profiles
    const profilesDir = path.join(storageRoot, contextUsername, 'profiles');
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir);
      for (const file of files) {
        const username = path.parse(file).name;
        const ext = path.parse(file).ext.toLowerCase();
        const localPath = path.join(profilesDir, file);
        const storageKey = `content/${contextUsername}/profiles/${username}${ext}`;

        try {
          logger.info(`Optimizing and uploading profile image: ${file}`);
          const optimizedPath = path.join(config.paths.temp, `profile_${username}_mig_opt${ext}`);
          await optimizeImage(localPath, optimizedPath);

          await r2Client.send(
            new PutObjectCommand({
              Bucket: config.env.R2_BUCKET_NAME,
              Key: storageKey,
              Body: fs.createReadStream(optimizedPath),
              ContentType: 'image/jpeg',
            }),
          );

          const publicUrl = `${config.env.R2_PUBLIC_URL}/${storageKey}`;

          // Update DB: If this is the context account's profile pic
          if (username === contextUsername) {
            await prisma.igProfile.update({
              where: { username },
              data: { profileImageUrl: publicUrl },
            });
          }

          // Note: Updating collaborator references in posts for this context account
          // This is a bit heavy, but necessary for parity with download.worker behavior
          const postsWithCollabs = await prisma.post.findMany({
            where: { username: contextUsername, collaborators: { not: Prisma.DbNull } },
          });

          for (const p of postsWithCollabs) {
            const cs = p.collaborators as any[];
            if (Array.isArray(cs)) {
              const newCs = cs.map((c) =>
                c.username === username ? { ...c, profilePicUrl: publicUrl } : c,
              );
              await prisma.post.update({ where: { id: p.id }, data: { collaborators: newCs } });
            }
          }

          // Cleanup
          fs.unlinkSync(optimizedPath);
          fs.unlinkSync(localPath);
          logger.info(`Successfully migrated and deleted profile: ${file}`);
        } catch (err) {
          logger.error(`Failed to migrate profile ${file}: ${err}`);
        }
      }
    }
  }

  logger.info('Migration complete.');
}

migrate().catch((err) => {
  logger.error(`Migration Script crashed: ${err}`);
  process.exit(1);
});
