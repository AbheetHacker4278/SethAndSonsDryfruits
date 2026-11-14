const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { v2: cloudinary } = require('cloudinary');
const mongoose = require('mongoose');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const { PRODUCTS_SEED } = require('../shared/catalogSeed.ts');

async function main() {
  const urlSet = new Set();
  for (const p of PRODUCTS_SEED) {
    if (p.image && p.image.includes('shreeramdryfruits')) urlSet.add(p.image);
    if (p.gallery) {
      for (const g of p.gallery) {
        if (g && g.includes('shreeramdryfruits')) urlSet.add(g);
      }
    }
  }

  const urls = Array.from(urlSet);
  console.log(`Found ${urls.length} distinct external image URLs to process.`);

  const mappingFile = path.join(__dirname, 'cloudinary_mapping.json');
  let mapping = {};
  if (fs.existsSync(mappingFile)) {
    try {
      mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
      console.log(`Loaded ${Object.keys(mapping).length} pre-existing mappings.`);
    } catch {}
  }

  const queue = urls.filter(u => !mapping[u]);
  console.log(`Need to upload ${queue.length} images to Cloudinary...`);

  const concurrency = 6;
  let completed = 0;

  async function uploadOne(url) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await cloudinary.uploader.upload(url, {
          folder: 'products',
          resource_type: 'image',
          timeout: 30000,
        });
        mapping[url] = res.secure_url;
        completed++;
        if (completed % 10 === 0 || completed === queue.length) {
          console.log(`Progress: ${completed}/${queue.length} uploaded.`);
          fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
        }
        return res.secure_url;
      } catch (err) {
        console.warn(`Attempt ${attempt} failed for ${url}: ${err.message}`);
        if (attempt === 3) {
          console.error(`Final failure for ${url}`);
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  // Process in batches
  for (let i = 0; i < queue.length; i += concurrency) {
    const chunk = queue.slice(i, i + concurrency);
    await Promise.all(chunk.map(uploadOne));
  }

  fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
  console.log(`Total mapped: ${Object.keys(mapping).length}/${urls.length}`);

  // Now update shared/catalogSeed.ts
  const catalogSeedPath = path.join(__dirname, '../shared/catalogSeed.ts');
  let code = fs.readFileSync(catalogSeedPath, 'utf8');
  let replacedCount = 0;
  for (const [oldUrl, newUrl] of Object.entries(mapping)) {
    if (code.includes(oldUrl)) {
      code = code.split(oldUrl).join(newUrl);
      replacedCount++;
    }
  }
  fs.writeFileSync(catalogSeedPath, code, 'utf8');
  console.log(`Updated shared/catalogSeed.ts (${replacedCount} URLs replaced).`);

  // Now update MongoDB Atlas
  if (process.env.MONGODB_URI) {
    console.log('Connecting to MongoDB Atlas to update existing product documents...');
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const col = db.collection('products');

    let mongoUpdated = 0;
    for (const [oldUrl, newUrl] of Object.entries(mapping)) {
      const res = await col.updateMany(
        {
          $or: [
            { image: oldUrl },
            { gallery: oldUrl },
            { images: oldUrl },
          ],
        },
        [
          {
            $set: {
              image: {
                $cond: [{ $eq: ['$image', oldUrl] }, newUrl, '$image'],
              },
              images: {
                $map: {
                  input: { $ifNull: ['$images', []] },
                  as: 'img',
                  in: { $cond: [{ $eq: ['$$img', oldUrl] }, newUrl, '$$img'] },
                },
              },
              gallery: {
                $map: {
                  input: { $ifNull: ['$gallery', []] },
                  as: 'img',
                  in: { $cond: [{ $eq: ['$$img', oldUrl] }, newUrl, '$$img'] },
                },
              },
            },
          },
        ]
      );
      if (res.modifiedCount > 0) {
        mongoUpdated += res.modifiedCount;
      }
    }
    console.log(`Updated ${mongoUpdated} product records in MongoDB Atlas.`);
    await mongoose.disconnect();
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
