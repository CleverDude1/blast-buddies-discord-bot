
const applicationId = "1558601726653898833";
const guildId = "1556494544957345872";

const botToken = process.env.DISCORD_BOT_TOKEN;

if (!botToken) {
  throw new Error("Missing DISCORD_BOT_TOKEN environment variable.");
}

const commands = [
  {
    name: "daily",
    description: "View the Blast Buddies daily leaderboard"
  }
];

const response = await fetch(
  `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  }
);

const result = await response.json();

if (!response.ok) {
  throw new Error(JSON.stringify(result));
}

console.log("Successfully registered /daily:", result);
