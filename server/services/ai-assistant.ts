import OpenAI from 'openai';
import { Message, Contact, Conversation, ChannelConnection } from '@shared/schema';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import elevenLabsService, { ElevenLabsConfig } from './elevenlabs-service';
import { aiCredentialsService } from './ai-credentials-service';
import knowledgeBaseService from './knowledge-base-service';
import serverI18n from '../utils/server-i18n';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: string | null;
}

interface AIProviderInterface {
  generateResponse(
    messages: ConversationMessage[],
    options: {
      systemPrompt?: string;
      enableFunctionCalling?: boolean;
      enableAudio?: boolean;
      enableImage?: boolean;
      enableVideo?: boolean;
      enableVoiceProcessing?: boolean;
      enableTextToSpeech?: boolean;
      ttsProvider?: string;
      ttsVoice?: string;
      voiceResponseMode?: string;
      maxAudioDuration?: number;
      functionDefinitions?: any[];
      model?: string;
      language?: string;
      elevenLabsApiKey?: string;
      elevenLabsVoiceId?: string;
      elevenLabsCustomVoiceId?: string;
      elevenLabsModel?: string;
      elevenLabsStability?: number;
      elevenLabsSimilarityBoost?: number;
      elevenLabsStyle?: number;
      elevenLabsUseSpeakerBoost?: boolean;
    }
  ): Promise<{
    text: string;
    audioUrl?: string;
    functionCalls?: any[];
  }>;
}

function generateMessagesWithHistory(
  message: Message,
  _contact: Contact,
  systemPrompt: string,
  conversationHistory: Message[] = [],
  historyLimit: number = 5
): ConversationMessage[] {
  const messages: ConversationMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  const recentHistory = conversationHistory
    .sort((a, b) => {
      const timeA = a.sentAt ? a.sentAt.getTime() : 0;
      const timeB = b.sentAt ? b.sentAt.getTime() : 0;
      return timeA - timeB;
    })
    .slice(-historyLimit);


  recentHistory.forEach(historyMsg => {
    const role = historyMsg.direction === 'inbound' ? 'user' : 'assistant';
    if (historyMsg.content) {
      let metadata = null;

      if (historyMsg.type === 'audio') {
        if (historyMsg.metadata) {
          metadata = typeof historyMsg.metadata === 'string' ? historyMsg.metadata : JSON.stringify(historyMsg.metadata);
        } else if (historyMsg.mediaUrl) {
          metadata = JSON.stringify({
            mediaUrl: historyMsg.mediaUrl,
            mediaType: 'audio'
          });
        }
      } else if (historyMsg.mediaUrl) {
        metadata = JSON.stringify({
          mediaUrl: historyMsg.mediaUrl,
          mediaType: historyMsg.type
        });
      }

      messages.push({
        role,
        content: historyMsg.content,
        metadata
      });
    }
  });

  if (!recentHistory.find(m => m.id === message.id) && message.content) {
    let metadata = null;

    if (message.type === 'audio') {
      if (message.metadata) {
        metadata = typeof message.metadata === 'string' ? message.metadata : JSON.stringify(message.metadata);
      } else if (message.mediaUrl) {
        metadata = JSON.stringify({
          mediaUrl: message.mediaUrl,
          mediaType: 'audio'
        });
      }
    } else if (message.mediaUrl) {
      metadata = JSON.stringify({
        mediaUrl: message.mediaUrl,
        mediaType: message.type
      });
    }

    messages.push({
      role: 'user',
      content: message.content,
      metadata
    });
  }

  return messages;
}

class OpenAIProvider implements AIProviderInterface {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Convert audio file to text using OpenAI Whisper
   */
  private async transcribeAudio(audioPath: string): Promise<string> {
    try {
      const audioFile = await fs.readFile(audioPath);
      const audioBuffer = Buffer.from(audioFile);

      const fileExtension = path.extname(audioPath).toLowerCase();
      let tempFileName = `temp_audio_${Date.now()}`;

      if (fileExtension === '.ogg' || fileExtension === '.oga') {
        tempFileName += '.ogg';
      } else if (fileExtension === '.mp3') {
        tempFileName += '.mp3';
      } else if (fileExtension === '.wav') {
        tempFileName += '.wav';
      } else if (fileExtension === '.m4a') {
        tempFileName += '.m4a';
      } else {
        tempFileName += '.mp3';
      }

      const tempPath = path.join(process.cwd(), 'temp', tempFileName);

      await fs.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.writeFile(tempPath, audioBuffer);

      try {
        const fs_node = await import('fs');

        let transcription = '';
        let lastError: Error | null = null;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const result = await this.client.audio.transcriptions.create({
              file: await OpenAI.toFile(fs_node.createReadStream(tempPath), path.basename(tempPath)),
              model: 'whisper-1',
              language: 'en',
              response_format: 'text'
            });

            transcription = result;
            break;

          } catch (error) {
            lastError = error as Error;

            if (attempt === maxRetries) {
              throw lastError;
            }

            const waitTime = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }

        await fs.unlink(tempPath).catch(() => {});

        return transcription;
      } catch (error) {
        await fs.unlink(tempPath).catch(() => {});
        throw error;
      }
    } catch (error) {
      console.error('OpenAI Provider: Error transcribing audio:', error);
      const errorMessage = await serverI18n.t(
        'ai_assistant.error_transcription_failed',
        'en',
        `Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw new Error(errorMessage);
    }
  }

  /**
   * Convert text to speech using OpenAI TTS with cross-platform optimization
   */
  private async generateSpeech(text: string, voice: string = 'alloy'): Promise<string> {
    try {
      let response: any;
      let lastError: Error | null = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await this.client.audio.speech.create({
            model: 'tts-1',
            voice: voice as any,
            input: text,
            response_format: 'mp3'
          });

          break;

        } catch (error) {
          lastError = error as Error;

          if (attempt === maxRetries) {
            throw lastError;
          }

          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const audioId = crypto.randomBytes(16).toString('hex');
      const audioDir = path.join(process.cwd(), 'media', 'audio');
      await fs.mkdir(audioDir, { recursive: true });


      const mp3FileName = `tts_${audioId}.mp3`;
      const mp3Path = path.join(audioDir, mp3FileName);
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(mp3Path, audioBuffer);


      try {
        const { convertAudioForCrossPlatform } = await import('../utils/audio-converter');
        const oggResult = await convertAudioForCrossPlatform(mp3Path, audioDir, mp3FileName);

        if (oggResult.success && oggResult.audioUrl) {

          return oggResult.audioUrl;
        } else {
          console.warn('OpenAI TTS: OGG conversion failed, using MP3 fallback:', oggResult.error);
        }
      } catch (conversionError) {
        console.warn('OpenAI TTS: Audio conversion not available, using MP3:', conversionError);
      }


      return `media/audio/${mp3FileName}`;
    } catch (error) {
      console.error('OpenAI Provider: Error generating speech:', error);
      const errorMessage = await serverI18n.t(
        'ai_assistant.error_speech_generation_failed',
        'en',
        `Speech generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw new Error(errorMessage);
    }
  }

