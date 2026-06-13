# Sound - Discord Music Bot (Modern)

A modern, fast, and simple Discord Music Bot built using **Discord.js v14** and **DisTube** with **@distube/youtube**. It streams audio directly within Node.js, removing the dependency on external Java/Lavalink servers.

## Features

- **Direct YouTube & Spotify Streaming**: No separate Java or Lavalink processes required.
- **Clickable Video Links**: Embed layouts show direct, clickable links to the YouTube video URL so you can watch when you click them.
- **Slash Commands & Text Commands**: Fully supports `/play`, `/skip`, `/stop`, `/queue`, `/volume`, `/pause`, and `/resume` commands, alongside standard text prefix `>` commands.

## Getting Started

1. Set up your environment variables in `.env`:
   ```env
   Token=YOUR_DISCORD_BOT_TOKEN
   Prefix=>
   Presence_Name=Sound
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the bot:
   ```bash
   node index.js
   ```

## License

MIT
