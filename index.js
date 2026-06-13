require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require("discord.js");
const { DisTube } = require("distube");
const { YouTubePlugin } = require("@distube/youtube");

if (!process.env.Token) {
  console.error("Error: Token is missing in .env file!");
  process.exit(1);
}

// 1. Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 2. Initialize DisTube
const distube = new DisTube(client, {
  plugins: [
    new YouTubePlugin({
      // We can pass options if needed, but defaults are robust
    }),
  ],
  emitNewSongOnly: true,
});

// Presence & Slash Command Definitions
const prefix = process.env.Prefix || ">";
const slashCommandsData = [
  {
    name: "play",
    description: "Play a song from YouTube or Spotify",
    options: [
      {
        name: "query",
        description: "The name or URL of the song to play",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "skip",
    description: "Skip the current song",
  },
  {
    name: "stop",
    description: "Stop the music and leave the voice channel",
  },
  {
    name: "queue",
    description: "Show the current song queue",
  },
  {
    name: "volume",
    description: "Adjust the music volume",
    options: [
      {
        name: "percent",
        description: "Volume percentage (0-100)",
        type: 4, // INTEGER
        required: true,
      },
    ],
  },
  {
    name: "pause",
    description: "Pause the music playback",
  },
  {
    name: "resume",
    description: "Resume the music playback",
  },
];

// client ready event
client.once("ready", async () => {
  console.log(`Successfully logged in as ${client.user.tag}`);
  
  // Set Presence
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: process.env.Presence_Name || "Sound",
        type: ActivityType.Listening,
      },
    ],
  });

  // Register slash commands globally
  try {
    console.log("Registering global slash commands...");
    await client.application.commands.set(slashCommandsData);
    console.log("Global slash commands registered successfully!");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

// --- Command Execution Logic ---

// Helper function to resolve query and play
async function handlePlay(voiceChannel, query, textChannel, member, replyTarget) {
  if (!voiceChannel) {
    const msg = "❌ | **You must be in a voice channel to play music!**";
    return replyTarget.reply ? replyTarget.reply(msg) : textChannel.send(msg);
  }

  const permissions = voiceChannel.permissionsFor(client.user);
  if (!permissions.has("Connect") || !permissions.has("Speak")) {
    const msg = "❌ | **I do not have permissions to join and speak in your voice channel!**";
    return replyTarget.reply ? replyTarget.reply(msg) : textChannel.send(msg);
  }

  const statusMsg = replyTarget.reply 
    ? await replyTarget.reply({ content: `🔍 | Searching for \`${query}\`...`, fetchReply: true })
    : await textChannel.send(`🔍 | Searching for \`${query}\`...`);

  try {
    await distube.play(voiceChannel, query, {
      textChannel,
      member,
    });
    
    // Delete searching status
    if (statusMsg.deletable) {
      await statusMsg.delete().catch(() => {});
    } else if (replyTarget.deleteReply) {
      await replyTarget.deleteReply().catch(() => {});
    }
  } catch (error) {
    console.error("DisTube Play Error:", error);
    const errorMsg = `❌ | **An error occurred while playing:** ${error.message || error}`;
    if (statusMsg.editable) {
      await statusMsg.edit(errorMsg).catch(() => {});
    } else {
      await textChannel.send(errorMsg).catch(() => {});
    }
  }
}

// 3. Message Prefix Event Handler
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  const queue = distube.getQueue(message.guild.id);

  if (command === "play" || command === "p") {
    const query = args.join(" ");
    if (!query) {
      return message.reply(`❌ | **Usage:** \`${prefix}play [song name or URL]\``);
    }
    await handlePlay(message.member?.voice?.channel, query, message.channel, message.member, message);
  }

  else if (command === "skip" || command === "s") {
    if (!queue) return message.reply("❌ | **There is nothing playing right now!**");
    if (queue.songs.length <= 1 && !queue.autoplay) {
      // If last song, stop instead of throwing error in distube
      await queue.stop();
      return message.reply("⏭️ | **Skipped last song. Queue is empty.**");
    }
    try {
      await distube.skip(message);
      message.reply("⏭️ | **Skipped the current song.**");
    } catch (e) {
      message.reply(`❌ | ${e.message}`);
    }
  }

  else if (command === "stop" || command === "leave") {
    if (!queue) {
      // Just leave channel if bot is in one
      const botVoice = message.guild.members.me?.voice?.channel;
      if (botVoice) {
        distube.voices.leave(message.guild);
        return message.reply("⏹️ | **Stopped and left the voice channel.**");
      }
      return message.reply("❌ | **I am not in a voice channel!**");
    }
    await distube.stop(message);
    message.reply("⏹️ | **Stopped and left the voice channel.**");
  }

  else if (command === "queue" || command === "q") {
    if (!queue) return message.reply("❌ | **The queue is empty!**");
    const q = queue.songs
      .map((song, i) => `${i === 0 ? "Playing:" : `${i}.`} [${song.name}](${song.url}) - \`${song.formattedDuration}\``)
      .slice(0, 10)
      .join("\n");
    
    const embed = new EmbedBuilder()
      .setTitle(`Queue for ${message.guild.name}`)
      .setDescription(q + (queue.songs.length > 10 ? `\n...and ${queue.songs.length - 10} more songs.` : ""))
      .setColor("#5865F2");
    message.reply({ embeds: [embed] });
  }

  else if (command === "volume" || command === "vol") {
    if (!queue) return message.reply("❌ | **There is nothing playing right now!**");
    const volume = parseInt(args[0]);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.reply("❌ | **Volume must be a number between 0 and 100!**");
    }
    distube.setVolume(message, volume);
    message.reply(`🔊 | **Volume set to ${volume}%**`);
  }

  else if (command === "pause") {
    if (!queue) return message.reply("❌ | **There is nothing playing right now!**");
    if (queue.paused) return message.reply("❌ | **Playback is already paused!**");
    distube.pause(message);
    message.reply("⏸️ | **Paused the music.**");
  }

  else if (command === "resume") {
    if (!queue) return message.reply("❌ | **There is nothing playing right now!**");
    if (!queue.paused) return message.reply("❌ | **Playback is not paused!**");
    distube.resume(message);
    message.reply("▶️ | **Resumed the music.**");
  }
});