  async generateResponse(
    messages: ConversationMessage[],
    options: {
      systemPrompt?: string;
      enableFunctionCalling?: boolean;
      enableAudio?: boolean;
      enableImage?: boolean;
      enableVideo?: boolean;
      enableVoiceProcessing?: boolean;
      enableTextToSpeech?: boolean;
      ttsProvider?: string;
      ttsVoice?: string;
      voiceResponseMode?: string;
      maxAudioDuration?: number;
      functionDefinitions?: any[];
      model?: string;
      elevenLabsApiKey?: string;
      elevenLabsVoiceId?: string;
      elevenLabsCustomVoiceId?: string;
      elevenLabsModel?: string;
      elevenLabsStability?: number;
      elevenLabsSimilarityBoost?: number;
      elevenLabsStyle?: number;
      elevenLabsUseSpeakerBoost?: boolean;
    }
  ): Promise<{
    text: string;
    audioUrl?: string;
    functionCalls?: any[];
  }> {
    try {


      const processedMessages = await Promise.all(messages.map(async (msg) => {
        const userMessagesWithMetadata = messages.filter(m => m.role === 'user' && m.metadata);
        const isLatestUserMessageWithMetadata = userMessagesWithMetadata.length > 0 &&
                                               userMessagesWithMetadata[userMessagesWithMetadata.length - 1] === msg;
        const shouldTranscribe = options.enableVoiceProcessing && msg.metadata && msg.role === 'user' && isLatestUserMessageWithMetadata;

        if (shouldTranscribe) {
          try {
            if (!msg.metadata) {
              throw new Error('No metadata available for transcription');
            }
            const metadata = JSON.parse(msg.metadata);

            let audioPath: string | null = null;

            const isAudioMessage = metadata.mediaType === 'audio' ||
                                 metadata.whatsappMessage?.message?.audioMessage ||
                                 metadata.audioPath ||
                                 (metadata.mediaUrl && metadata.mediaUrl.includes('/audio/')) ||
                                 (metadata.mediaUrl && metadata.mediaUrl.includes('.mp3')) ||
                                 (metadata.mediaUrl && metadata.mediaUrl.includes('.ogg')) ||
                                 (metadata.mediaUrl && metadata.mediaUrl.includes('.wav'));

            if (isAudioMessage) {
              const maxDuration = options.maxAudioDuration || 30;
              const audioDuration = metadata.whatsappMessage?.message?.audioMessage?.seconds;

              if (audioDuration && audioDuration > maxDuration) {

                const language = (options as any).language || 'en';
                const warningMessage = await serverI18n.t(
                  'ai_assistant.audio_too_long_warning',
                  language,
                  `Your audio message is too long for processing. Please send a shorter message (under ${maxDuration} seconds) or type your message instead.`,
                  { maxDuration }
                );
                return {
                  role: msg.role,
                  content: warningMessage,
                  metadata: msg.metadata
                };
              }

              if (metadata.mediaUrl) {
                audioPath = metadata.mediaUrl;
              } else if (metadata.audioPath) {
                audioPath = metadata.audioPath;
              }

              if (audioPath) {
                try {
                  let fullAudioPath: string;

                  if (audioPath.startsWith('/media/')) {
                    fullAudioPath = path.join(process.cwd(), 'public', audioPath.slice(1));
                  } else if (audioPath.startsWith('media/')) {
                    fullAudioPath = path.join(process.cwd(), 'public', audioPath);
                  } else if (path.isAbsolute(audioPath)) {
                    fullAudioPath = audioPath;
                  } else {
                    fullAudioPath = path.join(process.cwd(), audioPath);
                  }

                  try {
                    await fs.access(fullAudioPath);
                  } catch (fileError) {
                    const language = (options as any).language || 'en';
                    const errorMessage = await serverI18n.t(
                      'ai_assistant.error_audio_file_not_found',
                      language,
                      `Audio file not found: ${fullAudioPath}`,
                      { path: fullAudioPath }
                    );
                    throw new Error(errorMessage);
                  }

                  const transcribedText = await this.transcribeAudio(fullAudioPath);
                  const language = (options as any).language || 'en';
                  const fallbackMessage = await serverI18n.t(
                    'ai_assistant.voice_message_transcription_failed',
                    language,
                    'Voice message (transcription failed)'
                  );
                  const enhancedContent = transcribedText || fallbackMessage;

                  return {
                    role: msg.role,
                    content: enhancedContent,
                    metadata: msg.metadata
                  };
                } catch (transcriptionError) {
                  const language = (options as any).language || 'en';
                  const errorMessage = await serverI18n.t(
                    'ai_assistant.voice_message_transcription_error',
                    language,
                    `Voice message (transcription failed: ${transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'})`,
                    { error: transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error' }
                  );
                  return {
                    role: msg.role,
                    content: errorMessage,
                    metadata: msg.metadata
                  };
                }
              }
            }
          } catch (error) {
          }
        }

        return {
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata
        };
      }));

      const apiMessages = processedMessages;

      let modelToUse = options.model || "gpt-4-turbo";

      switch (modelToUse) {
        case 'gpt-4.1-nano':
          modelToUse = "gpt-4o-mini";
          break;
        case 'gpt-4.1-mini':
          modelToUse = "gpt-4o-mini";
          break;
        case 'gpt-4o':
          modelToUse = "gpt-4o";
          break;
        case 'gpt-4-turbo':
          modelToUse = "gpt-4-turbo";
          break;
        case 'gpt-3.5-turbo':
          modelToUse = "gpt-3.5-turbo";
          break;
        default:
          modelToUse = "gpt-4-turbo";
      }

      let maxTokens = 4096;
      let temperature = 0.7;

      if (modelToUse === "gpt-4o-mini") {
        maxTokens = 2048;
        temperature = 0.5;
      }

      const apiParams: any = {
        model: modelToUse,
        messages: apiMessages,
        temperature: temperature,
        max_tokens: maxTokens
      };

      if (options.enableFunctionCalling && options.functionDefinitions) {
        apiParams.tools = options.functionDefinitions.map(funcDef => ({
          type: "function",
          function: funcDef
        }));
        apiParams.tool_choice = "auto";

      }

      const response = await this.client.chat.completions.create(apiParams);

      let functionCalls: Array<{ name: string, arguments: any }> = [];

      if (response.choices[0]?.message?.tool_calls) {
        functionCalls = response.choices[0].message.tool_calls.map(tool => {
          if (tool.type === 'function') {
            try {
              return {
                name: tool.function.name,
                arguments: JSON.parse(tool.function.arguments)
              };
            } catch (e) {
              console.error(`OpenAI Provider: Error parsing function arguments:`, e);
              return {
                name: tool.function.name,
                arguments: tool.function.arguments
              };
            }
          }
          return null;
        }).filter(Boolean) as Array<{ name: string, arguments: any }>;

      }

      const text = response.choices[0]?.message?.content || "";

      let shouldGenerateTTS = false;
      const voiceResponseMode = options.voiceResponseMode || 'always';



      const userSentVoiceMessage = (() => {
        const userMessages = messages.filter(msg => msg.role === 'user');

        if (userMessages.length === 0) {
          return false;
        }

        const lastUserMessage = userMessages[userMessages.length - 1];

        let currentUserMessage = lastUserMessage;

        if (!lastUserMessage.metadata && userMessages.length >= 2) {
          const secondLastUserMessage = userMessages[userMessages.length - 2];

          if (lastUserMessage.content === secondLastUserMessage.content && secondLastUserMessage.metadata) {
            currentUserMessage = secondLastUserMessage;
          }
        }

        if (!currentUserMessage.metadata) {
          return false;
        }

        try {
          const metadata = JSON.parse(currentUserMessage.metadata);

          const hasMediaType = metadata.mediaType === 'audio';
          const hasAudioMessage = !!metadata.whatsappMessage?.message?.audioMessage;
          const hasAudioPath = !!metadata.audioPath;
          const hasAudioUrl = metadata.mediaUrl && (
            metadata.mediaUrl.includes('/audio/') ||
            metadata.mediaUrl.includes('.mp3') ||
            metadata.mediaUrl.includes('.ogg') ||
            metadata.mediaUrl.includes('.wav')
          );

          const isVoiceMessage = hasMediaType || hasAudioMessage || hasAudioPath || hasAudioUrl;

          if (isVoiceMessage) {
            const maxDuration = options.maxAudioDuration || 30;
            const audioDuration = metadata.whatsappMessage?.message?.audioMessage?.seconds;

            if (audioDuration && audioDuration > maxDuration) {
              return false;
            }
          }

          return isVoiceMessage;
        } catch (error) {
          return false;
        }
      })();

      if (options.enableTextToSpeech && text) {
        switch (voiceResponseMode) {
          case 'always':
            shouldGenerateTTS = true;
            break;

          case 'voice_only':
          case 'voice-to-voice':
            shouldGenerateTTS = userSentVoiceMessage;
            break;

          case 'never':
            shouldGenerateTTS = false;
            break;

          default:
            shouldGenerateTTS = true;
        }
      }

      let audioUrl: string | undefined;
      if (shouldGenerateTTS) {
        try {
          const ttsProvider = options.ttsProvider || 'openai';

          if (ttsProvider === 'elevenlabs') {
            if (!options.elevenLabsApiKey) {
              console.error('OpenAI Provider: ElevenLabs API key is required for ElevenLabs TTS');
            } else {
              const voiceId = options.elevenLabsCustomVoiceId && options.elevenLabsCustomVoiceId.trim()
                ? options.elevenLabsCustomVoiceId.trim()
                : options.elevenLabsVoiceId;

              if (!voiceId || voiceId === 'custom') {
                console.error('OpenAI Provider: ElevenLabs voice ID is required for ElevenLabs TTS');
              } else {
                const elevenLabsConfig: ElevenLabsConfig = {
                  apiKey: options.elevenLabsApiKey,
                  voiceId: voiceId,
                  model: options.elevenLabsModel,
                  stability: options.elevenLabsStability,
                  similarityBoost: options.elevenLabsSimilarityBoost,
                  style: options.elevenLabsStyle,
                  useSpeakerBoost: options.elevenLabsUseSpeakerBoost
                };
                audioUrl = await elevenLabsService.generateSpeech(text, elevenLabsConfig);
              }
            }
          } else {
            audioUrl = await this.generateSpeech(text, options.ttsVoice || 'alloy');
          }
        } catch (error) {
          console.error('OpenAI Provider: Error generating TTS audio:', error);
        }
      }

      return { text, audioUrl, functionCalls };
    } catch (error) {
      console.error('OpenAI Provider: Error in generateResponse', error);
      return {
        text: ""
      };
    }
  }
}

/** OpenRouter fallback model when API rejects tools (tool-capable) */
const OPENROUTER_TOOLS_FALLBACK_MODEL = 'openai/gpt-4o-mini';

class OpenRouterProvider implements AIProviderInterface {
  private client: OpenAI;

