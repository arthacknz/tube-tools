import got from 'got'
import { parallelMap, pipeline, collect } from 'streaming-iterables'

build({
  peertubeUrl: 'https://tube.arthack.nz',

  chunkSize: 10,
})

async function listVideosWithoutOriginals(options) {
}

async function getChannelTitle(options) {
  const { channelName, serverUrl } = options

  const { displayName, description } = await got({
    prefixUrl: serverUrl,
    url: `api/v1/video-channels/${channelName}`,
  }).json()

  const description2 = description.replace(newlineRegex, '\n')
  const description3 = rewriteVideoLinks(options, description2)

  const text = [
    `# [${displayName}](${serverUrl}/c/${channelName}/)`,
    ``,
    `![](./banner.jpg)`,
    ``,
    description3,
  ].join('\n')

  return text + '\n\n'
}

async function* getPeertubeVideos(options, position = {}) {
  const { serverUrl, chunkSize } = options
  const { start = 0, count = chunkSize } = position

  console.log(start)

  const { data } = await got(
    `api/v1/video`,
    {
      prefixUrl: serverUrl,
      searchParams: {
        count,
        start,
        sort: "-publishedAt",
        skipCount: "true",
      },
    },
  ).json()

  for (const video of data) {
    yield video
  }

  if (!(data.length < count)) {
    yield* getPeertubeVideos(options, { start: start + data.length, count })
  }
}

function mapChannelVideosToText(options) {
  const { serverUrl, chunkSize } = options

  return parallelMap(chunkSize, async (video) => {
    const { id, name, thumbnailPath, url } = video

    const { description } = await got(
      `api/v1/videos/${id}/description`,
      {
        prefixUrl: serverUrl,
      },
    ).json()

    const shortDescription = description
      .split(newlineRegex)
      .slice(0, 3)
      .join('\n')

    const text = [
      `## [${name}](${url})`,
      ``,
      `[![${name}](${serverUrl}${thumbnailPath})](${url})`,
      ``,
      shortDescription,
    ].join('\n')

    return text + '\n\n'
  })
}

function rewriteVideoLinks(options, text) {
  const { serverUrl } = options

  const videoLinkRegex = new RegExp(`\\[(.*?)\\]\\(${serverUrl}/w/[a-zA-Z0-9]+\\)`, 'g')

  return text.replaceAll(videoLinkRegex, (_, label) => {
    return anchor(label)
  })
}

