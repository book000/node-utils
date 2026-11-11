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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export const DiscordMessageFlag = {
  SuppressEmbeds: 1 << 2,
  SuppressNotifications: 1 << 12,
} as const

/** Flags accepted when sending a message (Create Message / Execute Webhook) */
const SEND_ALLOWED_FLAGS =
  DiscordMessageFlag.SuppressEmbeds | DiscordMessageFlag.SuppressNotifications

/**
 * Flags that can be changed when editing a message (Edit Message / Edit Webhook Message).
 *
 * Per the Discord API, only `SuppressEmbeds` can be set or unset by an edit.
 */
const EDIT_CHANGEABLE_FLAGS = DiscordMessageFlag.SuppressEmbeds

/**
 * Flags accepted when editing a message.
 *
 * The Discord API requires the existing flags to be included when editing flags.
 * So in addition to the changeable flags (`EDIT_CHANGEABLE_FLAGS`), this also accepts flags that cannot be changed
 * but must be passed to keep them (the flags accepted on send, such as `SuppressNotifications`).
 * Flags that cannot be changed are ignored by Discord.
 */
const EDIT_ALLOWED_FLAGS = EDIT_CHANGEABLE_FLAGS | SEND_ALLOWED_FLAGS

/**
 * Message flags. They can be combined with the other message types.
 *
 * - On send, `SuppressEmbeds` and `SuppressNotifications` can be specified
 * - On edit, only `SuppressEmbeds` can be set or unset (Discord API restriction).
 *   Existing flags must be included when editing flags, so to add `SuppressEmbeds` to a message
 *   sent with `SuppressNotifications`, pass both (`SuppressEmbeds | SuppressNotifications`).
 *   `SuppressNotifications` itself cannot be changed by an edit and is ignored by Discord
 * - An Error is thrown if any other flag is included
 */
interface DiscordMessageFlags {
  flags: number
}

export type DiscordMessage =
  | DiscordNormalMessage
  | DiscordEmbedMessage
  | DiscordFileMessage
  | DiscordComponentMessage
  | DiscordMessageFlags

/**
 * Sends and edits Discord messages through a Bot or a Webhook.
 */
export class Discord {
  private options: DiscordOptions

  /**
   * Acts as a Bot when both `token` and `channelId` are non-empty strings,
   * otherwise as a Webhook when `webhookUrl` is a non-empty string.
   *
   * @param options Bot options (`token` and `channelId`) or Webhook options (`webhookUrl`)
   * @throws If neither a valid Bot nor a valid Webhook configuration is given
   */
  constructor(options: DiscordOptions) {
    if (
      this.isDiscordBotOptions(options) ||
      this.isDiscordWebhookOptions(options)
    ) {
      this.options = options
    } else {
      throw new Error('Invalid options')
    }
  }

  /**
   * Validation rules for {@link ConfigFramework.validates}.
   *
   * Note that the rules cannot all pass for any single configuration:
   * a Bot configuration fails `webhookUrl is valid`, and a Webhook configuration fails `token is valid`.
   */
  public static get validations(): Record<string, (options: any) => boolean> {
    return {
      'token or webhookUrl and channelId': (options: any) =>
        'token' in options ||
        ('webhookUrl' in options && 'channelId' in options),
      'token is valid': (options: any) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        'token' in options && typeof options.token === 'string',
      'webhookUrl is valid': (options: any) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        'webhookUrl' in options && typeof options.webhookUrl === 'string',
      'channelId is valid': (options: any) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        'channelId' in options && typeof options.channelId === 'string',
    }
  }

  /**
   * Sends a message.
   *
   * @param message Message text, or a message object (content, embeds, components, file and/or flags)
   * @returns The ID of the sent message. undefined when a Webhook responds with 204
   * @throws If the flags are invalid or the Discord API returns an error status
   */
  public async sendMessage(
    message: string | DiscordMessage
  ): Promise<string | undefined> {
    const formData = this.buildFormData(message, SEND_ALLOWED_FLAGS)

    return await (this.isDiscordBotOptions(this.options)
      ? this.sendBot(formData)
      : this.sendWebhook(formData))
  }

  /**
   * Builds the FormData passed to the send/edit API.
   *
   * @param message Message to send or edit
   * @param allowedFlags Bit mask of the flags the API accepts
   * @returns FormData containing payload_json (and the attached file)
   */
  private buildFormData(
    message: string | DiscordMessage,
    allowedFlags: number
  ): FormData {
    const formData = new FormData()

    if (typeof message === 'string') {
      formData.append('payload_json', JSON.stringify({ content: message }))
      return formData
    }

    const flags = 'flags' in message ? message.flags : undefined
    if (flags !== undefined) {
      this.validateFlags(flags, allowedFlags)
    }

    formData.append(
      'payload_json',
      JSON.stringify({
        content: 'content' in message ? message.content : undefined,
        embeds: 'embeds' in message ? message.embeds : undefined,
        components: 'components' in message ? message.components : undefined,
        flags,
      })
    )

    if ('file' in message) {
      const filename = `${message.file.isSpoiler === true ? 'SPOILER_' : ''}${message.file.name}`
      const blob = new Blob([message.file.file], {
        type: message.file.contentType,
      })
      formData.append('file', blob, filename) // WHATWG FormData (Node.js 18+)
    }

    return formData
  }

