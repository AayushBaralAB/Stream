#!/bin/sh
# Kill stream script - finds and kills FFmpeg process by stream ID or RTMP URL

STREAM_ID=$1
RTMP_URL=$2

if [ -z "$STREAM_ID" ]; then
  echo "Usage: $0 <stream_id> [rtmp_url]"
  exit 1
fi

echo "Attempting to kill stream $STREAM_ID"

# Method 1: Find by stream ID in process args
PIDS=$(ps aux | grep ffmpeg | grep "streamid:$STREAM_ID" | grep -v grep | awk '{print $2}')
if [ ! -z "$PIDS" ]; then
  echo "Found FFmpeg processes with streamid:$STREAM_ID - PIDs: $PIDS"
  for PID in $PIDS; do
    kill -9 $PID 2>/dev/null && echo "Killed PID $PID"
  done
  exit 0
fi

# Method 2: Find by RTMP URL if provided
if [ ! -z "$RTMP_URL" ]; then
  PIDS=$(ps aux | grep ffmpeg | grep "$RTMP_URL" | grep -v grep | awk '{print $2}')
  if [ ! -z "$PIDS" ]; then
    echo "Found FFmpeg processes with RTMP URL - PIDs: $PIDS"
    for PID in $PIDS; do
      kill -9 $PID 2>/dev/null && echo "Killed PID $PID"
    done
    exit 0
  fi
fi

# Method 3: Use pkill as fallback
pkill -9 -f "streamid:$STREAM_ID" 2>/dev/null && echo "Killed via pkill streamid"
if [ ! -z "$RTMP_URL" ]; then
  pkill -9 -f "$RTMP_URL" 2>/dev/null && echo "Killed via pkill RTMP URL"
fi

echo "Stream $STREAM_ID stop attempted"