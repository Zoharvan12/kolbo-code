---
name: nle-xml-timeline
description: Use when generating XMEML XML timeline files for import into DaVinci Resolve or Premiere Pro — from any source (AI-generated clips, local files, rendered outputs). Covers the exact structure DaVinci and Premiere require, path encoding, audio track format, and common failure modes like empty timelines or missing clips.
---

# NLE XML Timeline Generator

## Overview

XMEML (v4) is the shared XML format used by Final Cut Pro 7, Premiere Pro, and DaVinci Resolve for timeline interchange. Generating it by hand is tricky — DaVinci especially is strict about structure. This skill captures every battle-tested detail needed to produce a working import on the first try.

**Golden rule:** Model your XML on a real Premiere Pro export. DaVinci reads Premiere-style XMEML reliably. Never invent structure.

---

## Key Lessons (Learned the Hard Way)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| DaVinci imports empty timeline | Wrong structure — used `project>children` instead of flat `sequence` | Put `<sequence>` directly under `<xmeml>` |
| DaVinci ignores clips | Inline `<file>` blocks missing or using wrong id ref scheme | Full `<file>` block inline inside each `<clipitem>`, not separate library |
| Wrong frame count | Assumed 72 frames for 3s @ 24fps — clips were actually 73 | Always probe with `cv2` or `ffprobe` — never hardcode |
| Clips load offline | URL-encoded path used `%20` for spaces but DaVinci wanted `file://localhost/G%3a/` | Use `file://localhost/` + `%3a` for `:`, `%20` for spaces |
| Audio tracks missing | Used empty `<audio></audio>` block | Full audio `<track>` with `<clipitem>`, `<sourcetrack>`, Audio Levels filter |
| Wrong fps interpretation | `ntsc=TRUE` + `timebase=24` = 23.976, not 24 | Use `ntsc=FALSE` for true 24fps |
| Interlace misread | `fielddominance` not set | Always set `<fielddominance>none</fielddominance>` |

---

## Required Structure (DaVinci + Premiere Compatible)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1" explodedTracks="true"
    TL.SQAudioVisibleBase="0" TL.SQVideoVisibleBase="0"
    MZ.Sequence.PreviewFrameSizeHeight="1080"
    MZ.Sequence.PreviewFrameSizeWidth="1920"
    MZ.Sequence.VideoTimeDisplayFormat="100"
    MZ.Sequence.AudioTimeDisplayFormat="200">
    <uuid>your-unique-id</uuid>
    <duration>TOTAL_FRAMES</duration>
    <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
    <name>My Timeline</name>
    <media>
      <video>
        <format>...</format>       <!-- REQUIRED: codec + dimensions -->
        <track ...>
          <clipitem id="clipitem-1">...</clipitem>
          ...
        </track>
      </video>
      <audio>
        <numOutputChannels>1</numOutputChannels>
        <format>...</format>
        <outputs>...</outputs>
        <track ...>                <!-- one track per audio file -->
          <clipitem ...>...</clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