  /**
   * Validates that flags satisfy the API constraints.
   *
   * @param flags Flags to validate
   * @param allowedFlags Bit mask of the flags the API accepts
   * @throws If flags is not a non-negative integer, or contains a flag that is not accepted
   */
  private validateFlags(flags: number, allowedFlags: number): void {
    // JavaScript bitwise operators work on 32-bit signed integers (0x7f_ff_ff_ff is the maximum).
    // Values above the limit would be truncated to 32 bits and slip through the check, so reject them before any bit operation
    if (!Number.isSafeInteger(flags) || flags < 0 || flags > 0x7f_ff_ff_ff) {
      throw new Error(`Invalid flags: ${flags} must be a non-negative integer`)
    }
    const unsupported = flags & ~allowedFlags
    if (unsupported !== 0) {
      throw new Error(
        `Unsupported flags: ${unsupported} cannot be set (allowed mask: ${allowedFlags})`
      )
    }
  }

  private async sendBot(formData: FormData): Promise<string> {
    if (!this.isDiscordBotOptions(this.options)) {
      throw new Error('Invalid bot options')
    }

    const response = await fetch(
      `https://discord.com/api/channels/${this.options.channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.options.token}`,
        },
        body: formData,
      }
    )
    if (response.status !== 200) {
      const data = await response.json()
      throw new Error(
        `Discord API returned ${response.status}: ${JSON.stringify(data)}`
      )
    }

    const data = (await response.json()) as { id: string }
    return data.id
  }

  private async sendWebhook(formData: FormData): Promise<string | undefined> {
    if (!this.isDiscordWebhookOptions(this.options)) {
      throw new Error('Invalid webhook options')
    }

    const urlObject = new URL(this.options.webhookUrl)
    urlObject.searchParams.append('wait', 'true')

    const response = await fetch(urlObject.href, {
      method: 'POST',
      body: formData,
    })
    if (response.status !== 200 && response.status !== 204) {
      const data = await response.json()
      throw new Error(
        `Discord API returned ${response.status}: ${JSON.stringify(data)}`
      )
    }

    if (response.status === 204) {
      return undefined
    }

    const data = (await response.json()) as { id: string }
    return data.id
  }

  /**
   * Edits a message that was sent through the same Bot channel or Webhook.
   *
   * @param messageId ID of the message to edit
   * @param message New message text, or a message object. Flags allowed on edit are described in the flags section of the README
   * @throws If messageId is invalid, the flags are invalid, or the Discord API returns an error status
   */
  public async editMessage(
    messageId: string,
    message: string | DiscordMessage
  ): Promise<void> {
    const formData = this.buildFormData(message, EDIT_ALLOWED_FLAGS)

    await (this.isDiscordBotOptions(this.options)
      ? this.editBot(messageId, formData)
      : this.editWebhook(messageId, formData))
  }

  /**
   * Makes a message ID safe to use as a URL path segment.
   *
   * @param messageId ID of the message to edit
   * @returns The encoded message ID
   * @throws If the message ID is empty, `.` or `..`
   */
  private encodeMessageId(messageId: string): string {
    const encoded = encodeURIComponent(messageId)
    // `.` and `..` are treated as path levels when the URL is resolved and would point outside /messages/
    if (['', '.', '..'].includes(encoded)) {
      throw new Error(`Invalid messageId: ${messageId}`)
    }
    return encoded
  }

  private async editBot(messageId: string, formData: FormData): Promise<void> {
    if (!this.isDiscordBotOptions(this.options)) {
      throw new Error('Invalid bot options')
    }

    const response = await fetch(
      `https://discord.com/api/channels/${this.options.channelId}/messages/${this.encodeMessageId(messageId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${this.options.token}`,
        },
        body: formData,
      }
    )
    if (response.status === 200) {
      return
    }
    const data = await response.json()
    throw new Error(
      `Discord API returned ${response.status}: ${JSON.stringify(data)}`
    )
  }

  private async editWebhook(
    messageId: string,
    formData: FormData
  ): Promise<void> {
    if (!this.isDiscordWebhookOptions(this.options)) {
      throw new Error('Invalid webhook options')
    }

    // Appending to href would put the path after the query string (?wait=true/messages/<id>),
    // so append to pathname. The edit API does not use wait, so it is not added
    const urlObject = new URL(this.options.webhookUrl)
    urlObject.pathname = `${urlObject.pathname.replace(/\/$/, '')}/messages/${this.encodeMessageId(messageId)}`

    const response = await fetch(urlObject.href, {
      method: 'PATCH',
      body: formData,
    })
    if (response.status === 200 || response.status === 204) {
      return
    }
    const text = await response.text()
    throw new Error(`Discord API returned ${response.status}: ${text}`)
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
