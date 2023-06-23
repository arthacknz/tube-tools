# tube-tools

## setup

`.env`

```shell
PEERTUBE_URL="https://tube.arthack.nz"
PEERTUBE_USERNAME="arthack"
PEERTUBE_PASSWORD="xxxx"
PEERTUBE_CHANNEL="arthacknz"

S3_ENDPOINT="xxxx"
S3_KEY="xxxx"
S3_SECRET="xxxx"
S3_BUCKET="xxxx"
```

## usage

```
Usage: tube-tools [options] [command]

Command-line tools to manage tube.arthack.nz

Options:
  -h, --help                                   display help for command

Commands:
  upload [options] <path>                      Upload a video to PeerTube and our backup storage
  upload-peertube [options] <path>             Upload a video to PeerTube
  upload-original [options] <path>             Upload an original video to our backup storage
  upload-dir <path>                            Upload a directory of videos to PeerTube
  metadata <path>                              Read metadata in a video file
  hash <path>                                  Get hash of initial 1 MB of file
  get-videos-missing-from-s3-originals-bucket  Get list of videos missing from s3 originals bucket
  help [command]                               display help for command
```