  /** OpenRouter model IDs that support tool/function calling; user's model is always tried first, fallback only on API error */
  private static readonly FUNCTION_CALLING_SUPPORTED_MODELS = new Set([
    'openai/gpt-5.2',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'openai/gpt-5.2-pro',
    'openai/gpt-5',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4o-2024-11-20',
    'openai/gpt-4o-2024-08-06',
    'openai/gpt-4o-2024-05-13',
    'openai/gpt-4',
    'openai/gpt-4-turbo',
    'openai/gpt-4-turbo-preview',
    'openai/gpt-4-turbo-2024-04-09',
    'openai/gpt-4-1106-preview',
    'openai/gpt-4-vision-preview',
    'openai/gpt-3.5-turbo',
    'openai/gpt-3.5-turbo-0125',
    'openai/gpt-3.5-turbo-1106',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'anthropic/claude-3-haiku',
    'anthropic/claude-3-5-sonnet-20241022',
    'anthropic/claude-3-5-haiku',
    'anthropic/claude-3-5-sonnet-20240620',
    'google/gemini-3-flash-preview',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-flash-lite',
    'google/gemini-2.0-flash',
    'google/gemini-2.0-flash-lite',
    'google/gemini-2.0-flash-exp',
    'google/gemini-2.0-flash-thinking-exp',
    'google/gemini-pro',
    'google/gemini-1.5-pro',
    'google/gemini-1.5-flash',
    'google/gemini-1.5-pro-latest',
    'google/gemini-1.5-flash-latest',
    'thudm/glm-4-32b',
    'thudm/glm-z1-32b',
    'thudm/glm-z1-rumination-32b',
    '01-ai/yi-large-fc',
    'mistralai/mistral-large',
    'mistralai/mistral-medium',
    'mistralai/mistral-small',
    'mistralai/mixtral-8x7b-instruct',
    'mistralai/mistral-7b-instruct',
    'mistralai/pixtral-12b',
    'mistralai/mistral-nemo',
    'cohere/command-r-plus',
    'cohere/command-r',
    'cognitivecomputations/dolphin-llama-3-70b',
    'cognitivecomputations/dolphin3.0-mistral-24b',
    'xai/grok-4',
    'xai/grok-4-0709',
    'xai/grok-3',
    'xai/grok-3-latest',
    'xai/grok-2',
    'xai/grok-2-latest',
    'xai/grok-2-1212',
    'xai/grok-beta',
    'qwen/qwen-2.5-72b-instruct',
    'qwen/qwen-2.5-coder-32b-instruct',
    'qwen/qwq-32b-preview',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-coder',
    'meta-llama/llama-3.1-405b-instruct',
    'meta-llama/llama-3.1-70b-instruct',
    'perplexity/llama-3.1-sonar-large-128k-online',
    'perplexity/llama-3.1-sonar-small-128k-online'
  ]);

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://powerchat.plus',
        'X-Title': 'PowerChat Plus'
      }
    });
  }

  private supportsTools(model: string): boolean {
    return OpenRouterProvider.FUNCTION_CALLING_SUPPORTED_MODELS.has(model);
  }

  /** True if error likely means model does not support tools */
  private isToolsNotSupportedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    return (
      lower.includes('tool') ||
      lower.includes('function calling') ||
      lower.includes('function_call') ||
      lower.includes('not supported') ||
      lower.includes('does not support')
    );
  }

  async generateResponse(
    messages: ConversationMessage[],
    options: {
      systemPrompt?: string;
      enableFunctionCalling?: boolean;
      enableAudio?: boolean;
      enableImage?: boolean;
      enableVideo?: boolean;
      enableVoiceProcessing?: boolean;
      enableTextToSpeech?: boolean;
      ttsProvider?: string;
      ttsVoice?: string;
      voiceResponseMode?: string;
      maxAudioDuration?: number;
      model?: string;
      functionDefinitions?: any[];
      elevenLabsApiKey?: string;
      elevenLabsVoiceId?: string;
      elevenLabsCustomVoiceId?: string;
      elevenLabsModel?: string;
      elevenLabsStability?: number;
      elevenLabsSimilarityBoost?: number;
      elevenLabsStyle?: number;
      elevenLabsUseSpeakerBoost?: boolean;
    }
  ): Promise<{
    text: string;
    audioUrl?: string;
    functionCalls?: any[];
  }> {
    const openAIMessages = messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    }));

    if (options.systemPrompt && !messages.find(m => m.role === 'system')) {
      openAIMessages.unshift({
        role: 'system',
        content: options.systemPrompt
      });
    }

    const needsTools = options.enableFunctionCalling && options.functionDefinitions && options.functionDefinitions.length > 0;
    const userModel = options.model || 'openai/gpt-4o-mini';

    const buildTools = (): any[] => {
      if (!needsTools || !options.functionDefinitions) return [];
      return options.functionDefinitions.map(func => ({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters
        }
      }));
    };

    const runRequest = (modelName: string) => {
      const requestParams: any = {
        model: modelName,
        messages: openAIMessages,
        max_tokens: 4096,
        temperature: 0.7
      };
      const tools = buildTools();
      if (tools.length > 0) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }
      return this.client.chat.completions.create(requestParams);
    };

    const parseResponse = (response: any) => {
      let text = response.choices[0]?.message?.content || "";
      const functionCalls: Array<{ name: string, arguments: any }> = [];
      if (response.choices[0]?.message?.tool_calls) {
        for (const toolCall of response.choices[0].message.tool_calls) {
          if (toolCall.type === 'function') {
            functionCalls.push({
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments || '{}')
            });
          }
        }
      }
      return { text, functionCalls: functionCalls.length > 0 ? functionCalls : undefined };
    };

    try {
      const response = await runRequest(userModel);
      return parseResponse(response);
    } catch (firstError) {
      if (needsTools && this.isToolsNotSupportedError(firstError)) {
        console.warn(`OpenRouter: User model ${userModel} rejected tools. Retrying once with ${OPENROUTER_TOOLS_FALLBACK_MODEL}.`, firstError);
        try {
          const fallbackResponse = await runRequest(OPENROUTER_TOOLS_FALLBACK_MODEL);
          return parseResponse(fallbackResponse);
        } catch (fallbackError) {
          console.error('OpenRouter Provider: Fallback model also failed', fallbackError);
          return { text: "" };
        }
      }
      console.error('OpenRouter Provider: Error in generateResponse', firstError);
      return { text: "" };
    }
  }
}

