import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'panperyskop-admin-dev';

const headers = {
  Authorization: `Bearer ${ADMIN_SECRET}`,
  'Content-Type': 'application/json',
};

async function main() {
  const [, , cmd, id] = process.argv;

  if (!cmd) {
    console.log('Usage: cli <queue|approve|reject> [post_id]');
    process.exit(1);
  }

  switch (cmd) {
    case 'queue': {
      const res = await fetch(`${BASE_URL}/admin/queue`, { headers });
      const items = await res.json();
      if (!Array.isArray(items)) {
        console.error('Error:', JSON.stringify(items, null, 2));
        process.exit(1);
      }
      for (const item of items) {
        console.log(`[${item.id}] ${item.type.padEnd(5)} @(${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}) "${item.description}" — by ${item.author_name}`);
        if (item.media_url) console.log(`  Media: ${item.media_url}`);
        console.log('');
      }
      console.log(`Total pending: ${items.length}`);
      break;
    }
    case 'approve': {
      if (!id) { console.log('Usage: cli approve <post_id>'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/posts/${id}/approve`, { method: 'POST', headers });
      console.log(await res.json());
      break;
    }
    case 'reject': {
      if (!id) { console.log('Usage: cli reject <post_id>'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/posts/${id}/reject`, { method: 'POST', headers });
      console.log(await res.json());
      break;
    }
    default:
      console.log(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main();
