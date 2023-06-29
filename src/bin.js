import { Command } from 'commander'
import { exiftool } from 'exiftool-vendored'
import dotEnv from 'dotenv'
import { join } from 'node:path'

import {
  getChannelId,
  getFileHash,
  getPeertubeAccessToken,
  getVideoIdsMissingFromS3OriginalsBucket,
  loadPeertubeConfig,
  loadS3Config,
  scanVideoDir,
  uploadPeertubeVideo,
  uploadS3OriginalVideo,
} from './index.js'

dotEnv.config()
const baseConfig = {
  dataDir: join(process.cwd(), 'data'),
}

const program = new Command()

program
  .name('tube-tools')
  .description('Command-line tools to manage tube.arthack.nz')

program
  .command('upload')
  .description('Upload a video to PeerTube and our backup storage')
  .argument('<path>', 'path to file')
  .option('--name <text>', 'name of video')
  .option('--description <text>', 'description for video')
  .action(async (filePath, options) => {
    const { name, description } = options
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
      ...loadS3Config(),
    }
    const { peertubeUrl, s3Bucket } = config
    const accessToken = await getPeertubeAccessToken(config)
    const channelId = await getChannelId(config, { accessToken })

    console.log(`Uploading to PeerTube: ${filePath}`)
    const uuid = await uploadPeertubeVideo(config, {
      accessToken,
      filePath,
      channelId,
      name,
      description,
    })
    console.log(`Uploaded: ${peertubeUrl}/videos/watch/${uuid}`)

    console.log(`Uploading original to backup: ${uuid}`)
    const key = await uploadS3OriginalVideo(config, {
      filePath,
      uuid,
    })
    console.log(`Uploaded: ${s3Bucket}/${key}`)
  })

program
  .command('upload-peertube')
  .description('Upload a video to PeerTube')
  .argument('<path>', 'path to file')
  .option('--name <text>', 'name of video')
  .option('--description <text>', 'description for video')
  .action(async (filePath, options) => {
    const { name, description } = options
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
    }
    const accessToken = await getPeertubeAccessToken(config)
    const channelId = await getChannelId(config, { accessToken })

    console.log(`Uploading to PeerTube: ${filePath}`)
    const uuid = await uploadPeertubeVideo(config, {
      accessToken,
      filePath,
      channelId,
      name,
      description,
    })
    const { peertubeUrl } = config
    console.log(`Uploaded: ${peertubeUrl}/videos/watch/${uuid}`)
  })

program
  .command('upload-original')
  .description('Upload an original video to our backup storage')
  .argument('<path>', 'path to file')
  .requiredOption('--uuid <uuid>', 'uuid of video on PeerTube')
  .action(async (filePath, options) => {
    const { uuid } = options
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
      ...loadS3Config(),
    }
    const { s3Bucket } = config

    console.log(`Uploading original to backup: ${uuid}`)
    const key = await uploadS3OriginalVideo(config, { filePath, uuid })
    console.log(`Uploaded: ${s3Bucket}/${key}`)
  })

program
  .command('upload-dir')
  .description('Upload a directory of videos to PeerTube')
  .argument('<path>', 'path to directory')
  .action(async (dirPath, _options) => {
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
    }
    const accessToken = await getPeertubeAccessToken(config)
    const channelId = await getChannelId(config, { accessToken })

    console.log(`Scanning dir for new uploads: ${dirPath}`)
    const newUploads = scanVideoDir(config, { dirPath })
    for await (const { filePath, fileHash } of newUploads) {
      console.log(`Uploading to PeerTube: ${filePath}`)
      const uuid = await uploadPeertubeVideo(config, {
        accessToken,
        filePath,
        fileHash,
        channelId,
      })
      console.log(`Uploaded: ${peertubeUrl}/videos/watch/${uuid}`)

      console.log(`Uploading original to backup: ${uuid}`)
      const key = await uploadS3OriginalVideo(config, {
        filePath,
        uuid,
      })
      console.log(`Uploaded: ${s3Bucket}/${key}`)
    }
  })

program
  .command('metadata')
  .description('Read metadata in a video file')
  .argument('<path>', 'path to file')
  .action(async (filePath) => {
    const metadata = await exiftool.read(filePath)
    console.log(JSON.stringify(metadata, null, 2))
  })

program
  .command('hash')
  .description('Get hash of initial 1 MB of file')
  .argument('<path>', 'path to file')
  .action(async (filePath) => {
    const hash = await getFileHash({ filePath })
    console.log(hash)
  })

program
  .command('get-videos-missing-from-s3-originals-bucket')
  .description('Get list of videos missing from s3 originals bucket')
  .action(async (dirPath, _options) => {
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
      ...loadS3Config(),
    }

    const peertubeAccessToken = await getPeertubeAccessToken(config)
    const idsNotInS3Originals = await getVideoIdsMissingFromS3OriginalsBucket(
      config,
      { chunkSize: 10, peertubeAccessToken },
    )
    console.log('Video uuids not in S3 originals/ bucket:')
    console.log()
    for (const id of idsNotInS3Originals) {
      console.log(id)
    }
  })

await program.parseAsync()
exiftool.end()
