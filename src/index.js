import got from 'got'
import { FormData, File } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path'
import { createReadStream } from 'node:fs'
import { mkdir, symlink, writeFile, realpath } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { sha256 } from 'crypto-hash'
import { pipeline } from 'streaming-iterables'
import dotEnv from 'dotenv'
import { z } from 'zod'

export async function getChannelId(config, options) {
  const { peertubeUrl } = config
  const { name } = options

  const response = await got
    .post({
      url: `api/videos/upload`,
      baseUrl: serverUrl,
      body: form,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    })
    .json()

  console.log('response', response)

  await writeFile(join(dataDir, 'uploaded'), JSON.stringify(response))
}

export async function uploadPeertubeVideo(config, options) {
  const { dataDir, peertubeUrl } = config
  let { name } = options
  const {
    accessToken,
    filePath,
    channelId,
    description,
    categoryId,
    languageId = 'en',
    originallyPublishedAt,
    privacy = '1',
    waitTranscoding = true,
  } = options

  const fileHash = await getFileHash({ filePath })

  if (name == null) {
    name = basename(filePath)
  }

  await mkdir(join(dataDir, 'created'), { recursive: true })
  await mkdir(join(dataDir, 'uploaded'), { recursive: true })

  await symlink(filePath, await realpath(join(dataDir, 'created', fileHash)))

  const form = new FormData()
  form.set('channelId', channelId)
  form.set('name', name)
  form.set('videofile', fileFromPath)
  if (categoryId != null) {
    form.set('category', categoryId)
  }
  if (typeof description === 'string') {
    form.set('description', description)
  }
  form.set('language', languageId)
  if (originallyPublishedAt != null) {
    form.set('originallyPublishedAt', originallyPublishedAt.toISOString())
  }
  form.set('privacy', privacy)
  form.set('waitTranscoding', waitTranscoding)

  const response = await got
    .post({
      url: `api/videos/upload`,
      baseUrl: serverUrl,
      body: form,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    })
    .json()

  console.log('response', response)

  await writeFile(join(dataDir, 'uploaded'), JSON.stringify(response))
}

async function getFileHash(options) {
  const { filePath } = options

  const file = createReadStream(filePath, {
    start: 0,
    end: 1e6,
  })

  return await sha256(file)
}

export async function getPeertubeAccessToken(config) {
  const { peertubeUrl, peertubeUsername, peertubePassword } = config

  const { clientId, clientSecret } = await got({
    url: `api/v1/oauth-clients/local`,
    baseUrl: peertubeUrl,
  }).json()

  const { access_token: accessToken } = await got({
    url: `api/v1/users/token`,
    baseUrl: peertubeUrl,
    data: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'password',
      username: peertubeUsername,
      password: peertubePassword,
    },
  }).json()

  return accessToken
}

const envSchema = z.object({
  DATA_DIR: z.string().nonempty(),
  PEERTUBE_URL: z.string().url().nonempty(),
  PEERTUBE_USERNAME: z.string().nonempty(),
  PEERTUBE_PASSWORD: z.string().nonempty(),
  PEERTUBE_CHANNEL_ID: z.string().nonempty(),
})

export function loadConfig() {
  const env = envSchema.parse(dotEnv.config())
  return {
    dataDir: env.DATA_DIR,
    peertubeUrl: env.PEERTUBE_URL,
    peertubeUsername: env.PEERTUBE_USERNAME,
    peertubePassword: env.PEERTUBE_PASSWORD,
  }
}
