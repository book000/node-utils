/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import axios from 'axios'
import { Discord } from '../discord'
import FormData from 'form-data'

// Axios をモック化
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// FormDataのメソッドをスパイ
const originalFormDataAppend = FormData.prototype.append
FormData.prototype.append = jest.fn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function (this: FormData, _field: string, _value: any, _options?: any) {
    // 元のappendメソッドは呼び出さないが、呼び出しのみ記録
    // TypeScript用のスタブを返す
    return {} as any
  }
)

// GetHeadersのモック
const originalFormDataGetHeaders = FormData.prototype.getHeaders
FormData.prototype.getHeaders = jest.fn(function (this: FormData) {
  return {
    'content-type':
      'multipart/form-data; boundary=---------------------------1234',
  }
})

// DiscordButtonStylesタイプの定数を定義（テスト用）
const LinkStyle = 5 as const

describe('Discord', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { id: 'mock-message-id' },
    })
    mockedAxios.patch.mockResolvedValue({ status: 200, data: {} })

    // FormDataのモックをリセット
    jest.clearAllMocks()
  })

  afterAll(() => {
    // テスト後にFormDataのメソッドを復元
    FormData.prototype.append = originalFormDataAppend
    FormData.prototype.getHeaders = originalFormDataGetHeaders
  })

  describe('constructor', () => {
    it('should initialize with bot options', () => {
      const options = { token: 'test-token', channelId: 'test-channel' }
      const discord = new Discord(options)
      expect(discord).toBeDefined()
    })

    it('should initialize with webhook options', () => {
      const options = { webhookUrl: 'https://discord.com/api/webhooks/123/abc' }
      const discord = new Discord(options)
      expect(discord).toBeDefined()
    })

    it('should throw an error with invalid options', () => {
      const options = { invalidOption: 'test' } as any
      expect(() => new Discord(options)).toThrow('Invalid options')
    })
  })

  describe('validations', () => {
    const validations = Discord.validations

    it('should validate token or webhookUrl and channelId', () => {
      expect(
        validations['token or webhookUrl and channelId']({ token: 'test' })
      ).toBe(true)
      expect(
        validations['token or webhookUrl and channelId']({
          webhookUrl: 'test',
          channelId: 'test',
        })
      ).toBe(true)
      expect(validations['token or webhookUrl and channelId']({})).toBe(false)
    })

    it('should validate token is valid', () => {
      expect(validations['token is valid']({ token: 'test' })).toBe(true)
      expect(validations['token is valid']({ token: 123 })).toBe(false)
      expect(validations['token is valid']({})).toBe(false)
    })

    it('should validate webhookUrl is valid', () => {
      expect(validations['webhookUrl is valid']({ webhookUrl: 'test' })).toBe(
        true
      )
      expect(validations['webhookUrl is valid']({ webhookUrl: 123 })).toBe(
        false
      )
      expect(validations['webhookUrl is valid']({})).toBe(false)
    })

    it('should validate channelId is valid', () => {
      expect(validations['channelId is valid']({ channelId: 'test' })).toBe(
        true
      )
      expect(validations['channelId is valid']({ channelId: 123 })).toBe(false)
      expect(validations['channelId is valid']({})).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should send a string message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      const messageId = await discord.sendMessage('Test message')

      expect(mockedAxios.post).toHaveBeenCalled()
      expect(messageId).toBe('mock-message-id')

      // formDataのチェックは難しいので、URLとヘッダーのみ確認
      const call = mockedAxios.post.mock.calls[0]
      expect(call[0]).toContain('/channels/test-channel/messages')
      expect(call[2]?.headers).toHaveProperty('Authorization', 'Bot test-token')
    })

    it('should send an embed message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      const embeds = [
        {
          title: 'Test Title',
          description: 'Test Description',
          color: 0xff_00_00,
        },
      ]

      const messageId = await discord.sendMessage({ embeds })

      expect(mockedAxios.post).toHaveBeenCalled()
      expect(messageId).toBe('mock-message-id')
    })

    it('should send a component message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      // as any でキャストしてテストする
      const components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: LinkStyle,
              label: 'Test Button',
              url: 'https://example.com',
            },
          ],
        },
      ] as any

      const messageId = await discord.sendMessage({ components })

      expect(mockedAxios.post).toHaveBeenCalled()
      expect(messageId).toBe('mock-message-id')
    })

    it('should send a file message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      // ダミーファイルデータの作成
      const file = {
        name: 'test.txt',
        file: new ArrayBuffer(10),
        contentType: 'text/plain',
      }

      await discord.sendMessage({ file })

      expect(FormData.prototype.append).toHaveBeenCalledWith(
        'file',
        expect.anything(),
        expect.objectContaining({
          filename: 'test.txt',
        })
      )
      expect(mockedAxios.post).toHaveBeenCalled()
    })

    it('should send a file message with spoiler via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      // ダミーファイルデータの作成（スポイラー付き）
      const file = {
        name: 'test.txt',
        file: new ArrayBuffer(10),
        contentType: 'text/plain',
        isSpoiler: true,
      }

      await discord.sendMessage({ file })

      expect(FormData.prototype.append).toHaveBeenCalledWith(
        'file',
        expect.anything(),
        expect.objectContaining({
          filename: 'SPOILER_test.txt',
        })
      )
      expect(mockedAxios.post).toHaveBeenCalled()
    })

    it('should send a message with flags via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      const messageId = await discord.sendMessage({ flags: 4100 })

      expect(mockedAxios.post).toHaveBeenCalled()
      expect(messageId).toBe('mock-message-id')
    })

    it('should send a message via webhook', async () => {
      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })
      const messageId = await discord.sendMessage('Test webhook message')

      expect(mockedAxios.post).toHaveBeenCalled()
      expect(messageId).toBe('mock-message-id')

      const call = mockedAxios.post.mock.calls[0]
      expect(call[0]).toContain(
        'https://discord.com/api/webhooks/123/abc?wait=true'
      )
    })

    it('should handle 204 status code for webhook messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        data: {}, // 204はデータがない場合も
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })

      const messageId = await discord.sendMessage('Test webhook message')

      // 204の場合はidはundefinedになる
      expect(messageId).toBeUndefined()
    })

    it('should handle API error for bot messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 400,
        data: { message: 'Bad Request' },
      })

      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      await expect(discord.sendMessage('Test message')).rejects.toThrow(
        'Discord API returned 400'
      )
    })

    it('should handle API error for webhook messages', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 404,
        data: { message: 'Not Found' },
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })
      await expect(discord.sendMessage('Test message')).rejects.toThrow(
        'Discord API returned 404'
      )
    })

    it('should mock sendBot to throw error with webhook options', async () => {
      mockedAxios.post.mockImplementationOnce(() => {
        throw new Error('Invalid bot options')
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })

      // sendMessageを使うと内部的にisDiscordBotOptionsで判定されて
      // sendWebhookにリダイレクトされるため、axiosをモックして間接的にテスト
      await expect(discord.sendMessage('Test message')).rejects.toThrow()
    })

    it('should mock sendWebhook to throw error with bot options', async () => {
      mockedAxios.post.mockImplementationOnce(() => {
        throw new Error('Invalid webhook options')
      })

      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      await expect(discord.sendMessage('Test message')).rejects.toThrow()
    })
  })

  describe('editMessage', () => {
    it('should edit a message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      await discord.editMessage('message-id', 'Updated message')

      expect(mockedAxios.patch).toHaveBeenCalled()

      const call = mockedAxios.patch.mock.calls[0]
      expect(call[0]).toContain('/channels/test-channel/messages/message-id')
      expect(call[2]?.headers).toHaveProperty('Authorization', 'Bot test-token')
    })

    it('should edit an embed message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      const embeds = [
        {
          title: 'Updated Title',
          description: 'Updated Description',
          color: 0x00_ff_00,
        },
      ]

      await discord.editMessage('message-id', { embeds })

      expect(mockedAxios.patch).toHaveBeenCalled()
    })

    it('should edit a file message via bot', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      // ダミーファイルデータ
      const file = {
        name: 'updated.txt',
        file: new ArrayBuffer(10),
        contentType: 'text/plain',
      }

      await discord.editMessage('message-id', { file })

      expect(FormData.prototype.append).toHaveBeenCalledWith(
        'file',
        expect.anything(),
        expect.objectContaining({
          filename: 'updated.txt',
          contentType: 'text/plain',
        })
      )
      expect(mockedAxios.patch).toHaveBeenCalled()
    })

    it('should edit a message via webhook', async () => {
      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })
      await discord.editMessage('message-id', 'Updated webhook message')

      expect(mockedAxios.patch).toHaveBeenCalled()

      const call = mockedAxios.patch.mock.calls[0]
      expect(call[0]).toContain(
        'https://discord.com/api/webhooks/123/abc?wait=true/messages/message-id'
      )
    })

    it('should handle 204 status code for webhook message edit', async () => {
      mockedAxios.patch.mockResolvedValueOnce({
        status: 204,
        data: {}, // 204はデータがない場合も
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })

      await discord.editMessage('message-id', 'Test webhook message')

      // 正常に完了するはず
      expect(mockedAxios.patch).toHaveBeenCalled()
    })

    it('should handle API error for bot message edit', async () => {
      mockedAxios.patch.mockResolvedValueOnce({
        status: 400,
        data: { message: 'Bad Request' },
      })

      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      await expect(
        discord.editMessage('message-id', 'Test message')
      ).rejects.toThrow('Discord API returned 400')
    })

    it('should handle API error for webhook message edit', async () => {
      mockedAxios.patch.mockResolvedValueOnce({
        status: 404,
        data: { message: 'Not Found' },
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })
      await expect(
        discord.editMessage('message-id', 'Test message')
      ).rejects.toThrow('Discord API returned 404')
    })

    it('should mock editBot to throw error with webhook options', async () => {
      mockedAxios.patch.mockImplementationOnce(() => {
        throw new Error('Invalid bot options')
      })

      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })

      await expect(
        discord.editMessage('message-id', 'Test message')
      ).rejects.toThrow()
    })

    it('should mock editWebhook to throw error with bot options', async () => {
      mockedAxios.patch.mockImplementationOnce(() => {
        throw new Error('Invalid webhook options')
      })

      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })

      await expect(
        discord.editMessage('message-id', 'Test message')
      ).rejects.toThrow()
    })
  })

  describe('internal methods', () => {
    // これらのテストはプライベートメソッドをテストするため、リフレクションなどを使わず
    // 間接的に挙動を確認しています

    it('should identify valid bot options', async () => {
      const discord = new Discord({
        token: 'test-token',
        channelId: 'test-channel',
      })
      await discord.sendMessage('Test message')

      // Bot APIのURLが呼ばれていることを確認
      const call = mockedAxios.post.mock.calls[0]
      expect(call[0]).toContain('/channels/test-channel/messages')
    })

    it('should identify valid webhook options', async () => {
      const discord = new Discord({
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      })
      await discord.sendMessage('Test message')

      // Webhook APIのURLが呼ばれていることを確認
      const call = mockedAxios.post.mock.calls[0]
      expect(call[0]).toContain('https://discord.com/api/webhooks/123/abc')
    })

    it('should invalidate incomplete bot options', () => {
      expect(() => new Discord({ token: 'test-token' } as any)).toThrow(
        'Invalid options'
      )
      expect(() => new Discord({ channelId: 'test-channel' } as any)).toThrow(
        'Invalid options'
      )
    })
  })
})
