

import openai
import os
from dotenv import load_dotenv

# Load .env.local automatically
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

api_key = os.getenv("OPENAI_API_KEY")
model_id = "ft:gpt-4o-mini-2024-07-18:personal:verbit-verbal:D9pqRXSS"

if not api_key:
    raise Exception("OPENAI_API_KEY not set in environment.")

client = openai.OpenAI(api_key=api_key)

system_prompt = "You generate CAT/IPMAT verbal questions. Return only valid JSON. Follow the requested schema precisely. Avoid markdown."
user_prompt = "Generate a Sentence Correction question. Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation. Target difficulty: 70."

response = client.chat.completions.create(
    model=model_id,
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    temperature=0.7,
    max_tokens=512,
    response_format={"type": "json_object"}
)

print(response.choices[0].message.content)
