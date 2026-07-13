type DemoErrorBody = {
  error?: string;
};

const demoErrorMessages: Record<string, string> = {
  demo_budget_exhausted: "本日のAIデモ上限に達しました。時間を置いて再度お試しください。",
  demo_key_not_configured: "公開URL設定が未完了のため、この操作は一時停止しています。",
  demo_key_required: "確認用キーを入力してください。",
  demo_rate_limit_unavailable: "デモ利用制限を確認できないため、この操作は一時停止しています。",
  demo_rate_limited: "短時間の操作回数が上限に達しました。少し時間を置いて再度お試しください。",
  invalid_demo_key: "確認用キーが一致しません。",
  provider_overloaded: "AIサービスが混雑しています。少し時間を置いて再度お試しください。",
  provider_rate_limited: "AIサービスの利用回数が上限に達しました。少し時間を置いて再度お試しください。",
  provider_timeout: "AI処理が時間内に完了しませんでした。少し時間を置いて再度お試しください。",
};

export async function readDemoErrorMessage(response: Response, fallbackMessage: string) {
  const errorCode = await readErrorCode(response);
  return errorCode ? demoErrorMessages[errorCode] ?? fallbackMessage : fallbackMessage;
}

async function readErrorCode(response: Response) {
  try {
    const body = (await response.clone().json()) as DemoErrorBody;
    return body.error;
  } catch {
    return undefined;
  }
}
