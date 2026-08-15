import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'https://panperyskop-api.dev-4cb.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET env var is required (no dev default — see backend/wrangler secrets)');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${ADMIN_SECRET}`,
  'Content-Type': 'application/json',
};

async function main() {
  const [, , cmd, id, ...rest] = process.argv;

  if (!cmd) {
    console.log('Usage: cli <approve|reject|ban|unban> [id] [reason]');
    process.exit(1);
  }

  switch (cmd) {
    case 'approve': {
      if (!id) { console.log('Usage: cli approve <post_id>'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/posts/${id}/approve`, { method: 'POST', headers });
      console.log(await res.json());
      break;
    }
    case 'reject': {
      if (!id) { console.log('Usage: cli reject <post_id> [reason]'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/posts/${id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: rest.join(' ') || null }),
      });
      console.log(await res.json());
      break;
    }
    case 'ban': {
      if (!id) { console.log('Usage: cli ban <device_id> [reason]'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/ban`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ device_id: id, reason: rest.join(' ') || null }),
      });
      console.log(await res.json());
      break;
    }
    case 'unban': {
      if (!id) { console.log('Usage: cli unban <device_id>'); process.exit(1); }
      const res = await fetch(`${BASE_URL}/admin/unban`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ device_id: id }),
      });
      console.log(await res.json());
      break;
    }
    default:
      console.log(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main();
