/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { pollUntilDone, PollingTimeoutError } = require('../polling');
const { resolveToBuffer, creditFields } = require('./_shared');

function registerGenerateTools(server, client) {
  // ─── generate_image ────────────────────────────────────────
  server.tool(
    'generate_image',
    'Generate image(s) from a text prompt using Kolbo AI. Supports Visual DNA profiles (for character/style/product consistency), moodboards (for style direction), reference images (for composition guidance), batch generation (num_images), and web-search grounding. For EDITING an existing image, use generate_image_edit instead. For a coordinated multi-scene set (storyboard, ad campaign), use generate_creative_director. Returns the final image URL(s) when complete.',
    {
      prompt: z.string().describe('Text description of the image to generate'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_img" to see options. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "1:1", "16:9", "9:16"). Must be a value present in the model\'s `supported_aspect_ratios` from list_models — pass an unsupported value and the API rejects. Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      num_images: z.number().optional().describe('Number of images to generate in one call. Default: 1. Note: some models (Midjourney etc.) have a fixed `images_per_request` and ignore this — check list_models.'),
      reference_images: z.array(z.string()).optional().describe('STYLE/COMPOSITION inspiration only — does NOT embed reference pixels. Array of image URLs used to guide the look-and-feel of a brand-new generation. The model interprets the references and regenerates approximations conditioned on them. It will NOT copy pixels from these images into the output. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.** To embed a specific logo, icon, watermark, or asset pixel-accurately, use generate_image_edit with the asset in source_images. To EDIT an existing image, also use generate_image_edit.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Visual DNA profile IDs (from create_visual_dna / list_visual_dnas) for character / style / product / scene consistency. **Cap: pass at most `max_visual_dna` IDs from list_models — if the field is null/0 or `supports_visual_dna: false`, the model rejects DNA entirely (silently ignored in some paths).** How DNA works: the server fetches the DNA\'s reference images AND always injects its `description` field into the prompt as plaintext (by design — independent of enhance_prompt). Practical implication: do NOT also write physical descriptors of the same subject in your own prompt — they will compete with the DNA description text. For pixel-accurate face anchoring of a specific person, prefer passing the DNA\'s reference image directly via source_images on generate_image_edit and OMIT visual_dna_ids. visual_dna_ids is best for style / scene / product DNAs and for soft consistency across a set.'),
      moodboard_id: z.string().optional().describe('Moodboard ID (from list_moodboards / get_moodboard) whose master_prompt and style_guide should be applied to this generation.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding for the prompt (useful for current events, brand references, real-world accuracy). Default: false'),
      resolution: z.string().optional().describe('Image resolution tier: "1K" (~1024px), "2K" (Full HD), "3K" (QHD), or "4K" (UHD). Model-dependent — call list_models and read supported_resolutions on the chosen model. Read resolution_multipliers on the same model to predict credit cost. Omit to use the model default.'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="image" to apply a saved style preset to this generation.')
    },
    async ({ prompt, model, aspect_ratio, enhance_prompt = false, num_images, reference_images, visual_dna_ids, moodboard_id, enable_web_search, resolution, preset_id }) => {
      const gen = await client.post('/v1/generate/image', {
        prompt, model, aspect_ratio, enhance_prompt, num_images,
        reference_images, visual_dna_ids, moodboard_id, enable_web_search, resolution, preset_id
      });

      // 60s here (not 120s) so a stuck generation surfaces faster — the
      // PollingTimeoutError tells the model to switch to get_generation_status,
      // which block-polls for 10min by default. Same total wait, but the
      // first hand-off happens at 60s instead of 120s so the user isn't
      // staring at a frozen spinner.
      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: 60000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks to edit/change/modify this image next, pass urls[0] to generate_image_edit (free-form edits) or edit_image (upscale/reframe/removebg/enhance_skin/magic_edit). Do NOT call generate_image again.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_image_edit ──────────────────────────────────
  server.tool(
    'generate_image_edit',
    'Edit or transform an existing image using AI. Provide the source image URL(s) in `source_images` and describe the edit in `prompt` (e.g., "remove the background", "change the car color to red", "add sunglasses to the person"). Supports Visual DNA profiles and moodboards for style-consistent edits. For creating a brand new image from scratch, use generate_image. Returns the edited image URL(s) when complete.',
    {
      prompt: z.string().describe('Description of the edit to apply (e.g., "remove the background", "change the sky to sunset")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="image_editing" to see options. Omit for Smart Select.'),
      source_images: z.array(z.string()).describe('PIXEL-ACCURATE compositing. Array of source image URLs whose pixel content is composited into the output. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.** Three modes the model auto-detects from input shape: (1) Single image → edit/transform that image. (2) Multiple images, one base + others → composite the others into the base. (3) Multiple images with no clear base → generate a new scene that pixel-accurately embeds the supplied images at positions described in the prompt. Mode 3 is the canonical pattern for thumbnails / branded compositions where exact-pixel logo + face fidelity matter. Refer to source images in the prompt by ordinal position ("FIRST source image", "SECOND source image") or use @image1/@image2 tags. Add "composite AS-IS, do not redraw or restyle" to lock pixels.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "1:1", "16:9", "9:16"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "1:1"'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      num_images: z.number().optional().describe('Number of output images. Default: 1'),
      visual_dna_ids: z.array(z.string()).optional().describe('Visual DNA profile IDs for character / style / product consistency. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.** How DNA works: the server fetches the DNA\'s reference images AND always injects its `description` field into the prompt as plaintext (by design — independent of enhance_prompt). For pixel-accurate face anchoring of a specific person on this tool, the PREFERRED pattern is to pass the face photo directly via source_images and OMIT visual_dna_ids — that way the face pixels anchor the output and no description text competes. Do NOT pass visual_dna_ids if source_images already contains the same person\'s face (face averaging). visual_dna_ids is best here for style / product DNAs.'),
      moodboard_id: z.string().optional().describe('Moodboard ID whose master_prompt and style_guide should be applied.'),
      enable_web_search: z.boolean().optional().describe('Enable web-search grounding. Default: false'),
      resolution: z.string().optional().describe('Image resolution tier: "1K" / "2K" / "3K" / "4K". Model-dependent — call list_models and read supported_resolutions. Default: "1K" for most edit models.')
    },
    async ({ prompt, model, source_images, aspect_ratio, enhance_prompt = false, num_images, visual_dna_ids, moodboard_id, enable_web_search, resolution }) => {
      const gen = await client.post('/v1/generate/image-edit', {
        prompt, model, source_images, aspect_ratio, enhance_prompt, num_images,
        visual_dna_ids, moodboard_id, enable_web_search, resolution
      });

      // Flux/Seedance/DNA-anchored edits routinely run 3-5 min. Old 120s
      // timeout forced every call into the timeout-and-recover path via
      // get_generation_status — and when the model fired multiple parallel
      // edits, some recovered, some got abandoned with their URLs lost
      // (the user's "lost generations" bug). 360s/480s covers the realistic
      // p99 single-call duration without making the model poll forever.
      const heavy = (source_images && source_images.length > 1) || (visual_dna_ids && visual_dna_ids.length > 0);
      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 3) * 1000,
        timeout: heavy ? 480000 : 360000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks for another edit on this output, pass urls[0] back into generate_image_edit as source_images. For targeted ops (upscale/reframe/removebg/enhance_skin) use edit_image instead. Do NOT call generate_image from scratch.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_creative_director ─────────────────────────────
  server.tool(
    'generate_creative_director',
    'Generate 2–8 related images or videos as one coherent set from a single creative brief. Use scene_count (NOT num_images) to set the number of scenes (1–8, default 4). Use this when the user gives a general brief ("make 4 product shots", "create a storyboard") and you are planning the scenes — it handles style consistency and runs scenes in parallel. If the user explicitly provides separate prompts for each image, use parallel generate_image calls instead. Supports image and video modes (workflow_type). Visual DNA and moodboard references keep character/style consistent across every scene.',
    {
      prompt: z.string().describe('Creative brief or concept describing the full set of scenes to generate'),
      scene_count: z.number().optional().describe('Number of scenes/images to generate, 1–8. Default: 4. Use this — NOT num_images — to control how many outputs are created.'),
      model: z.string().optional().describe('Model identifier applied to every scene. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio applied to every scene (e.g., "1:1", "16:9", "9:16"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "1:1"'),
      workflow_type: z.string().optional().describe('"image" (default) or "video"'),
      duration: z.number().optional().describe('Duration in seconds per scene (video mode only). Must be a value in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. E.g., 5 or 10.'),
      sound_enabled: z.boolean().optional().describe('Video mode only. Enable (`true`) or disable (`false`) AI-generated synced audio on every scene. Only honored by models with `sound_generation_type: "native"` from list_models (Veo 3.1, Kling V3/2.6/O3, PixVerse V6). Omit to use each model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio.'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      reference_images: z.array(z.string()).optional().describe('Array of reference image URLs to guide style/composition of every scene. **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model.**'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply consistently across every scene. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.** This is the ideal way to keep a character or product looking the same in all scenes of a campaign.'),
      moodboard_id: z.string().optional().describe('A single moodboard ID whose master_prompt and style_guide should shape every scene.'),
      moodboard_ids: z.array(z.string()).optional().describe('Multiple moodboard IDs when blending styles. Prefer `moodboard_id` for single moodboards.'),
      resolution: z.string().optional().describe('Resolution tier applied to every scene. Images: "1K" / "2K" / "3K" / "4K". Videos: "720p" / "1080p" / "1440p" / "2160p". Values are model-dependent — call list_models and read supported_resolutions on the target model. Multiplied across every scene.')
    },
    async ({ prompt, scene_count, model, aspect_ratio, workflow_type, duration, sound_enabled, enhance_prompt = false, reference_images, visual_dna_ids, moodboard_id, moodboard_ids, resolution }) => {
      const gen = await client.post('/v1/generate/creative-director', {
        prompt, scene_count, model, aspect_ratio, workflow_type, duration, sound_enabled,
        enhance_prompt, reference_images, visual_dna_ids, moodboard_id, moodboard_ids, resolution
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 600000,
        statusUrl: `/v1/generate/creative-director/${gen.generation_id}/status`
      });

      const scenes = (result.scenes || [])
        .filter(s => s.status === 'completed')
        .map(s => ({
          scene_number: s.scene_number,
          title: s.title,
          image_urls: s.image_urls,
          video_urls: s.video_urls
        }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            scenes,
            total_scenes: result.scenes?.length || 0,
            completed_scenes: scenes.length,
            _followup_hint: 'Each scene is a separate asset. If the user asks to edit one scene, find that scene by scene_number/title and pass its image_urls[0] (or video_urls[0]) to generate_image_edit / edit_image / edit_video / generate_video_from_video. Do NOT re-run generate_creative_director unless the user explicitly wants a brand-new set.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video ────────────────────────────────────────
  // NOTE: text-to-video does NOT support Visual DNA — the textToVideoGeneration
  // controller in kolbo-api never reads visualDnaIds. For character-consistent
  // video, use generate_elements (which DOES honor visual_dna_ids) or animate a
  // DNA-locked still via generate_video_from_image.
  server.tool(
    'generate_video',
    'Generate a video from a text prompt using Kolbo AI. For animating an existing still image into motion, use generate_video_from_image instead. For a coordinated multi-scene video campaign, use generate_creative_director with workflow_type="video". Supports reference images (for style/composition guidance). Does NOT support Visual DNA — for character-consistent video use generate_elements or animate a DNA-locked still via generate_video_from_image. Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the video to generate'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_video" to see options. Check supported_durations and supported_aspect_ratios.'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be a value in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration` (whichever the model exposes). Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      reference_images: z.array(z.string()).optional().describe('Array of image URLs used as visual references (style / composition / subject). **Cap: pass at most `max_reference_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Some models use labels like "512P"/"1024P"/"768P"/"1080P". Model-dependent — call list_models and read supported_resolutions. Read resolution_multipliers to predict cost.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Veo 3.1, Kling V3/2.6, PixVerse V6). On `sound_generation_type: "none"` models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio. Enabling sound may apply `sound_credit_multiplier` to cost.'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="video" to apply a saved motion/style preset to this generation.')
    },
    async ({ prompt, model, aspect_ratio, duration, enhance_prompt = false, reference_images, resolution, sound_enabled, preset_id }) => {
      const gen = await client.post('/v1/generate/video', {
        prompt, model, aspect_ratio, duration, enhance_prompt, reference_images, resolution, sound_enabled, preset_id
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url,
            prompt_used: result.result.prompt_used,
            _followup_hint: 'If the user asks to edit/restyle/extend this video next, pass urls[0] to edit_video (upscale/reframe/face_swap/extend/generate_audio/lipsync/magic_edit) or generate_video_from_video (restyle). Do NOT call generate_video from scratch.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video_from_image ─────────────────────────────
  server.tool(
    'generate_video_from_image',
    'Animate an existing still image into a video using Kolbo AI. The image comes from `image_url`; `prompt` describes the motion (not the subject — the subject is already in the image). For generating a video from scratch, use generate_video. Returns the final video URL when complete.',
    {
      image_url: z.string().describe('URL of the source image to animate'),
      prompt: z.string().describe('Text description of the desired MOTION (e.g., "camera slowly pans right while the character walks forward")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="img_to_video" to see options.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in the chosen model\'s `supported_aspect_ratios` from list_models. Default: "16:9"'),
      duration: z.number().optional().describe('Duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to maintain consistency with prior characters / styles. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false` the model ignores DNA entirely.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Some models use labels like "512P"/"1024P"/"768P"/"1080P". Model-dependent — call list_models and read supported_resolutions. Read resolution_multipliers to predict cost.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Veo 3.1 Lite, Kling V3 4K, PixVerse V6, Kling 2.6/v3). On `sound_generation_type: "none"` models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio. Enabling sound may apply `sound_credit_multiplier` to cost.')
    },
    async ({ image_url, prompt, model, aspect_ratio, duration, enhance_prompt = false, visual_dna_ids, resolution, sound_enabled }) => {
      const gen = await client.post('/v1/generate/video/from-image', {
        image_url, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution, sound_enabled
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            model: result.result.model,
            duration: result.result.duration,
            thumbnail_url: result.result.thumbnail_url,
            _followup_hint: 'If the user asks to edit/restyle/extend this video next, pass urls[0] to edit_video or generate_video_from_video. Do NOT re-run generate_video_from_image unless they want a fresh animation from a different source image.'
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_music ────────────────────────────────────────
  server.tool(
    'generate_music',
    'Generate music from a text description using Kolbo AI. Supports instrumental mode, custom lyrics, style direction, and vocal gender. Default model is Suno. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the music to generate (e.g., "upbeat electronic dance track with synthesizers")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="music_gen" to see options. Omit for Suno (default).'),
      style: z.string().optional().describe('Music style / genre (e.g., "pop", "rock", "lo-fi", "electronic", "jazz")'),
      instrumental: z.boolean().optional().describe('Generate instrumental only, no vocals. Default: false'),
      lyrics: z.string().optional().describe('Custom lyrics for the song. If omitted, lyrics are generated automatically from the prompt unless instrumental is true.'),
      vocal_gender: z.string().optional().describe('Preferred vocal gender: "male" or "female". Only applies when instrumental is false.'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="music" to apply a saved music style preset.')
    },
    async ({ prompt, model, style, instrumental, lyrics, vocal_gender, enhance_prompt = false, preset_id }) => {
      const gen = await client.post('/v1/generate/music', {
        prompt, model, style, instrumental, lyrics, vocal_gender, enhance_prompt, preset_id
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            title: result.result.title,
            duration: result.result.duration,
            lyrics: result.result.lyrics
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_speech ───────────────────────────────────────
  server.tool(
    'generate_speech',
    'Convert text to speech using Kolbo AI. Default provider is ElevenLabs. To pick a specific voice by language/gender, call list_voices first and pass the returned voice_id (or a voice display name — both work). Returns the final audio URL when complete.',
    {
      text: z.string().describe('The text to convert to speech'),
      voice: z.string().optional().describe('Voice ID (from list_voices) or voice display name (e.g., "Rachel", "Adam"). Default: "Rachel"'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_speech" to see options. Default: eleven_v3'),
      language: z.string().optional().describe('Language code (e.g., "en-US", "he-IL", "es-ES"). Default: "en-US"')
    },
    async ({ text, voice, model, language }) => {
      const gen = await client.post('/v1/generate/speech', {
        text, voice, model, language
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            voice: result.result.voice,
            duration: result.result.duration
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_sound ────────────────────────────────────────
  server.tool(
    'generate_sound',
    'Generate sound effects (not music, not speech) from a text description using Kolbo AI. Use this for ambient sounds, foley, impacts, atmospheres, UI sounds, etc. For music use generate_music; for voice use generate_speech. Returns the final audio URL when complete.',
    {
      prompt: z.string().describe('Text description of the sound effect (e.g., "thunder clap with rain", "door creaking open", "futuristic UI beep")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="text_to_sound" to see options. Default: elevenlabs-sound-effects-v1'),
      duration: z.number().optional().describe('Duration in seconds. Omit for automatic duration.'),
      prompt_influence: z.number().optional().describe('How strongly the prompt guides the generation (0–1). Default: 0.5. Lower values give the model more creative freedom; higher values follow the prompt more literally.')
    },
    async ({ prompt, model, duration, prompt_influence }) => {
      const gen = await client.post('/v1/generate/sound', {
        prompt, model, duration, prompt_influence
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 120000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result.urls,
            duration: result.result.duration
          }, null, 2)
        }]
      };
    }
  );

  // ─── list_voices ─────────────────────────────────────────────
  server.tool(
    'list_voices',
    'List available TTS voices for generate_speech. Returns preset voices and the user\'s own cloned/designed voices. Filter by provider, language, or gender to find the right voice. Use the returned `voice_id` as the `voice` parameter in generate_speech.',
    {
      provider: z.string().optional().describe('Filter by provider (e.g., "elevenLabs", "google")'),
      language: z.string().optional().describe('Filter by language name or code (e.g., "English", "en-US")'),
      gender: z.string().optional().describe('Filter by gender (e.g., "Female", "Male")')
    },
    async ({ provider, language, gender }) => {
      const params = new URLSearchParams();
      if (provider) params.set('provider', provider);
      if (language) params.set('language', language);
      if (gender) params.set('gender', gender);

      const qs = params.toString();
      const result = await client.get(`/v1/voices${qs ? '?' + qs : ''}`);

      // Summarize for context window efficiency
      const voices = (result.voices || []).map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        provider: v.provider,
        language: v.language,
        gender: v.gender,
        custom: v.custom
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ voices, count: result.count }, null, 2)
        }]
      };
    }
  );

  // Track how many consecutive get_generation_status polls land on the same
  // id within a short window. Models routinely ignore the "stop polling"
  // hint and re-call, burning minutes of wall-clock and confusing the user.
  // After STATUS_POLL_CAP attempts in a row, we hard-abandon: return a
  // distinct shape (no `still_pending`) so the model can't pattern-match
  // its way back into the loop.
  const STATUS_POLL_CAP = 2;
  const STATUS_POLL_RESET_MS = 10 * 60 * 1000; // a quiet 10min resets the counter
  const statusPollHistory = new Map(); // id → { count, lastAt }

  // ─── get_generation_status ─────────────────────────────────
  server.tool(
    'get_generation_status',
    'Resume polling a generation after a timeout. Pass the generation_id from a prior generation tool that timed out. This call BLOCKS server-side, polling internally — you do NOT need to call it again in a loop. Defaults to a 10-minute internal poll which covers most image edits and short videos; pass `wait_seconds` up to 1700 (~28 min) for long video / 3D / batch generations. **If you fired multiple generations in parallel and they all timed out, you MUST call get_generation_status for EACH generation_id in this same turn — do not give up on any of them, or their URLs will be lost forever.** A response with `abandoned: true` is TERMINAL — the generation will not be polled again in this turn; report it to the user and move on. A response with `still_pending: true` means the job is genuinely slow — STOP polling THAT id immediately, tell the user, and wait for them to ask again. Never call this tool more than ONCE per generation_id consecutively in the same turn.',
    {
      generation_id: z.string().describe('The generation ID to check'),
      wait_seconds: z.number().int().min(60).max(1700).optional().describe('How long to block-poll internally before giving up (60–1700 seconds, default 600). Values below 300 are clamped up to 300 server-side because shorter waits cause the model to abandon still-running generations. Use higher values for video / 3D / large batches that can legitimately take 15+ minutes.'),
    },
    async ({ generation_id, wait_seconds }) => {
      // Clamp the floor: shorter waits caused models to abandon generations
      // that completed seconds later (URLs lost forever, paid-for compute
      // wasted). 300s is the floor that survived real-world cases.
      const requested = wait_seconds ?? 600;
      const timeoutMs = Math.max(requested, 300) * 1000;

      // Update the consecutive-call counter for this id. We reset if the
      // last attempt was a long time ago (new user turn), so this only
      // catches within-turn looping. Opportunistic sweep keeps the map
      // bounded on long-lived MCP servers (no setInterval — that would
      // keep the Node event loop alive forever).
      const now = Date.now();
      if (statusPollHistory.size > 64) {
        const cutoff = now - STATUS_POLL_RESET_MS;
        for (const [k, v] of statusPollHistory) {
          if (v.lastAt < cutoff) statusPollHistory.delete(k);
        }
      }
      const prior = statusPollHistory.get(generation_id);
      const count = prior && now - prior.lastAt < STATUS_POLL_RESET_MS ? prior.count + 1 : 1;
      statusPollHistory.set(generation_id, { count, lastAt: now });

      // Hard abandon — the model has hit the cap. Return a non-pending
      // shape so it has nothing left to keep polling against.
      if (count > STATUS_POLL_CAP) {
        const current = await client
          .get(`/v1/generate/${encodeURIComponent(generation_id)}/status`)
          .catch(() => null);
        // If the generation actually finished in the meantime, surface it.
        if (current?.state === 'completed') {
          statusPollHistory.delete(generation_id);
          return {
            content: [{ type: 'text', text: JSON.stringify(current, null, 2) }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  generation_id,
                  state: current?.state ?? 'unknown',
                  abandoned: true,
                  poll_attempts: count,
                  _note: `This generation has been polled ${count} consecutive times in this turn and is still not done. ABANDONED — do NOT call get_generation_status for this id again. Tell the user the generation is taking unusually long and ask them to check back later.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      let result;
      try {
        result = await pollUntilDone(client, generation_id, {
          interval: 5000,
          timeout: timeoutMs,
        });
      } catch (err) {
        if (err instanceof PollingTimeoutError) {
          const current = await client.get(`/v1/generate/${encodeURIComponent(generation_id)}/status`).catch(() => null);
          const minutes = Math.round(timeoutMs / 60000);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                generation_id,
                state: current?.state ?? 'unknown',
                still_pending: true,
                waited_seconds: Math.round(timeoutMs / 1000),
                poll_attempts: count,
                _note: `Polled for ${minutes} minute(s) — generation is taking longer than usual. STOP calling get_generation_status now. Tell the user the generation is still running and ask them to prompt you to check again later. Do NOT loop — one more consecutive call for this id will be hard-abandoned.`,
              }, null, 2),
            }],
          };
        }
        throw err;
      }
      // Completed cleanly — clear the counter so a future generation reusing
      // the id (theoretically possible) starts fresh.
      statusPollHistory.delete(generation_id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // ═════════════════════════════════════════════════════════════
  // ─── 2026-04 SDK Expansion Batch ─────────────────────────────
  // ═════════════════════════════════════════════════════════════

  // ─── generate_elements ─────────────────────────────────────
  server.tool(
    'generate_elements',
    'Generate a video from reference elements (images, videos, and/or audio) + a text prompt. Use when the user wants to animate specific uploaded/referenced assets — e.g. "animate this product", "put these 3 characters into a scene". IMPORTANT: different models accept different numbers of inputs — call list_models type="elements" and read elements_max_images / elements_max_videos / elements_max_audio on the chosen model before generating. For text-only → video use generate_video instead. For animating a single still image use generate_video_from_image. Returns the final video URL when complete.',
    {
      prompt: z.string().describe('Text description of the desired video / animation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="elements" to see options (Seedance 2, Kling O3 Reference, Grok Imagine, Veo 3.1, etc.). Check elements_max_images / elements_max_videos / elements_max_audio on the model. Omit for Smart Select.'),
      reference_images: z.array(z.string()).optional().describe('Array of public image URLs used as reference elements (product shots, character references, etc.). **Cap: pass at most `elements_max_images` URLs from list_models for the chosen model — exceeding it is a deterministic 400.**'),
      reference_videos: z.array(z.string()).optional().describe('Array of reference video URLs for models that accept video inputs. **Cap: pass at most `elements_max_videos` URLs from list_models — if the cap is 0 the model rejects videos.**'),
      audio_url: z.string().optional().describe('URL of a reference audio track. **Audio constraints: `elements_max_audio` from list_models gates whether audio is accepted at all; audio duration must fall within `min_audio_duration`-`max_audio_duration`; format must be in `supported_audio_formats` (if specified).**'),
      files: z.array(z.string()).optional().describe('Array of URLs or absolute local paths — alternative to reference_images. Use this when you have local files to upload. Each item can be a URL OR a local path. **Total count across files + reference_images still capped by `elements_max_images`.**'),
      duration: z.number().optional().describe('Output duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (e.g., "16:9", "9:16", "1:1"). Must be in `supported_aspect_ratios` from list_models. Default: "16:9"'),
      motion: z.string().optional().describe('Motion style / intensity hint (optional)'),
      preset_id: z.string().optional().describe('Preset ID from list_presets type="video" (optional)'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency across outputs. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Kling O3 4K, Kling O3 via KIE). On other models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio. Enabling sound may apply `sound_credit_multiplier` to cost.')
    },
    async ({ prompt, model, reference_images, reference_videos, audio_url, files, duration, aspect_ratio, motion, preset_id, enhance_prompt = false, visual_dna_ids, resolution, sound_enabled }) => {
      if (!prompt) throw new Error('prompt is required');

      let startResponse;
      if (files && files.length > 0) {
        // Multipart mode: resolve each file source to a buffer and upload.
        const resolved = await Promise.all(files.map(src => resolveToBuffer(src, 'image')));
        const form = new FormData();
        form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (duration !== undefined) form.append('duration', String(duration));
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (motion) form.append('motion', motion);
        if (preset_id) form.append('preset_id', preset_id);
        form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (reference_images) form.append('reference_images', JSON.stringify(reference_images));
        if (reference_videos) form.append('reference_videos', JSON.stringify(reference_videos));
        if (audio_url) form.append('audio_url', audio_url);
        if (resolution) form.append('resolution', resolution);
        if (sound_enabled !== undefined) form.append('sound_enabled', String(sound_enabled));
        for (const f of resolved) {
          form.append('files', f.buffer, { filename: f.filename, contentType: f.contentType });
        }
        startResponse = await client.postMultipart('/v1/generate/elements', form);
      } else {
        // URL-only mode: plain JSON.
        startResponse = await client.post('/v1/generate/elements', {
          prompt, model, reference_images, reference_videos, audio_url, duration, aspect_ratio, motion, preset_id, enhance_prompt, visual_dna_ids, resolution, sound_enabled
        });
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_first_last_frame ─────────────────────────────
  server.tool(
    'generate_first_last_frame',
    'Generate a video that morphs / interpolates from a FIRST frame to a LAST frame. Provide the two frames as URLs (first_frame_url + last_frame_url) OR as local file paths (first_frame + last_frame). Optional prompt describes the desired motion/transition. Do NOT mix URL and file inputs. Returns the final video URL when complete.',
    {
      first_frame_url: z.string().optional().describe('Public URL of the first frame image (URL mode)'),
      last_frame_url: z.string().optional().describe('Public URL of the last frame image (URL mode)'),
      first_frame: z.string().optional().describe('URL or absolute local path to the first frame (file mode — alternative to first_frame_url)'),
      last_frame: z.string().optional().describe('URL or absolute local path to the last frame (file mode — alternative to last_frame_url)'),
      prompt: z.string().optional().describe('Optional description of the desired motion between the two frames (e.g. "smooth camera dolly in")'),
      model: z.string().optional().describe('Model identifier. Use list_models type="firstlastgenerations" to see options. Omit for Smart Select.'),
      duration: z.number().optional().describe('Duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: 5'),
      aspect_ratio: z.string().optional().describe('Aspect ratio (auto-detected from first frame if not provided). Must be in `supported_aspect_ratios` from list_models when set. Default: "16:9"'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false`, DNA is silently ignored.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Veo 3.1 Lite, Kling V3 4K, PixVerse V6). On other models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio.')
    },
    async ({ first_frame_url, last_frame_url, first_frame, last_frame, prompt, model, duration, aspect_ratio, enhance_prompt = false, visual_dna_ids, resolution, sound_enabled }) => {
      const urlMode = first_frame_url && last_frame_url;
      const fileMode = first_frame && last_frame;
      if (!urlMode && !fileMode) {
        throw new Error('Provide either both first_frame_url + last_frame_url OR both first_frame + last_frame (URL/local path).');
      }
      if (urlMode && fileMode) {
        throw new Error('Do not mix URL and file inputs. Provide either URLs OR file sources, not both.');
      }

      let startResponse;
      if (fileMode) {
        const [firstResolved, lastResolved] = await Promise.all([
          resolveToBuffer(first_frame, 'image'),
          resolveToBuffer(last_frame, 'image')
        ]);
        const form = new FormData();
        form.append('files', firstResolved.buffer, { filename: firstResolved.filename, contentType: firstResolved.contentType });
        form.append('files', lastResolved.buffer, { filename: lastResolved.filename, contentType: lastResolved.contentType });
        if (prompt) form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (duration !== undefined) form.append('duration', String(duration));
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (resolution) form.append('resolution', resolution);
        if (sound_enabled !== undefined) form.append('sound_enabled', String(sound_enabled));
        startResponse = await client.postMultipart('/v1/generate/first-last-frame', form);
      } else {
        startResponse = await client.post('/v1/generate/first-last-frame', {
          first_frame_url, last_frame_url, prompt, model, duration, aspect_ratio, enhance_prompt, visual_dna_ids, resolution, sound_enabled
        });
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 300000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_lipsync ──────────────────────────────────────
  server.tool(
    'generate_lipsync',
    'Lipsync an audio track to a source image or video. Both `source` (image or video) and `audio` can be provided as URLs or as absolute local file paths. Pass a text_prompt only if the model supports it (some lipsync models do character performance from a prompt). **Validate before submitting: for `lipsync-video` sources, the input video duration must fall within `min_video_duration`-`max_video_duration` from list_models; audio duration must fall within `min_audio_duration`-`max_audio_duration` (and if `audio_max_follows_video_duration: true`, audio is also capped at the video duration); audio format must be in `supported_audio_formats` when specified.** Returns a lipsynced video URL.',
    {
      source: z.string().describe('URL or absolute local path to the source image or video (the face to animate). For lipsync-video: duration must fall within `min_video_duration`-`max_video_duration` from list_models.'),
      audio: z.string().describe('URL or absolute local path to the audio track (the voice to sync to). Duration must fall within `min_audio_duration`-`max_audio_duration` from list_models; format must be in `supported_audio_formats` (when set).'),
      text_prompt: z.string().optional().describe('Optional text prompt (for performance-capable models)'),
      model: z.string().optional().describe('Model identifier. Use list_models type="lipsync-image" or type="lipsync-video" to see options. Omit for Smart Select.'),
      bounding_box_target: z.array(z.number()).optional().describe('Optional bounding box [x, y, w, h] for multi-face inputs (Hedra Character3 style). Leave empty for single-face.')
    },
    async ({ source, audio, text_prompt, model, bounding_box_target }) => {
      if (!source) throw new Error('source is required (URL or absolute local path to image/video)');
      if (!audio) throw new Error('audio is required (URL or absolute local path to audio file)');

      const sourceIsUrl = typeof source === 'string' && /^https?:\/\//i.test(source);
      const audioIsUrl = typeof audio === 'string' && /^https?:\/\//i.test(audio);

      let startResponse;
      if (sourceIsUrl && audioIsUrl) {
        // URL mode
        startResponse = await client.post('/v1/generate/lipsync', {
          source_url: source,
          audio_url: audio,
          prompt: text_prompt,
          model,
          bounding_box_target
        });
      } else {
        // File mode (or mixed — resolve any local paths, pass URLs through as body fields)
        const form = new FormData();
        if (!sourceIsUrl) {
          const resolved = await resolveToBuffer(source, /\.(mp4|mov|webm|mkv)$/i.test(source) ? 'video' : 'image');
          // Decide field name by kind — lipsync controller uses .fields() with image/video/audio.
          const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(resolved.filename);
          form.append(isVideo ? 'video' : 'image', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        } else {
          form.append('source_url', source);
        }
        if (!audioIsUrl) {
          const resolved = await resolveToBuffer(audio, 'audio');
          form.append('audio', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        } else {
          form.append('audio_url', audio);
        }
        if (text_prompt) form.append('prompt', text_prompt);
        if (model) form.append('model', model);
        if (bounding_box_target) form.append('bounding_box_target', JSON.stringify(bounding_box_target));
        startResponse = await client.postMultipart('/v1/generate/lipsync', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_video_from_video ─────────────────────────────
  server.tool(
    'generate_video_from_video',
    'Restyle / transform an existing video using a text prompt (video-to-video). Use for style transfer, scene restyling, subject swap, motion transfer, or character replacement. Source video can be a URL or absolute local path. IMPORTANT: different models support different extra inputs — call list_models type="video_to_video" and read max_images / max_videos / max_elements on the chosen model before generating. Pass reference_images for models with max_images > 0 (e.g. Kling O1/O3, Aleph, WAN VACE), reference_videos for models with max_videos > 1 (e.g. WAN 2.6 reference-to-video accepts up to 3), and elements for models with max_elements > 0. For animating a still image use generate_video_from_image instead. For text-only → video use generate_video.',
    {
      source_video: z.string().describe('URL or absolute local path to the primary source video to restyle. **Source duration must fall within `min_video_duration`-`max_video_duration` from list_models for the chosen model** — videos outside that range are rejected (or silently truncated by some upstream providers). For models that use reference_videos as their primary input (e.g. WAN 2.6 reference-to-video), pass the first reference video here and also include it in reference_videos.'),
      prompt: z.string().describe('Text description of the desired restyle / transformation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="video_to_video" to see options and check max_images / max_videos / max_elements / max_video_duration per model. Omit for Smart Select.'),
      aspect_ratio: z.string().optional().describe('Output aspect ratio. Must be in `supported_aspect_ratios` from list_models when set. Default: matches source'),
      duration: z.number().optional().describe('Output duration in seconds. Must be in `supported_durations` from list_models, OR within `min_output_duration`-`max_output_duration`. Default: matches source'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      visual_dna_ids: z.array(z.string()).optional().describe('Array of Visual DNA profile IDs to apply for character/style consistency. **Cap: pass at most `max_visual_dna` IDs from list_models for the chosen model; if `supports_visual_dna: false`, DNA is silently ignored.**'),
      resolution: z.string().optional().describe('Video resolution tier (vertical pixels): "720p" / "1080p" / "1440p" / "2160p". Model-dependent — call list_models and read supported_resolutions.'),
      reference_images: z.array(z.string()).optional().describe('Array of reference image URLs for models that support additional image inputs. **Cap: pass at most `max_images` URLs from list_models — if `max_images === 0` the model does not accept image refs.** Examples: character reference images for Kling O1/O3, style reference for Aleph/gen4_aleph, character image for WAN VACE video-edit.'),
      reference_videos: z.array(z.string()).optional().describe('Array of additional reference video URLs for models that support multiple video inputs. **Cap: pass at most `max_videos` URLs from list_models — if `max_videos <= 1` only the source_video is accepted.** Example: WAN 2.6 reference-to-video accepts 1–3 reference videos.'),
      elements: z.array(z.string()).optional().describe('Array of element image URLs. **Cap: pass at most `max_elements` URLs from list_models — if `max_elements === 0` the model does not accept elements.** Elements are style or character reference assets alongside the main video.'),
      sound_enabled: z.boolean().optional().describe('Enable (`true`) or disable (`false`) AI-generated synced audio on the output video. Only honored by models with `sound_generation_type: "native"` from list_models (e.g. Kling v3 via KIE). On other models the flag has no effect. Omit to use the model\'s `sound_enabled_by_default`. Pass `false` when the user says no sound / silent / mute / without audio.')
    },
    async ({ source_video, prompt, model, aspect_ratio, duration, enhance_prompt = false, visual_dna_ids, resolution, reference_images, reference_videos, elements, sound_enabled }) => {
      if (!source_video) throw new Error('source_video is required');
      if (!prompt) throw new Error('prompt is required');

      const isUrl = /^https?:\/\//i.test(source_video);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/generate/video-from-video', {
          video_url: source_video, prompt, model, aspect_ratio, duration, enhance_prompt, visual_dna_ids, resolution,
          reference_images, reference_videos, elements, sound_enabled
        });
      } else {
        const resolved = await resolveToBuffer(source_video, 'video');
        const form = new FormData();
        form.append('files', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        form.append('prompt', prompt);
        if (model) form.append('model', model);
        if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
        if (duration !== undefined) form.append('duration', String(duration));
        form.append('enhance_prompt', String(enhance_prompt));
        if (visual_dna_ids) form.append('visual_dna_ids', JSON.stringify(visual_dna_ids));
        if (resolution) form.append('resolution', resolution);
        if (reference_images) form.append('reference_images', JSON.stringify(reference_images));
        if (reference_videos) form.append('reference_videos', JSON.stringify(reference_videos));
        if (elements) form.append('elements', JSON.stringify(elements));
        if (sound_enabled !== undefined) form.append('sound_enabled', String(sound_enabled));
        startResponse = await client.postMultipart('/v1/generate/video-from-video', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── transcribe_audio ──────────────────────────────────────
  server.tool(
    'transcribe_audio',
    'Transcribe audio or video into text + SRT subtitles. Source can be a URL or an absolute local file path. Returns the full text, SRT content, duration, and download URLs for .srt/.txt files. Works on both audio-only files (mp3, wav, m4a) and videos with audio tracks (mp4, mov, webm).',
    {
      source: z.string().describe('URL or absolute local path to the audio / video file to transcribe')
    },
    async ({ source }) => {
      if (!source) throw new Error('source is required (URL or absolute local path)');

      const isUrl = /^https?:\/\//i.test(source);
      let startResponse;
      if (isUrl) {
        startResponse = await client.post('/v1/transcribe', { audio_url: source });
      } else {
        const resolved = await resolveToBuffer(source, 'audio');
        const form = new FormData();
        form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
        startResponse = await client.postMultipart('/v1/transcribe', form);
      }

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 5) * 1000,
        timeout: 1800000 // 30 minutes — long podcasts are a thing
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            text: result.result?.text || '',
            srt_url: result.result?.srt_url || null,
            word_by_word_srt_url: result.result?.word_by_word_srt_url || null,
            txt_url: result.result?.txt_url || null,
            duration: result.result?.duration || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── generate_3d ───────────────────────────────────────────
  server.tool(
    'generate_3d',
    'Generate a 3D model from a text prompt, a single reference image, or multiple reference images (for multi-view reconstruction). Returns model URLs in multiple formats (GLB, FBX, OBJ, USDZ). Modes: "text" (prompt-only), "single" (one image), "multi" (multiple images for better quality). The mode is auto-detected from the inputs if not specified.',
    {
      prompt: z.string().optional().describe('Text description of the 3D object to generate (used in text mode and also as a hint in image modes)'),
      reference_images: z.array(z.string()).optional().describe('Array of public image URLs. 1 image → single mode, 2+ → multi mode.'),
      mode: z.string().optional().describe('Explicitly set mode: "text" | "single" | "multi". Auto-detected from reference_images if omitted.'),
      texture_prompt: z.string().optional().describe('Optional prompt to guide texture generation'),
      model: z.string().optional().describe('Model identifier. Use list_models type="three_d" to see all 3D options, or filter by sub-type: "3d_text_to_model", "3d_image_to_model", "3d_multi_image_to_model", "3d_world".'),
      topology: z.string().optional().describe('Topology preset (optional, model-specific)'),
      target_polycount: z.number().optional().describe('Target polygon count (optional, model-specific)'),
      enable_tpose: z.boolean().optional().describe('Force T-pose for character models (optional)'),
      enable_pbr: z.boolean().optional().describe('Enable PBR textures (optional)')
    },
    async ({ prompt, reference_images, mode, texture_prompt, model, topology, target_polycount, enable_tpose, enable_pbr }) => {
      if (!prompt && !(reference_images && reference_images.length > 0)) {
        throw new Error('Provide prompt (text mode) or reference_images (single/multi mode)');
      }

      const startResponse = await client.post('/v1/generate/3d', {
        mode,
        prompt,
        reference_images,
        texture_prompt,
        model,
        topology,
        target_polycount,
        enable_tpose,
        enable_pbr
      });

      const result = await pollUntilDone(client, startResponse.generation_id, {
        interval: (startResponse.poll_interval_hint || 8) * 1000,
        timeout: 900000 // 15 minutes — 3D generation is slow
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            thumbnail_url: result.result?.thumbnail_url || null,
            mode: result.result?.mode || null,
            prompt_used: result.result?.prompt_used || null
          }, null, 2)
        }]
      };
    }
  );
  // ─── edit_image ────────────────────────────────────────────
  server.tool(
    'edit_image',
    'Apply a targeted AI edit to an existing image. Use for upscaling resolution, changing aspect ratio (reframe), removing the background, portrait skin enhancement, or a text-guided edit (magic_edit). Faster and cheaper than generate_image_edit for these specific operations because it routes to specialized models. Returns the edited image URL when complete.',
    {
      image_url: z.string().describe('URL of the source image to edit'),
      operation: z.enum(['upscale', 'reframe', 'removebg', 'enhance_skin', 'magic_edit'])
        .describe('Edit operation to apply: "upscale" (increase resolution 2×–4×), "reframe" (change aspect ratio), "removebg" (remove background), "enhance_skin" (portrait retouching), "magic_edit" (text-guided edit — requires prompt)'),
      model: z.string().optional().describe('Model identifier override. Omit to use the default model for the operation.'),
      scale: z.number().optional().describe('Upscale factor: 2, 3, or 4. Only used when operation="upscale". Default: 2.'),
      aspect_ratio: z.string().optional().describe('Target aspect ratio (e.g., "16:9", "9:16", "1:1"). Required for operation="reframe".'),
      skin_strength: z.enum(['subtle', 'realistic', 'pimple', 'freckle']).optional()
        .describe('Skin enhancement style. Only used when operation="enhance_skin". Default: "realistic".'),
      prompt: z.string().optional().describe('Text instruction for the edit. Required for operation="magic_edit" (e.g., "add sunglasses", "change the sky to sunset").')
    },
    async ({ image_url, operation, model, scale, aspect_ratio, skin_strength, prompt }) => {
      if (operation === 'magic_edit' && !prompt) throw new Error('prompt is required for magic_edit operation');
      if (operation === 'reframe' && !aspect_ratio) throw new Error('aspect_ratio is required for reframe operation');

      const gen = await client.post('/v1/edit/image', {
        image_url, operation, model, scale, aspect_ratio, skin_strength, prompt
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 5) * 1000,
        timeout: 180000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            edit_type: result.result?.edit_type || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── edit_video ────────────────────────────────────────────
  server.tool(
    'edit_video',
    'Apply a targeted AI edit to an existing video. Operations: upscale (4K resolution boost), reframe (change aspect ratio), generate_audio (add AI-generated sound/music from a prompt), remove_watermark, face_swap (replace faces using a reference image URL), extend (lengthen at start or end), magic_edit (restyle/transform with a prompt), lipsync (sync an audio track to a face in the video). Returns the edited video URL when complete.',
    {
      video_url: z.string().describe('URL of the source video to edit'),
      operation: z.enum(['upscale', 'reframe', 'generate_audio', 'remove_watermark', 'face_swap', 'extend', 'magic_edit', 'lipsync'])
        .describe('Edit operation: "upscale", "reframe" (requires aspect_ratio), "generate_audio" (requires prompt), "remove_watermark", "face_swap" (requires image_url), "extend" (requires duration), "magic_edit" (requires prompt), "lipsync" (requires audio_url)'),
      model: z.string().optional().describe('Model identifier override. Omit to use the default model for the operation.'),
      aspect_ratio: z.string().optional().describe('Target aspect ratio (e.g., "16:9", "9:16"). Required for operation="reframe".'),
      scale: z.number().optional().describe('Upscale factor. Only used when operation="upscale".'),
      prompt: z.string().optional().describe('Text prompt. Required for operation="magic_edit" and "generate_audio". Optional hint for "extend".'),
      image_url: z.string().optional().describe('URL of the reference face image. Required for operation="face_swap".'),
      audio_url: z.string().optional().describe('URL of the audio track to sync. Required for operation="lipsync".'),
      duration: z.number().optional().describe('Seconds of video to generate. Required for operation="extend". Typical range: 1–20.'),
      mode: z.string().optional().describe('Where to extend: "start" or "end". Only used when operation="extend". Default: "end".')
    },
    async ({ video_url, operation, model, aspect_ratio, scale, prompt, image_url, audio_url, duration, mode }) => {
      if (operation === 'magic_edit' && !prompt) throw new Error('prompt is required for magic_edit');
      if (operation === 'generate_audio' && !prompt) throw new Error('prompt is required for generate_audio');
      if (operation === 'reframe' && !aspect_ratio) throw new Error('aspect_ratio is required for reframe');
      if (operation === 'face_swap' && !image_url) throw new Error('image_url (reference face) is required for face_swap');
      if (operation === 'lipsync' && !audio_url) throw new Error('audio_url is required for lipsync');
      if (operation === 'extend' && !duration) throw new Error('duration is required for extend');

      const gen = await client.post('/v1/edit/video', {
        video_url, operation, model, aspect_ratio, scale, prompt,
        image_url, audio_url, duration, mode
      });

      const result = await pollUntilDone(client, gen.generation_id, {
        interval: (gen.poll_interval_hint || 8) * 1000,
        timeout: 600000
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            urls: result.result?.urls || [],
            download_url: result.result?.download_url || null,
            edit_type: result.result?.edit_type || null,
            duration: result.result?.duration || null,
            model: result.result?.model || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerGenerateTools };
