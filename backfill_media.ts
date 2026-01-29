import { prisma } from './src/db/prisma';
import { getProfileInfo } from './src/services/apify.service';
import { processingQueue } from './src/queues/processing.queue';
import { config } from './src/config';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const STORAGE_ACCOUNTS = path.join(config.paths.storage, 'profiles');

async function downloadFile(url: string, destPath: string) {
    console.log(`[Download] Starting: ${url} -> ${destPath}`);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        // @ts-ignore
        await pipeline(res.body, createWriteStream(destPath));
        console.log(`[Download] Success: ${destPath}`);
    } catch (e) {
        console.error(`[Download] Error downloading ${url}:`, e);
        throw e;
    }
}

async function backfillProfiles() {
    console.log('--- Backfilling Profile Images ---');
    // Ensure storage/profiles exists
    await fs.mkdir(STORAGE_ACCOUNTS, { recursive: true });

    const accounts = await prisma.account.findMany();

    for (const acc of accounts) {
        console.log(`Checking account: ${acc.username}`);
        const isLocal = acc.profileImageUrl && acc.profileImageUrl.includes('/content/profiles/');

        if (!isLocal) {
            console.log(`Profile image is remote or missing. Fetching info...`);
            let imageUrl = acc.profileImageUrl;

            // 1. Try to get from cached ScrapingRun (Most reliable & free)
            try {
                const lastRun = await prisma.scrapingRun.findFirst({
                    where: { username: acc.username },
                    orderBy: { createdAt: 'desc' }
                });

                if (lastRun && lastRun.rawData) {
                    const items = lastRun.rawData as any[];
                    // Find any item that has owner info
                    const firstItem = items.find((i: any) => i.ownerProfilePicUrl || i.owner?.profile_pic_url);
                    if (firstItem) {
                        imageUrl = firstItem.ownerProfilePicUrl || firstItem.owner?.profile_pic_url;
                        console.log(`[Cache] Found profile URL from ScrapingRun: ${imageUrl}`);
                    }
                }
            } catch (cacheError) {
                console.error(`[Cache] Error reading scraping run:`, cacheError);
            }

            // 2. If still empty, try external Apify fetch (Backup)
            // Only try if we didn't find a valid URL (checking for 'http' to be sure)
            if (!imageUrl || (!imageUrl.startsWith('http') && !imageUrl.includes('instagram.com'))) {
                console.log(`[Apify] Cache empty/invalid. Fetching fresh profile info...`);
                try {
                    const info = await getProfileInfo(acc.username);
                    console.log(`[Apify] Info found:`, !!info);
                    if (info && (info.profilePicUrlHD || info.profilePicUrl)) {
                        imageUrl = info.profilePicUrlHD || info.profilePicUrl;
                        console.log(`[Apify] Found fresh URL: ${imageUrl}`);
                    }
                } catch (apifyError) {
                    console.error(`[Apify] Error for ${acc.username}:`, apifyError);
                }
            }

            if (imageUrl) {
                const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
                const filename = `${acc.username}${ext}`;
                const localPath = path.join(STORAGE_ACCOUNTS, filename);
                const publicUrl = `http://localhost:${config.port}/content/profiles/${filename}`;

                try {
                    await downloadFile(imageUrl, localPath);
                    await prisma.account.update({
                        where: { username: acc.username },
                        data: { profileImageUrl: publicUrl }
                    });
                    console.log(`[Success] Updated profile image for ${acc.username} -> ${publicUrl}`);
                } catch (e) {
                    console.error(`[Error] Failed to download profile image for ${acc.username}`, e);
                }
            } else {
                console.warn(`[Warn] No image URL found for ${acc.username}`);
            }
        } else {
            console.log(`Account ${acc.username} already has local image.`);
        }
    }
}

async function main() {
    await backfillProfiles();
}

main().catch(console.error).finally(() => prisma.$disconnect());
