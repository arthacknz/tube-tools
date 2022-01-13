#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source "$DIR/.env"

[[ -z "$API" ]] && echo "Missing .env var API" && exit

TRANSCODED_DIR="$DIR/data/transcoded"
VIDEOS_PER_PAGE=10

mkdir -p "$TRANSCODED_DIR"

index=0
page_offset=0
page_total=$VIDEOS_PER_PAGE

while [[ $VIDEOS_PER_PAGE == $page_total ]]
do
  videos_response=$(curl -s \
    "$API/videos?start=$page_offset" \
  )

  page_total="$(echo "$videos_response" | jq -r '.total')"
  mapfile -t video_list < <(echo "$videos_response" | jq -r -c '.data[]')

  for video_list_item in "${video_list[@]}"
  do
    uuid="$(echo "$video_list_item" | jq -r '.uuid')"
    echo "$uuid"

    video_response="$(curl -s \
      "$API/videos/$uuid" \
    )"
    echo "$(echo "$video_response" | jq -r '.files')"
    echo "$(echo "$video_response" | jq -r '.streamingPlaylists[0]')"
  done

  page_offset=$((page_offset + page_total))
done