class TranslationService {
  /**
   * Detect if text is in a foreign language (not the target language)
   */
  async detectLanguage(text: string, provider: string, apiKey: string): Promise<string> {
    try {
      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a language detection expert. Respond with only the ISO 639-1 language code (2 letters) of the given text. Examples: "en" for English, "es" for Spanish, "fr" for French, etc. If uncertain, respond with "unknown".'
            },
            {
              role: 'user',
              content: `Detect the language of this text: "${text}"`
            }
          ],
          max_tokens: 10,
          temperature: 0
        });

        return response.choices[0]?.message?.content?.trim().toLowerCase() || 'unknown';
      }


      return this.simpleLanguageDetection(text);
    } catch (error) {
      console.error('Language detection error:', error);
      return 'unknown';
    }
  }

  /**
   * Simple heuristic language detection as fallback
   */
  private simpleLanguageDetection(text: string): string {

    const patterns = {
      es: /\b(hola|gracias|por favor|buenos días|buenas tardes|cómo estás|qué tal)\b/i,
      fr: /\b(bonjour|merci|s'il vous plaît|comment allez-vous|bonsoir|salut)\b/i,
      de: /\b(hallo|danke|bitte|guten tag|wie geht es|auf wiedersehen)\b/i,
      it: /\b(ciao|grazie|prego|buongiorno|come stai|arrivederci)\b/i,
      pt: /\b(olá|obrigado|por favor|bom dia|como está|tchau)\b/i,
      ru: /[а-яё]/i,
      ar: /[ا-ي]/,
      zh: /[\u4e00-\u9fff]/,
      ja: /[\u3040-\u309f\u30a0-\u30ff]/,
      ko: /[\uac00-\ud7af]/
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return 'en'; // Default to English if no pattern matches
  }

  /**
   * Translate text using the specified provider
   */
  async translateText(
    text: string,
    targetLanguage: string,
    provider: string,
    apiKey: string
  ): Promise<string> {
    try {
      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

        const languageNames: Record<string, string> = {
          en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
          pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
          ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', sv: 'Swedish',
          da: 'Danish', no: 'Norwegian', fi: 'Finnish', pl: 'Polish', cs: 'Czech',
          hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', hr: 'Croatian',
          sk: 'Slovak', sl: 'Slovenian', et: 'Estonian', lv: 'Latvian',
          lt: 'Lithuanian', mt: 'Maltese', ga: 'Irish', cy: 'Welsh'
        };

        const targetLanguageName = languageNames[targetLanguage] || targetLanguage;

        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the given text to ${targetLanguageName}. Maintain the original tone and meaning. Respond with only the translation, no additional text.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          max_tokens: 1000,
          temperature: 0.3
        });

        return response.choices[0]?.message?.content?.trim() || text;
      }


      console.warn('Google Translate provider not yet implemented, using OpenAI fallback');
      return await this.translateText(text, targetLanguage, 'openai', apiKey);

    } catch (error) {
      console.error('Translation error:', error);
      return text; // Return original text if translation fails
    }
  }

  /**
   * Check if translation is needed and perform translation
   */
  async processTranslation(
    text: string,
    targetLanguage: string,
    provider: string,
    apiKey: string
  ): Promise<{ needsTranslation: boolean; translatedText?: string; detectedLanguage?: string }> {
    try {

      const detectedLanguage = await this.detectLanguage(text, provider, apiKey);


      const needsTranslation = detectedLanguage !== targetLanguage && detectedLanguage !== 'unknown';

      if (!needsTranslation) {
        return { needsTranslation: false, detectedLanguage };
      }


      const translatedText = await this.translateText(text, targetLanguage, provider, apiKey);

      return {
        needsTranslation: true,
        translatedText,
        detectedLanguage
      };
    } catch (error) {
      console.error('Translation processing error:', error);
      return { needsTranslation: false };
    }
  }
}

