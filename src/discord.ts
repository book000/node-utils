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

/** メッセージ送信 (Create Message / Execute Webhook) で指定できる flags */
const SEND_ALLOWED_FLAGS =
  DiscordMessageFlag.SuppressEmbeds | DiscordMessageFlag.SuppressNotifications

/**
 * メッセージ編集 (Edit Message / Edit Webhook Message) で変更できる flags
 *
 * Discord API の仕様上、編集で設定・解除できるのは `SuppressEmbeds` のみ。
 */
const EDIT_CHANGEABLE_FLAGS = DiscordMessageFlag.SuppressEmbeds

/**
 * メッセージ編集で指定できる flags
 *
 * Discord API は flags を編集する際に、既存の flag も含めて指定することを求めている。
 * そのため、変更できる flag (`EDIT_CHANGEABLE_FLAGS`) に加えて、変更はできないが
 * 保持のために指定が必要な flag (`SuppressNotifications` など、送信時に指定できる flag) も受理する。
 * 変更できない flag は Discord 側で無視される。
 */
const EDIT_ALLOWED_FLAGS = EDIT_CHANGEABLE_FLAGS | SEND_ALLOWED_FLAGS

/**
 * メッセージ flags。他のメッセージ種別と組み合わせて指定できる。
 *
 * - 送信時は `SuppressEmbeds` と `SuppressNotifications` を指定できる
 * - 編集時に設定・解除できるのは `SuppressEmbeds` のみ (Discord API の仕様)。
 *   flags を編集する際は既存の flag も含めて指定する必要があるため、
 *   `SuppressNotifications` 付きで送信したメッセージに `SuppressEmbeds` を追加する場合は
 *   両方を指定する (`SuppressEmbeds | SuppressNotifications`)。
 *   `SuppressNotifications` 自体は編集で変更できず、Discord 側で無視される
 * - 上記以外の flag を含む場合は Error を投げる
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

export class Discord {
  private options: DiscordOptions

  constructor(options: DiscordOptions) {
    // token があれば Bot として動作する
    // webhookUrl と channelId があれば Webhook として動作する
    // どちらもなければエラーを投げる

    if (
      this.isDiscordBotOptions(options) ||
      this.isDiscordWebhookOptions(options)
    ) {
      this.options = options
    } else {
      throw new Error('Invalid options')
    }
  }

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

  public async sendMessage(
    message: string | DiscordMessage
  ): Promise<string | undefined> {
    const formData = this.buildFormData(message, SEND_ALLOWED_FLAGS)

    return await (this.isDiscordBotOptions(this.options)
      ? this.sendBot(formData)
      : this.sendWebhook(formData))
  }

  /**
   * 送信・編集 API に渡す FormData を生成する
   *
   * @param message 送信・編集するメッセージ
   * @param allowedFlags API が受理する flags のビットマスク
   * @returns payload_json (と添付ファイル) を含む FormData
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
   * flags が API の制約に沿っているか検証する
   *
   * @param flags 検証する flags
   * @param allowedFlags API が受理する flags のビットマスク
   * @throws flags が 0 以上の整数でない場合、または受理されない flag を含む場合
   */
  private validateFlags(flags: number, allowedFlags: number): void {
    // JavaScript のビット演算子は 32bit 符号付き整数で動作する (0x7f_ff_ff_ff はその最大値)。
    // 上限を超える値は 32bit に丸められて検証をすり抜けるため、ビット演算の前に拒否する
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
   * メッセージ ID を URL のパスセグメントとして安全な形にする
   *
   * @param messageId 編集するメッセージの ID
   * @returns エンコード済みのメッセージ ID
   * @throws メッセージ ID が空、または `.` / `..` の場合
   */
  private encodeMessageId(messageId: string): string {
    const encoded = encodeURIComponent(messageId)
    // `.` と `..` は URL の解決時にパスの階層として扱われ、/messages/ の外を指してしまう
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

    // href に連結するとクエリ文字列の後ろにパスが付いてしまう (?wait=true/messages/<id>) ため、
    // pathname に追加する。編集 API は wait を使わないので付与しない
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
