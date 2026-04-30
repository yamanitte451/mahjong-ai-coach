from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Mahjong AI Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

SYSTEM_PROMPT = """あなたは麻雀上達コーチです。
手牌と状況を受け取り、以下のJSON形式のみで返してください（前後の説明文・コードブロック記号は不要）:
{
  "candidates": [
    {
      "tile": "7s",
      "reason": "切ることで3面待ちになり、...",
      "shanten_after": 1,
      "notes": "守備面では..."
    }
  ],
  "overall_explanation": "現在の手牌の方針として...",
  "key_point": "今回の最重要ポイント: ..."
}
ルール:
- 捨て牌候補は最大3つ
- 理由は向聴数（テンパイまでに必要な交換枚数）・打点・守備の観点を必ず含める
- 専門用語（向聴・ドラ受け・ベタオリ等）は初出時に括弧内で説明を添える
- JSONのみ出力すること"""


class AnalyzeRequest(BaseModel):
    hand: str


class Candidate(BaseModel):
    tile: str
    reason: str
    shanten_after: int
    notes: str


class AnalyzeResponse(BaseModel):
    candidates: list[Candidate]
    overall_explanation: str
    key_point: str


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    if not req.hand.strip():
        raise HTTPException(status_code=400, detail="手牌を入力してください")

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": f"手牌: {req.hand}"}],
        )
        raw = message.content[0].text.strip()
        # コードブロック記号が含まれる場合は除去
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1])
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI応答の解析に失敗しました: {e}")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"AI APIエラー: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
