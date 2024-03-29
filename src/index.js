import got from 'got'
import { createHash } from 'node:crypto'
import { FormData } from 'formdata-node'
import { fileFromPath } from 'formdata-node/file-from-path'
import { createReadStream } from 'node:fs'
import { mkdir, symlink, writeFile, readdir } from 'node:fs/promises'
import { pathExists } from 'path-exists'
import { basename, extname, join } from 'node:path'
import { reduce } from 'streaming-iterables'
import { z } from 'zod'
import { exiftool } from 'exiftool-vendored'
import { ListObjectsV2Command, S3 } from '@aws-sdk/client-s3'
import { Upload as S3Upload } from '@aws-sdk/lib-storage'
import difference from 'set.prototype.difference'

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

  let { name, createdAt, fileHash } = options

  if (fileHash == null) {
    fileHash = await getFileHash({ filePath })
  }

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
  if (
    createdAt == null &&
    metadata.CreateDate != null &&
    typeof metadata.CreateDate.toDate === 'function'
  ) {
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

  const {
    video: { uuid },
  } = await got
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

export async function* scanVideoDir(config, options) {
  const { dataDir } = config
  const { dirPath } = options

  const fileNames = await readdir(dirPath)
  for (const fileName of fileNames) {
    const filePath = join(dirPath, fileName)

    const fileHash = await getFileHash({ filePath })
    const uploadedPath = join(dataDir, 'uploaded', fileHash)
    if (await pathExists(uploadedPath)) {
      continue
    }

    yield {
      filePath,
      fileHash,
    }
  }
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

export async function* getPeertubeVideos(config, options, position = {}) {
  const { peertubeUrl, peertubeChannel } = config
  const { chunkSize, accessToken } = options
  const { start = 0, count = chunkSize } = position

  const { data } = await got({
    url: `api/v1/video-channels/${peertubeChannel}/videos`,
    prefixUrl: peertubeUrl,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    searchParams: {
      count,
      start,
      sort: '-publishedAt',
      skipCount: 'true',
    },
  }).json()

  for (const video of data) {
    yield video
  }

  if (!(data.length < count)) {
    yield* getPeertubeVideos(config, options, {
      start: start + data.length,
      count,
    })
  }
}

export async function uploadS3OriginalVideo(config, options) {
  const { s3Bucket } = config
  const { filePath, uuid } = options

  const s3Client = createS3Client(config)

  const ext = extname(filePath).toLowerCase()
  const key = `originals/${uuid}${ext}`

  const upload = new S3Upload({
    client: s3Client,
    params: {
      Bucket: s3Bucket,
      Key: key,
      Body: createReadStream(filePath),
    },
    leavePartsOnError: false,
  })

  /*
  upload.on("httpUploadProgress", (progress) => {
    console.log(progress)
  })
  */

  await upload.done()

  return key
}

export async function* getS3VideosFromOriginalsBucket(
  config,
  options,
  continuationToken,
) {
  const { s3Bucket } = config
  const { chunkSize } = options

  const s3Client = createS3Client(config)

  const command = new ListObjectsV2Command({
    Bucket: s3Bucket,
    Prefix: 'originals',
    MaxKeys: chunkSize,
    ContinuationToken: continuationToken,
  })
  const response = await s3Client.send(command)
  const {
    Contents: data,
    IsTruncated: isTruncated,
    NextContinuationToken: nextContinuationToken,
  } = response

  for (const video of data) {
    yield video
  }

  if (isTruncated) {
    yield* getS3VideosFromOriginalsBucket(
      config,
      options,
      nextContinuationToken,
    )
  }
}

export async function getVideoIdsMissingFromS3OriginalsBucket(config, options) {
  const { chunkSize, peertubeAccessToken } = options

  const peertubeVideos = getPeertubeVideos(config, {
    chunkSize,
    accessToken: peertubeAccessToken,
  })
  const peertubeVideoIds = await reduce(
    (set, video) => {
      set.add(video.uuid)
      return set
    },
    new Set(),
    peertubeVideos,
  )

  const s3OriginalVideos = getS3VideosFromOriginalsBucket(config, { chunkSize })
  const s3OriginalVideoIds = await reduce(
    (set, video) => {
      const { Key: key } = video
      if (!key.startsWith('originals/')) throw new Error('unexpected')
      const uuid = video.Key.substring(10, 46)
      set.add(uuid)
      return set
    },
    new Set(),
    s3OriginalVideos,
  )

  const idsNotInS3Originals = difference(peertubeVideoIds, s3OriginalVideoIds)

  return idsNotInS3Originals
}

function createS3Client(config) {
  const { s3Endpoint, s3Key, s3Secret } = config

  return new S3({
    forcePathStyle: false,
    endpoint: s3Endpoint,
    region: 'us-east-1', // because reasons...
    credentials: {
      accessKeyId: s3Key,
      secretAccessKey: s3Secret,
    },
  })
}

const peertubeEnvSchema = z.object({
  PEERTUBE_URL: z.string().url().nonempty(),
  PEERTUBE_USERNAME: z.string().nonempty(),
  PEERTUBE_PASSWORD: z.string().nonempty(),
  PEERTUBE_CHANNEL: z.string().nonempty(),
})

export function loadPeertubeConfig() {
  const env = peertubeEnvSchema.parse(process.env)

  return {
    peertubeUrl: env.PEERTUBE_URL,
    peertubeUsername: env.PEERTUBE_USERNAME,
    peertubePassword: env.PEERTUBE_PASSWORD,
    peertubeChannel: env.PEERTUBE_CHANNEL,
  }
}

const s3EnvSchema = z.object({
  S3_ENDPOINT: z.string().nonempty(),
  S3_KEY: z.string().nonempty(),
  S3_SECRET: z.string().nonempty(),
  S3_BUCKET: z.string().nonempty(),
})

export function loadS3Config() {
  const env = s3EnvSchema.parse(process.env)

  return {
    s3Endpoint: env.S3_ENDPOINT,
    s3Key: env.S3_KEY,
    s3Secret: env.S3_SECRET,
    s3Bucket: env.S3_BUCKET,
  }
}