```

**Critical:** `<sequence>` is a direct child of `<xmeml>`. No `<project><children>` wrapper — that breaks DaVinci.

---

## Video Clipitem Template

```xml
<clipitem id="clipitem-N">
  <masterclipid>masterclip-N</masterclipid>
  <name>CLIP_NAME</name>
  <enabled>TRUE</enabled>
  <duration>ACTUAL_FRAME_COUNT</duration>   <!-- from ffprobe/cv2, NOT calculated -->
  <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
  <start>TIMELINE_IN_FRAME</start>
  <end>TIMELINE_OUT_FRAME</end>
  <in>0</in>
  <out>72</out>                             <!-- source in/out -->
  <alphatype>none</alphatype>
  <pixelaspectratio>square</pixelaspectratio>
  <anamorphic>FALSE</anamorphic>
  <file id="file-N">
    <name>filename.mp4</name>
    <pathurl>file://localhost/G%3a/Path/To/filename.mp4</pathurl>
    <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
    <duration>ACTUAL_FRAME_COUNT</duration>
    <timecode>
      <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <samplecharacteristics>
          <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
          <width>1920</width>
          <height>1080</height>
          <anamorphic>FALSE</anamorphic>
          <pixelaspectratio>square</pixelaspectratio>
          <fielddominance>none</fielddominance>
        </samplecharacteristics>
      </video>
      <audio>
        <samplecharacteristics>
          <depth>16</depth>
          <samplerate>44100</samplerate>    <!-- match actual file -->
        </samplecharacteristics>
        <channelcount>1</channelcount>
        <layout>stereo</layout>
        <audiochannel><sourcechannel>1</sourcechannel><channellabel>left</channellabel></audiochannel>
      </audio>
      <audio>
        <samplecharacteristics>
          <depth>16</depth>
          <samplerate>44100</samplerate>
        </samplecharacteristics>
        <channelcount>1</channelcount>
        <layout>stereo</layout>
        <audiochannel><sourcechannel>2</sourcechannel><channellabel>right</channellabel></audiochannel>
      </audio>
    </media>
  </file>
  <!-- Basic Motion + Distort filters (required for non-1920x1080 clips) -->
  <filter>
    <effect>
      <name>Basic Motion</name><effectid>basic</effectid>
      <effectcategory>motion</effectcategory><effecttype>motion</effecttype>
      <mediatype>video</mediatype><pproBypass>false</pproBypass>
      <parameter authoringApp="PremierePro">
        <parameterid>scale</parameterid><name>Scale</name>
        <valuemin>0</valuemin><valuemax>1000</valuemax><value>100</value>
      </parameter>
    </effect>
  </filter>
  <filter>
    <effect>
      <name>Distort</name><effectid>deformation</effectid>
      <effectcategory>motion</effectcategory><effecttype>motion</effecttype>
      <mediatype>video</mediatype>
      <parameter authoringApp="PremierePro">
        <parameterid>aspect</parameterid><name>Aspect</name>
        <valuemin>-10000</valuemin><valuemax>10000</valuemax><value>9.99998</value>
      </parameter>
    </effect>
  </filter>
  <logginginfo>
    <description></description><scene></scene><shottake></shottake>
    <lognote></lognote><good></good>
    <originalvideofilename></originalvideofilename>
    <originalaudiofilename></originalaudiofilename>
  </logginginfo>
  <colorinfo><lut></lut><lut1></lut1><asc_sop></asc_sop><asc_sat></asc_sat><lut2></lut2></colorinfo>
</clipitem>
```

---

## Video Format Block (inside `<video>`)

```xml
<format>
  <samplecharacteristics>
    <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
    <codec>
      <name>Apple ProRes 422</name>
      <appspecificdata>
        <appname>Final Cut Pro</appname>
        <appmanufacturer>Apple Inc.</appmanufacturer>
        <appversion>7.0</appversion>
        <data>
          <qtcodec>
            <codecname>Apple ProRes 422</codecname>
            <codectypecode>apcn</codectypecode>
            <codecvendorcode>appl</codecvendorcode>
            <spatialquality>1024</spatialquality>
            <temporalquality>0</temporalquality>
            <keyframerate>0</keyframerate>
            <datarate>0</datarate>
          </qtcodec>
        </data>
      </appspecificdata>
    </codec>
    <width>1920</width>
    <height>1080</height>
    <anamorphic>FALSE</anamorphic>
    <pixelaspectratio>square</pixelaspectratio>
    <fielddominance>none</fielddominance>
    <colordepth>24</colordepth>
  </samplecharacteristics>
