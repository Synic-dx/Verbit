"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  verScoreToPercentile,
  percentileToVerScore,
} from "@/lib/scoring";

type ScoreItem = {
  topic: string;
  verScore: number;
  calibrated: boolean;
  calibrationAttempts: number;
};

type ViewMode = "verscore" | "percentile";

export default function ScoreGrid({ items }: { items: ScoreItem[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("verscore");

  const scored = useMemo(
    () =>
      items.map((item) => {
        const percentile = verScoreToPercentile(item.verScore);
        return { ...item, percentile };
      }),
    [items]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
          Score View
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setViewMode((prev) => (prev === "verscore" ? "percentile" : "verscore"))
          }
        >
          {viewMode === "verscore" ? "Show Percentile" : "Show VerScore"}
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {scored.map((item) => {
          const displayValue =
            viewMode === "percentile" ? item.percentile : item.verScore;
          const altValue =
            viewMode === "percentile"
              ? percentileToVerScore(item.percentile)
              : item.percentile;
          const altLabel = viewMode === "percentile" ? "VerScore" : "Percentile";
          const progressValue =
            viewMode === "percentile" ? item.percentile : item.verScore;

          return (
            <Card key={item.topic} className="animate-in topic-card">
              <CardHeader>
                <CardTitle className="text-white">{item.topic}</CardTitle>
                {!item.calibrated ? (
                  <p className="text-sm text-amber-300/80">
                    {item.calibrationAttempts === 0
                      ? "Not started — begin calibration"
                      : `Calibrating ${item.calibrationAttempts}/10`}
                  </p>
                ) : (
                  <p className="text-sm text-white/60">
                    {viewMode === "percentile"
                      ? `Percentile ${displayValue.toFixed(1)}%ile`
                      : `VerScore ${displayValue.toFixed(1)}`} {" "}
                    ~ {altLabel} {altValue.toFixed(1)}
                    {viewMode === "percentile" ? "" : "%ile"}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {!item.calibrated ? (
                  <Progress value={(item.calibrationAttempts / 10) * 100} />
                ) : (
                  <Progress value={progressValue} />
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-white/40">
                    {!item.calibrated ? "Assessment phase" : "Adaptive range"}
                  </span>
                  <Link href={`/practice/${encodeURIComponent(item.topic)}`}>
                    <Button size="sm">{!item.calibrated ? "Calibrate" : "Practice"}</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
