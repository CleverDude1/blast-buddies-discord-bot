
import nacl from "tweetnacl";

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function getDailyLeaderboard() {
  const response = await fetch(
    "https://na1-ping.blastbuddies.io/api/leaderboard/day",
    { signal: AbortSignal.timeout(2000) }
  );

  if (!response.ok) {
    throw new Error(`Game API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const players = payload?.data?.top ?? payload?.top ?? [];

  if (!Array.isArray(players) || players.length === 0) {
    throw new Error("No leaderboard entries were returned");
  }

  return players.slice(0, 10);
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    return res.status(401).send("Missing signature information");
  }

  let rawBody;

  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).send("Could not read request body");
  }

  const valid = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody.toString("utf8")),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex")
  );

  if (!valid) {
    return res.status(401).send("Invalid request signature");
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  // Discord checks the endpoint using a PING.
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // Handle slash commands.
  if (interaction.type === 2) {
    if (interaction.data?.name === "daily") {
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              title: "🏆 Blast Buddies — Daily Leaderboard",
              description:
                "The bot is connected! Real leaderboard data will be added next.",
              color: 0x5865F2,
              footer: {
                text: "Blast Buddies Tracker"
              },
              timestamp: new Date().toISOString()
            }
          ]
        }
      });
    }

    return res.status(200).json({
      type: 4,
      data: {
        content: "That command isn't implemented yet.",
        flags: 64
      }
    });
  }

  return res.status(400).send("Unsupported interaction type");
}