</format>
```

---

## Audio Track Template (narration / music)

```xml
<audio>
  <numOutputChannels>1</numOutputChannels>
  <format>
    <samplecharacteristics>
      <depth>16</depth>
      <samplerate>48000</samplerate>
    </samplecharacteristics>
  </format>
  <outputs>
    <group><index>1</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>1</index></channel></group>
    <group><index>2</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>2</index></channel></group>
  </outputs>
  <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0"
         TL.SQTrackExpandedHeight="41" TL.SQTrackExpanded="0"
         MZ.TrackTargeted="1" PannerCurrentValue="0.5"
         PannerName="Balance" currentExplodedTrackIndex="0"
         totalExplodedTrackCount="1" premiereTrackType="Mono">
    <clipitem id="clipitem-17" premiereChannelType="mono">
      <masterclipid>masterclip-17</masterclipid>
      <name>narration</name>
      <enabled>TRUE</enabled>
      <duration>11531</duration>
      <rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate>
      <start>0</start>
      <end>TOTAL_FRAMES</end>
      <in>0</in><out>TOTAL_FRAMES</out>
      <file id="file-17">
        <name>narration.mp3</name>
        <pathurl>file://localhost/G%3a/Path/To/narration.mp3</pathurl>
        <rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>  <!-- MP3 rate as Premiere detects -->
        <duration>977</duration>                               <!-- frame count at that rate -->
        <timecode>
          <rate><timebase>30</timebase><ntsc>TRUE</ntsc></rate>
          <string>00;00;00;00</string><frame>0</frame>
          <displayformat>DF</displayformat>
        </timecode>
        <media>
          <audio>
            <samplecharacteristics><depth>16</depth><samplerate>44100</samplerate></samplecharacteristics>
            <channelcount>1</channelcount>
            <audiochannel><sourcechannel>1</sourcechannel></audiochannel>
          </audio>
        </media>
      </file>
      <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
      <filter>
        <effect>
          <name>Audio Levels</name><effectid>audiolevels</effectid>
          <effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype>
          <mediatype>audio</mediatype><pproBypass>false</pproBypass>
          <parameter authoringApp="PremierePro">
            <parameterid>level</parameterid><name>Level</name>
            <valuemin>0</valuemin><valuemax>3.98109</valuemax><value>1</value>
          </parameter>
        </effect>
      </filter>
      <logginginfo><description></description><scene></scene><shottake></shottake><lognote></lognote><good></good><originalvideofilename></originalvideofilename><originalaudiofilename></originalaudiofilename></logginginfo>
      <colorinfo><lut></lut><lut1></lut1><asc_sop></asc_sop><asc_sat></asc_sat><lut2></lut2></colorinfo>
    </clipitem>
    <enabled>TRUE</enabled>
    <locked>FALSE</locked>
    <outputchannelindex>1</outputchannelindex>
  </track>
</audio>
```

---

## Path URL Encoding Rules

| OS | Format |
|----|--------|
| Windows | `file://localhost/G%3a/My%20Folder/file.mp4` |
| Mac/Linux | `file://localhost/Users/name/folder/file.mp4` |

- Drive letter colon: `G:` → `G%3a`
- Spaces: `My Folder` → `My%20Folder`
- No other encoding needed for standard path chars

---

## Frame Rate Reference

| FPS | `timebase` | `ntsc` | `displayformat` |
|-----|-----------|--------|-----------------|
| 24 (true) | 24 | FALSE | NDF |
| 23.976 | 24 | TRUE | NDF |
| 29.97 | 30 | TRUE | DF |
| 30 (true) | 30 | FALSE | NDF |
| 25 | 25 | FALSE | NDF |

**MP3/AAC audio files** — Premiere detects them as `timebase=30, ntsc=TRUE` regardless of content. Use that in the `<file>` rate block for audio-only clipitems.

---

## Python Generator Workflow

Always generate XML programmatically — never hand-edit large files.

```python
import cv2

def get_clip_meta(path):
    cap = cv2.VideoCapture(path)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps    = cap.get(cv2.CAP_PROP_FPS)
    w      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return frames, fps, w, h

# Use real metadata in XML — never assume frame count from duration × fps
```

Write to a `build_xml.py` script alongside the output folder so it can be re-run if clip list changes.

---

## Track Attributes (copy verbatim)

```
Video track:
TL.SQTrackShy="0" TL.SQTrackExpandedHeight="41" TL.SQTrackExpanded="0" MZ.TrackTargeted="1"

Audio track:
TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="41"
TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5"
PannerName="Balance" currentExplodedTrackIndex="0" totalExplodedTrackCount="1"
premiereTrackType="Mono"
```

---

## DaVinci Import Steps

1. Set project frame rate **before** importing (can't change after media is in)
2. **File → Import Timeline** (NOT "Media from XML" — that only imports clips)
3. On the dialog: uncheck "Automatically import source clips" if paths might not resolve
4. If clips show offline: right-click timeline → Relink Media → point to folder

## Premiere Import Steps

1. **File → Import** (or drag XML into Project panel)
2. Accept sequence settings dialog
3. Offline clips → right-click → Link Media

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `project > children` wrapper | DaVinci: empty timeline | Remove wrapper, `<sequence>` directly under `<xmeml>` |
| Empty `<audio></audio>` | No audio tracks in timeline | Full track + clipitem + file + filter structure |
| Hardcoded 72 frames per clip | Wrong clip lengths / gaps | Always probe with cv2/ffprobe |
| `ntsc=TRUE` on 24fps | Resolve treats as 23.976 | Use `ntsc=FALSE` for true 24 |
| Missing `<format>` block in video | Premiere fails to read | Always include format with codec data |
| Missing motion filters | Non-1080p clips look stretched | Include Basic Motion + Distort filters |
| Missing `<logginginfo>` / `<colorinfo>` | Premiere warnings on import | Include empty blocks |
