import * as path from 'path';
import * as fs from 'fs-extra';
import { stat as fsStat, unlink as fsUnlink } from 'fs/promises';
import { statSync } from 'fs';
import { promisify } from 'util';

let ffmpeg: any = null;
let ffmpegPath: string | null = null;

async function initializeFFmpeg() {
  try {
    const fluentFfmpeg = await import('fluent-ffmpeg');
    ffmpeg = fluentFfmpeg.default;
    try {
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
      ffmpegPath = ffmpegInstaller.default.path;
      ffmpeg.setFfmpegPath(ffmpegPath);

      const ffprobePath = ffmpegPath.replace('ffmpeg.exe', 'ffprobe.exe');
      ffmpeg.setFfprobePath(ffprobePath);
    } catch (installerError: any) {
    }

  } catch (error: any) {
  }
}

initializeFFmpeg();


export interface AudioConversionOptions {
  inputPath: string;
  outputPath?: string;
  format: 'mp3' | 'ogg' | 'aac' | 'm4a';
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  quality?: number;
}

export interface AudioMetadata {
  duration: number;
  format: string;
  bitrate: string;
  sampleRate: number;
  channels: number;
  size: number;
}

/**
 * Check if FFmpeg is available
 */
function isFFmpegAvailable(): boolean {
  if (ffmpeg === null) {
    return false;
  }

  try {
    ffmpeg();
    return true;
  } catch (error: any) {
    return false;
  }
}

/**
 * Convert audio file to WhatsApp-compatible format
 */
/**
 * Convert audio with fallback support for maximum WhatsApp compatibility
 */
export async function convertAudioForWhatsAppWithFallback(
  inputPath: string,
  outputDir: string,
  originalFilename: string
): Promise<{ outputPath: string; metadata: AudioMetadata; format: string; mimeType: string }> {
  const fallbackFormats = getWhatsAppFallbackFormats();

  for (const formatConfig of fallbackFormats) {
    try {
      const baseName = path.basename(originalFilename, path.extname(originalFilename));
      const outputPath = path.join(outputDir, `${baseName}_${formatConfig.format}_${Date.now()}${formatConfig.extension}`);

      await fs.ensureDir(outputDir);

      const metadata = await convertAudio({
        inputPath,
        outputPath,
        format: formatConfig.format as any,
        bitrate: '64k',
        sampleRate: 48000,
        channels: 1,
        quality: undefined
      });

      return {
        outputPath,
        metadata,
        format: formatConfig.format,
        mimeType: formatConfig.mimeType
      };
    } catch (error) {
      continue;
    }
  }

  const stats = await fsStat(inputPath);
  const metadata: AudioMetadata = {
    duration: 0,
    format: 'unknown',
    bitrate: '0',
    sampleRate: 0,
    channels: 0,
    size: stats.size
  };

  return {
    outputPath: inputPath,
    metadata,
    format: 'original',
    mimeType: 'audio/mpeg'
  };
}

export async function convertAudioForWhatsApp(
  inputPath: string,
  outputDir: string,
  originalFilename: string
): Promise<{ outputPath: string; metadata: AudioMetadata }> {
  if (!isFFmpegAvailable()) {

    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const outputPath = path.join(outputDir, `${baseName}_whatsapp_${Date.now()}.ogg`);

    await fs.ensureDir(outputDir);
    await fs.copy(inputPath, outputPath);

    const stats = await fsStat(outputPath);
    const metadata: AudioMetadata = {
      duration: 0,
      format: 'webm-as-ogg',
      bitrate: '0',
      sampleRate: 0,
      channels: 0,
      size: stats.size
    };


    return { outputPath, metadata };
  }

  const inputExt = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(originalFilename, path.extname(originalFilename));

  const bestFormat = getBestWhatsAppFormat();
  let outputFormat: 'mp3' | 'ogg' | 'aac' | 'm4a' = bestFormat.format as any;
  let outputExt = bestFormat.extension;

  if (inputExt === '.webm') {
    outputFormat = bestFormat.format as any;
    outputExt = bestFormat.extension;
  }

  const outputPath = path.join(outputDir, `${baseName}_converted_${Date.now()}${outputExt}`);

  await fs.ensureDir(outputDir);

  try {
    const metadata = await convertAudio({
      inputPath,
      outputPath,
      format: outputFormat,
      bitrate: '64k',
      sampleRate: 48000,
      channels: 1,
      quality: undefined
    });

    return { outputPath, metadata };
  } catch (conversionError) {
    const stats = await fsStat(inputPath);
    const metadata: AudioMetadata = {
      duration: 0,
      format: 'unknown',
      bitrate: '0',
      sampleRate: 0,
      channels: 0,
      size: stats.size
    };
    return { outputPath: inputPath, metadata };
  }
}

/**
 * Convert audio file with specified options
 */
