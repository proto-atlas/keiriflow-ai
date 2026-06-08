# 外部サービス接続の確認記録

生成日時: 2026-05-08 23:59 +09:00
公開URL: https://keiriflow-ai.atlas-lab.workers.dev
確認時のWorker version ID: e3ddb07a-b7e7-4777-8763-cd7ae8e5a7a2
確認時のrepository commit: a1c01416a0ec3532e89cd3c97c87819245cc049b
GitHub CI run: 25561904560
確認時のCloudflare build run: 25562340474
確認種別: 確認用キーで制限した外部サービス確認
補足: 上記commitはデプロイに使ったアプリケーションsourceを示します。

## 日本語要約

この記録は、Cloudflare Workers上の確認用構成で、Supabase保存とAnthropic provider経路を最小件数で確認した時点ログです。Anthropic providerを含む外部サービス接続は直前のdeployで確認済みで、この更新ではAI API呼び出しを再実行せず、同一アプリケーションコードの最小限の起動確認だけを行っています。

- 確認したこと: 公開URLの起動、Supabase repository mode、確認用キー制限、AI抽出route、仕訳候補生成route、承認フロー、CSV出力
- 結果: CI、Cloudflare Build、deploy、外部サービス接続の確認は通過
- 読み方: 合成画像1件を使った限定的な接続確認であり、AI抽出品質や会計判断の一般品質を評価するものではありません
- この記録に含めない範囲: 本番認証、負荷耐性、税務判断の正確性、AI抽出精度の一般化

## 確認範囲

- 入力document: synthetic PNGのみ
- Private documents: no
- Bulk eval: false
- Load test: false
- access guard: `x-keiriflow-demo-key`
- raw確認用キーの記録: なし
- AI extraction request: 1件
- AI journal generation request: 1件

## 実行時設定

- 確認時のrepository mode: Supabase Database / Storage
- AI provider mode: Anthropic
- model: `claude-sonnet-4-6`
- max tokens: 800
- timeout: 60000 ms
- Worker実行環境: Cloudflare Workers + OpenNext
- 確認用rate limit window: 60 seconds
- 確認用rate limit max requests: 6
- 確認用daily AI limit: 30

## 確認結果

| 確認項目 | 結果 | 補足 |
|---|---|---|
| GitHub CI | 通過 | `lint`, `typecheck`, `test` |
| Cloudflare Build | 通過 | Linux runner, `pnpm cf:build`, artifact upload |
| Cloudflare deploy | 通過 | Worker Version ID `e3ddb07a-b7e7-4777-8763-cd7ae8e5a7a2` |
| `GET /dashboard` | 200 | 公開URLが描画された |
| `GET /api/documents` | 200 | `mode=supabase`, `total=7` after external service check |
| no-key upload | 401 | `demo_key_required` |
| 確認用キー付きupload | 200 | Synthetic PNGをmultipart uploadで保存、`mode=supabase` |
| AI extract | 200 | Document moved to `Extracted` |
| AI journal generation | 200 | Journal suggestion returned |
| journal update | 200 | Suggested journal fields were saved |
| status transition | 200 | `Extracted` → `NeedsReview` → `Reviewed` |
| approval request | 200 | Document moved to `PendingApproval` |
| approval response | 200 | Document moved to `Approved` |
| CSV export | 200 | CSV response length: 448 |
| 最新デプロイの最小確認 | 通過 | トップページ 200、公開読み取り 200、キーなし 401、確認用キー付きCSV 200。Worker Version ID `e3ddb07a-b7e7-4777-8763-cd7ae8e5a7a2` |

## 記録しない情報

- Anthropic API keyの記録: なし
- 確認用キーの記録: なし
- Supabase service role keyの記録: なし
- raw provider responseは記録していません。
- promptの記録: なし
- stack traceの記録: なし
- cookieの記録: なし
- local absolute pathの記録: なし

この記録は、対象commitのCIとCloudflare Buildの結果を残すものです。不要な外部API呼び出しを避けるため、この更新ではAnthropic APIへの接続確認を再実行せず、deploy後の最小限の起動確認だけを行っています。

## この記録に含めない範囲

- 一括評価ではありません。
- 負荷テストではありません。
- AI抽出精度の一般品質を示すものではありません。
- 本番向け認証を証明するものではありません。
- 税務判断や会計判断の正確性を示すものではありません。
- client abortやtimeout後のprovider側コスト挙動を証明するものではありません。
