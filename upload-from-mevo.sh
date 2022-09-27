#!/bin/bash

# depends on:
# - jq
# - exiftool:
#   - debian / ubuntu: sudo apt install libimage-exiftool-perl

shopt -s nullglob
NL=$'\n'
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source "$DIR/.env"

[[ -z "$MEDIA" ]] && echo "Missing .env var MEDIA" && exit
[[ -z "$USERNAME" ]] && echo "Missing .env var USERNAME" && exit
[[ -z "$PASSWORD" ]] && echo "Missing .env var PASSWORD" && exit
[[ -z "$CHANNEL_ID" ]] && echo "Missing .env var CHANNEL_ID" && exit
[[ -z "$API" ]] && echo "Missing .env var API" && exit

media_array=$(exiftool -json -Title -CreateDate $MEDIA/*)
mapfile -t media_list < <(echo "$media_array" | jq -r -c '.[]')

CREATED_DIR="$DIR/data/created"
UPLOADED_DIR="$DIR/data/uploaded"

mkdir -p "$CREATED_DIR"
mkdir -p "$UPLOADED_DIR"

client_id=$(curl -s "$API/oauth-clients/local" | jq -r ".client_id")
client_secret=$(curl -s "$API/oauth-clients/local" | jq -r ".client_secret")
token=$(curl -s "$API/users/token" \
  --data client_id="$client_id" \
  --data client_secret="$client_secret" \
  --data grant_type=password \
  --data username="$USERNAME" \
  --data password="$PASSWORD" \
  | jq -r ".access_token")

for media in "${media_list[@]}"
do
  media_file_path="$(echo "$media" | jq -r '.SourceFile')"
  echo "media: $media_file_path"
  file_name="$(basename "$media_file_path")"
  id=$(basename "$file_name" .MP4)
  checksum="$(head "$media_file_path" --bytes 1M | sha256sum - | cut -d' ' -f1)"
  echo "checksum: $checksum"

  if [[ ! -f "$UPLOADED_DIR/$checksum" ]]; then
    file_path="$CREATED_DIR/$checksum.mp4"
    ln -s "$media_file_path" "$file_path"

    title="$(echo "$media" | jq -r '.Title')"
    created_at="$(echo "$media" | jq -r '.CreateDate | strptime("%Y:%m:%d %H:%M:%S") | todateiso8601')"

    echo "name: $title"
    echo "uploading: $file_path"

    response_code=$(curl -s \
      -o response.txt \
      -w "%{http_code}" \
      "$API/videos/upload" \
      -H "Authorization: Bearer $token" \
      --max-time 3600 \
      --form videofile=@"$file_path" \
      --form channelId="$CHANNEL_ID" \
      --form name="$title" \
      --form language="en" \
      --form privacy="1" \
      --form originallyPublishedAt="$created_at" \
      --form waitTranscoding=true \
    )

    if [[ "$response_code" == "200" ]]; then
      echo "success!"
      echo
      touch "$UPLOADED_DIR/$checksum"
      rm "$file_path"
    else
      echo "error! $response_code"
      cat response.txt
      echo
      exit
    fi

    # read -p "Press Enter to continue" </dev/tty
  fi
done
