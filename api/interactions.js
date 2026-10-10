
import nacl from "tweetnacl";

export const config = {
  api: {
    bodyParser: false
  }
};

const PAGE_SIZE = 10;
const MAX_PLAYERS = 50;

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

async function getDailyLeaderboard() {
  const response = await fetch(
    "https://na1-ping.blastbuddies.io/api/leaderboard/day",
    {
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `Game API returned HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  const players =
    payload?.data?.top ??
    payload?.top ??
    [];

  if (!Array.isArray(players) || players.length === 0) {
    throw new Error(
      "No leaderboard entries were returned"
    );
  }

  return players.slice(0, MAX_PLAYERS);
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}

function buildLeaderboardEmbed(players, page) {
  const start = page * PAGE_SIZE;
  const pagePlayers = players.slice(
    start,
    start + PAGE_SIZE
  );

  const description = pagePlayers
    .map((player, index) => {
      const rank = start + index + 1;
      const name = player.name || "Unknown";

      const clan = player.clanTag
        ? ` [${player.clanTag}]`
        : "";

      return (
        `**${rank}.** ${name}${clan}\n` +
        `⚔️ ${formatNumber(player.kills)} kills` +
        ` · ☠️ ${formatNumber(player.deaths)} deaths`
      );
    })
    .join("\n\n");

  const totalPages = Math.max(
    1,
    Math.ceil(players.length / PAGE_SIZE)
  );

  return {
    title: "🏆 Blast Buddies — Daily Leaderboard",
    description,
    color: 0x5865F2,
    footer: {
      text:
        `Players ${start + 1}–${start + pagePlayers.length}` +
        ` of ${players.length} • Page ${page + 1}/${totalPages}`
    },
    timestamp: new Date().toISOString()
  };
}

function buildPageButtons(page, playerCount) {
  const totalPages = Math.max(
    1,
    Math.ceil(playerCount / PAGE_SIZE)
  );

  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: "◀ Previous",
          custom_id: `daily_page:${page - 1}`,
          disabled: page <= 0
        },
        {
          type: 2,
          style: 2,
          label: `${page + 1} / ${totalPages}`,
          custom_id: "daily_page:current",
          disabled: true
        },
        {
          type: 2,
          style: 2,
          label: "Next ▶",
          custom_id: `daily_page:${page + 1}`,
          disabled: page >= totalPages - 1
        }
      ]
    }
  ];
}

function buildLeaderboardResponse(players, page, responseType) {
  const totalPages = Math.max(
    1,
    Math.ceil(players.length / PAGE_SIZE)
  );

  const safePage = Math.max(
    0,
    Math.min(page, totalPages - 1)
  );

  return {
    type: responseType,
    data: {
      embeds: [
        buildLeaderboardEmbed(players, safePage)
      ],
      components: buildPageButtons(
        safePage,
        players.length
      )
    }
  };
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
    return res.status(401).send(
      "Missing signature information"
    );
  }

  let rawBody;

  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).send(
      "Could not read request body"
    );
  }

  let valid;

  try {
    valid = nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody.toString("utf8")),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    return res.status(401).send(
      "Invalid request signature"
    );
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  // Discord endpoint verification
  if (interaction.type === 1) {
    return res.status(200).json({
      type: 1
    });
  }

  // Handle Previous and Next button clicks
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id || "";

    if (customId.startsWith("daily_page:")) {
      const requestedPage = customId.split(":")[1];

      if (requestedPage === "current") {
        return res.status(200).json({
          type: 6
        });
      }

      const page = Number(requestedPage);

      if (!Number.isInteger(page) || page < 0) {
        return res.status(200).json({
          type: 6
        });
      }

      try {
        const players = await getDailyLeaderboard();

        return res.status(200).json(
          buildLeaderboardResponse(players, page, 7)
        );
      } catch (error) {
        console.error(
          "Daily leaderboard page error:",
          error
        );

        return res.status(200).json({
          type: 4,
          data: {
            content:
              "⚠️ Couldn't load the next leaderboard page. Please try again.",
            flags: 64
          }
        });
      }
    }

    return res.status(200).json({
      type: 6
    });
  }

  // Handle slash commands
  if (interaction.type === 2) {
    if (interaction.data?.name === "daily") {
      try {
        const players = await getDailyLeaderboard();

        return res.status(200).json(
          buildLeaderboardResponse(players, 0, 4)
        );
      } catch (error) {
        console.error(
          "Daily leaderboard error:",
          error
        );

        return res.status(200).json({
          type: 4,
          data: {
            content:
              "⚠️ I couldn't retrieve the daily leaderboard right now. Please try again shortly.",
            flags: 64
          }
        });
      }
    }

    return res.status(200).json({
      type: 4,
      data: {
        content: "That command isn't implemented yet.",
        flags: 64
      }
    });
  }

  return res.status(400).send(
    "Unsupported interaction type"
  );
}
