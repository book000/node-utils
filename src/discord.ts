import axios from 'axios'
import FormData from 'form-data'

interface DiscordBotOptions {
  token: string
  channelId: string
}

interface DiscordWebhookOptions {
  webhookUrl: string
}

export type DiscordOptions = DiscordBotOptions | DiscordWebhookOptions
export interface DiscordEmbedFooter {
  text: string
  icon_url?: string
  proxy_icon_url?: string
}

export interface DiscordEmbedImage {
  url?: string
  proxy_url?: string
  height?: number
  width?: number
}

export interface DiscordEmbedThumbnail {
  url?: string
  proxy_url?: string
  height?: number
  width?: number
}

export interface DiscordEmbedVideo {
  url?: string
  proxy_url?: string
  height?: number
  width?: number
}

export interface DiscordEmbedProvider {
  name?: string
  url?: string
}

export interface DiscordEmbedAuthor {
  name?: string
  url?: string
  icon_url?: string
  proxy_icon_url?: string
}

export interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordEmbed {
  title?: string
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link'
  description?: string
  url?: string
  timestamp?: string
  color?: number
  footer?: DiscordEmbedFooter
  image?: DiscordEmbedImage
  thumbnail?: DiscordEmbedThumbnail
  video?: DiscordEmbedVideo
  provider?: DiscordEmbedProvider
  author?: DiscordEmbedAuthor
  fields?: DiscordEmbedField[]
}

interface DiscordNormalMessage {
  content: string
}

interface DiscordEmbedMessage {
  embeds: DiscordEmbed[]
}

interface DiscordFile {
  name: string
  file: ArrayBuffer
  contentType?: string
  isSpoiler?: boolean
}

interface DiscordFileMessage {
  file: DiscordFile
}

const DiscordButtonStyles = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
  Link: 5,
} as const

// only link button is supported
interface DiscordButton {
  type: 2
  style: typeof DiscordButtonStyles.Link
  label?: string
  emoji?: {
    id?: string
    name?: string
    animated?: boolean
  }
  url: string
  disabled?: boolean
}

interface DiscordComponent {
  type: 1
  components: DiscordButton[]
}

interface DiscordComponentMessage {
  components: DiscordComponent[]
}

export type DiscordMessage =
  | DiscordNormalMessage
  | DiscordEmbedMessage
  | DiscordFileMessage
  | DiscordComponentMessage

export class Discord {
  private options: DiscordOptions

  constructor(options: DiscordOptions) {
    // token があれば Bot として動作する
    // webhookUrl と channelId があれば Webhook として動作する
    // どちらもなければエラーを投げる

    if (this.isDiscordBotOptions(options)) {
      this.options = options
    } else if (this.isDiscordWebhookOptions(options)) {
      this.options = options
    } else {
      throw new Error('Invalid options')
    }
  }

  public static get validations(): {
    [key: string]: (options: any) => boolean
  } {
    return {
      'token or webhookUrl and channelId': (options: any) =>
        'token' in options ||
        ('webhookUrl' in options && 'channelId' in options),
      'token is valid': (options: any) => typeof options.token === 'string',
      'webhookUrl is valid': (options: any) =>
        typeof options.webhookUrl === 'string',
      'channelId is valid': (options: any) =>
        typeof options.channelId === 'string',
    }
  }

  public async sendMessage(message: string | DiscordMessage): Promise<string> {
    const formData = new FormData()

    if (typeof message === 'string') {
      formData.append('payload_json', JSON.stringify({ content: message }))
    } else {
      formData.append(
        'payload_json',
        JSON.stringify({
          content: 'content' in message ? message.content : undefined,
          embeds: 'embeds' in message ? message.embeds : undefined,
          components: 'components' in message ? message.components : undefined,
        })
      )

      if ('file' in message) {
        formData.append('file', message.file.file, {
          filename: `${message.file.isSpoiler === true ? 'SPOILER_' : ''}${
            message.file.name
          }`,
          contentType: message.file.contentType,
        })
      }
    }

    return await (this.isDiscordBotOptions(this.options)
      ? this.sendBot(formData)
      : this.sendWebhook(formData))
  }