// 4. Interaction (Slash Command) Event Handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, member, channel } = interaction;
  const queue = distube.getQueue(guild.id);

  if (commandName === "play") {
    const query = options.getString("query");
    await handlePlay(member?.voice?.channel, query, channel, member, interaction);
  }

  else if (commandName === "skip") {
    if (!queue) return interaction.reply({ content: "❌ | **There is nothing playing right now!**", ephemeral: true });
    if (queue.songs.length <= 1 && !queue.autoplay) {
      await queue.stop();
      return interaction.reply("⏭️ | **Skipped last song. Queue is empty.**");
    }
    try {
      await distube.skip(interaction);
      interaction.reply("⏭️ | **Skipped the current song.**");
    } catch (e) {
      interaction.reply(`❌ | ${e.message}`);
    }
  }

  else if (commandName === "stop") {
    if (!queue) {
      const botVoice = guild.members.me?.voice?.channel;
      if (botVoice) {
        distube.voices.leave(guild);
        return interaction.reply("⏹️ | **Stopped and left the voice channel.**");
      }
      return interaction.reply({ content: "❌ | **I am not in a voice channel!**", ephemeral: true });
    }
    await distube.stop(interaction);
    interaction.reply("⏹️ | **Stopped and left the voice channel.**");
  }

  else if (commandName === "queue") {
    if (!queue) return interaction.reply({ content: "❌ | **The queue is empty!**", ephemeral: true });
    const q = queue.songs
      .map((song, i) => `${i === 0 ? "Playing:" : `${i}.`} [${song.name}](${song.url}) - \`${song.formattedDuration}\``)
      .slice(0, 10)
      .join("\n");
    
    const embed = new EmbedBuilder()
      .setTitle(`Queue for ${guild.name}`)
      .setDescription(q + (queue.songs.length > 10 ? `\n...and ${queue.songs.length - 10} more songs.` : ""))
      .setColor("#5865F2");
    interaction.reply({ embeds: [embed] });
  }

  else if (commandName === "volume") {
    if (!queue) return interaction.reply({ content: "❌ | **There is nothing playing right now!**", ephemeral: true });
    const volume = options.getInteger("percent");
    if (volume < 0 || volume > 100) {
      return interaction.reply({ content: "❌ | **Volume must be between 0 and 100!**", ephemeral: true });
    }
    distube.setVolume(interaction, volume);
    interaction.reply(`🔊 | **Volume set to ${volume}%**`);
  }

  else if (commandName === "pause") {
    if (!queue) return interaction.reply({ content: "❌ | **There is nothing playing right now!**", ephemeral: true });
    if (queue.paused) return interaction.reply({ content: "❌ | **Playback is already paused!**", ephemeral: true });
    distube.pause(interaction);
    interaction.reply("⏸️ | **Paused the music.**");
  }

  else if (commandName === "resume") {
    if (!queue) return interaction.reply({ content: "❌ | **There is nothing playing right now!**", ephemeral: true });
    if (!queue.paused) return interaction.reply({ content: "❌ | **Playback is not paused!**", ephemeral: true });
    distube.resume(interaction);
    interaction.reply("▶️ | **Resumed the music.**");
  }
});

