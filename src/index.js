import got from 'got'
import { createHash } from 'node:crypto'
import { FormData } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path'
import { createReadStream } from 'node:fs'
import { mkdir, symlink, writeFile, realpath } from 'node:fs/promises'
import { dirname, basename, extname, join } from 'node:path'
import { sha256 } from 'crypto-hash'
import { pipeline } from 'streaming-iterables'
import dotEnv from 'dotenv'
import { z } from 'zod'
import { ExifDateTime, exiftool } from 'exiftool-vendored'

export async function getChannelId(config, options) {
  const { peertubeUrl, peertubeChannel } = config
  const { accessToken } = options

  const response = await got({
    url: `api/v1/video-channels/${peertubeChannel}`,
    prefixUrl: peertubeUrl,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  }).json()

  const { id: channelId } = response

  return channelId
}

export async function uploadPeertubeVideo(config, options) {
  const { dataDir, peertubeUrl } = config
  const {
    accessToken,
    filePath,
    channelId,
    description,
    categoryId,
    languageId = 'en',
    privacy = '1',
    waitTranscoding = true,
  } = options

  let { name, createdAt } = options

  const fileHash = await getFileHash({ filePath })

  await mkdir(join(dataDir, 'created'), { recursive: true })
  await mkdir(join(dataDir, 'uploaded'), { recursive: true })

  const ext = extname(filePath).toLowerCase()
  const newFilePath = join(dataDir, 'created', fileHash + ext)
  try {
    await symlink(filePath, newFilePath)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }

  const metadata = await exiftool.read(newFilePath)
  if (name == null && metadata.Title != null) {
    name = metadata.Title
  }
  if (createdAt == null && metadata.CreateDate != null) {
    createdAt = metadata.CreateDate.toDate()
  }

  if (name == null) {
    name = basename(filePath)
  }

  const form = new FormData()
  form.set('channelId', channelId)
  form.set('name', name)
  form.set('videofile', await fileFromPath(newFilePath))
  if (categoryId != null) {
    form.set('category', categoryId)
  }
  if (typeof description === 'string') {
    form.set('description', description)
  }
  form.set('language', languageId)
  if (createdAt != null) {
    form.set('originallyPublishedAt', createdAt.toISOString())
  }
  form.set('privacy', privacy)
  form.set('waitTranscoding', waitTranscoding)

  const { video: { uuid } } = await got
    .post({
      url: `api/v1/videos/upload`,
      prefixUrl: peertubeUrl,
      body: form,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    })
    .json()

  await writeFile(join(dataDir, 'uploaded', fileHash), uuid, 'utf-8')

  return uuid
}

export function getFileHash(options) {
  const { filePath } = options

  return new Promise((resolve, reject) => {
    const file = createReadStream(filePath, {
      start: 0,
      end: 1024 * 1024 - 1,
    })
    const hasher = createHash('sha256').setEncoding('hex')

    file.on('error', (err) => reject(err))
    file.on('data', (chunk) => hasher.update(chunk))
    file.on('end', () => resolve(hasher.digest('hex')))
  })
}

export async function getPeertubeAccessToken(config) {
  const { peertubeUrl, peertubeUsername, peertubePassword } = config

  const { client_id: clientId, client_secret: clientSecret } = await got({
    url: `api/v1/oauth-clients/local`,
    prefixUrl: peertubeUrl,
  }).json()

  const { access_token: accessToken } = await got
    .post({
      url: `api/v1/users/token`,
      prefixUrl: peertubeUrl,
      form: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'password',
        username: peertubeUsername,
        password: peertubePassword,
      },
    })
    .json()

  return accessToken
}

const envSchema = z.object({
  PEERTUBE_URL: z.string().url().nonempty(),
  PEERTUBE_USERNAME: z.string().nonempty(),
  PEERTUBE_PASSWORD: z.string().nonempty(),
  PEERTUBE_CHANNEL: z.string().nonempty(),
})

export function loadConfig() {
  dotEnv.config()

  const env = envSchema.parse(process.env)

  return {
    dataDir: join(process.cwd(), 'data'),
    peertubeUrl: env.PEERTUBE_URL,
    peertubeUsername: env.PEERTUBE_USERNAME,
    peertubePassword: env.PEERTUBE_PASSWORD,
    peertubeChannel: env.PEERTUBE_CHANNEL,
  }
}
