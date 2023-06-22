import { Command } from 'commander'
import { exiftool } from 'exiftool-vendored'
import dotEnv from 'dotenv'
import { join } from 'node:path'

import {
  getFileHash,
  getChannelId,
  getPeertubeAccessToken,
  uploadPeertubeVideo,
  uploadPeertubeVideoDir,
  loadS3Config,
  loadPeertubeConfig,
  getVideoIdsMissingFromS3OriginalsBucket,
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
  .description('Upload a video to PeerTube')
  .argument('<path>', 'path to file')
  .option('--name <text>', 'name of video')
  .option('--description <text>', 'description for video')
  .action(async (filePath, options) => {
    const config = {
      ...baseConfig,
      ...loadPeertubeConfig(),
    }
    const accessToken = await getPeertubeAccessToken(config)
    const channelId = await getChannelId(config, { accessToken })
    const uuid = await uploadPeertubeVideo(config, {
      accessToken,
      filePath,
      channelId,
      ...options,
    })
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

    const uuid = await uploadPeertubeVideoDir(config, {
      accessToken,
      dirPath,
      channelId,
    })
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
  .description('Get hash of initial 1 MB of file)')
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
    const idsNotInS3Originals = await getVideoIdsMissingFromS3OriginalsBucket(config, { chunkSize: 10, peertubeAccessToken })
    console.log('Video uuids not in S3 originals/ bucket:')
    console.log()
    for (const id of idsNotInS3Originals) {
      console.log(id)
    }
  })

await program.parseAsync()
exiftool.end()