export async function convertAudio(options: AudioConversionOptions): Promise<AudioMetadata> {
  const { inputPath, outputPath, format, bitrate = '128k', sampleRate = 44100, channels = 1 } = options;
  
  if (!outputPath) {
    throw new Error('Output path is required');
  }
  
  return new Promise((resolve, reject) => {
    if (!ffmpeg) {
      return reject(new Error('FFmpeg not available'));
    }

    let command = ffmpeg(inputPath);
    
    switch (format) {
      case 'mp3':
        command = command.audioCodec('libmp3lame');
        break;
      case 'ogg':
        command = command.audioCodec('libopus');
        break;
      case 'aac':
      case 'm4a':
        command = command.audioCodec('aac');
        break;
      default:
        return reject(new Error(`Unsupported audio format: ${format}`));
    }
    

    let finalSampleRate = sampleRate;
    if (format === 'ogg' && sampleRate !== 48000) {
      console.warn(`Warning: OGG Opus format should use 48000 Hz sample rate for WhatsApp compatibility. Adjusting from ${sampleRate} Hz to 48000 Hz.`);
      finalSampleRate = 48000;
    }
    
    command = command
      .audioBitrate(bitrate)
      .audioFrequency(finalSampleRate)
      .audioChannels(channels)
      .format(format === 'm4a' ? 'mp4' : format);
    
    if (format === 'ogg') {
      command = command.outputOptions([
        '-application', 'voip',
        '-frame_duration', '20',
        '-packet_loss', '1'
      ]);
    } else if (format === 'm4a' || format === 'aac') {
      command = command.outputOptions([
        '-profile:a', 'aac_low',
        '-movflags', '+faststart',
        '-map_metadata', '0'
      ]);
    } else {
      command = command.outputOptions([
        '-map_metadata', '0',
        '-movflags', '+faststart'
      ]);
    }
    
    command
      .on('end', async () => {
        try {
          const stats = await fsStat(outputPath);
          const metadata: AudioMetadata = {
            duration: 0,
            format: format,
            bitrate: bitrate,
            sampleRate: finalSampleRate,
            channels: channels,
            size: stats.size
          };
          resolve(metadata);
        } catch (statsError) {
          resolve({
            duration: 0,
            format: format,
            bitrate: bitrate,
            sampleRate: finalSampleRate,
            channels: channels,
            size: 0
          });
        }
      })
      .on('error', (error: any) => {
        reject(error);
      })
      .save(outputPath);
  });
}

/**
 * Get audio file metadata
 */
export async function getAudioMetadata(filePath: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) {
      return reject(new Error('FFmpeg not available'));
    }

    ffmpeg.ffprobe(filePath, (error: any, metadata: any) => {
      if (error) {
        return reject(error);
      }
      
      const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');
      if (!audioStream) {
        return reject(new Error('No audio stream found'));
      }
      
      const stats = statSync(filePath);
      
      resolve({
        duration: metadata.format.duration || 0,
        format: metadata.format.format_name || 'unknown',
        bitrate: metadata.format.bit_rate || audioStream.bit_rate || '0',
        sampleRate: audioStream.sample_rate || 0,
        channels: audioStream.channels || 0,
        size: stats.size
      });
    });
  });
}

/**
 * Get the best audio format for WhatsApp cross-platform compatibility
 * OGG Opus is preferred for Android WhatsApp compatibility
 */
export function getBestWhatsAppFormat(): { format: string; extension: string; codec: string; mimeType: string } {
  return {
    format: 'ogg',
    extension: '.ogg',
    codec: 'opus',
    mimeType: 'audio/ogg'
  };
}

/**
 * Get fallback audio formats for WhatsApp compatibility
 * Prioritized for Android WhatsApp compatibility: OGG Opus first, then M4A, then MP3
 */
export function getWhatsAppFallbackFormats(): Array<{ format: string; extension: string; codec: string; mimeType: string }> {
  return [
    {
      format: 'ogg',
      extension: '.ogg',
      codec: 'opus',
      mimeType: 'audio/ogg'
    },
    {
      format: 'm4a',
      extension: '.m4a',
      codec: 'aac',
      mimeType: 'audio/mp4'
    },
    {
      format: 'mp3',
      extension: '.mp3',
      codec: 'mp3',
      mimeType: 'audio/mpeg'
    }
  ];
}

/**
 * Check if audio conversion is needed for WhatsApp compatibility
 */
export function needsConversionForWhatsApp(mimeType: string, fileExtension: string): boolean {
  const whatsappCompatibleFormats = [
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
  ];

  const whatsappCompatibleExtensions = ['.m4a', '.mp3', '.ogg'];

  if (fileExtension === '.webm' || mimeType === 'audio/webm') {
    return true;
  }

  return !whatsappCompatibleFormats.includes(mimeType.toLowerCase()) ||
         !whatsappCompatibleExtensions.includes(fileExtension.toLowerCase());
}

/**
 * Get WhatsApp-compatible MIME type for converted audio
 */
export function getWhatsAppMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
      return 'audio/mp4';
    default:
      return 'audio/mp4';
  }
}

/**
 * Convert audio to WhatsApp-compatible format (OGG Opus) for better Android support
 */
export async function convertAudioForCrossPlatform(
  inputPath: string,
  outputDir: string,
  originalFilename: string
): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
  try {
    if (!isFFmpegAvailable()) {
      return {
        success: false,
        error: 'FFmpeg not available for audio conversion'
      };
    }

    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const oggFileName = `${baseName}_ogg_${Date.now()}.ogg`;
    const outputPath = path.join(outputDir, oggFileName);

    await fs.ensureDir(outputDir);


    await convertAudio({
      inputPath,
      outputPath,
      format: 'ogg',
      bitrate: '64k', // Optimal bitrate for voice with Opus codec
      sampleRate: 48000, // Opus preferred sample rate
      channels: 1, // Mono for voice
      quality: undefined
    });

    return {
      success: true,
      audioUrl: `media/audio/${oggFileName}`
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown conversion error'
    };
  }
}

/**
 * Clean up temporary audio files
 */
export async function cleanupTempAudioFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
    }
  }
}
