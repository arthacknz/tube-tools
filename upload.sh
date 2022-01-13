#!/bin/bash

# depends on:
# - jq
# - exiftool:
#   - debian / ubuntu: sudo apt install libimage-exiftool-perl

shopt -s nullglob
NL=$'\n'
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source "$DIR/.env"

[[ -z "$USERNAME" ]] && echo "Missing .env var USERNAME" && exit
[[ -z "$PASSWORD" ]] && echo "Missing .env var PASSWORD" && exit
[[ -z "$CHANNEL_ID" ]] && echo "Missing .env var CHANNEL_ID" && exit
[[ -z "$API" ]] && echo "Missing .env var API" && exit

client_id=$(curl -s "$API/oauth-clients/local" | jq -r ".client_id")
client_secret=$(curl -s "$API/oauth-clients/local" | jq -r ".client_secret")
token=$(curl -s "$API/users/token" \
  --data client_id="$client_id" \
  --data client_secret="$client_secret" \
  --data grant_type=password \
  --data username="$USERNAME" \
  --data password="$PASSWORD" \
  | jq -r ".access_token")

file_path="$1"
title="$(basename "$1")"

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
  --form waitTranscoding=true \
)

if [[ "$response_code" == "200" ]]; then
  echo "success!"
else
  echo "error! $response_code"
  cat response.txt
  echo
  exit
fi