class AIAssistantService {
  public translationService = new TranslationService();

  /**
   * Estimate token count for text (rough approximation)
   * This is a simple estimation - actual token counts may vary by provider
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;



    const charCount = text.length;
    const wordCount = text.split(/\s+/).length;


    const charBasedTokens = Math.ceil(charCount / 4);
    const wordBasedTokens = Math.ceil(wordCount * 1.3); // ~1.3 tokens per word on average

    return Math.ceil((charBasedTokens + wordBasedTokens) / 2);
  }

  /**
   * Generate audio capability prompt based on configuration
   */
  private async generateAudioCapabilityPrompt(config: any, language: string = 'en'): Promise<string> {
    const capabilities = [];

    if (config.enableVoiceProcessing) {
      const capabilityText = await serverI18n.t(
        'ai_assistant.audio_capability_process',
        language,
        'process and understand voice messages/audio files'
      );
      capabilities.push(capabilityText);
    }

    if (config.enableTextToSpeech) {
      const ttsProvider = config.ttsProvider || 'openai';
      const voiceResponseMode = config.voiceResponseMode || 'always';

      let responseMode = '';
      switch (voiceResponseMode) {
        case 'always':
          responseMode = await serverI18n.t(
            'ai_assistant.voice_mode_always_prompt',
            language,
            'You will respond with both text and voice messages for all interactions.'
          );
          break;
        case 'voice_only':
        case 'voice-to-voice':
          responseMode = await serverI18n.t(
            'ai_assistant.voice_mode_voice_only_prompt',
            language,
            'You will respond with voice messages only when the user sends you a voice message.'
          );
          break;
        case 'never':
          responseMode = await serverI18n.t(
            'ai_assistant.voice_mode_never_prompt',
            language,
            'You will only respond with text messages.'
          );
          break;
        default:
          responseMode = await serverI18n.t(
            'ai_assistant.voice_mode_always_prompt',
            language,
            'You can respond with voice messages when appropriate.'
          );
      }

      const ttsCapabilityText = await serverI18n.t(
        'ai_assistant.audio_capability_generate',
        language,
        `generate voice responses using ${ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'} text-to-speech technology`,
        { provider: ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI' }
      );
      capabilities.push(ttsCapabilityText);
      capabilities.push(responseMode);
    }

    if (capabilities.length === 0) {
      return '';
    }

    const maxDuration = config.maxAudioDuration || 30;

    let capabilityDescription = '';
    if (capabilities.length === 1) {
      capabilityDescription = capabilities[0];
    } else if (capabilities.length === 2) {
      capabilityDescription = `${capabilities[0]} and ${capabilities[1]}`;
    } else if (capabilities.length > 2) {
      capabilityDescription = `${capabilities.slice(0, -1).join(', ')}, and ${capabilities[capabilities.length - 1]}`;
    }

    const title = await serverI18n.t(
      'ai_assistant.audio_guidelines_title',
      language,
      'AUDIO PROCESSING CAPABILITIES:'
    );
    const intro = await serverI18n.t(
      'ai_assistant.audio_guidelines_intro',
      language,
      `You have advanced audio processing capabilities and can ${capabilityDescription}`,
      { capabilities: capabilityDescription }
    );
    const importantTitle = await serverI18n.t(
      'ai_assistant.audio_guidelines_important',
      language,
      'IMPORTANT AUDIO GUIDELINES:'
    );
    const guideline1 = await serverI18n.t(
      'ai_assistant.audio_guideline_can_process',
      language,
      'You CAN process voice messages and audio files that users send to you'
    );
    const guideline2 = await serverI18n.t(
      'ai_assistant.audio_guideline_acknowledge',
      language,
      'When users send voice messages, acknowledge that you received and understood their audio message'
    );
    const guideline3 = await serverI18n.t(
      'ai_assistant.audio_guideline_understand',
      language,
      'You can understand speech, transcribe audio content, and respond appropriately to voice inputs'
    );
    const guideline4 = await serverI18n.t(
      'ai_assistant.audio_guideline_limit',
      language,
      `Audio messages are limited to ${maxDuration} seconds for processing efficiency`,
      { maxDuration }
    );
    const guideline5 = await serverI18n.t(
      'ai_assistant.audio_guideline_never_claim',
      language,
      'Never claim that you cannot process voice messages or audio files - you have full audio processing capabilities'
    );
    const guideline6 = await serverI18n.t(
      'ai_assistant.audio_guideline_natural',
      language,
      'Respond naturally to voice messages as you would to any text message'
    );
    const guideline7 = await serverI18n.t(
      'ai_assistant.audio_guideline_conversational',
      language,
      'Be conversational. And don\'t tell the user that you have the ability of voice processing etc just respond to their request directly.'
    );

    return `
${title}
${intro}

${importantTitle}
- ${guideline1}
- ${guideline2}
- ${guideline3}
- ${guideline4}
- ${guideline5}
- ${guideline6}
- ${guideline7}

${config.enableTextToSpeech && capabilities.length > 0 ? capabilities[capabilities.length - 1] : ''}`.trim();
  }

  private async getProvider(provider: string, apiKey: string, companyId?: number): Promise<AIProviderInterface> {

    if (!provider) {
      provider = 'openai';
    }


    if (apiKey) {
      return this.createProviderInstance(provider, apiKey);
    }


    if (companyId) {
      try {
        const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, provider);
        if (credentialSource) {
          return this.createProviderInstance(provider, credentialSource.apiKey);
        }
      } catch (error) {
        console.error('Error getting AI credential:', error);
      }
    }


    const envKey = this.getEnvironmentKey(provider);
    if (envKey) {
      return this.createProviderInstance(provider, envKey);
    }


    if (provider !== 'openai') {
      return this.getProvider('openai', '', companyId);
    }

    const language = 'en'; // Default for error messages
    const errorMessage = await serverI18n.t(
      'ai_assistant.error_no_api_key',
      language,
      `No API key available for ${provider} provider. Please configure credentials in the admin panel or provide an API key in the node settings.`,
      { provider }
    );
    throw new Error(errorMessage);
  }