// --- DisTube Event Listeners ---

distube
  .on("playSong", (queue, song) => {
    // Generate beautiful Embed
    const embed = new EmbedBuilder()
      .setTitle("🎶 Now Playing")
      .setDescription(`**[${song.name}](${song.url})**`) // Clickable link to YouTube video URL
      .addFields(
        { name: "👤 Requested by", value: `${song.user}`, inline: true },
        { name: "⏱️ Duration", value: `\`${song.formattedDuration}\``, inline: true },
        { name: "🎙️ Channel", value: `${queue.voiceChannel.name}`, inline: true },
        { name: "🎥 Watch Video", value: `[Click here to watch on YouTube](${song.url})`, inline: false } // Clicking here shows video
      )
      .setThumbnail(song.thumbnail)
      .setColor("#E50914") // Premium vibrant YouTube red
      .setFooter({ text: "Sound Premium Music Bot", iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    queue.textChannel.send({ embeds: [embed] }).catch(err => console.error(err));
  })
  .on("addSong", (queue, song) => {
    const embed = new EmbedBuilder()
      .setTitle("✅ Song Added to Queue")
      .setDescription(`**[${song.name}](${song.url})**`)
      .addFields(
        { name: "⏱️ Duration", value: `\`${song.formattedDuration}\``, inline: true },
        { name: "🎥 Watch Video", value: `[Click here to watch on YouTube](${song.url})`, inline: true }
      )
      .setThumbnail(song.thumbnail)
      .setColor("#5865F2")
      .setTimestamp();
    
    queue.textChannel.send({ embeds: [embed] }).catch(err => console.error(err));
  })
  .on("addList", (queue, playlist) => {
    const embed = new EmbedBuilder()
      .setTitle("✅ Playlist Added to Queue")
      .setDescription(`**[${playlist.name}](${playlist.url})**`)
      .addFields(
        { name: "🎵 Song Count", value: `\`${playlist.songs.length}\` songs`, inline: true }
      )
      .setColor("#5865F2")
      .setTimestamp();
    
    queue.textChannel.send({ embeds: [embed] }).catch(err => console.error(err));
  })
  .on("error", (channel, error) => {
    console.error("DisTube Exception:", error);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Error Occurred")
        .setDescription(`Playback error: ${error.message || error}`)
        .setColor("#FF0000");
      channel.send({ embeds: [embed] }).catch(err => console.error(err));
    }
  });

// Login the bot client
client.login(process.env.Token);
