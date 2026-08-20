import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GROQ_API_KEY || '';

async function testChat(modelId: string) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Say: Nova Life Space verified properties are ready.' }],
        max_tokens: 30
      })
    });
    console.log(`[Chat Test] Model ${modelId} HTTP Status:`, res.status);
    const data = await res.json();
    if (res.ok) {
      console.log(`[Chat Test] Success with ${modelId}:`, data.choices?.[0]?.message?.content);
    } else {
      console.log(`[Chat Test] Error with ${modelId}:`, data.error?.message);
    }
  } catch (err: any) {
    console.error(`[Chat Test] Error with ${modelId}:`, err.message);
  }
}

async function main() {
  await testChat('openai/gpt-oss-20b');
  await testChat('qwen/qwen3.6-27b');
}

main();
