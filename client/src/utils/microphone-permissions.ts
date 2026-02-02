/**
 * Direct microphone access - exactly as MDN docs show
 */
export async function requestMicrophoneAccess(constraints: MediaStreamConstraints['audio'] = true) {

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: constraints
  });

  return {
    success: true,
    stream
  };
}

/**
 * Stop a microphone stream
 */
export function stopMicrophoneStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

/**
 * Test microphone level - returns audio level from 0-100
 * Uses AudioContext and AnalyserNode to measure input volume
 * Useful for showing visual indicator that microphone is working
 */
export async function testMicrophoneLevel(durationMs: number = 500): Promise<number> {
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    

    let maxLevel = 0;
    const sampleInterval = 50; // Sample every 50ms
    const samples = Math.floor(durationMs / sampleInterval);
    
    for (let i = 0; i < samples; i++) {
      await new Promise(resolve => setTimeout(resolve, sampleInterval));
      analyser.getByteFrequencyData(dataArray);
      

      const sum = dataArray.reduce((acc, val) => acc + val, 0);
      const avgLevel = sum / dataArray.length;
      maxLevel = Math.max(maxLevel, avgLevel);
    }
    

    return Math.round((maxLevel / 255) * 100);
    
  } finally {

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
      await audioContext.close();
    }
  }
}

/**
 * Check if microphone permission is granted without requesting it
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {

    return 'prompt';
  }
}