  private createProviderInstance(provider: string, apiKey: string): AIProviderInterface {
    switch (provider.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'openrouter':
        return new OpenRouterProvider(apiKey);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private getEnvironmentKey(provider: string): string | null {
    switch (provider.toLowerCase()) {
      case 'openai':
        return process.env.OPENAI_API_KEY || null;
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY || null;
      default:
        return null;
    }
  }

  async processMessage(
    message: Message,
    _conversation: Conversation,
    contact: Contact,
    _channelConnection: ChannelConnection,
    config: {
      provider: string;
      model: string;
      apiKey: string;
      systemPrompt: string;
      enableHistory: boolean;
      historyLimit?: number;
      enableAudio: boolean;
      enableImage: boolean;
      enableVideo: boolean;
      enableVoiceProcessing?: boolean;
      enableTextToSpeech?: boolean;
      ttsProvider?: string;
      ttsVoice?: string;
      voiceResponseMode?: string;
      maxAudioDuration?: number;
      enableFunctionCalling: boolean;
      enableTaskExecution?: boolean;
      tasks?: any[];
      enableGoogleCalendar?: boolean;
      calendarFunctions?: any[];
      enableZohoCalendar?: boolean;
      zohoCalendarFunctions?: any[];
      elevenLabsApiKey?: string;
      elevenLabsVoiceId?: string;
      elevenLabsCustomVoiceId?: string;
      elevenLabsModel?: string;
      elevenLabsStability?: number;
      elevenLabsSimilarityBoost?: number;
      elevenLabsStyle?: number;
      elevenLabsUseSpeakerBoost?: boolean;

      enableMCPServers?: boolean;
      mcpServers?: any[];

      nodeId?: string;
      knowledgeBaseEnabled?: boolean;
      knowledgeBaseConfig?: {
        maxRetrievedChunks?: number;
        similarityThreshold?: number;
        contextPosition?: 'before_system' | 'after_system' | 'before_user';
        contextTemplate?: string;
      };
      language?: string;
    },
    conversationHistory: Message[] = [],
    companyId?: number
  ): Promise<{
    text: string;
    audioUrl?: string;
    functionCalls?: any[];
    triggeredTasks?: string[];
    triggeredCalendarFunctions?: any[];
    triggeredZohoCalendarFunctions?: any[];
    triggeredMCPTools?: any[];
    mcpResults?: any[];
  }> {
    try {

      const provider = await this.getProvider(config.provider, config.apiKey, companyId);


      let language = config.language || 'en';
      if (language === 'auto') {

        if ((contact as any).language && typeof (contact as any).language === 'string') {
          language = (contact as any).language;
        } else {

          const messageContent = message.content || '';
          if (messageContent.trim()) {
            try {

              let detectionApiKey = config.apiKey;
              if (!detectionApiKey && companyId) {
                try {
                  const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, config.provider);
                  if (credentialSource) {
                    detectionApiKey = credentialSource.apiKey;
                  }
                } catch (error) {

                }
              }
              if (!detectionApiKey) {
                detectionApiKey = this.getEnvironmentKey(config.provider) || '';
              }

              const detectedLang = await this.translationService.detectLanguage(
                messageContent,
                config.provider,
                detectionApiKey
              );
              

              if (detectedLang && detectedLang !== 'unknown') {
                language = detectedLang;
              } else {
                language = 'en';
              }
            } catch (error) {
              console.error('Error detecting language:', error);
              language = 'en';
            }
          } else {

            language = 'en';
          }
        }
      }

      let functionDefinitions: any[] = [];
      const shouldEnableTaskFunctions = config.enableTaskExecution && config.tasks && config.tasks.length > 0;
      const shouldEnableCalendarFunctions = config.enableGoogleCalendar && config.calendarFunctions && config.calendarFunctions.length > 0;
      const shouldEnableZohoCalendarFunctions = config.enableZohoCalendar && config.zohoCalendarFunctions && config.zohoCalendarFunctions.length > 0;
      const shouldEnableMCPServers = config.enableMCPServers && config.mcpServers && config.mcpServers.length > 0;
      const shouldEnableFunctionCalling = shouldEnableTaskFunctions || shouldEnableCalendarFunctions || shouldEnableZohoCalendarFunctions || shouldEnableMCPServers;


      if (shouldEnableTaskFunctions && config.tasks) {
        functionDefinitions = config.tasks
          .filter(task => task.enabled)
          .map(task => task.functionDefinition);
      }


      if (shouldEnableCalendarFunctions && config.calendarFunctions) {
        const calendarFunctionDefs = config.calendarFunctions
          .filter((func: any) => func.enabled)
          .map((func: any) => func.functionDefinition);
        functionDefinitions = [...functionDefinitions, ...calendarFunctionDefs];
      }


      if (shouldEnableZohoCalendarFunctions && config.zohoCalendarFunctions) {
        const zohoCalendarFunctionDefs = config.zohoCalendarFunctions
          .filter((func: any) => func.enabled)
          .map((func: any) => func.functionDefinition);
        functionDefinitions = [...functionDefinitions, ...zohoCalendarFunctionDefs];
      }


      if (shouldEnableMCPServers && config.mcpServers) {
        const mcpClientService = (await import('./mcp-client-service')).default;
        const { convertMCPToolToOpenAIFunction } = await import('./mcp-tool-converter');
        
        for (const serverConfig of config.mcpServers.filter((s: any) => s.enabled)) {
          try {
            const connection = await mcpClientService.getOrCreateConnection(serverConfig);
            const mcpTools = connection.tools || [];
            

            const openAIFunctions = mcpTools.map(tool => 
              convertMCPToolToOpenAIFunction(tool)
            );
            
            functionDefinitions = [...functionDefinitions, ...openAIFunctions];
          } catch (error) {
            console.error(`Failed to discover tools from MCP server ${serverConfig.name}:`, error);

          }
        }
      }


      let knowledgeBaseContext = '';
      if (config.knowledgeBaseEnabled && config.nodeId && companyId) {
        try {
          const userQuery = message.content || '';
          const kbConfig = config.knowledgeBaseConfig || {};


          const retrievalResults = await knowledgeBaseService.retrieveContext(
            companyId,
            config.nodeId,
            userQuery
          );

          if (retrievalResults && retrievalResults.length > 0) {
            const maxChunks = kbConfig.maxRetrievedChunks || 3;
            const defaultTemplate = await serverI18n.t(
              'ai_assistant.knowledge_base_context_template',
              language,
              'Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user\'s question using this information when relevant.'
            );
            const contextTemplate = kbConfig.contextTemplate || defaultTemplate.replace('{context}', '{{context}}');


            const contextChunksPromises = retrievalResults
              .slice(0, maxChunks)
              .map(async (result, index) => {
                const similarity = (result.similarity * 100).toFixed(1);
                const label = await serverI18n.t(
                  'ai_assistant.knowledge_base_document_label',
                  language,
                  `[Document: ${result.document.originalName}] (Relevance: ${similarity}%)`,
                  { name: result.document.originalName, similarity }
                );
                return `${label}\n${result.chunk.content}`;
              });
            const contextChunks = (await Promise.all(contextChunksPromises)).join('\n\n---\n\n');

            knowledgeBaseContext = contextTemplate.replace('{context}', contextChunks);


          }
        } catch (error) {
          console.error('[Knowledge Base] Error retrieving context:', error);

        }
      }

      await serverI18n.ensureLanguageLoaded(language);


      const defaultSystemPrompt = await serverI18n.t(
        'ai_assistant.default_system_prompt',
        language,
        'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.'
      );
      let enhancedSystemPrompt = config.systemPrompt || defaultSystemPrompt;

      const contextPosition = config.knowledgeBaseConfig?.contextPosition || 'before_system';
      if (knowledgeBaseContext) {
        if (contextPosition === 'before_system') {
          enhancedSystemPrompt = `${knowledgeBaseContext}\n\n${enhancedSystemPrompt}`;
        } else if (contextPosition === 'after_system') {
          enhancedSystemPrompt = `${enhancedSystemPrompt}\n\n${knowledgeBaseContext}`;
        }

      }

      const hasAudioCapabilities = config.enableVoiceProcessing || config.enableTextToSpeech;
      if (hasAudioCapabilities) {
        const audioCapabilityText = await this.generateAudioCapabilityPrompt(config, language);
        enhancedSystemPrompt = `${enhancedSystemPrompt}

${audioCapabilityText}`;
      }

      if (shouldEnableFunctionCalling && functionDefinitions.length > 0) {
        const functionRulesTitle = await serverI18n.t(
          'ai_assistant.function_calling_rules_title',
          language,
          'IMPORTANT FUNCTION CALLING RULES:'
        );
        const rule1 = await serverI18n.t(
          'ai_assistant.function_calling_rule_explicit',
          language,
          'Only call functions when the user explicitly requests the specific action'
        );
        const rule2 = await serverI18n.t(
          'ai_assistant.function_calling_rule_no_greetings',
          language,
          'Do NOT call functions for general greetings, questions, or casual conversation'
        );
        const rule3 = await serverI18n.t(
          'ai_assistant.function_calling_rule_clear_intent',
          language,
          'Do NOT call functions unless there is clear, unambiguous user intent'
        );
        const rule4 = await serverI18n.t(
          'ai_assistant.function_calling_rule_greeting_examples',
          language,
          'For greetings like "Hello", "Hi", "How are you?" - respond normally without calling any functions'
        );
        const rule5 = await serverI18n.t(
          'ai_assistant.function_calling_rule_specific',
          language,
          'Only use functions when the user specifically asks for something that matches the function\'s purpose'
        );
        const rule6 = await serverI18n.t(
          'ai_assistant.function_calling_rule_conservative',
          language,
          'Be conservative - when in doubt, respond normally without calling functions'
        );
        enhancedSystemPrompt = `${enhancedSystemPrompt}

${functionRulesTitle}
- ${rule1}
- ${rule2}
- ${rule3}
- ${rule4}
- ${rule5}
- ${rule6}`;
      }


      const languageName = serverI18n.getLanguageName(language);
      const languageInstruction = await serverI18n.t(
        'ai_assistant.respond_in_language',
        language,
        `Respond in ${languageName}.`,
        { language: languageName }
      );
      enhancedSystemPrompt = `${enhancedSystemPrompt}

${languageInstruction}`;


      let messages: ConversationMessage[];
      if (config.enableHistory) {
        messages = generateMessagesWithHistory(message, contact, enhancedSystemPrompt, conversationHistory, config.historyLimit || 5);
      } else {
        messages = [
          { role: 'system', content: enhancedSystemPrompt }
        ] as ConversationMessage[];


        const userContent = contextPosition === 'before_user' && knowledgeBaseContext
          ? `${knowledgeBaseContext}\n\n${message.content || ''}`
          : message.content || '';

        messages.push({ role: 'user', content: userContent });
      }

      try {
        const response = await provider.generateResponse(messages, {
          systemPrompt: enhancedSystemPrompt,
          enableFunctionCalling: shouldEnableFunctionCalling,
          enableAudio: config.enableAudio,
          enableImage: config.enableImage,
          enableVideo: config.enableVideo,
          enableVoiceProcessing: config.enableVoiceProcessing,
          enableTextToSpeech: config.enableTextToSpeech,
          ttsProvider: config.ttsProvider,
          ttsVoice: config.ttsVoice,
          voiceResponseMode: config.voiceResponseMode,
          maxAudioDuration: config.maxAudioDuration,
          functionDefinitions,
          model: config.model,
          language: language,
          elevenLabsApiKey: config.elevenLabsApiKey,
          elevenLabsVoiceId: config.elevenLabsVoiceId,
          elevenLabsCustomVoiceId: config.elevenLabsCustomVoiceId,
          elevenLabsModel: config.elevenLabsModel,
          elevenLabsStability: config.elevenLabsStability,
          elevenLabsSimilarityBoost: config.elevenLabsSimilarityBoost,
          elevenLabsStyle: config.elevenLabsStyle,
          elevenLabsUseSpeakerBoost: config.elevenLabsUseSpeakerBoost
        });

        const triggeredTasks: string[] = [];
        const triggeredCalendarFunctions: any[] = [];
        const triggeredZohoCalendarFunctions: any[] = [];
        const triggeredMCPTools: any[] = [];

        if (response.functionCalls && response.functionCalls.length > 0) {



          if (config.enableTaskExecution && config.tasks) {
            for (const functionCall of response.functionCalls) {
              const matchingTask = config.tasks.find(task =>
                task.enabled && task.functionDefinition.name === functionCall.name
              );
              if (matchingTask) {

                triggeredTasks.push(matchingTask.outputHandle);
              }
            }
          }


          if (config.enableGoogleCalendar && config.calendarFunctions) {
            for (const functionCall of response.functionCalls) {
              const matchingCalendarFunction = config.calendarFunctions.find((func: any) =>
                func.enabled && func.functionDefinition.name === functionCall.name
              );
              if (matchingCalendarFunction) {

                triggeredCalendarFunctions.push({
                  ...functionCall,
                  functionConfig: matchingCalendarFunction
                });
              }
            }
          }


          if (config.enableZohoCalendar && config.zohoCalendarFunctions) {
            for (const functionCall of response.functionCalls) {
              const matchingZohoCalendarFunction = config.zohoCalendarFunctions.find((func: any) =>
                func.enabled && func.functionDefinition.name === functionCall.name
              );
              if (matchingZohoCalendarFunction) {

                triggeredZohoCalendarFunctions.push({
                  ...functionCall,
                  functionConfig: matchingZohoCalendarFunction
                });
              }
            }
          }


          if (shouldEnableMCPServers && config.mcpServers) {
            const mcpClientService = (await import('./mcp-client-service')).default;
            
            for (const functionCall of response.functionCalls) {

              for (const serverConfig of config.mcpServers.filter((s: any) => s.enabled)) {
                try {
                  const connection = await mcpClientService.getOrCreateConnection(serverConfig);
                  const toolExists = connection.tools.some(tool => tool.name === functionCall.name);
                  
                  if (toolExists) {
                    triggeredMCPTools.push({
                      serverConfig,
                      functionCall
                    });
                    break; // Found the server, no need to check others
                  }
                } catch (error) {
                  console.error(`Error checking MCP server ${serverConfig.name} for tool ${functionCall.name}:`, error);
                }
              }
            }
          }
        }


        const mcpResults: any[] = [];
        if (triggeredMCPTools.length > 0) {
          const mcpClientService = (await import('./mcp-client-service')).default;
          
          for (const mcpTool of triggeredMCPTools) {
            try {
              const result = await mcpClientService.executeToolCall(
                mcpTool.serverConfig.id,
                mcpTool.functionCall.name,
                mcpTool.functionCall.arguments || {}
              );
              
              mcpResults.push({
                tool: mcpTool.functionCall.name,
                server: mcpTool.serverConfig.name,
                result: result,
                success: true
              });
            } catch (error: any) {
              console.error(`MCP tool execution failed for ${mcpTool.functionCall.name}:`, error);
              mcpResults.push({
                tool: mcpTool.functionCall.name,
                server: mcpTool.serverConfig.name,
                error: error.message || 'Unknown error',
                success: false
              });
            }
          }
        }



        if (companyId && !config.apiKey) {
          try {
            const credentialSource = await aiCredentialsService.getCredentialForCompany(companyId, config.provider);
            if (credentialSource) {

              const inputTokens = this.estimateTokens(messages.map(m => m.content).join(' '));
              const outputTokens = this.estimateTokens(response.text);

              await aiCredentialsService.trackUsageWithCost({
                companyId,
                credentialType: credentialSource.type,
                credentialId: credentialSource.credential?.id || null,
                provider: config.provider,
                model: config.model,
                tokensInput: inputTokens,
                tokensOutput: outputTokens,
                tokensTotal: inputTokens + outputTokens,
                requestCount: 1
              });
            }
          } catch (trackingError) {
            console.error('Error tracking AI usage:', trackingError);

          }
        }

        return {
          ...response,
          triggeredTasks,
          triggeredCalendarFunctions,
          triggeredZohoCalendarFunctions,
          triggeredMCPTools,
          mcpResults
        };
      } catch (providerError) {
        console.error('AI Assistant: Error calling provider.generateResponse:', providerError);
        return {
          text: ""
        };
      }
    } catch (error) {
      console.error('Error in AI Assistant service:', error);
      return {
        text: ""
      };
    }
  }
}


const aiAssistantService = new AIAssistantService();
export default aiAssistantService;