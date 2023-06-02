import { Command } from 'commander'
import { exiftool } from 'exiftool-vendored'

import {
  getFileHash,
  getChannelId,
  getPeertubeAccessToken,
  loadConfig,
  uploadPeertubeVideo,
} from './index.js'

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
    const config = loadConfig()
    const accessToken = await getPeertubeAccessToken(config)
    const channelId = await getChannelId(config, { accessToken })
    const uuid = await uploadPeertubeVideo(config, {
      accessToken,
      filePath,
      channelId,
      ...options,
    })
    const { peertubeUrl } = config
    console.log(`Uploaded: ${peertubeUrl}/videos/watch/${uuid}`)
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

await program.parseAsync()
exiftool.end()
