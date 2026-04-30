"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Candidate = {
  tile: string;
  reason: string;
  shanten_after: number;
  notes: string;
};

type AnalyzeResponse = {
  candidates: Candidate[];
  overall_explanation: string;
  key_point: string;
};

export default function Home() {
  const [hand, setHand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!hand.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hand }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.detail || `サーバーエラーが発生しました (${res.status})`
        );
      }

      const data: AnalyzeResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "予期しないエラーが発生しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleAnalyze();
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">麻雀AIコーチ</h1>
          <p className="text-gray-500 text-sm">
            手牌を入力すると、なぜその牌を切るべきかをAIが解説します
          </p>
        </div>

        {/* Input Area */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Input
              value={hand}
              onChange={(e) => setHand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例: 1m2m3m4p5p6p7s8s9s東南西北"
              disabled={loading}
              className="text-base"
            />
            <p className="text-xs text-gray-400">
              書式：数字+m（万子）/ 数字+p（筒子）/ 数字+s（索子）/ 東南西北白發中
            </p>
            <Button
              onClick={handleAnalyze}
              disabled={loading || !hand.trim()}
              className="w-full"
            >
              {loading ? "解析中..." : "解説する"}
            </Button>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <p className="text-red-600 text-sm text-center">{error}</p>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Overall Explanation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-gray-700">全体方針</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-800 text-sm leading-relaxed">
                  {result.overall_explanation}
                </p>
              </CardContent>
            </Card>

            {/* Key Point */}
            {result.key_point && (
              <div className="flex items-start gap-2">
                <Badge variant="default" className="shrink-0 mt-0.5">
                  重要ポイント
                </Badge>
                <p className="text-sm text-gray-800">{result.key_point}</p>
              </div>
            )}

            {/* Candidates */}
            {result.candidates && result.candidates.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  切り牌候補
                </h2>
                {result.candidates.slice(0, 3).map((candidate, index) => (
                  <Card key={index} className="border border-gray-200">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-gray-900">
                          {candidate.tile}
                        </span>
                        <Badge variant="secondary">
                          向聴数: {candidate.shanten_after}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {candidate.reason}
                      </p>
                      {candidate.notes && (
                        <p className="text-xs text-gray-400 italic">
                          {candidate.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
