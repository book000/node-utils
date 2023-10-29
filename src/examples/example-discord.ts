import { Discord, DiscordMessageFlag, Logger } from '..'

export async function exampleDiscord() {
  const logger = Logger.configure('exampleDiscord')

  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!discordWebhookUrl) {
    logger.error('DISCORD_WEBHOOK_URL are required')
    return
  }

  const discord = new Discord({
    webhookUrl: discordWebhookUrl,
  })

  await discord.sendMessage('Hello world!')

  await discord.sendMessage({
    embeds: [
      {
        title: 'Hello world!',
        description:
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
        color: 0x00_ff_00,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Click me!',
            url: 'https://google.com',
          },
        ],
      },
    ],
    flags:
      DiscordMessageFlag.SuppressEmbeds |
      DiscordMessageFlag.SuppressNotifications,
  })
}