  private async sendBot(formData: FormData): Promise<string> {
    if (!this.isDiscordBotOptions(this.options)) {
      throw new Error('Invalid bot options')
    }

    const response = await axios.post(
      `https://discord.com/api/channels/${this.options.channelId}/messages`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bot ${this.options.token}`,
        },
        validateStatus: () => true,
      }
    )
    if (response.status !== 200) {
      throw new Error(
        `Discord API returned ${response.status}: ${response.data}`
      )
    }

    return response.data.id
  }

  private async sendWebhook(formData: FormData): Promise<string> {
    if (!this.isDiscordWebhookOptions(this.options)) {
      throw new Error('Invalid webhook options')
    }

    const urlObject = new URL(this.options.webhookUrl)
    urlObject.searchParams.append('wait', 'true')

    const response = await axios.post(urlObject.toString(), formData, {
      headers: {
        ...formData.getHeaders(),
      },
      validateStatus: () => true,
    })
    if (response.status !== 200 && response.status !== 204) {
      throw new Error(
        `Discord API returned ${response.status}: ${response.data}`
      )
    }

    return response.data.id
  }

  public async editMessage(
    messageId: string,
    message: string | DiscordMessage
  ): Promise<void> {
    const formData = new FormData()

    if (typeof message === 'string') {
      formData.append('payload_json', JSON.stringify({ content: message }))
    } else {
      formData.append(
        'payload_json',
        JSON.stringify({
          content: 'content' in message ? message.content : undefined,
          embeds: 'embeds' in message ? message.embeds : undefined,
          components: 'components' in message ? message.components : undefined,
        })
      )

      if ('file' in message) {
        formData.append('file', message.file.file, {
          filename: `${message.file.isSpoiler === true ? 'SPOILER_' : ''}${
            message.file.name
          }`,
          contentType: message.file.contentType,
        })
      }
    }

    await (this.isDiscordBotOptions(this.options)
      ? this.editBot(messageId, formData)
      : this.editWebhook(messageId, formData))
  }

  private async editBot(messageId: string, formData: FormData): Promise<void> {
    if (!this.isDiscordBotOptions(this.options)) {
      throw new Error('Invalid bot options')
    }

    const response = await axios.patch(
      `https://discord.com/api/channels/${this.options.channelId}/messages/${messageId}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bot ${this.options.token}`,
        },
        validateStatus: () => true,
      }
    )
    if (response.status !== 200) {
      throw new Error(
        `Discord API returned ${response.status}: ${response.data}`
      )
    }
  }

  private async editWebhook(
    messageId: string,
    formData: FormData
  ): Promise<void> {
    if (!this.isDiscordWebhookOptions(this.options)) {
      throw new Error('Invalid webhook options')
    }

    const urlObject = new URL(this.options.webhookUrl)
    urlObject.searchParams.append('wait', 'true')

    const response = await axios.patch(
      `${urlObject.toString()}/messages/${messageId}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        validateStatus: () => true,
      }
    )
    if (response.status !== 200 && response.status !== 204) {
      throw new Error(
        `Discord API returned ${response.status}: ${response.data}`
      )
    }
  }

  private isDiscordBotOptions(
    options: DiscordOptions
  ): options is DiscordBotOptions {
    return (
      'token' in options &&
      typeof options.token === 'string' &&
      options.token.length > 0 &&
      'channelId' in options &&
      typeof options.channelId === 'string' &&
      options.channelId.length > 0
    )
  }

  private isDiscordWebhookOptions(
    options: DiscordOptions
  ): options is DiscordWebhookOptions {
    return (
      'webhookUrl' in options &&
      typeof options.webhookUrl === 'string' &&
      options.webhookUrl.length > 0
    )
  }
}
