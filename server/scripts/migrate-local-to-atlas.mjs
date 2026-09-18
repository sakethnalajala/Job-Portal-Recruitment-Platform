/**
 * One-time migration: local MongoDB `job_portal` → Atlas Cluster0 `job_portal`.
 *
 *   node scripts/migrate-local-to-atlas.mjs --check     # read-only: connectivity, counts, baseline
 *   node scripts/migrate-local-to-atlas.mjs --migrate   # copy documents (refuses if Atlas job_portal is non-empty)
 *   node scripts/migrate-local-to-atlas.mjs --verify    # compare counts + confirm other DBs unchanged
 *
 * Safety rules:
 *  - Only ever opens the `job_portal` database on Atlas for reads/writes.
 *  - Other Atlas databases are only *listed by name* (read-only) to prove they are untouched.
 *  - Never deletes or updates anything; inserts use ordered:false with the original _id,
 *    so re-running can never create duplicates (duplicate _id → skipped, reported).
 *  - Credentials are read from server/.env and never printed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const ROOT = path.resolve(process.cwd());
const LOCAL_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'job_portal';
const BASELINE_FILE = path.join(ROOT, '.data', 'atlas-baseline.json');

function readAtlasUri() {
  const env = readFileSync(path.join(ROOT, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('MONGODB_URI='));
  if (!line) throw new Error('MONGODB_URI not found in server/.env');
  const raw = line.slice('MONGODB_URI='.length).trim().replace(/^"|"$/g, '');
  if (!raw.startsWith('mongodb+srv://')) throw new Error('MONGODB_URI in .env is not an Atlas (mongodb+srv) URI');
  return raw;
}

/** Force the database path to /job_portal without touching credentials or options. */
function withDbName(uri) {
  const u = new URL(uri);
  u.pathname = `/${DB_NAME}`;
  if (!u.searchParams.has('retryWrites')) u.searchParams.set('retryWrites', 'true');
  if (!u.searchParams.has('w')) u.searchParams.set('w', 'majority');
  return u.toString();
}

const redact = (uri) => uri.replace(/(:\/\/[^:]+:)[^@]+@/, '$1********@');

async function counts(db) {
  const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  const out = {};
  for (const name of cols) out[name] = await db.collection(name).countDocuments();
  return out;
}

async function listDbNames(client) {
  const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
  return databases.map((d) => d.name).sort();
}

async function main() {
  const mode = process.argv[2];
  if (!['--check', '--migrate', '--verify'].includes(mode)) {
    console.error('Usage: node scripts/migrate-local-to-atlas.mjs --check | --migrate | --verify');
    process.exit(1);
  }

  const atlasUri = withDbName(readAtlasUri());
  console.log(`Atlas target : ${redact(atlasUri)}`);
  console.log(`Local source : ${LOCAL_URI}/${DB_NAME}\n`);

  const local = new MongoClient(LOCAL_URI, { serverSelectionTimeoutMS: 5000 });
  const atlas = new MongoClient(atlasUri, { serverSelectionTimeoutMS: 15000 });
  await local.connect();
  await atlas.connect();
  const src = local.db(DB_NAME);
  const dst = atlas.db(DB_NAME);

  try {
    const srcCounts = await counts(src);
    const dstCounts = await counts(dst);
    const otherDbs = (await listDbNames(atlas)).filter((n) => n !== DB_NAME);

    const table = (a, b) => {
      const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      console.log('collection'.padEnd(20), 'local'.padStart(7), 'atlas'.padStart(7));
      for (const n of names) console.log(n.padEnd(20), String(a[n] ?? 0).padStart(7), String(b[n] ?? 0).padStart(7));
      console.log('TOTAL'.padEnd(20), String(Object.values(a).reduce((s, v) => s + v, 0)).padStart(7), String(Object.values(b).reduce((s, v) => s + v, 0)).padStart(7));
    };

    if (mode === '--check') {
      table(srcCounts, dstCounts);
      console.log(`\nOther Atlas databases (read-only listing, will not be touched): ${otherDbs.join(', ') || '(none)'}`);
      writeFileSync(BASELINE_FILE, JSON.stringify({ takenAt: new Date().toISOString(), otherDbs, atlasJobPortal: dstCounts }, null, 2));
      console.log(`Baseline saved to ${path.relative(ROOT, BASELINE_FILE)}`);
      const dstTotal = Object.values(dstCounts).reduce((s, v) => s + v, 0);
      console.log(dstTotal === 0 ? '\nAtlas job_portal is EMPTY → safe to migrate.' : `\nAtlas job_portal already has ${dstTotal} documents → migration will refuse to run.`);
      return;
    }

    if (mode === '--migrate') {
      const dstTotal = Object.values(dstCounts).reduce((s, v) => s + v, 0);
      if (dstTotal > 0) {
        console.error(`REFUSING: Atlas job_portal already contains ${dstTotal} documents. Nothing was written.`);
        process.exit(2);
      }
      const summary = {};
      for (const name of Object.keys(srcCounts)) {
        const docs = await src.collection(name).find({}).toArray();
        if (docs.length === 0) {
          await dst.createCollection(name);
          summary[name] = { inserted: 0, skipped: 0 };
          continue;
        }
        let inserted = 0;
        let skipped = 0;
        try {
          const r = await dst.collection(name).insertMany(docs, { ordered: false });
          inserted = r.insertedCount;
        } catch (err) {
          // ordered:false → duplicates (same _id) are reported, everything else still inserts
          inserted = err.result?.insertedCount ?? err.insertedCount ?? 0;
          skipped = (err.writeErrors ?? []).filter((e) => e.code === 11000).length;
          const other = (err.writeErrors ?? []).filter((e) => e.code !== 11000);
          if (other.length) throw err;
        }
        summary[name] = { inserted, skipped };
        console.log(`${name.padEnd(20)} inserted ${String(inserted).padStart(4)}  skipped(dup _id) ${skipped}`);
      }
      console.log('\nDone. Run --verify next.');
      return;
    }

    if (mode === '--verify') {
      table(srcCounts, dstCounts);
      const mismatches = Object.keys(srcCounts).filter((n) => srcCounts[n] !== dstCounts[n]);
      console.log(mismatches.length ? `\nMISMATCH in: ${mismatches.join(', ')}` : '\nAll collection counts match.');

      // Spot-check _id preservation on a few collections
      for (const name of ['users', 'jobs', 'applications']) {
        const sample = await src.collection(name).find({}, { projection: { _id: 1 } }).limit(5).toArray();
        const found = await dst.collection(name).countDocuments({ _id: { $in: sample.map((d) => d._id) } });
        console.log(`_id spot-check ${name.padEnd(13)} ${found}/${sample.length} preserved`);
      }

      if (existsSync(BASELINE_FILE)) {
        const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
        const same = JSON.stringify(baseline.otherDbs) === JSON.stringify(otherDbs);
        console.log(`\nOther Atlas databases unchanged since baseline: ${same ? 'YES' : 'NO'}`);
        console.log(`  before: ${baseline.otherDbs.join(', ')}`);
        console.log(`  after : ${otherDbs.join(', ')}`);
      }
      return;
    }
  } finally {
    await local.close();
    await atlas.close();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
