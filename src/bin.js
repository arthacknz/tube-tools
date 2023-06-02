import { Command } from 'commander'
import { exiftool } from 'exiftool-vendored'
import dotEnv from 'dotenv'
import { join } from 'node:path'

import {
  getFileHash,
  getChannelId,
  getPeertubeAccessToken,
  getS3VideosFromOriginalsBucket,
  uploadPeertubeVideo,
  uploadPeertubeVideoDir,
  loadS3Config,
  loadPeertubeConfig,
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
  .option('--name', 'name of video')
  .option('--description', 'description for video')
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
      ...loadS3Config(),
    }

    const s3OriginalVideos = getS3VideosFromOriginalsBucket(config, { chunkSize: 10 })
    console.log('arstarst', s3OriginalVideos)
    for await (const video of s3OriginalVideos) {
      console.log('video', video)
    }
  })

await program.parseAsync()
exiftool.end()
