import { describe, expect, it } from "vitest";
import { readDemoErrorMessage } from "./demo-error-message";

describe("readDemoErrorMessage", () => {
  it("demo_key_requiredなら確認用キーの入力案内を返す", async () => {
    const response = Response.json({ error: "demo_key_required" }, { status: 401 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe(
      "確認用キーを入力してください。",
    );
  });

  it("demo_rate_limitedなら時間を置く案内を返す", async () => {
    const response = Response.json({ error: "demo_rate_limited" }, { status: 429 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe(
      "短時間の操作回数が上限に達しました。少し時間を置いて再度お試しください。",
    );
  });

  it("provider_timeoutならAI処理の再試行案内を返す", async () => {
    const response = Response.json({ error: "provider_timeout" }, { status: 502 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe(
      "AI処理が時間内に完了しませんでした。少し時間を置いて再度お試しください。",
    );
  });

  it("provider_overloadedならAIサービス混雑の案内を返す", async () => {
    const response = Response.json({ error: "provider_overloaded" }, { status: 502 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe(
      "AIサービスが混雑しています。少し時間を置いて再度お試しください。",
    );
  });

  it("provider_rate_limitedならAIサービス利用上限の案内を返す", async () => {
    const response = Response.json({ error: "provider_rate_limited" }, { status: 502 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe(
      "AIサービスの利用回数が上限に達しました。少し時間を置いて再度お試しください。",
    );
  });

  it("未知のerrorならfallbackを返す", async () => {
    const response = Response.json({ error: "unknown" }, { status: 500 });

    await expect(readDemoErrorMessage(response, "失敗しました。")).resolves.toBe("失敗しました。");
  });
});
